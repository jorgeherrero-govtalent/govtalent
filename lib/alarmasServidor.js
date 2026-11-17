// =====================================================================
// ALARMAS — lo que comparten las dos formas de guardar una alarma
// lib/alarmasServidor.js
//
// Una alarma se guarda desde la pantalla (/api/alarmas/guardar) y desde
// el MCP (lib/mcp/acciones.js, cuando el usuario la crea hablando con su
// asistente). Las dos tienen que limpiar los campos igual y arrancar la
// vigilancia igual; por eso vive aquí y no copiado en cada sitio.
//
// Solo servidor.
// =====================================================================

import { FUENTES_ALARMA } from '@/lib/alarmas';

const FRECUENCIAS = new Set(['inmediato', 'diario', 'semanal']);

const textos = (v, max, largo = 120) =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x || '').trim().slice(0, largo))
    .filter(Boolean)
    .slice(0, max);

/**
 * La fila de sector_alerts a partir de lo que llega, con los topes de
 * longitud y de número de elementos. No incluye user_id ni id.
 */
export function filaDeAlarma(a) {
  const criterios = a?.criterios || {};
  return {
    nombre: String(a?.nombre || '').trim().slice(0, 60) || 'Mi alarma',
    descripcion: String(a?.descripcion || '').trim().slice(0, 3000),
    keywords: textos(a?.keywords, 15, 60).map((k) => k.toLowerCase()),
    sectores: textos(a?.sectores, 6, 60),
    criterios: {
      resumen: String(criterios.resumen || '').trim().slice(0, 400),
      temas: textos(criterios.temas, 8, 60),
      normativa: textos(criterios.normativa, 8),
      territorios: textos(criterios.territorios, 10, 60),
      excluye: textos(criterios.excluye, 8),
    },
    fuentes: FUENTES_ALARMA,
    frecuencia: FRECUENCIAS.has(a?.frecuencia) ? a.frecuencia : 'semanal',
    activa: a?.activa !== false,
    // Recordatorios a 30, 14, 7, 3 y 1 días del cierre (sql/60). Solo se
    // envían en Pro; en Free la opción se guarda pero no tiene efecto.
    recordar_plazos: a?.recordar_plazos !== false,
  };
}

/**
 * Una alarma NUEVA empieza a vigilar desde ahora. Lo que entró en los
 * últimos siete días se da por visto; sin esto, la primera pasada lo
 * evaluaría y mandaría un correo con cosas de hace una semana como si
 * fueran novedades. `db` es un cliente con service_role.
 */
export async function vigilarDesdeAhora(db, alertId) {
  const { data: reciente } = await db.from('regulatorio_reciente').select('kind, ref_id').limit(3000);
  const filas = (reciente || []).map((r) => ({ alert_id: alertId, kind: r.kind, ref_id: r.ref_id }));
  for (let i = 0; i < filas.length; i += 500) {
    await db
      .from('sector_alert_seen')
      .upsert(filas.slice(i, i + 500), { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true });
  }
}
