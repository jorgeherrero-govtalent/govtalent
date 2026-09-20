// =====================================================================
// BACKOFFICE — estado de los syncs
// app/api/backoffice/syncs/route.js
//
// Responde a una sola pregunta: ¿qué corrió anoche y qué no?
//
// El cálculo vive en lib/estadoSyncs.js, porque lo comparte con el correo
// de aviso (/api/cron/vigilante-syncs). Aquí solo queda quién puede
// mirarlo. Ahí está explicado por qué el censo de rutas sale de
// vercel.json y no de la base.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { estadoDeSyncs } from '@/lib/estadoSyncs';

export const dynamic = 'force-dynamic';

async function requireSuperadmin() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
  if (profile?.role !== 'platform_admin') return null;
  return authData.user;
}

export async function GET() {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const estado = await estadoDeSyncs(createAdminClient());

  if (estado.error) {
    console.error('Error backoffice/syncs:', estado.error);
    return NextResponse.json({ error: estado.error }, { status: 500 });
  }

  return NextResponse.json(estado);
}
