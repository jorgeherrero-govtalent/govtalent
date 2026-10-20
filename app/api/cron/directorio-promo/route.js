// =====================================================================
// CORREO — presentación del Directorio
// app/api/cron/directorio-promo/route.js
//
// Una vez al día. Escribe a quien terminó el registro hace entre 2 y 5
// días (el correo de bienvenida sale al terminar el onboarding, así que
// llega unos 2 días después de él) y no tiene acceso al Directorio.
// La ventana llega hasta 5 días para que un día sin cron no deje a nadie
// fuera.
//
// NO SE ENVÍA a quien ha pedido borrar su cuenta, a quien ya tiene el
// Directorio (tiene_directorio_de, sql/73) ni dos veces a la misma
// persona (users.directorio_promo_sent_at, sql/101).
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1   prueba sin enviar
//   ?key=<DEBUG_KEY>         envío real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { directorioPromoEmail } from '@/lib/email/templates';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { conRegistro } from '@/lib/syncLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DIAS_MIN = 2;
const DIAS_MAX = 5;
const PRESUPUESTO_MS = 45000;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export const GET = conRegistro('/api/cron/directorio-promo', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry };

  try {
    const hasta = new Date(Date.now() - DIAS_MIN * 86400000).toISOString();
    const desde = new Date(Date.now() - DIAS_MAX * 86400000).toISOString();

    const { data: candidatos, error } = await supabase
      .from('users')
      .select('id, first_name, email')
      .eq('onboarding_completed', true)
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .is('directorio_promo_sent_at', null)
      .is('deletion_requested_at', null)
      .limit(200);
    if (error) throw new Error(`No se pudieron leer los usuarios: ${error.message}`);

    informe.en_ventana = (candidatos || []).length;
    if (informe.en_ventana === 0) {
      return NextResponse.json({ ...informe, nota: 'Nadie en la ventana.', ms_total: Date.now() - t0 });
    }

    // Quien ya tiene el Directorio no lo recibe, pero se marca para no
    // volver a comprobarlo mañana.
    const destinatarios = [];
    const conDirectorio = [];
    for (const u of candidatos) {
      if (!u.email) continue;
      if (await puedeVerContactos(supabase, u.id)) conDirectorio.push(u.id);
      else destinatarios.push(u);
    }
    informe.con_directorio = conDirectorio.length;
    informe.sin_directorio = destinatarios.length;

    if (dry) {
      informe.muestra = destinatarios.slice(0, 5).map((u) => u.email);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    if (conDirectorio.length) {
      await supabase.from('users').update({ directorio_promo_sent_at: new Date().toISOString() }).in('id', conDirectorio);
    }

    const enviados = [];
    const fallos = [];
    for (const u of destinatarios) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }
      const { subject, html } = directorioPromoEmail({ firstName: u.first_name || '' });
      const { error: errEnvio } = await resend.emails.send({ from: EMAIL_FROM, to: u.email, subject, html });
      if (errEnvio) fallos.push({ user_id: u.id, error: errEnvio.message });
      else enviados.push(u.id);
    }

    // Se marca solo lo enviado: lo fallido se reintenta mañana.
    if (enviados.length) {
      await supabase.from('users').update({ directorio_promo_sent_at: new Date().toISOString() }).in('id', enviados);
    }

    informe.enviados = enviados.length;
    informe.fallidos = fallos.length;
    informe.detalle_fallos = fallos.slice(0, 3);
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
