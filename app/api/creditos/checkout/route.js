import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { packPorCreditos } from '@/lib/creditos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://govtalent.app';

/**
 * POST /api/creditos/checkout  body: { creditos: 100 | 500 | 1000 }
 *
 * Sesión de Checkout de pago único para un pack de créditos. Solo con el
 * Directorio activo: los créditos sirven para enriquecer contactos y sin
 * Directorio no hay dónde gastarlos. El webhook suma los créditos
 * (checkout.session.completed, mode = payment, plan_key = creditos) a la
 * bolsa del comprador; el número sale de los metadatos del precio en
 * Stripe, no de lo que diga el navegador.
 */
export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const pack = packPorCreditos(body.creditos);
  if (!pack) return NextResponse.json({ error: 'Pack no válido' }, { status: 400 });

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return NextResponse.json({ error: 'Los créditos son del Directorio, que se contrata aparte' }, { status: 403 });
  }

  const prices = await stripe.prices.list({ lookup_keys: [pack.lookup], active: true, limit: 1 });
  const price = prices.data[0];
  const creditos = Number(price?.metadata?.creditos);
  if (!price || !(creditos > 0)) {
    console.error(`No hay precio activo con lookup_key "${pack.lookup}" y metadata.creditos en Stripe`);
    return NextResponse.json({ error: 'Pack no disponible temporalmente' }, { status: 503 });
  }

  const { data: profile } = await admin
    .from('users')
    .select('id, email, first_name, last_name, stripe_customer_id')
    .eq('id', authData.user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || undefined,
      metadata: { supabase_user_id: profile.id },
    });
    customerId = customer.id;
    await admin.from('users').update({ stripe_customer_id: customerId }).eq('id', profile.id);
  }

  const metadata = { scope: 'user', plan_key: 'creditos', user_id: profile.id, creditos: String(creditos) };

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      consent_collection: { terms_of_service: 'required' },
      // Factura de la compra, como en las suscripciones.
      invoice_creation: { enabled: true, invoice_data: { metadata } },
      client_reference_id: profile.id,
      metadata,
      payment_intent_data: { metadata },
      success_url: `${APP_URL}/contactos?compra=ok`,
      cancel_url: `${APP_URL}/contactos`,
    });
  } catch (err) {
    console.error('Error creando la sesión de Checkout de créditos:', err.message);
    return NextResponse.json({ error: 'No hemos podido iniciar el pago. Inténtalo de nuevo.' }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
