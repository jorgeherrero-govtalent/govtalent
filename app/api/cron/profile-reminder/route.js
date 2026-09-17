// =====================================================================
// CORREO — completa tu perfil
// app/api/cron/profile-reminder/route.js
//
// Una vez al día. Escribe a los profesionales que terminaron el registro
// hace entre 3 y 7 días y siguen con el perfil vacío.
//
// PERFIL VACÍO: sin experiencia, sin formación y sin CV. Con cualquiera
// de las tres cosas, no se envía.
//
// NO SE ENVÍA a quien administra una organización, a quien ha pedido
// borrar su cuenta ni dos veces a la misma persona
// (users.profile_reminder_sent_at).
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1   prueba sin enviar
//   ?key=<DEBUG_KEY>         envío real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { completeProfileEmail } from '@/lib/email/templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DIAS_MIN = 3;
const DIAS_MAX = 7;
const PRESUPUESTO_MS = 45000;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export async function GET(request) {
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
      .eq('role', 'candidate')
      .eq('onboarding_completed', true)
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .is('profile_reminder_sent_at', null)
      .is('deletion_requested_at', null)
      .limit(200);
    if (error) throw new Error(`No se pudieron leer los usuarios: ${error.message}`);

    const ids = (candidatos || []).map((u) => u.id);
    informe.en_ventana = ids.length;
    if (ids.length === 0) {
      return NextResponse.json({ ...informe, nota: 'Nadie en la ventana.', ms_total: Date.now() - t0 });
    }

    const [{ data: exp }, { data: edu }, { data: perfiles }, { data: miembros }] = await Promise.all([
      supabase.from('experiences').select('user_id').in('user_id', ids),
      supabase.from('education').select('user_id').in('user_id', ids),
      supabase.from('candidate_profiles').select('user_id, cv_url').in('user_id', ids),
      supabase.from('organization_members').select('user_id').in('user_id', ids),
    ]);

    const conAlgo = new Set([
      ...(exp || []).map((r) => r.user_id),
      ...(edu || []).map((r) => r.user_id),
      ...(perfiles || []).filter((p) => p.cv_url).map((p) => p.user_id),
      ...(miembros || []).map((r) => r.user_id),
    ]);

    const destinatarios = (candidatos || []).filter((u) => u.email && !conAlgo.has(u.id));
    informe.perfil_vacio = destinatarios.length;

    if (dry) {
      informe.muestra = destinatarios.slice(0, 5).map((u) => u.email);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    const enviados = [];
    const fallos = [];
    for (const u of destinatarios) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }
      const { subject, html } = completeProfileEmail({ firstName: u.first_name || '' });
      const { error: errEnvio } = await resend.emails.send({ from: EMAIL_FROM, to: u.email, subject, html });
      if (errEnvio) fallos.push({ user_id: u.id, error: errEnvio.message });
      else enviados.push(u.id);
    }

    // Se marca solo lo enviado: lo fallido se reintenta mañana.
    if (enviados.length) {
      await supabase.from('users').update({ profile_reminder_sent_at: new Date().toISOString() }).in('id', enviados);
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
