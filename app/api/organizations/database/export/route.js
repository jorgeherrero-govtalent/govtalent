import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessDatabase } from '@/lib/plan';
import {
  getExportUsageThisMonth,
  checkAndLogExport,
  exportMonthlyRowLimit,
  exportMaxRowsPerExport,
} from '@/lib/exportRateLimit';

async function getOrgForUser() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: 'No autenticado', status: 401 };

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organizations(id, plan)')
    .eq('user_id', authData.user.id)
    .limit(1)
    .maybeSingle();

  const org = membership?.organizations;
  if (!org) return { error: 'No perteneces a ninguna organización', status: 403 };
  if (!canAccessDatabase(org)) {
    return { error: 'El directorio inteligente es una función del plan Pro', status: 403 };
  }
  return { org, userId: authData.user.id };
}

// Cuánto de la cuota mensual lleva usada la organización — para mostrar la
// barra de progreso en el modal de confirmación, sin registrar nada.
export async function GET() {
  const result = await getOrgForUser();
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  const { usedThisMonth } = await getExportUsageThisMonth(result.org.id);
  return NextResponse.json({
    usedThisMonth,
    limit: exportMonthlyRowLimit(),
    maxPerExport: exportMaxRowsPerExport(),
  });
}

// Confirmación real de una exportación: comprueba la cuota y, si hay
// margen, registra el consumo. El Excel en sí se sigue generando en el
// cliente (los datos ya están cargados ahí) — esta llamada es el guardián
// que se hace justo antes de dejar pasar la descarga.
export async function POST(request) {
  const result = await getOrgForUser();
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await request.json().catch(() => ({}));
  const rowCount = Number(body.rowCount) || 0;
  if (rowCount <= 0) {
    return NextResponse.json({ error: 'No hay filas que exportar' }, { status: 400 });
  }

  const check = await checkAndLogExport(result.org.id, result.userId, rowCount, body.filters);
  if (!check.allowed) {
    return NextResponse.json(
      { error: check.reason, usedThisMonth: check.usedThisMonth, limit: check.limit },
      { status: 429 }
    );
  }

  return NextResponse.json({ ok: true, usedThisMonth: check.usedThisMonth, limit: check.limit });
}
