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
//   proyectos   solo con suscripción y hasta el tope de lib/proyectos.js.
//               Un proyecto nace SIEMPRE de una norma que existe en
//               Regulatorio: sin norma no hay proyecto.
//
// Todo se escribe con el cliente del usuario (RLS). Nada se borra desde
// aquí, salvo dejar de seguir.
// =====================================================================

import { WEB } from '@/lib/mcp/sesion';
import { mensajeError } from '@/lib/alarmas';
import { filaDeAlarma, vigilarDesdeAhora } from '@/lib/alarmasServidor';
import { limiteProyectos, puedeCrearProyecto, tieneProyectos } from '@/lib/proyectos';

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
  if (!tieneProyectos(s.perfil)) return CON_SUSCRIPCION('Crear proyectos');

  const n = norma?.tipo && norma?.id ? await normaDe(s, norma.tipo, norma.id) : null;
  if (!n) return NO_ESTA;

  const { count } = await s.usuario
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', s.userId)
    .eq('archived', false);
  if (!puedeCrearProyecto(s.perfil, count || 0)) {
    return { hecho: false, motivo: `Has llegado al máximo de ${limiteProyectos()} proyectos. Archiva alguno en GovTalent para crear otro.`, url: `${WEB}/projects` };
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
      : 'Los actores, las acciones y el mapa del proyecto se trabajan en GovTalent.',
    url: `${WEB}/projects`,
  };
}
