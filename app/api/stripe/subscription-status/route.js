import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { PLAN_LABELS } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Estados en los que consideramos que el plan ya está dando servicio.
const SERVING = new Set(['active', 'trialing', 'past_due']);

/**
 * GET /api/stripe/subscription-status?session_id=cs_...
 *
 * Lo usa la página de gracias para sondear si el webhook ya aplicó el plan.
 * Solo LEE: nunca escribe. La activación es responsabilidad del webhook, que
 * es la única fuente de verdad.
 */
export async function GET(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Falta session_id' }, { status: 400 });
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
  }

  const meta = session.metadata || {};

  // La sesión tiene que ser de quien la consulta. Sin esto, cualquiera con un
  // session_id ajeno podría averiguar qué compró otra persona.
  if (meta.user_id !== authData.user.id) {
    return NextResponse.json({ error: 'Sesión no disponible' }, { status: 403 });
  }

  const planKey = meta.plan_key || null;
  const scope = meta.scope || null;
  const admin = createAdminClient();

  let ready = false;

  if (scope === 'user') {
    const { data: profile } = await admin
      .from('users')
      .select('plan, plan_status')
      .eq('id', authData.user.id)
      .single();

    ready = profile?.plan === 'pro' && SERVING.has(profile?.plan_status);
  } else if (scope === 'org' && meta.organization_id) {
    const { data: org } = await admin
      .from('organizations')
      .select('plan, plan_status')
      .eq('id', meta.organization_id)
      .single();

    ready = org?.plan === planKey && SERVING.has(org?.plan_status);
  }

  return NextResponse.json({
    ready,
    scope,
    planKey,
    planLabel: PLAN_LABELS[planKey] || null,
    paid: session.payment_status === 'paid',
  });
}
