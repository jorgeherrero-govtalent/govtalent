import { createAdminClient } from '@/lib/supabase/admin';

// Límites de exportación, por ámbito. El tope es de FILAS acumuladas en el
// mes natural, no de exportaciones: así una sola exportación grande y diez
// pequeñas cuentan igual, y no se puede vaciar el directorio troceándolo.
//
// Los dos directorios llevan contador separado a propósito: son productos
// distintos y quien exporte organizaciones no debe quedarse sin margen para
// exportar contactos institucionales ese mes.
const LIMITES = {
  organizaciones: { mensual: 1600, porExportacion: 400 },
  institucional: { mensual: 2000, porExportacion: 500 },
};

const AMBITO_POR_DEFECTO = 'organizaciones';

function limitesDe(ambito) {
  return LIMITES[ambito] || LIMITES[AMBITO_POR_DEFECTO];
}

export function exportMonthlyRowLimit(ambito = AMBITO_POR_DEFECTO) {
  return limitesDe(ambito).mensual;
}

export function exportMaxRowsPerExport(ambito = AMBITO_POR_DEFECTO) {
  return limitesDe(ambito).porExportacion;
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// Suma de filas ya exportadas por esta organización en lo que va de mes
// natural, dentro de un ámbito. Se usa tanto para pintar la barra de cuota
// como para decidir si se puede exportar más.
export async function getExportUsageThisMonth(organizationId, ambito = AMBITO_POR_DEFECTO) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('directory_exports')
    .select('row_count')
    .eq('organization_id', organizationId)
    .eq('ambito', ambito)
    .gte('created_at', startOfMonthIso());
  if (error) return { usedThisMonth: 0, error };
  const usedThisMonth = (data || []).reduce((sum, r) => sum + (r.row_count || 0), 0);
  return { usedThisMonth };
}

// Comprueba si esta organización puede exportar `rowCount` filas más ahora
// mismo en este ámbito y, si puede, registra la exportación. Debe llamarse
// justo antes de dejar generar el archivo — nunca después, para que quede
// constancia incluso si el usuario cierra la pestaña a mitad de la descarga.
export async function checkAndLogExport(
  organizationId,
  userId,
  rowCount,
  filters,
  ambito = AMBITO_POR_DEFECTO
) {
  const { mensual, porExportacion } = limitesDe(ambito);

  if (rowCount > porExportacion) {
    return {
      allowed: false,
      reason: `No se puede exportar más de ${porExportacion} filas de una vez. Filtra la lista antes de exportar.`,
      limit: mensual,
    };
  }

  const { usedThisMonth } = await getExportUsageThisMonth(organizationId, ambito);
  if (usedThisMonth + rowCount > mensual) {
    return {
      allowed: false,
      reason: `Esto superaría tu cuota mensual de exportación (${mensual} filas). Te quedan ${Math.max(
        0,
        mensual - usedThisMonth
      )} filas disponibles este mes.`,
      usedThisMonth,
      limit: mensual,
    };
  }

  const admin = createAdminClient();
  await admin.from('directory_exports').insert({
    organization_id: organizationId,
    user_id: userId,
    row_count: rowCount,
    filters: filters || null,
    ambito,
  });

  return { allowed: true, usedThisMonth: usedThisMonth + rowCount, limit: mensual };
}
