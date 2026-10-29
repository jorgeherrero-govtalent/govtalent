// =====================================================================
// CORREO ¡Novedad! — página de las elecciones del 29N
// app/api/cron/novedad-29n/route.js
//
// Envío único a mano (29-10-2026), sin cron. Va a todos los registrados
// con los correos comerciales activados (users.marketing_emails_enabled),
// salvo a quien ha pedido borrar su cuenta o ya lo recibió
// (users.novedad_29n_sent_at, sql/106).
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1                    a quién saldría, sin enviar
//   ?key=<DEBUG_KEY>&para=a@x.com             prueba a esas direcciones
//                                             (no las marca como enviadas)
//   ?key=<DEBUG_KEY>&enviar=1                 envío a todos
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { novedad29nEmail } from '@/lib/email/templates';
import datos from '@/lib/data/elecciones29n.json';
import { conRegistro } from '@/lib/syncLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOTE = 100; // máximo de Resend por petición en batch

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

function correo(firstName) {
  return novedad29nEmail({
    firstName,
    seVan: datos.d.filter((d) => d.d === 'no').length,
    nuevos: datos.nu.length,
    cargos: (datos.gob || datos.c || []).length,
  });
}

async function enviarLote(usuarios) {
  const enviados = [];
  const fallos = [];
  for (let i = 0; i < usuarios.length; i += LOTE) {
    const lote = usuarios.slice(i, i + LOTE);
    const { error } = await resend.batch.send(
      lote.map((u) => {
        const { subject, html } = correo(u.first_name || '');
        return { from: EMAIL_FROM, to: u.email, subject, html };
      })
    );
    if (error) fallos.push({ lote: lote.map((u) => u.email), error: error.message });
    else enviados.push(...lote);
  }
  return { enviados, fallos };
}

export const GET = conRegistro('/api/cron/novedad-29n', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = admin();
  const informe = { inicio: new Date().toISOString() };

  try {
    // Prueba a una lista: no marca nada.
    const para = String(sp.get('para') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'));
    if (para.length) {
      const { data: us } = await supabase.from('users').select('email, first_name').in('email', para);
      const nombres = Object.fromEntries((us || []).map((u) => [String(u.email).toLowerCase(), u.first_name]));
      const r = await enviarLote(para.map((email) => ({ email, first_name: nombres[email] || '' })));
      return NextResponse.json({ ...informe, prueba: true, enviados: r.enviados.map((u) => u.email), fallidos: r.fallos, ms_total: Date.now() - t0 });
    }

    const { data: usuarios, error } = await supabase
      .from('users')
      .select('id, first_name, email')
      .eq('marketing_emails_enabled', true)
      .is('deletion_requested_at', null)
      .is('novedad_29n_sent_at', null)
      .not('email', 'is', null);
    if (error) throw new Error(`No se pudieron leer los usuarios: ${error.message}`);
    informe.pendientes = usuarios.length;

    if (sp.get('enviar') !== '1') {
      informe.dry_run = true;
      informe.saldria_a = usuarios.map((u) => `${u.first_name || '(sin nombre)'} <${u.email}>`);
      informe.nota = 'Añade &enviar=1 para enviarlo.';
      return NextResponse.json(informe);
    }

    const r = await enviarLote(usuarios);
    if (r.enviados.length) {
      await supabase
        .from('users')
        .update({ novedad_29n_sent_at: new Date().toISOString() })
        .in('id', r.enviados.map((u) => u.id));
    }
    informe.enviados = r.enviados.length;
    informe.fallidos = r.fallos;
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
