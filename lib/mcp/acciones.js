// =====================================================================
// MCP — herramientas que hacen algo dentro de GovTalent
// lib/mcp/acciones.js
//
// Lo que un asistente puede HACER en nombre del usuario: crear y pausar
// alarmas, seguir una norma, crear y completar tareas y abrir un
// proyecto a partir de una norma.
//
// CADA ACCIÓN TIENE EL MISMO LÍMITE QUE EN LA PLATAFORMA, y se apoya en
// la misma pieza que lo decide allí:
//   alarmas     el trigger alarmas_limite (sql/59): una en Free y con
//               resumen los lunes; las del plan en Vigilancia.
//   seguir      solo con suscripción, como el botón «Seguir». Dejar de
//               seguir, siempre: no se encierra a nadie.
//   tareas      sin tope por plan, como en /tareas.
//   proyectos   uno en Free y los del plan con suscripción (decisión del
//               17-11-2026; lib/proyectos.js). Es lo único que el MCP
//               deja hacer y la pantalla no: en Free, el proyecto solo
//               se puede abrir desde el asistente. Un proyecto nace
//               SIEMPRE de una norma que existe en Regulatorio: sin
//               norma no hay proyecto. A un proyecto se le pueden
//               añadir actores con su briefing (hasta el tope de
//               lib/proyectos.js), enlazados a su ficha del directorio
//               siempre que exista, para que salgan con su foto.
//
//   listas      con el Directorio contratado, como en la pantalla. Se
//               guardan personas del directorio por su id, hasta 50 por
//               llamada; los correos se ven en GovTalent, en la lista.
//
// Todo se escribe con el cliente del usuario (RLS), salvo las listas,
// que usan las mismas funciones de servidor que la pantalla
// (lib/listas.js). Nada se borra desde aquí, salvo dejar de seguir.
// =====================================================================

import { WEB } from '@/lib/mcp/sesion';
import { mensajeError } from '@/lib/alarmas';
import { filaDeAlarma, vigilarDesdeAhora } from '@/lib/alarmasServidor';
import { limiteActores, limiteProyectosDe, puedeAnadirActor, puedeCrearProyectoConAsistente, tieneProyectos } from '@/lib/proyectos';
import { actorDelDirectorio, clavePersona } from '@/lib/actoresDirectorio';
import { anadirMiembros, listaAccesible, organizacionDe, MAX_MIEMBROS } from '@/lib/listas';

const CON_SUSCRIPCION = (que) => ({
  hecho: false,
  motivo: `${que} está disponible con suscripción.`,
  ver_planes: `${WEB}/precios`,
});

// Lo que se puede seguir desde el MCP: los asuntos de Regulatorio.
export const TIPOS_SEGUIBLES = ['ley', 'actividad', 'expediente', 'procedimiento', 'consulta', 'boe', 'ccaa', 'consejo'];

async function normaDe(s, tipo, id) {
  const { data } = await s.admin
    .from('regulatorio_search')
    .select('kind, ref_id, titulo, contexto, ruta')
    .eq('kind', tipo)
    .eq('ref_id', String(id))
    .limit(1)
    .maybeSingle();
  return data || null;
}

const NO_ESTA = { hecho: false, motivo: 'Esa norma no está en GovTalent. Localízala antes con buscar_normativa y usa su tipo y su id.' };

// ---------------------------------------------------------------------
// Alarmas
// ---------------------------------------------------------------------

export async function crearAlarma(s, a) {
  const fila = filaDeAlarma({
    nombre: a.nombre,
    descripcion: a.descripcion,
    keywords: a.palabras_clave,
    sectores: a.sectores,
    frecuencia: a.frecuencia,
    criterios: {
      resumen: a.resumen,
      temas: a.temas,
      normativa: a.normativa,
      territorios: a.territorios?.length ? a.territorios : ['España', 'Unión Europea'],
      excluye: a.excluye,
    },
  });
  if (!fila.descripcion || fila.keywords.length === 0) {
    return { hecho: false, motivo: 'A la alarma le falta la descripción o las palabras clave.' };
  }

  const { data, error } = await s.usuario
    .from('sector_alerts')
    .insert({ ...fila, user_id: s.userId })
    .select('id, nombre, frecuencia, activa')
    .limit(1)
    .maybeSingle();
  if (error) return { hecho: false, motivo: mensajeError(error), ver_planes: s.pago ? undefined : `${WEB}/precios` };

  await vigilarDesdeAhora(s.admin, data.id);

  return {
    hecho: true,
    alarma: { id: data.id, nombre: data.nombre, frecuencia: data.frecuencia, activa: data.activa },
    nota:
      (a.frecuencia && a.frecuencia !== data.frecuencia
        ? 'Con el plan Free el aviso llega en el resumen de los lunes. '
        : '') +
      'La alarma vigila desde ahora: avisará de lo que entre a partir de hoy. Para ver lo que ya está abierto, usa buscar_normativa o plazos_abiertos.',
    url: `${WEB}/alarmas`,
  };
}

export async function cambiarAlarma(s, { id, activa, frecuencia, nombre }) {
  const cambios = {};
  if (typeof activa === 'boolean') cambios.activa = activa;
  if (frecuencia) cambios.frecuencia = frecuencia;
  if (nombre) cambios.nombre = String(nombre).trim().slice(0, 60);
  if (Object.keys(cambios).length === 0) return { hecho: false, motivo: 'No se ha indicado ningún cambio.' };

  const { data, error } = await s.usuario
    .from('sector_alerts')
    .update(cambios)
    .eq('id', id)
    .eq('user_id', s.userId)
    .select('id, nombre, frecuencia, activa')
    .limit(1)
    .maybeSingle();
  if (error) return { hecho: false, motivo: mensajeError(error) };
  if (!data) return { hecho: false, motivo: 'No se ha encontrado esa alarma. Usa mis_alarmas para ver las que hay.' };

  return {
    hecho: true,
    alarma: data,
    nota: frecuencia && frecuencia !== data.frecuencia ? 'Con el plan Free el aviso llega en el resumen de los lunes.' : null,
    url: `${WEB}/alarmas`,
  };
}

// ---------------------------------------------------------------------
// Seguimientos
// ---------------------------------------------------------------------

export async function seguirNorma(s, { tipo, id }) {
  if (!s.pago) return CON_SUSCRIPCION('Seguir una norma');
  const n = await normaDe(s, tipo, id);
  if (!n) return NO_ESTA;

  const { data: ya } = await s.usuario
    .from('follows')
    .select('id')
    .eq('user_id', s.userId)
    .eq('kind', tipo)
    .eq('ref_id', String(id))
    .limit(1)
    .maybeSingle();
  if (ya) return { hecho: true, nota: 'Ya la estabas siguiendo.', url: `${WEB}/seguimiento` };

  const { error } = await s.usuario.from('follows').insert({
    user_id: s.userId,
    kind: tipo,
    ref_id: String(id),
    label: String(n.titulo || '').slice(0, 200),
  });
  if (error) return { hecho: false, motivo: 'No se ha podido seguir. Inténtalo de nuevo.' };

  return { hecho: true, siguiendo: n.titulo, nota: 'GovTalent avisará cuando haya novedades.', url: `${WEB}/seguimiento` };
}

export async function dejarDeSeguir(s, { tipo, id }) {
  const { data, error } = await s.usuario
    .from('follows')
    .delete()
    .eq('user_id', s.userId)
    .eq('kind', tipo)
    .eq('ref_id', String(id))
    .select('id');
  if (error) return { hecho: false, motivo: 'No se ha podido dejar de seguir. Inténtalo de nuevo.' };
  if (!data || data.length === 0) return { hecho: false, motivo: 'No la estabas siguiendo.' };
  return { hecho: true, url: `${WEB}/seguimiento` };
}

// ---------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------

export async function crearTarea(s, { titulo, tipo, prioridad, vence, notas, norma }) {
  const t = String(titulo || '').trim().slice(0, 300);
  if (!t) return { hecho: false, motivo: 'A la tarea le falta el título.' };

  let venceAt = null;
  if (vence) {
    // Solo la fecha → a las 9:00, como en la pantalla de Tareas.
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(vence) ? `${vence}T09:00:00+01:00` : vence);
    if (Number.isNaN(d.getTime())) return { hecho: false, motivo: 'La fecha no es válida. Usa el formato AAAA-MM-DD.' };
    venceAt = d.toISOString();
  }

  let vinculo = null;
  if (norma?.tipo && norma?.id) {
    vinculo = await normaDe(s, norma.tipo, norma.id);
    if (!vinculo) return NO_ESTA;
  }

  const { data: om } = await s.usuario
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', s.userId)
    .limit(1)
    .maybeSingle();

  const { data, error } = await s.usuario
    .from('tareas')
    .insert({
      created_by: s.userId,
      asignada_a: s.userId,
      organization_id: om?.organization_id || null,
      titulo: t,
      tipo: tipo || null,
      prioridad: prioridad || null,
      vence_at: venceAt,
      notas: notas ? String(notas).trim().slice(0, 5000) : null,
      vinculo_kind: vinculo?.kind || null,
      vinculo_ref: vinculo ? String(vinculo.ref_id) : null,
      vinculo_titulo: vinculo?.titulo || null,
      vinculo_contexto: vinculo?.contexto || null,
      vinculo_ruta: vinculo?.ruta || null,
    })
    .select('id, titulo, vence_at')
    .limit(1)
    .maybeSingle();
  if (error) return { hecho: false, motivo: 'No se ha podido crear la tarea. Inténtalo de nuevo.' };

  return { hecho: true, tarea: { id: data.id, titulo: data.titulo, vence: data.vence_at }, url: `${WEB}/tareas` };
}

export async function completarTarea(s, { id }) {
  const { data, error } = await s.usuario
    .from('tareas')
    .update({ estado: 'completada', completada_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, titulo')
    .limit(1)
    .maybeSingle();
  if (error) return { hecho: false, motivo: 'No se ha podido completar la tarea. Inténtalo de nuevo.' };
  if (!data) return { hecho: false, motivo: 'No se ha encontrado esa tarea. Usa mis_tareas para ver las que hay.' };
  return { hecho: true, tarea: data, url: `${WEB}/tareas` };
}

// ---------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------

export async function crearProyecto(s, { norma, nombre, objetivo }) {
  const n = norma?.tipo && norma?.id ? await normaDe(s, norma.tipo, norma.id) : null;
  if (!n) return NO_ESTA;

  const { count } = await s.usuario
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', s.userId)
    .eq('archived', false);
  if (!puedeCrearProyectoConAsistente(s.perfil, count || 0)) {
    return tieneProyectos(s.perfil)
      ? { hecho: false, motivo: `Has llegado al máximo de ${limiteProyectosDe(s.perfil)} proyectos. Archiva alguno en GovTalent para crear otro.`, url: `${WEB}/projects` }
      : { hecho: false, motivo: 'Con el plan Free puedes tener un proyecto. Para abrir más, hace falta una suscripción.', url: `${WEB}/projects`, ver_planes: `${WEB}/precios` };
  }

  const { data, error } = await s.usuario
    .from('projects')
    .insert({
      user_id: s.userId,
      created_by: s.userId,
      name: String(nombre || n.titulo || 'Proyecto sin título').trim().slice(0, 120),
      objetivo: objetivo ? String(objetivo).trim().slice(0, 1000) : null,
    })
    .select('id, name')
    .limit(1)
    .maybeSingle();
  if (error || !data) return { hecho: false, motivo: 'No se ha podido crear el proyecto. Inténtalo de nuevo.' };

  // El proyecto nace con la norma dentro, así que trae su histórico de
  // avisos y sus plazos (igual que «crear proyecto desde» en la pantalla).
  const { error: e2 } = await s.usuario
    .from('project_items')
    .insert({ project_id: data.id, kind: n.kind, ref_id: String(n.ref_id), etiqueta: String(n.titulo || '').slice(0, 200) });

  return {
    hecho: true,
    proyecto: { id: data.id, nombre: data.name, norma: n.titulo },
    nota: e2
      ? 'El proyecto se ha creado, pero la norma no se ha podido añadir. Añádela desde GovTalent.'
      : 'Para guardar a los actores clave con su briefing, usa anadir_actor_a_proyecto: personas (buscar_en_directorio) y también organizaciones, grupos parlamentarios y comisiones (buscar_organizaciones). El mapa y las acciones se trabajan en GovTalent.',
    url: `${WEB}/projects`,
  };
}

/**
 * Un actor (stakeholder) en el mapa de un proyecto, con su briefing.
 *
 * SIEMPRE SE INTENTA ENLAZAR CON SU FICHA DEL DIRECTORIO, y no depende
 * de lo que mande el asistente: se busca aquí por el nombre
 * (lib/actoresDirectorio.js). Enlazado, el actor entra igual que desde
 * el buscador de la pantalla: con su foto o su logotipo, su ficha y sus
 * avisos. Vale para personas y para organizaciones, grupos, comisiones
 * y ministerios.
 *
 * Solo se enlaza con el nombre exacto; si no hay ficha con ese nombre,
 * entra como actor propio del proyecto (nombre y descripción escritos)
 * y la respuesta lo dice, para que el asistente avise al usuario.
 *
 * El briefing va a los dos campos que ya enseña la pestaña Briefing del
 * proyecto: la posición del actor y los argumentos para abordarlo.
 */
export async function anadirActorAProyecto(s, a) {
  const escrito = String(a.nombre || '').trim().slice(0, 160);
  if (!escrito) return { hecho: false, motivo: 'Al actor le falta el nombre.' };

  // Con el cliente del usuario: si el proyecto no es suyo, no lo ve.
  const { data: proyecto } = await s.usuario.from('projects').select('id, name').eq('id', a.proyecto_id).eq('user_id', s.userId).limit(1).maybeSingle();
  if (!proyecto) return { hecho: false, motivo: 'No se ha encontrado ese proyecto. Usa mis_proyectos para ver los que hay.' };
  const url = `${WEB}/projects?p=${proyecto.id}`;

  const { data: actuales } = await s.usuario.from('project_actors').select('nombre, kind, ref_id').eq('project_id', proyecto.id).limit(200);
  if (!puedeAnadirActor((actuales || []).length)) {
    return { hecho: false, motivo: `Un proyecto admite hasta ${limiteActores()} actores.`, url };
  }

  const cargo = a.cargo ? String(a.cargo).trim().slice(0, 300) : null;
  let ficha = null;
  try {
    ficha = await actorDelDirectorio(s.usuario, escrito, cargo);
  } catch {
    ficha = null; // sin ficha entra como propio: no se pierde el briefing
  }
  // En el mapa, el nombre como lo lleva el directorio.
  const nombre = ficha?.nombre ? String(ficha.nombre).slice(0, 160) : escrito;

  const clave = clavePersona(escrito);
  const yaEsta = (actuales || []).some(
    (x) => (ficha && x.kind === ficha.kind && x.ref_id === ficha.ref_id) || clavePersona(x.nombre) === clave
  );
  if (yaEsta) {
    return { hecho: true, nota: 'Ese actor ya estaba en el proyecto. Su briefing se edita en GovTalent.', url };
  }

  const entre0y100 = (v) => (typeof v === 'number' ? Math.min(100, Math.max(0, Math.round(v))) : 50);
  const { error } = await s.usuario.from('project_actors').insert({
    project_id: proyecto.id,
    kind: ficha?.kind || null,
    ref_id: ficha?.ref_id || null,
    es_propio: !ficha,
    nombre,
    descripcion: cargo || ficha?.detalle || null,
    // La foto o el logotipo viajan con el actor, como en la pantalla.
    imagen: ficha?.imagen || null,
    posicion: entre0y100(a.posicion),
    influencia: entre0y100(a.influencia),
    posicion_texto: a.por_que_importa ? String(a.por_que_importa).trim().slice(0, 2000) : null,
    argumentos: a.como_abordarlo ? String(a.como_abordarlo).trim().slice(0, 2000) : null,
    posicion_fuente: 'Briefing preparado con el asistente',
    posicion_fecha: new Date().toISOString().slice(0, 10),
  });
  if (error) return { hecho: false, motivo: 'No se ha podido añadir el actor. Inténtalo de nuevo.' };

  return {
    hecho: true,
    actor: nombre,
    proyecto: proyecto.name,
    enlazado_al_directorio: !!ficha,
    nota: ficha
      ? null
      : 'No hay nadie con ese nombre exacto en el directorio de GovTalent: se ha guardado como actor propio del proyecto, sin foto ni ficha. Si el nombre venía de buscar_en_directorio o de buscar_organizaciones, repite la llamada con el nombre tal cual lo devuelven. Si no, díselo al usuario.',
    url,
  };
}

// ---------------------------------------------------------------------
// Listas de contactos
// ---------------------------------------------------------------------

const POR_LLAMADA = 50;

const SIN_DIRECTORIO = {
  hecho: false,
  motivo: 'Las listas son del Directorio, que se contrata aparte.',
  ver_planes: `${WEB}/precios`,
};

// Solo personas del directorio: los ids «libre:…» (lo encontrado con
// «Buscar correo») se añaden desde la pantalla, no desde el asistente.
const idsValidos = (personas) =>
  [...new Set((Array.isArray(personas) ? personas : []).map(String))]
    .filter((x) => x && x.length <= 200 && !x.startsWith('libre:'))
    .slice(0, POR_LLAMADA);

export async function crearLista(s, { nombre, personas }) {
  if (!s.directorio) return SIN_DIRECTORIO;
  const n = String(nombre || '').trim().slice(0, 120);
  if (!n) return { hecho: false, motivo: 'A la lista le falta el nombre.' };
  const ids = idsValidos(personas);

  const { data: lista, error } = await s.admin
    .from('contactos_listas')
    .insert({ owner_id: s.userId, organization_id: await organizacionDe(s.admin, s.userId), nombre: n })
    .select('id, nombre')
    .limit(1)
    .maybeSingle();
  if (error || !lista) return { hecho: false, motivo: 'No se ha podido crear la lista. Inténtalo de nuevo.' };

  let anadidas = 0;
  let aviso = null;
  if (ids.length) {
    try {
      anadidas = await anadirMiembros(s.admin, lista.id, ids);
    } catch {
      aviso = 'La lista se ha creado, pero no se han podido añadir las personas. Añádelas con anadir_a_lista.';
    }
  }

  return {
    hecho: true,
    lista: { id: lista.id, nombre: lista.nombre, personas: anadidas },
    nota: aviso || (ids.length && anadidas < ids.length ? 'Alguna persona no se ha encontrado en el directorio y no se ha añadido.' : 'Los correos y el resto del contacto se ven en GovTalent, en la lista.'),
    url: `${WEB}/contactos/listas/${lista.id}`,
  };
}

export async function anadirALista(s, { lista_id, personas }) {
  if (!s.directorio) return SIN_DIRECTORIO;
  if (!(await listaAccesible(s.admin, lista_id, s.userId))) {
    return { hecho: false, motivo: 'No se ha encontrado esa lista. Usa mis_listas para ver las que hay.' };
  }
  const ids = idsValidos(personas);
  if (!ids.length) return { hecho: false, motivo: 'No se ha indicado a quién añadir.' };

  const { count } = await s.admin.from('contactos_lista_miembros').select('persona_id', { count: 'exact', head: true }).eq('lista_id', lista_id);
  if ((count || 0) + ids.length > MAX_MIEMBROS) {
    return { hecho: false, motivo: `Una lista admite hasta ${MAX_MIEMBROS} personas y esta ya tiene ${count || 0}.`, url: `${WEB}/contactos/listas/${lista_id}` };
  }

  let anadidas = 0;
  try {
    anadidas = await anadirMiembros(s.admin, lista_id, ids);
  } catch {
    return { hecho: false, motivo: 'No se han podido añadir las personas. Inténtalo de nuevo.' };
  }
  return {
    hecho: true,
    anadidas,
    nota: anadidas < ids.length ? 'Alguna persona no se ha encontrado en el directorio y no se ha añadido.' : null,
    url: `${WEB}/contactos/listas/${lista_id}`,
  };
}
