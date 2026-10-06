/**
 * Leyes que sigue un usuario y caducaron con la disolución de las Cortes
 * del 06-10-2026 (art. 207 del Reglamento del Congreso).
 *
 * Lo usan el aviso de Novedades, la página para decidir qué mantener y
 * el correo único. Una caducada se reconoce por su resultado, que viene
 * como «Caducado dd/mm/aaaa»; «Decaído» es otra cosa y no entra.
 */

// Ya ha decidido qué hacer con ellas: el aviso deja de salir.
export const CLAVE_RESUELTO = 'resuelto:caducadas-xv';
// Ya se le ha mandado el correo. Solo la escribe el servidor.
export const CLAVE_CORREO = 'correo:caducadas-xv';

export const FECHA_DISOLUCION = '6 de octubre';

const COLUMNAS = 'num_expediente, slug, title, situacion, fase, comision, resultado, n_prorrogas';

/**
 * Funciona con el cliente del navegador (RLS: solo sus seguimientos) y
 * con el de servidor (service role), pasando el usuario.
 */
export async function leyesCaducadasQueSigue(supabase, userId) {
  const { data: seguidas, error } = await supabase
    .from('follows')
    .select('id, ref_id, label')
    .eq('user_id', userId)
    .eq('kind', 'ley');
  if (error) throw error;
  if (!seguidas || seguidas.length === 0) return [];

  const porRef = new Map(seguidas.map((f) => [String(f.ref_id), f]));
  const { data: leyes, error: e2 } = await supabase
    .from('es_initiatives_directory')
    .select(COLUMNAS)
    .in('num_expediente', [...porRef.keys()])
    .eq('is_closed', true)
    .ilike('resultado', 'caducad%');
  if (e2) throw e2;

  return (leyes || []).map((l) => ({
    ...l,
    followId: porRef.get(l.num_expediente)?.id || null,
    // «Dónde se quedó»: el órgano y la fase en la que estaba.
    seQuedo: [l.situacion, l.fase].filter(Boolean).join(' · ') || null,
  }));
}
