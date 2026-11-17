// =====================================================================
// MCP — tope de uso y registro de llamadas
// lib/mcp/cuota.js
//
// Cada llamada a una herramienta se apunta en mcp_llamadas (sql/133):
// quién, desde qué asistente, qué herramienta y cuándo. Sirve para tres
// cosas: cortar un uso automatizado, enseñar al usuario la última vez
// que se usó cada conexión y saber qué se pide de verdad.
//
// LOS TOPES SON POR USUARIO Y POR 24 HORAS, y hay tres:
//   total        todas las herramientas juntas
//   directorio   las búsquedas de personas. Es el más bajo a propósito:
//                desde el MCP se consulta, no se exporta. Con diez
//                personas por búsqueda, el tope deja mirar a quien
//                necesitas pero no llevarse el directorio.
//   escritura    lo que crea o cambia algo
//
// No se apunta en ai_usage_log: esa tabla alimenta el tope general de
// las funciones de IA (lib/aiRateLimit.js) y aquí GovTalent no gasta IA,
// la pone el asistente del usuario.
//
// Si la tabla todavía no existe (código desplegado antes que el SQL), no
// se bloquea a nadie: se deja pasar y se avisa en el log.
// =====================================================================

export const TOPES = {
  free: { total: 200, directorio: 30, escritura: 30 },
  pro: { total: 1000, directorio: 150, escritura: 200 },
};

const MENSAJE = {
  total: 'Has alcanzado el máximo de consultas a GovTalent desde tu asistente por hoy. Mañana vuelve a estar disponible; mientras, todo sigue en govtalent.app.',
  directorio: 'Has alcanzado el máximo de búsquedas en el directorio desde tu asistente por hoy. Puedes seguir consultándolo en govtalent.app.',
  escritura: 'Has alcanzado el máximo de cambios desde tu asistente por hoy. Puedes seguir haciéndolos en govtalent.app.',
};

/**
 * ¿Cabe una llamada más? Si cabe, la apunta.
 * `grupo` es 'consulta', 'directorio' o 'escritura'.
 */
export async function comprobarYApuntar(s, herramienta, grupo) {
  const topes = TOPES[s.pago ? 'pro' : 'free'];
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const contar = (g) => {
    let q = s.admin.from('mcp_llamadas').select('id', { count: 'exact', head: true }).eq('user_id', s.userId).gte('created_at', desde);
    if (g) q = q.eq('grupo', g);
    return q;
  };

  const [total, delGrupo] = await Promise.all([contar(null), grupo === 'consulta' ? Promise.resolve({ count: 0 }) : contar(grupo)]);

  if (total.error || delGrupo.error) {
    console.error('[mcp] cuota:', (total.error || delGrupo.error).message);
    return { ok: true };
  }
  if ((total.count || 0) >= topes.total) return { ok: false, motivo: MENSAJE.total };
  if (grupo !== 'consulta' && (delGrupo.count || 0) >= topes[grupo]) return { ok: false, motivo: MENSAJE[grupo] };

  const { error } = await s.admin.from('mcp_llamadas').insert({
    user_id: s.userId,
    client_id: s.clientId,
    herramienta,
    grupo,
  });
  if (error) console.error('[mcp] registro:', error.message);
  return { ok: true };
}
