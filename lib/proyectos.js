// Lógica central de Proyectos.
//
// Mismo criterio que lib/plan.js: toda comprobación de "¿puede este
// usuario hacer X con proyectos?" pasa por aquí, para que los límites
// vivan en un solo archivo y no repartidos por páginas y endpoints.
//
// OJO CON LA PALABRA "PRO". lib/plan.js habla del plan de una
// ORGANIZACIÓN (free/trial/plus/pro, con su prueba gratuita). Esto es
// el plan PERSONAL del usuario (free/pro). Son dos escalas distintas
// que comparten nombre; no se mezclan nunca.

// Cuántos proyectos caben en Pro. No es un límite comercial sino de
// sensatez: quien pasa de veinte proyectos personales en realidad
// necesita Teams, y conviene enterarse antes de que se le haga bola.
const LIMITE_PROYECTOS_PRO = 20;

// Actores por proyecto. Por encima de esto la matriz deja de leerse
// —los chips se pisan— así que el límite protege la herramienta, no
// la factura.
const LIMITE_ACTORES = 60;

// --- Quién puede -----------------------------------------------------

export function tieneProyectos(user) {
  return user?.plan === 'pro';
}

export function puedeCrearProyecto(user, proyectosActuales) {
  if (!tieneProyectos(user)) return false;
  return (proyectosActuales || 0) < LIMITE_PROYECTOS_PRO;
}

export function limiteProyectos() {
  return LIMITE_PROYECTOS_PRO;
}

export function puedeAnadirActor(actoresActuales) {
  return (actoresActuales || 0) < LIMITE_ACTORES;
}

export function limiteActores() {
  return LIMITE_ACTORES;
}

// --- Funciones que llegarán con Teams --------------------------------
//
// Se enseñan en gris dentro de Pro. Una sola lista para que la interfaz
// no pueda desincronizarse de lo que realmente está bloqueado.

export const BLOQUEADO_TEAMS = {
  colaboradores: 'Invitar a compañeros al proyecto',
  responsables: 'Asignar un responsable a cada actor',
  menciones: 'Mencionar a alguien del equipo en una nota',
  registroContactos: 'Registrar reuniones y gestiones con trazabilidad',
  cartera: 'Ver todos los proyectos de la organización',
};

// --- El mapa: de coordenadas a lenguaje ------------------------------
//
// posicion e influencia se guardan como 0-100 porque el usuario arrastra
// y hay que respetar dónde soltó. Pero para escribir un titular ("cuatro
// actores decisivos sin contactar") hacen falta cuadrantes, y ese corte
// se hace aquí y solo aquí.

const CORTE = 50;

export function esAlta(influencia) {
  return (influencia ?? CORTE) > CORTE;
}

export function posicionLabel(posicion) {
  const p = posicion ?? CORTE;
  if (p < 40) return 'En contra';
  if (p > 60) return 'A favor';
  return 'Neutral';
}

// La franja central es deliberadamente ancha (40-60). Un actor cuya
// posición no tienes clara NO es un actor neutral: es un actor que no
// has averiguado. Llamarlo "neutral" a la primera desviación daría una
// falsa sensación de mapa terminado.

export function cuadrante(actor) {
  return `${esAlta(actor?.influencia) ? 'Alta' : 'Baja'} · ${posicionLabel(actor?.posicion).toLowerCase()}`;
}

// Los que deciden y aún no sabes de qué lado están. Es la única
// pregunta que el mapa contesta de un vistazo, y la razón de que la
// zona de prioridad esté pintada.
export function enZonaDePrioridad(actor) {
  return esAlta(actor?.influencia) && posicionLabel(actor?.posicion) === 'Neutral';
}

export function resumenMapa(actores) {
  const lista = actores || [];
  const prioridad = lista.filter(enZonaDePrioridad);
  return {
    total: lista.length,
    sinContactar: lista.filter((a) => a.relacion === 'sin_contactar').length,
    enPrioridad: prioridad.length,
    // Lo que de verdad duele: decisivos, indefinidos y sin tocar.
    prioridadSinContactar: prioridad.filter((a) => a.relacion === 'sin_contactar').length,
  };
}

// --- Estado de la relación -------------------------------------------

export const RELACIONES = {
  sin_contactar: { label: 'Sin contactar', borde: 'dashed' },
  en_curso: { label: 'Relación iniciada', borde: 'solid' },
  aliado: { label: 'Aliado', borde: 'solid' },
};

export function relacionLabel(valor) {
  return RELACIONES[valor]?.label || RELACIONES.sin_contactar.label;
}

// --- Actores del directorio vs. propios -------------------------------
//
// Un actor propio no tiene kind ni ref_id, así que no cruza con
// follow_events y nunca traerá avisos. Que la interfaz lo sepa evita
// prometer un seguimiento que no puede existir.

export function tieneSeguimiento(actor) {
  return !actor?.es_propio && !!actor?.kind && !!actor?.ref_id;
}

// --- Enlaces ----------------------------------------------------------

export const TIPOS_ENLACE = {
  x: { label: 'X', placeholder: '@usuario' },
  linkedin: { label: 'LinkedIn', placeholder: '/in/nombre' },
  web: { label: 'Web', placeholder: 'ejemplo.com' },
  correo: { label: 'Correo', placeholder: 'nombre@dominio.es' },
  telefono: { label: 'Teléfono', placeholder: '+34 …' },
};

// Guardamos lo que el usuario escribe, pero al abrirlo hay que llevarle
// a una URL. Se resuelve al pintar y no al guardar, para no perder lo
// que escribió si mañana cambia el dominio de alguna red.
export function urlDeEnlace(tipo, valor) {
  if (!valor) return null;
  const v = valor.trim();
  if (tipo === 'correo') return `mailto:${v}`;
  if (tipo === 'telefono') return `tel:${v.replace(/\s/g, '')}`;
  if (/^https?:\/\//i.test(v)) return v;
  if (tipo === 'x') return `https://x.com/${v.replace(/^@/, '')}`;
  if (tipo === 'linkedin') return `https://www.linkedin.com${v.startsWith('/') ? '' : '/'}${v}`;
  return `https://${v}`;
}

// --- Textos -----------------------------------------------------------

export function proyectosVacioMensaje() {
  return 'Un proyecto reúne los asuntos que sigues, los actores a los que quieres llegar y lo que vas haciendo con cada uno.';
}

export function upsellProyectos() {
  return {
    title: 'Proyectos es una función de Pro',
    message:
      'Organiza tus asuntos públicos en un solo sitio: mapea los actores clave, planifica tu agenda, haz seguimiento normativo y registra tu actividad institucional.',
  };
}
