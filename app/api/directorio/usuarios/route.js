import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { DIRECTORIO_USUARIO_EXTRA } from '@/lib/precios';

// Usuarios adicionales del Directorio (sql/85, maqueta A).
//
//   GET                         → titular, accesos, renovación
//   POST { email, previsualizar: true } → importe prorrateado, sin cobrar
//   POST { email }              → cobra el prorrateo y da acceso
//   DELETE { email }            → quita el acceso (sin devolución; deja de
//                                 cobrarse en la renovación)
//
// El usuario adicional es una línea más (precio directorio_usuario_extra)
// en la misma suscripción del Directorio: el prorrateo se calcula hasta su
// renovación y todo se renueva junto.

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOOKUP_EXTRA = 'directorio_usuario_extra';

async function contexto() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: yo } = await admin
    .from('users')
    .select('id, email, first_name, last_name, directorio_status, directorio_subscription_id, directorio_renews_at, directorio_usuarios_extra')
    .eq('id', authData.user.id)
    .single();
  if (!yo || !['active', 'past_due'].includes(yo.directorio_status)) {
    return { error: NextResponse.json({ error: 'Solo el titular del Directorio puede gestionar sus usuarios' }, { status: 403 }) };
  }
  return { admin, yo };
}

async function suscripcion(id) {
  if (!id) return null;
  return stripe.subscriptions.retrieve(id, { expand: ['items.data.price'] });
}

function lineaExtra(sub) {
  return sub?.items?.data?.find((i) => i.price?.lookup_key === LOOKUP_EXTRA) || null;
}

/** Fracción del periodo que queda, de la línea principal. */
function prorrateo(sub) {
  const item = sub?.items?.data?.[0];
  const ini = item?.current_period_start ?? sub?.current_period_start;
  const fin = item?.current_period_end ?? sub?.current_period_end;
  if (!ini || !fin) return null;
  const ahora = Date.now() / 1000;
  const frac = Math.max(0, Math.min(1, (fin - ahora) / (fin - ini)));
  return { frac, fin: new Date(fin * 1000).toISOString() };
}

async function lista(admin, titularId) {
  const { data: accesos } = await admin
    .from('directorio_accesos')
    .select('email, created_at')
    .eq('titular_id', titularId)
    .order('created_at');
  const emails = (accesos || []).map((a) => a.email.toLowerCase());
  let nombres = {};
  if (emails.length) {
    const { data: us } = await admin.from('users').select('email, first_name, last_name').in('email', emails);
    for (const u of us || []) nombres[u.email.toLowerCase()] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || null;
  }
  return (accesos || []).map((a) => ({
    email: a.email,
    nombre: nombres[a.email.toLowerCase()] || null,
    con_cuenta: a.email.toLowerCase() in nombres,
    desde: a.created_at,
  }));
}

export async function GET() {
  const c = await contexto();
  if (c.error) return c.error;
  const { admin, yo } = c;
  return NextResponse.json({
    titular: { email: yo.email, nombre: `${yo.first_name || ''} ${yo.last_name || ''}`.trim() },
    accesos: await lista(admin, yo.id),
    precio_extra: DIRECTORIO_USUARIO_EXTRA,
    renueva: yo.directorio_renews_at,
    con_cobro: !!yo.directorio_subscription_id,
  });
}

export async function POST(request) {
  const c = await contexto();
  if (c.error) return c.error;
  const { admin, yo } = c;
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'Escribe un correo válido' }, { status: 400 });
  if (email === String(yo.email || '').toLowerCase()) {
    return NextResponse.json({ error: 'Ese es tu correo: ya tienes acceso como titular' }, { status: 400 });
  }

  // ¿Ya tiene acceso (aquí o en otro Directorio) o su propio Directorio?
  const { data: yaAcceso } = await admin.from('directorio_accesos').select('titular_id').ilike('email', email).maybeSingle();
  if (yaAcceso) {
    return NextResponse.json(
      { error: yaAcceso.titular_id === yo.id ? 'Esa persona ya tiene acceso' : 'Esa persona ya tiene acceso por otra suscripción' },
      { status: 409 }
    );
  }
  const { data: propio } = await admin.from('users').select('directorio_status').ilike('email', email).maybeSingle();
  if (propio && ['active', 'past_due'].includes(propio.directorio_status)) {
    return NextResponse.json({ error: 'Esa persona ya tiene su propio Directorio' }, { status: 409 });
  }

  const sub = await suscripcion(yo.directorio_subscription_id).catch(() => null);
  const p = sub ? prorrateo(sub) : null;
  const importe = p ? Math.round(DIRECTORIO_USUARIO_EXTRA * p.frac * 100) / 100 : 0;

  if (body.previsualizar) {
    return NextResponse.json({
      email,
      con_cuenta: !!propio,
      con_cobro: !!sub,
      importe_ahora: importe,
      anual: DIRECTORIO_USUARIO_EXTRA,
      renueva: p?.fin || yo.directorio_renews_at,
    });
  }

  // Cobro: una unidad más en la línea de usuarios adicionales, prorrateada
  // y facturada al momento con el método de pago de la suscripción.
  if (sub) {
    try {
      const linea = lineaExtra(sub);
      if (linea) {
        await stripe.subscriptionItems.update(linea.id, {
          quantity: (linea.quantity || 0) + 1,
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
        });
      } else {
        const precios = await stripe.prices.list({ lookup_keys: [LOOKUP_EXTRA], active: true, limit: 1 });
        const precio = precios.data[0];
        if (!precio) throw new Error('Falta el precio de usuario adicional en Stripe');
        await stripe.subscriptionItems.create({
          subscription: sub.id,
          price: precio.id,
          quantity: 1,
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
        });
      }
    } catch (e) {
      console.error('[directorio/usuarios] cobro', e.message);
      return NextResponse.json(
        { error: 'No se ha podido cobrar con tu método de pago. Revísalo en Gestionar suscripción y vuelve a intentarlo.' },
        { status: 402 }
      );
    }
  }

  const { error } = await admin.from('directorio_accesos').insert({ titular_id: yo.id, email });
  if (error) {
    console.error('[directorio/usuarios] alta', error.message);
    return NextResponse.json({ error: 'Se ha cobrado pero no se ha podido dar el acceso. Escríbenos a hola@govtalent.app.' }, { status: 500 });
  }
  await admin.from('users').update({ directorio_usuarios_extra: (yo.directorio_usuarios_extra || 0) + 1 }).eq('id', yo.id);
  return NextResponse.json({ ok: true, accesos: await lista(admin, yo.id), cobrado: importe });
}

export async function DELETE(request) {
  const c = await contexto();
  if (c.error) return c.error;
  const { admin, yo } = c;
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const { data: fila } = await admin
    .from('directorio_accesos')
    .select('id')
    .eq('titular_id', yo.id)
    .ilike('email', email)
    .maybeSingle();
  if (!fila) return NextResponse.json({ error: 'Esa persona no tiene acceso' }, { status: 404 });

  // Sin devolución: una unidad menos desde la renovación.
  const sub = await suscripcion(yo.directorio_subscription_id).catch(() => null);
  const linea = lineaExtra(sub);
  if (linea) {
    try {
      if ((linea.quantity || 0) <= 1) {
        await stripe.subscriptionItems.del(linea.id, { proration_behavior: 'none' });
      } else {
        await stripe.subscriptionItems.update(linea.id, { quantity: linea.quantity - 1, proration_behavior: 'none' });
      }
    } catch (e) {
      console.error('[directorio/usuarios] baja', e.message);
      return NextResponse.json({ error: 'No se ha podido actualizar la suscripción. Inténtalo de nuevo.' }, { status: 502 });
    }
  }
  await admin.from('directorio_accesos').delete().eq('id', fila.id);
  await admin
    .from('users')
    .update({ directorio_usuarios_extra: Math.max(0, (yo.directorio_usuarios_extra || 0) - 1) })
    .eq('id', yo.id);
  return NextResponse.json({ ok: true, accesos: await lista(admin, yo.id) });
}
