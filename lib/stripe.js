import Stripe from 'stripe';

// La versión de API se fija aquí a propósito: debe coincidir con la que está
// configurada en el endpoint de webhook del Dashboard de Stripe. Si cambian
// una sin la otra, los campos llegan en sitios distintos y la sincronización
// deja de funcionar en silencio.
export const STRIPE_API_VERSION = '2026-08-26.dahlia';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  appInfo: { name: 'GovTalent', url: 'https://govtalent.app' },
});

/**
 * A partir de la API 2025-03-31 el periodo de facturación vive en las líneas
 * de la suscripción y no en la suscripción. Leemos de los dos sitios para que
 * el código no dependa de la versión concreta.
 */
export function getPeriodEnd(subscription) {
  const item = subscription?.items?.data?.[0];
  const ts = item?.current_period_end ?? subscription?.current_period_end ?? null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

/**
 * Lo mismo con la suscripción asociada a una factura: antes estaba en
 * `invoice.subscription` y ahora en `invoice.parent.subscription_details`.
 */
export function getSubscriptionIdFromInvoice(invoice) {
  const candidate =
    invoice?.parent?.subscription_details?.subscription ??
    invoice?.subscription ??
    null;
  if (!candidate) return null;
  return typeof candidate === 'string' ? candidate : candidate.id;
}
