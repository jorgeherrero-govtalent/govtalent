import { createAdminClient } from '@/lib/supabase/admin';

// Límite de exportación del Directorio Inteligente — pensado para permitir
// el uso normal de armar listas de trabajo (una exportación filtrada de vez
// en cuando), pero hacer inviable vaciar el directorio completo trocéandolo
// en muchas exportaciones pequeñas. Ver conversación de diseño: el tope es
// de FILAS acumuladas en el mes, no de exportaciones — así una sola
// exportación grande y varias pequeñas cuentan igual.
const MONTHLY_ROW_LIMIT = 1600;
const MAX_ROWS_PER_EXPORT = 400;

export function exportMonthlyRowLimit() {
  return MONTHLY_ROW_LIMIT;
}

export function exportMaxRowsPerExport() {
  return MAX_ROWS_PER_EXPORT;
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// Suma de filas ya exportadas por esta organización en lo que va de mes
// natural. Se usa tanto para mostrar la barra de cuota como para decidir si
// se puede exportar más.
export async function getExportUsageThisMonth(organizationId) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('directory_exports')
    .select('row_count')
    .eq('organization_id', organizationId)
    .gte('created_at', startOfMonthIso());
  if (error) return { usedThisMonth: 0, error };
  const usedThisMonth = (data || []).reduce((sum, r) => sum + (r.row_count || 0), 0);
  return { usedThisMonth };
}

// Comprueba si esta organización puede exportar `rowCount` filas más ahora
// mismo y, si puede, registra la exportación. Debe llamarse justo antes de
// dejar generar el archivo — nunca después, para que quede constancia
// incluso si el usuario cierra la pestaña a mitad de la descarga.
export async function checkAndLogExport(organizationId, userId, rowCount, filters) {
  if (rowCount > MAX_ROWS_PER_EXPORT) {
    return {
      allowed: false,
      reason: `No se puede exportar más de ${MAX_ROWS_PER_EXPORT} filas de una vez. Filtra la lista antes de exportar.`,
    };
  }

  const { usedThisMonth } = await getExportUsageThisMonth(organizationId);
  if (usedThisMonth + rowCount > MONTHLY_ROW_LIMIT) {
    return {
      allowed: false,
      reason: `Esto superaría tu cuota mensual de exportación (${MONTHLY_ROW_LIMIT} filas). Te quedan ${Math.max(0, MONTHLY_ROW_LIMIT - usedThisMonth)} filas disponibles este mes.`,
      usedThisMonth,
      limit: MONTHLY_ROW_LIMIT,
    };
  }

  const admin = createAdminClient();
  await admin.from('directory_exports').insert({
    organization_id: organizationId,
    user_id: userId,
    row_count: rowCount,
    filters: filters || null,
  });

  return { allowed: true, usedThisMonth: usedThisMonth + rowCount, limit: MONTHLY_ROW_LIMIT };
}
