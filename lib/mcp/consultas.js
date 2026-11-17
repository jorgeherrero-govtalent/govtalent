// =====================================================================
// MCP — herramientas de consulta
// lib/mcp/consultas.js
//
// Lo que un asistente puede LEER de GovTalent en nombre del usuario.
// Cada función recibe el contexto de la llamada (lib/mcp/sesion.js) y
// los argumentos ya validados, y devuelve un objeto que se entrega al
// asistente como JSON.
//
// TRES REGLAS, LAS MISMAS QUE EN EL RESTO DE LA PLATAFORMA:
//   1. Se consulta, no se exporta. Cada herramienta tiene un tope de
//      filas y ninguna devuelve listados completos.
//   2. Todo lleva su enlace a GovTalent (`url`): el detalle se ve allí.
//   3. Del directorio salen nombre, cargo, unidad e institución. Nunca
//      correos ni teléfonos, tenga el usuario el plan que tenga: los
//      contactos se ven en la ficha, dentro de GovTalent.
//
// Y una cuarta: null antes que un dato inventado. Si algo no está, se
// dice que no está.
// =====================================================================

import { WEB } from '@/lib/mcp/sesion';
import { TOPES } from '@/lib/mcp/cuota';
import { limitesDe } from '@/lib/alarmas';
import { esRuido } from '@/lib/ruidoNormativo';
import { limiteProyectosDe } from '@/lib/proyectos';
import { buscarOrganizacionesPorNombre, TIPOS_ORGANIZACION } from '@/lib/actoresDirectorio';

const url = (ruta) => (ruta ? `${WEB}${ruta}` : null);

// Las fuentes de Regulatorio, como las ve el usuario, y los `kind` de
// regulatorio_search que hay detrás de cada una.
export const FUENTES = {
  congreso: ['ley', 'actividad'],
  boe: ['boe'],
  union_europea: ['expediente', 'procedimiento'],
  consultas_publicas: ['consulta'],
  parlamentos_autonomicos: ['ccaa'],
  boletines_autonomicos: ['diario'],
  consejo_de_ministros: ['consejo'],
};

const COLUMNAS = 'kind, ref_id, titulo, contexto, fuente, ruta, plazo, fecha, activo';

const sinTildes = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Para un ilike: fuera los comodines y lo que rompe el filtro.
const limpio = (t) => String(t || '').replace(/[%_,()\\]/g, ' ').replace(/\s+/g, ' ').trim();

const norma = (r) => ({
  tipo: r.kind,
  id: r.ref_id,
  titulo: r.titulo,
  fuente: r.fuente || null,
  contexto: r.contexto || null,
  fecha: r.fecha || null,
  plazo: r.plazo || null,
  // «Activo» como en el filtro de la plataforma: sigue en tramitación,
  // con plazo abierto o en vigor. El estado concreto va en `contexto`.
  activo: r.activo === true,
  url: url(r.ruta),
});

// Orden de los resultados de una búsqueda: delante lo que tiene un plazo
// abierto (es lo que pide actuar); después, las leyes, consultas y
// expedientes antes que los boletines autonómicos, que son muchos y casi
// siempre actos de trámite; al final, los actos individuales que las
// alarmas ya tratan como ruido (convenios, autorizaciones, premios…:
// lib/ruidoNormativo.js); y dentro de cada grupo, lo más reciente.
function porInteres(filas) {
  const ahora = Date.now();
  const conPlazo = (r) => (r.plazo && new Date(r.plazo).getTime() >= ahora ? 0 : 1);
  const boletin = (r) => (r.kind === 'diario' ? 1 : 0);
  const ruido = (r) => (esRuido(r.titulo) ? 1 : 0);
  return [...filas].sort(
    (a, b) =>
      conPlazo(a) - conPlazo(b) ||
      ruido(a) - ruido(b) ||
      boletin(a) - boletin(b) ||
      String(b.fecha || '').localeCompare(String(a.fecha || ''))
  );
}

function diasHasta(fecha) {
  if (!fecha) return null;
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000);
}

// ---------------------------------------------------------------------
// Mi cuenta
// ---------------------------------------------------------------------

export async function miCuenta(s) {
  const [{ count: activas }, { data: limite }] = await Promise.all([
    s.usuario.from('sector_alerts').select('id', { count: 'exact', head: true }).eq('user_id', s.userId).eq('activa', true),
    s.admin.rpc('limite_alarmas', { p_user: s.userId }),
  ]);
  const limites = limitesDe(s.nivel);
  const topes = TOPES[s.pago ? 'pro' : 'free'];
  const nombre = [s.perfil.first_name, s.perfil.last_name].filter(Boolean).join(' ') || null;

  return {
    nombre,
    correo: s.email,
    organizacion: s.perfil.organizacion_nombre || null,
    plan: s.pago ? 'Vigilancia' : 'Free',
    directorio_contratado: s.directorio,
    alarmas: {
      activas: activas || 0,
      maximo: typeof limite === 'number' ? limite : limites.alarmas,
      frecuencias: limites.frecuencias,
    },
    puede: {
      consultar_normativa: true,
      consultar_directorio: true,
      crear_alarmas: true,
      crear_tareas: true,
      seguir_normas: s.pago,
      crear_proyectos: true,
    },
    uso_diario_maximo: topes,
    proyectos_maximo: limiteProyectosDe(s.perfil),
    nota: s.pago ? null : 'Con el plan Free puedes tener una alarma, con resumen los lunes, y un proyecto. Seguir normas está disponible con suscripción.',
    planes: `${WEB}/precios`,
  };
}

// ---------------------------------------------------------------------
// Normativa
// ---------------------------------------------------------------------

export async function buscarNormativa(s, { consulta, fuente, solo_activos, limite }) {
  const max = Math.min(Math.max(limite || 10, 1), 10);
  const palabras = limpio(consulta).split(' ').filter((w) => w.length >= 3).slice(0, 5);
  if (palabras.length === 0) return { resultados: [], nota: 'Escribe al menos una palabra de tres letras o más.' };

  const base = () => {
    let q = s.admin.from('regulatorio_search').select(COLUMNAS).neq('kind', 'ccaa_tramite');
    if (fuente && FUENTES[fuente]) q = q.in('kind', FUENTES[fuente]);
    if (solo_activos) q = q.eq('activo', true);
    return q;
  };

  // Primero, todas las palabras en el título.
  let q = base();
  for (const w of palabras) q = q.ilike('titulo', `%${w}%`);
  // Se leen más de los que se devuelven para poder ordenarlos por interés.
  let { data, error } = await q.order('fecha', { ascending: false }).limit(60);
  if (error) throw new Error(error.message);

  // Si no hay nada y eran varias, cualquiera de ellas: mejor algo cercano
  // que una lista vacía, y se dice que la búsqueda se ha ampliado.
  let ampliada = false;
  if ((data || []).length === 0 && palabras.length > 1) {
    const r = await base()
      .or(palabras.map((w) => `titulo.ilike.%${w}%`).join(','))
      .order('fecha', { ascending: false })
      .limit(60);
    if (r.error) throw new Error(r.error.message);
    data = r.data;
    ampliada = (data || []).length > 0;
  }
  const hayMas = (data || []).length > max;
  data = porInteres(data || []).slice(0, max);

  return {
    resultados: (data || []).map(norma),
    hay_mas: hayMas,
    nota: ampliada
      ? 'No hay nada con todas las palabras; estos resultados contienen alguna de ellas.'
      : (data || []).length === 0
        ? 'No hay resultados en GovTalent para esa búsqueda. Prueba con otros términos: los que usaría el título oficial.'
        : null,
    ver_en_govtalent: `${WEB}/regulatorio/buscar?q=${encodeURIComponent(limpio(consulta))}`,
  };
}

export async function fichaNorma(s, { tipo, id }) {
  const { data: r, error } = await s.admin
    .from('regulatorio_search')
    .select(COLUMNAS)
    .eq('kind', tipo)
    .eq('ref_id', String(id))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) return { encontrada: false, nota: 'Esa norma no está en GovTalent. Usa buscar_normativa para localizarla.' };

  // Lo que el usuario ya tiene sobre ella: si la sigue y qué han dicho
  // sus alarmas (el motivo es el análisis de por qué le afecta).
  const [{ data: sigue }, { data: avisos }] = await Promise.all([
    s.usuario.from('follows').select('id, created_at').eq('user_id', s.userId).eq('kind', tipo).eq('ref_id', String(id)).limit(1).maybeSingle(),
    s.usuario
      .from('sector_alert_matches')
      .select('motivo, relevancia, created_at')
      .eq('user_id', s.userId)
      .eq('kind', tipo)
      .eq('ref_id', String(id))
      .eq('descartado', false)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  // Una ley autonómica trae además sus trámites (plazos de enmiendas,
  // ampliaciones, dictámenes), que en regulatorio_search van aparte.
  let tramites = null;
  if (tipo === 'ccaa' && r.ruta) {
    const { data: t } = await s.admin
      .from('regulatorio_search')
      .select('titulo, fecha, plazo')
      .eq('kind', 'ccaa_tramite')
      .eq('ruta', r.ruta)
      .order('fecha', { ascending: false })
      .limit(15);
    tramites = (t || []).map((x) => ({ tramite: x.titulo, fecha: x.fecha || null, plazo: x.plazo || null }));
  }

  return {
    encontrada: true,
    ...norma(r),
    dias_para_el_plazo: diasHasta(r.plazo),
    tramites,
    la_sigues: !!sigue,
    lo_que_dicen_tus_alarmas: (avisos || []).map((a) => ({ motivo: a.motivo || null, relevancia: a.relevancia, fecha: a.created_at })),
    nota: 'El texto completo, los documentos y el histórico están en la ficha de GovTalent (url).',
  };
}

export async function plazosAbiertos(s, { consulta, fuente, dias, limite }) {
  const max = Math.min(Math.max(limite || 10, 1), 15);
  const hasta = new Date(Date.now() + Math.min(Math.max(dias || 30, 1), 180) * 86400000).toISOString();

  let q = s.admin
    .from('regulatorio_search')
    .select(COLUMNAS)
    .neq('kind', 'ccaa_tramite')
    .gte('plazo', new Date().toISOString())
    .lte('plazo', hasta);
  if (fuente && FUENTES[fuente]) q = q.in('kind', FUENTES[fuente]);
  for (const w of limpio(consulta).split(' ').filter((x) => x.length >= 3).slice(0, 5)) q = q.ilike('titulo', `%${w}%`);

  const { data, error } = await q.order('plazo', { ascending: true }).limit(max);
  if (error) throw new Error(error.message);

  return {
    plazos: (data || []).map((r) => ({ ...norma(r), dias_que_quedan: diasHasta(r.plazo) })),
    nota: (data || []).length === 0 ? 'No hay plazos abiertos con esos criterios en ese periodo.' : null,
  };
}

export async function consejoDeMinistros(s, { fecha }) {
  let q = s.admin.from('consejo_referencias').select('url, fecha, titulo, n_acuerdos').order('fecha', { ascending: false }).limit(1);
  if (fecha) q = q.lte('fecha', fecha);
  const { data: refs, error } = await q;
  if (error) throw new Error(error.message);
  const ref = (refs || [])[0];
  if (!ref) return { encontrado: false, nota: 'No hay ninguna Referencia del Consejo de Ministros en esa fecha o antes.' };

  const { data: acuerdos, error: e2 } = await s.admin
    .from('consejo_acuerdos')
    .select('id, ministerio, tipo, titulo, estado, boe_id, orden')
    .eq('referencia_url', ref.url)
    .order('orden', { ascending: true })
    .limit(80);
  if (e2) throw new Error(e2.message);

  return {
    encontrado: true,
    fecha: ref.fecha,
    titulo: ref.titulo || null,
    referencia_oficial: ref.url,
    acuerdos: (acuerdos || []).map((a) => ({
      id: a.id,
      ministerio: a.ministerio || null,
      tipo: a.tipo || null,
      titulo: a.titulo,
      publicado_en_boe: a.boe_id || null,
      url: `${WEB}/regulatorio/consejo/${a.id}`,
    })),
  };
}

// ---------------------------------------------------------------------
// Lo mío
// ---------------------------------------------------------------------

export async function misAlarmas(s) {
  const { data, error } = await s.usuario
    .from('sector_alerts')
    .select('id, nombre, descripcion, criterios, keywords, sectores, frecuencia, activa, pausada_por_plan, created_at')
    .eq('user_id', s.userId)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);

  return {
    alarmas: (data || []).map((a) => ({
      id: a.id,
      nombre: a.nombre,
      vigila: a.criterios?.resumen || a.descripcion || null,
      temas: a.criterios?.temas || [],
      territorios: a.criterios?.territorios || [],
      palabras_clave: a.keywords || [],
      frecuencia: a.frecuencia,
      activa: a.activa === true,
      pausada_por_plan: a.pausada_por_plan === true,
    })),
    ver_en_govtalent: `${WEB}/alarmas`,
  };
}

export async function misNovedades(s, { desde, alarma_id, limite }) {
  const max = Math.min(Math.max(limite || 15, 1), 25);
  const inicio = desde ? new Date(desde) : new Date(Date.now() - 7 * 86400000);
  if (Number.isNaN(inicio.getTime())) return { novedades: [], nota: 'La fecha no es válida. Usa el formato AAAA-MM-DD.' };

  let q = s.usuario
    .from('sector_alert_matches')
    .select('alert_id, kind, ref_id, titulo, fuente, ruta, motivo, plazo, relevancia, visto, created_at')
    .eq('user_id', s.userId)
    .eq('descartado', false)
    .gte('created_at', inicio.toISOString());
  if (alarma_id) q = q.eq('alert_id', alarma_id);
  const { data, error } = await q.order('relevancia', { ascending: false }).order('created_at', { ascending: false }).limit(max);
  if (error) throw new Error(error.message);

  const ids = [...new Set((data || []).map((m) => m.alert_id))];
  const { data: alarmas } = ids.length
    ? await s.usuario.from('sector_alerts').select('id, nombre').in('id', ids)
    : { data: [] };
  const nombre = Object.fromEntries((alarmas || []).map((a) => [a.id, a.nombre]));

  return {
    desde: inicio.toISOString().slice(0, 10),
    novedades: (data || []).map((m) => ({
      alarma: nombre[m.alert_id] || null,
      tipo: m.kind,
      id: m.ref_id,
      titulo: m.titulo,
      fuente: m.fuente || null,
      por_que_te_afecta: m.motivo || null,
      // 3 = te afecta de lleno, 2 = relevante, 1 = contexto útil.
      relevancia: m.relevancia,
      plazo: m.plazo || null,
      dias_para_el_plazo: diasHasta(m.plazo),
      vista: m.visto === true,
      detectada: m.created_at,
      url: url(m.ruta),
    })),
    nota: (data || []).length === 0 ? 'Tus alarmas no han detectado nada en ese periodo.' : null,
    ver_en_govtalent: `${WEB}/novedades`,
  };
}

export async function misSeguimientos(s, { limite }) {
  const max = Math.min(Math.max(limite || 20, 1), 30);
  const { data, error } = await s.usuario
    .from('my_follows')
    .select('kind, ref_id, label, estado, fuente, ruta, n_novedades, ultima_novedad, ultimo_detalle, project_name, activo')
    .eq('user_id', s.userId)
    .order('ultima_novedad', { ascending: false, nullsFirst: false })
    .limit(max);
  if (error) throw new Error(error.message);

  return {
    seguimientos: (data || []).map((f) => ({
      tipo: f.kind,
      id: f.ref_id,
      titulo: f.label,
      fuente: f.fuente || null,
      estado: f.estado || null,
      activo: f.activo === true,
      novedades_sin_ver: f.n_novedades || 0,
      ultima_novedad: f.ultima_novedad || null,
      ultimo_cambio: f.ultimo_detalle || null,
      proyecto: f.project_name || null,
      url: url(f.ruta),
    })),
    ver_en_govtalent: `${WEB}/seguimiento`,
  };
}

export async function misTareas(s, { estado, limite }) {
  const max = Math.min(Math.max(limite || 20, 1), 30);
  let q = s.usuario
    .from('tareas')
    .select('id, titulo, tipo, prioridad, vence_at, estado, notas, vinculo_titulo, vinculo_ruta, created_by, asignada_a')
    .or(`created_by.eq.${s.userId},asignada_a.eq.${s.userId}`)
    .eq('estado', estado || 'pendiente');
  const { data, error } = await q.order('vence_at', { ascending: true, nullsFirst: false }).limit(max);
  if (error) throw new Error(error.message);

  return {
    tareas: (data || []).map((t) => ({
      id: t.id,
      titulo: t.titulo,
      tipo: t.tipo || null,
      prioridad: t.prioridad || null,
      vence: t.vence_at || null,
      estado: t.estado,
      notas: t.notas || null,
      vinculada_a: t.vinculo_titulo ? { titulo: t.vinculo_titulo, url: url(t.vinculo_ruta) } : null,
    })),
    ver_en_govtalent: `${WEB}/tareas`,
  };
}

export async function misProyectos(s) {
  const { data, error } = await s.usuario
    .from('projects')
    .select('id, name, objetivo, description, updated_at')
    .eq('user_id', s.userId)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);

  const ids = (data || []).map((p) => p.id);
  const { data: items } = ids.length
    ? await s.usuario.from('project_items').select('project_id, kind, ref_id, etiqueta').in('project_id', ids).limit(200)
    : { data: [] };

  return {
    proyectos: (data || []).map((p) => ({
      id: p.id,
      nombre: p.name,
      objetivo: p.objetivo || p.description || null,
      actualizado: p.updated_at,
      asuntos: (items || []).filter((i) => i.project_id === p.id).map((i) => ({ tipo: i.kind, id: i.ref_id, titulo: i.etiqueta || null })),
    })),
    ver_en_govtalent: `${WEB}/projects`,
  };
}

// ---------------------------------------------------------------------
// Directorio
// ---------------------------------------------------------------------

export const MAX_PERSONAS = 10;

export async function buscarEnDirectorio(s, { consulta, solo_titulares }) {
  const palabras = sinTildes(String(consulta || '').slice(0, 160)).split(' ').filter((w) => w.length > 1).slice(0, 6);
  if (!palabras.length || palabras.join('').length < 3) {
    return { personas: [], nota: 'Escribe un nombre, un cargo o una institución.' };
  }

  // directorio_pro_mat (sql/129) ya excluye a quien ha ejercido su
  // derecho de oposición. Solo se piden las columnas que se devuelven:
  // los correos y teléfonos ni siquiera salen de la base.
  let q = s.admin
    .from('directorio_pro_mat')
    .select('id, nombre, cargo, unidad, institucion, es_titular, orden, nombre_norm')
    .order('orden', { ascending: true })
    .order('id', { ascending: true })
    .limit(40);
  for (const w of palabras) q = q.like('busqueda', `%${w}%`);
  if (solo_titulares) q = q.eq('es_titular', true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // Primero quien lleva las palabras en el nombre; una persona, una vez.
  const enNombre = (f) => (palabras.every((w) => (f.nombre_norm || '').includes(w)) ? 0 : 1);
  const vistos = new Set();
  const personas = [];
  for (const f of (data || []).sort((a, b) => enNombre(a) - enNombre(b))) {
    const clave = `${f.nombre_norm}|${f.institucion}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    personas.push({
      // El id sirve para crear_lista y anadir_a_lista.
      id: f.id,
      nombre: f.nombre,
      cargo: f.cargo || null,
      unidad: f.unidad || null,
      institucion: f.institucion || null,
      titular_de_la_unidad: f.es_titular === true,
      url: `${WEB}/instituciones/directorio?q=${encodeURIComponent(f.nombre)}`,
    });
    if (personas.length >= MAX_PERSONAS) break;
  }

  return {
    personas,
    hay_mas: (data || []).length >= 40,
    nota:
      personas.length === 0
        ? 'No hay nadie en el directorio de GovTalent con esos datos.'
        : 'El correo, el teléfono y el resto del contacto se consultan en GovTalent, en la ficha de cada persona (url). Para guardar a estas personas, usa crear_lista o anadir_a_lista con su id: la lista se trabaja en GovTalent.',
    ver_en_govtalent: `${WEB}/instituciones/directorio?q=${encodeURIComponent(String(consulta || '').slice(0, 160))}`,
  };
}

/**
 * Organizaciones y órganos: lo que no son personas. Patronales,
 * empresas y asociaciones, grupos parlamentarios, comisiones y
 * ministerios. Sirve para completar el mapa de actores de un proyecto.
 * No trae contactos: solo el nombre, el tipo y el sector o el ámbito.
 */
export async function buscarOrganizaciones(s, { consulta }) {
  const texto = String(consulta || '').slice(0, 160);
  const filas = await buscarOrganizacionesPorNombre(s.usuario, texto, MAX_PERSONAS);
  return {
    organizaciones: filas.map((f) => ({
      nombre: f.nombre,
      tipo: TIPOS_ORGANIZACION[f.kind] || f.kind,
      detalle: f.detalle || null,
      url: f.kind === 'organizacion' ? `${WEB}/organizations/${encodeURIComponent(f.ref_id)}` : `${WEB}/buscar?q=${encodeURIComponent(f.nombre)}`,
    })),
    nota:
      filas.length === 0
        ? 'No hay ninguna organización ni órgano en GovTalent con ese nombre. Prueba con una sola palabra del nombre o con sus siglas.'
        : 'Para llevar alguna al mapa de un proyecto, usa anadir_actor_a_proyecto con el nombre tal cual sale aquí.',
  };
}

// ---------------------------------------------------------------------
// Listas de contactos
// ---------------------------------------------------------------------

export async function misListas(s) {
  if (!s.directorio) {
    return { listas: [], nota: 'Las listas son del Directorio, que se contrata aparte.', ver_planes: `${WEB}/precios` };
  }
  // Las del usuario y las de su organización, como en la pantalla.
  const { data: om } = await s.admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', s.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  let q = s.admin.from('contactos_listas').select('id, nombre, consulta, updated_at');
  q = om?.organization_id ? q.or(`owner_id.eq.${s.userId},organization_id.eq.${om.organization_id}`) : q.eq('owner_id', s.userId);
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(30);
  if (error) throw new Error(error.message);

  return {
    listas: (data || []).map((l) => ({
      id: l.id,
      nombre: l.nombre,
      busqueda_guardada: l.consulta || null,
      actualizada: l.updated_at,
      url: `${WEB}/contactos/listas/${l.id}`,
    })),
    ver_en_govtalent: `${WEB}/contactos/listas`,
  };
}
