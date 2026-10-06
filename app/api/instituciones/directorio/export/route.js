import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessDatabase } from '@/lib/plan';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import {
  getExportUsageThisMonth,
  checkAndLogExport,
  exportMonthlyRowLimit,
  exportMaxRowsPerExport,
} from '@/lib/exportRateLimit';

// Mismo guardián que el export de organizaciones, pero contando contra el
// ámbito "institucional": las dos cuotas son independientes.
const AMBITO = 'institucional';

// Quién exporta: hace falta el Directorio (propio o por una organización
// Teams). La cuota es de la organización si la hay; si no, de la persona.
async function getOrgForUser() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: 'No autenticado', status: 401 };

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return { error: 'El directorio institucional se contrata aparte', status: 403 };
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organizations(id, plan, plan_status, claimed, verified)')
    .eq('user_id', authData.user.id)
    .limit(1)
    .maybeSingle();

  const org = membership?.organizations;
  const orgId = org && canAccessDatabase(org) ? org.id : null;
  return { org: { id: orgId }, userId: authData.user.id };
}

// Cuota consumida en lo que va de mes, para la barra del modal. No registra.
export async function GET() {
  const result = await getOrgForUser();
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  const { usedThisMonth } = await getExportUsageThisMonth(result.org.id, AMBITO, result.userId);
  return NextResponse.json({
    usedThisMonth,
    limit: exportMonthlyRowLimit(AMBITO),
    maxPerExport: exportMaxRowsPerExport(AMBITO),
  });
}

// Confirmación real: comprueba la cuota y, si hay margen, registra el
// consumo. El Excel se genera en el cliente con los datos ya cargados;
// esta llamada es el guardián que se hace justo antes de dejar descargar.
export async function POST(request) {
  const result = await getOrgForUser();
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await request.json().catch(() => ({}));
  const rowCount = Number(body.rowCount) || 0;
  if (rowCount <= 0) {
    return NextResponse.json({ error: 'No hay filas que exportar' }, { status: 400 });
  }

  const check = await checkAndLogExport(
    result.org.id,
    result.userId,
    rowCount,
    body.filters,
    AMBITO
  );
  if (!check.allowed) {
    return NextResponse.json(
      { error: check.reason, usedThisMonth: check.usedThisMonth, limit: check.limit },
      { status: 429 }
    );
  }

  return NextResponse.json({ ok: true, usedThisMonth: check.usedThisMonth, limit: check.limit });
}
