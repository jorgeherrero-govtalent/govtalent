// =====================================================================
// ESTADO DE LOS SYNCS
// lib/estadoSyncs.js
//
// Responde a una sola pregunta: ¿qué corrió y qué no?
//
// Estaba dentro de la pantalla del backoffice. Se saca aquí porque ahora
// hay dos consumidores —la pantalla y el correo de aviso— y el día en que
// digan cosas distintas, la pantalla parecerá tranquila mientras el correo
// grita, o al revés. Un solo cálculo, dos formas de enseñarlo.
//
// EL CENSO SALE DE vercel.json, NO DE LA BASE. Esa es la decisión que
// sostiene todo esto. Si la lista de rutas se sacara de lo que hay escrito
// en `sync_log`, una ruta que lleva un mes sin ejecutarse simplemente no
// aparecería — que es exactamente cómo las comparecencias del Congreso
// estuvieron treinta y dos días sin cargarse sin que nadie lo viera.
// Partiendo del censo de crones, una ruta que no ha corrido sigue ocupando
// su fila y la fila grita.
// =====================================================================

import vercel from '@/vercel.json';

// Cuántas filas se traen para buscar la última de cada ruta. Una noche
// con cadenas largas son unas cuantas decenas; 600 cubre varios días con
// holgura y sigue siendo una sola consulta.
const FILAS = 600;

// Margen sobre la cadencia antes de dar una ruta por caída. Un cron
// diario que lleva 26 horas sin correr se ha saltado una noche; menos
// margen daría falsos positivos por la propia hora de ejecución.
const MARGEN_DIARIO_MS = 26 * 3600 * 1000;
const MARGEN_SEMANAL_MS = 8 * 86400 * 1000;

// Una fila que abrió y nunca cerró es una invocación muerta por tiempo.
// Se le da margen para que no cuente como muerta la que está corriendo
// justo ahora.
const MARGEN_EN_CURSO_MS = 10 * 60 * 1000;

// Lo que se le dice a quien lo lea, en palabras y no en códigos.
export const EXPLICACION = {
  nunca: 'no ha corrido nunca',
  colgada: 'se quedó a medias: abrió y no cerró',
  atrasada: 'lleva demasiado tiempo sin correr',
  error: 'terminó con error',
  cortado: 'terminó dejando trabajo pendiente',
  al_dia: 'al día',
};

/**
 * La hora a la que le toca, y cada cuánto.
 *
 * Vercel programa en UTC. Se guarda la hora tal cual para ordenar y se
 * deja que la pantalla la enseñe en hora local, que es como la mira
 * quien la abre.
 */
export function leerCron(expresion) {
  const [min, hora, , , diaSemana] = String(expresion || '').split(' ');
  const semanal = diaSemana !== undefined && diaSemana !== '*';
  return {
    minuto: parseInt(min, 10) || 0,
    hora: parseInt(hora, 10) || 0,
    cadencia: semanal ? 'semanal' : 'diaria',
    margen: semanal ? MARGEN_SEMANAL_MS : MARGEN_DIARIO_MS,
  };
}

/**
 * El estado de todas las rutas del censo.
 *
 * `admin` es un cliente de Supabase de servicio: `sync_log` no necesita
 * política de lectura para el navegador, igual que el resto del backoffice.
 *
 * Devuelve { rutas, resumen, generado } o { error }.
 */
export async function estadoDeSyncs(admin, ahora = Date.now()) {
  const { data: filas, error } = await admin
    .from('sync_log')
    .select('id, ruta, estado, n_leidos, n_escritos, duracion_ms, ejecutado_at, detalle')
    .order('ejecutado_at', { ascending: false })
    .limit(FILAS);

  if (error) return { error: error.message };

  const registros = filas || [];

  const rutas = (vercel.crons || []).map((c) => {
    const cron = leerCron(c.schedule);
    const suyas = registros.filter((r) => r.ruta === c.path);

    // La última REAL, que no es lo mismo que la última. Una prueba en
    // seco lanzada a mano esta tarde no significa que el cron corriera.
    const reales = suyas.filter((r) => r.estado !== 'prueba' && r.estado !== 'omitido');
    const ultima = reales[0] || null;
    const ultimaCualquiera = suyas[0] || null;

    const desde = ultima ? ahora - new Date(ultima.ejecutado_at).getTime() : null;

    // Las invocaciones de una misma tanda: sirve para ver de un vistazo
    // si una cadena hizo un eslabón o quince.
    const ultimas24h = reales.filter((r) => ahora - new Date(r.ejecutado_at).getTime() < 24 * 3600 * 1000);

    const colgada = reales.some(
      (r) => r.estado === 'empezado' && ahora - new Date(r.ejecutado_at).getTime() > MARGEN_EN_CURSO_MS
    );

    // El veredicto. Por orden: lo que nunca corrió, lo que se murió a
    // medias, lo que lleva demasiado sin correr, y lo que terminó
    // dejando trabajo pendiente.
    let veredicto = 'al_dia';
    if (!ultima) veredicto = 'nunca';
    else if (colgada) veredicto = 'colgada';
    else if (desde > cron.margen) veredicto = 'atrasada';
    else if (ultima.estado === 'error') veredicto = 'error';
    else if (ultima.estado === 'cortado') veredicto = 'cortado';

    return {
      ruta: c.path,
      programada: c.schedule,
      hora_utc: cron.hora,
      minuto_utc: cron.minuto,
      cadencia: cron.cadencia,
      veredicto,
      ultima_ejecucion: ultima?.ejecutado_at || null,
      ultimo_estado: ultima?.estado || null,
      duracion_ms: ultima?.duracion_ms ?? null,
      n_leidos: ultima?.n_leidos ?? null,
      n_escritos: ultima?.n_escritos ?? null,
      detalle: ultima?.detalle || null,
      invocaciones_24h: ultimas24h.length,
      // Se muestra aparte para que quede claro que hubo una prueba
      // manual pero que no cuenta como ejecución.
      hubo_prueba: !!(ultimaCualquiera && ultimaCualquiera.estado === 'prueba'),
    };
  });

  // Por hora programada: así la tabla se lee como se lee la noche.
  rutas.sort((a, b) => a.hora_utc - b.hora_utc || a.minuto_utc - b.minuto_utc);

  const alDia = rutas.filter((r) => r.veredicto === 'al_dia').length;

  return {
    rutas,
    resumen: {
      total: rutas.length,
      al_dia: alDia,
      con_problema: rutas.length - alDia,
      // Si no hay ni una fila, lo más probable es que el registro no
      // esté desplegado todavía. Merece decirlo en vez de pintar
      // dieciocho "nunca" que asustan sin motivo.
      sin_registro: registros.length === 0,
    },
    generado: new Date(ahora).toISOString(),
  };
}
