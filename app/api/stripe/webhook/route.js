import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  stripe,
  getPeriodEnd,
  getSubscriptionIdFromInvoice,
} from '@/lib/stripe';

// runtime nodejs es obligatorio: la verificación de firma usa crypto.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Traduce el estado de Stripe al de la base de datos.
 *
 * Ojo con la asimetría: el enum `org_plan_status` admite 'trialing', pero el
 * CHECK de `users.plan_status` no. Para usuarios, 'trialing' se guarda como
 * 'active' o la escritura falla.
 */
function mapStatus(stripeStatus, target) {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return target === 'user' ? 'active' : 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'incomplete':
      return 'incomplete';
    case 'canceled':
    case 'incomplete_expired':
    default:
      return 'canceled';
  }
}

// Estados en los que el cliente sigue teniendo derecho al servicio.
const SERVING = new Set(['active', 'trialing', 'past_due', 'unpaid']);

/**
 * Escribe el estado de una suscripción de Stripe en Supabase.
 * Es idempotente: aplicarla dos veces deja el mismo resultado.
 */
async function applySubscription(admin, subscription, extra = {}) {
  const meta = { ...(extra.metadataFallback || {}), ...(subscription.metadata || {}) };
  let scope = meta.scope;
  let planKey = meta.plan_key;
  let userId = meta.user_id || null;
  let organizationId = meta.organization_id || null;

  // Plan B: si la suscripción llega sin metadatos (creada a mano en el
  // Dashboard, por ejemplo), localizamos la fila por el id de suscripción.
  if (!scope) {
    const { data: orgRow } = await admin
      .from('organizations')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();
    if (orgRow) {
      scope = 'org';
      organizationId = orgRow.id;
    } else {
      const { data: userRow } = await admin
        .from('users')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle();
      if (userRow) {
        scope = 'user';
        userId = userRow.id;
      }
    }
  }

  if (!scope) {
    console.error(
      `Suscripción ${subscription.id} sin metadatos ni fila asociada: no se aplica`
    );
    return;
  }

  const serving = SERVING.has(subscription.status);
  const renewsAt = getPeriodEnd(subscription);
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);

  if (scope === 'user') {
    if (!userId) return;
    const plan = serving ? 'pro' : 'free';
    const patch = {
      plan,
      plan_status: mapStatus(subscription.status, 'user'),
      stripe_subscription_id: subscription.id,
      plan_renews_at: renewsAt,
      cancel_at_period_end: cancelAtPeriodEnd,
      // Columnas de la etapa anterior: las mantenemos coherentes para no
      // romper el código que todavía lee is_premium.
      is_premium: serving,
      premium_source: serving ? 'paid' : null,
    };
    if (serving) patch.plan_started_at = new Date().toISOString();
    if (extra.foundingMember) patch.is_founding_member = true;
    if (typeof subscription.customer === 'string') {
      patch.stripe_customer_id = subscription.customer;
    }

    const { error } = await admin.from('users').update(patch).eq('id', userId);
    if (error) throw error;
    return;
  }

  if (!organizationId) return;
  const plan = serving && planKey ? planKey : 'free';
  const patch = {
    plan,
    plan_status: mapStatus(subscription.status, 'org'),
    stripe_subscription_id: subscription.id,
    plan_renews_at: renewsAt,
    cancel_at_period_end: cancelAtPeriodEnd,
    is_premium: serving,
  };
  if (extra.foundingMember) patch.is_founding_member = true;
  if (typeof subscription.customer === 'string') {
    patch.stripe_customer_id = subscription.customer;
  }

  const { error } = await admin
    .from('organizations')
    .update(patch)
    .eq('id', organizationId);

  if (error) {
    // El CHECK organizations_paid_requires_active_account salta si la
    // organización dejó de estar reclamada o verificada entre el pago y este
    // evento. Registramos el plan igualmente en estado degradado para no
    // perder el rastro del cobro.
    console.error(
      `No se pudo aplicar el plan ${plan} a la organización ${organizationId}:`,
      error.message
    );
    throw error;
  }
}

export async function POST(request) {
  // Cuerpo en CRUDO. Si dejas que Next parsee el JSON, la firma nunca valida.
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Firma de webhook no válida:', err.message);
    return NextResponse.json({ error: 'Firma no válida' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotencia. Stripe reenvía eventos si duda de la respuesta y puede
  // entregarlos desordenados: sin esto, un reenvío de subscription.deleted
  // degradaría a Free a alguien que acaba de renovar.
  const { error: claimError } = await admin.from('stripe_events').insert({
    id: event.id,
    type: event.type,
    payload: event,
  });

  if (claimError) {
    if (claimError.code === '23505') {
      return NextResponse.json({ received: true, duplicated: true });
    }
    console.error('No se pudo registrar el evento de Stripe:', claimError.message);
    // 500 para que Stripe reintente.
    return NextResponse.json({ error: 'Error de registro' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription' || !session.subscription) break;

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // Si la sesión llevó descuento aplicado, era una compra de fundador.
        const foundingMember =
          Number(session.total_details?.amount_discount || 0) > 0;

        await applySubscription(admin, subscription, {
          foundingMember,
          metadataFallback: session.metadata,
        });
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(admin, event.data.object);
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const subscriptionId = getSubscriptionIdFromInvoice(event.data.object);
        if (!subscriptionId) break;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(admin, subscription);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`Error procesando ${event.type} (${event.id}):`, err);
    // Liberamos la marca de idempotencia para que el reintento de Stripe
    // vuelva a procesarlo en lugar de descartarlo como duplicado.
    await admin.from('stripe_events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'Error procesando' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
