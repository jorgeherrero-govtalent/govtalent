import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { PLAN_SCOPE, PRICE_LOOKUP_KEYS } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://govtalent.app';

/**
 * POST /api/stripe/checkout
 * body: { plan: 'pro' | 'recruiter' | 'teams', organizationId?: string }
 *
 * Devuelve { url } con la sesión de Checkout. Toda la validación de acceso
 * ocurre AQUÍ, antes de cobrar: el webhook no vuelve a comprobar nada, porque
 * rechazar un pago ya cobrado deja al cliente sin servicio y con cargo hecho.
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

  const plan = body.plan;
  const organizationId = body.organizationId || null;
  const scope = PLAN_SCOPE[plan];

  if (!scope) {
    return NextResponse.json({ error: 'Plan no válido' }, { status: 400 });
  }

  const admin = createAdminClient();

  // El precio se resuelve por lookup_key, nunca por price_id fijo en el código:
  // así puedes subir precios en Stripe sin tocar ni desplegar nada.
  const lookupKey = PRICE_LOOKUP_KEYS[plan];
  const prices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    console.error(`No hay precio activo con lookup_key "${lookupKey}" en Stripe`);
    return NextResponse.json(
      { error: 'Plan no disponible temporalmente' },
      { status: 503 }
    );
  }

  let customerId = null;
  let metadata = null;
  let clientReferenceId = null;

  if (scope === 'user') {
    const { data: profile } = await admin
      .from('users')
      .select('id, email, first_name, last_name, plan, plan_status, stripe_customer_id')
      .eq('id', authData.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    if (profile.plan === 'pro' && profile.plan_status === 'active') {
      return NextResponse.json(
        { error: 'Ya tienes una suscripción Pro activa' },
        { status: 409 }
      );
    }

    customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || undefined,
        metadata: { supabase_user_id: profile.id },
      });
      customerId = customer.id;
      await admin
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', profile.id);
    }

    clientReferenceId = profile.id;
    metadata = { scope: 'user', plan_key: plan, user_id: profile.id };
  } else {
    if (!organizationId) {
      return NextResponse.json(
        { error: 'Falta la organización' },
        { status: 400 }
      );
    }

    // .limit(1) obligatorio: sin él, maybeSingle() falla en silencio para
    // usuarios que pertenecen a más de una organización.
    const { data: membership } = await admin
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', authData.user.id)
      .limit(1)
      .maybeSingle();

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo un administrador de la organización puede contratar un plan' },
        { status: 403 }
      );
    }

    const { data: org } = await admin
      .from('organizations')
      .select('id, name, claimed, verified, plan, plan_status, contact_email, stripe_customer_id')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });
    }

    // Una ficha de directorio sin reclamar ni verificar no puede contratar.
    // La base de datos también lo impide con un CHECK, pero cortamos aquí para
    // no llegar siquiera a cobrar.
    if (!org.claimed || !org.verified) {
      return NextResponse.json(
        {
          error:
            'La organización debe estar reclamada y verificada antes de contratar un plan',
        },
        { status: 403 }
      );
    }

    if (org.plan !== 'free' && org.plan_status === 'active') {
      return NextResponse.json(
        { error: 'La organización ya tiene un plan activo' },
        { status: 409 }
      );
    }

    customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        email: org.contact_email || authData.user.email,
        metadata: { supabase_organization_id: org.id },
      });
      customerId = customer.id;
      await admin
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', org.id);
    }

    clientReferenceId = org.id;
    metadata = {
      scope: 'org',
      plan_key: plan,
      organization_id: org.id,
      user_id: authData.user.id,
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    // Campo de código promocional, para FUNDADOR30 y el cupón de Teams.
    allow_promotion_codes: true,
    // Stripe Tax: 21% en España, inversión del sujeto pasivo con NIF-IVA
    // válido en VIES, y tipo del país del cliente para particulares de la UE.
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    client_reference_id: clientReferenceId,
    metadata,
    // Los mismos metadatos en la suscripción: son los que lee el webhook en
    // los eventos posteriores (renovaciones, impagos, cancelaciones).
    subscription_data: { metadata },
    success_url: `${APP_URL}/suscripcion/gracias?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/precios`,
  });

  return NextResponse.json({ url: session.url });
}
