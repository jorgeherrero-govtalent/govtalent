import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://govtalent.app';

/**
 * POST /api/stripe/portal
 * body: { organizationId?: string }
 *
 * Sin organizationId abre el portal de la suscripción personal (Pro).
 * Con organizationId, el de la organización (Recruiter o Teams).
 */
export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const organizationId = body.organizationId || null;
  const admin = createAdminClient();

  let customerId = null;
  let returnUrl = `${APP_URL}/cuenta/suscripcion`;

  if (organizationId) {
    const { data: membership } = await admin
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', authData.user.id)
      .limit(1)
      .maybeSingle();

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo un administrador puede gestionar la facturación' },
        { status: 403 }
      );
    }

    const { data: org } = await admin
      .from('organizations')
      .select('id, slug, plan, stripe_customer_id')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });
    }

    customerId = org.stripe_customer_id;
    returnUrl = `${APP_URL}/organizaciones/${org.slug}/suscripcion`;
  } else {
    const { data: profile } = await admin
      .from('users')
      .select('id, stripe_customer_id')
      .eq('id', authData.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    customerId = profile.stripe_customer_id;
  }

  // Caso real: planes concedidos a mano (cortesías internas) no tienen cliente
  // en Stripe, así que no hay nada que abrir en el portal.
  if (!customerId) {
    return NextResponse.json(
      { error: 'No hay ninguna suscripción de pago que gestionar' },
      { status: 404 }
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return NextResponse.json({ url: session.url });
}
