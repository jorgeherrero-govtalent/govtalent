import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { saldoCreditos, PACKS_CREDITOS } from '@/lib/creditos';

// GET /api/creditos — saldo de créditos del usuario (sql/75) y los packs
// que puede comprar. Los créditos son del Directorio: sin él, saldo 0.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  const directorio = await puedeVerContactos(admin, authData.user.id);
  const saldo = await saldoCreditos(admin, authData.user.id);
  return NextResponse.json(
    { directorio, saldo, packs: PACKS_CREDITOS },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
