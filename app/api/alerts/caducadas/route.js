// =====================================================================
// CORREO ÚNICO — leyes que sigues y caducaron con la disolución
// app/api/alerts/caducadas/route.js
//
// Las Cortes se disolvieron el 06-10-2026 y caducó todo lo que estaba en
// tramitación (art. 207 del Reglamento del Congreso). A cada usuario que
// seguía alguna de esas leyes se le manda UN correo con cuáles son, dónde
// se quedó cada una y un botón a /novedades/disolucion para decidir qué
// mantener.
//
// No va en ningún cron: se lanza a mano. La marca correo:caducadas-xv en
// usuario_marcas evita que nadie lo reciba dos veces aunque se relance.
// No se manda a quien ya ha decidido (resuelto:caducadas-xv) ni a quien
// tiene los correos desactivados.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1          cuenta destinatarios, sin enviar
//   ?key=<DEBUG_KEY>&user=<uuid>    prueba: solo a ese usuario, aunque ya
//                                   lo haya recibido, y sin registrarlo
//   ?key=<DEBUG_KEY>                envío real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { caducadasEmail } from '@/lib/email/templates';
import { CLAVE_CORREO, CLAVE_RESUELTO, leyesCaducadasQueSigue } from '@/lib/caducadas';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PRESUPUESTO_MS = 240000;
const LOTE = 50;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

async function enviarLote(correos) {
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(correos),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export const GET = conRegistro('/api/alerts/caducadas', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const soloUsuario = sp.get('user');
  const prueba = !!soloUsuario;
  const db = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, prueba };

  try {
    // Solo quien sigue alguna ley: se parte de los seguimientos.
    let qF = db.from('follows').select('user_id').eq('kind', 'ley');
    if (prueba) qF = qF.eq('user_id', soloUsuario);
    const { data: seguimientos, error: eF } = await qF;
    if (eF) throw new Error(eF.message);
    const ids = [...new Set((seguimientos || []).map((f) => f.user_id))];
    informe.siguen_leyes = ids.length;
    if (ids.length === 0) return NextResponse.json(informe);

    const [{ data: usuarios }, { data: prefs }, { data: marcas }] = await Promise.all([
      db.from('users').select('id, email, first_name').in('id', ids).is('deletion_requested_at', null).not('email', 'is', null),
      db.from('alert_preferences').select('user_id, email').in('user_id', ids),
      db.from('usuario_marcas').select('user_id, clave').in('user_id', ids).in('clave', [CLAVE_CORREO, CLAVE_RESUELTO]),
    ]);
    const fuera = new Set([
      ...(prefs || []).filter((p) => !prueba && p.email === false).map((p) => p.user_id),
      ...(marcas || []).filter(() => !prueba).map((m) => m.user_id),
    ]);

    const destinatarios = [];
    for (const u of usuarios || []) {
      if (fuera.has(u.id)) continue;
      const leyes = await leyesCaducadasQueSigue(db, u.id);
      if (leyes.length > 0) destinatarios.push({ u, leyes });
    }
    informe.destinatarios = destinatarios.length;
    informe.leyes = destinatarios.reduce((n, d) => n + d.leyes.length, 0);

    let enviados = 0;
    const fallos = [];
    for (let i = 0; i < destinatarios.length; i += LOTE) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }
      const lote = destinatarios.slice(i, i + LOTE);
      const correos = lote.map(({ u, leyes }) => {
        const { subject, html } = caducadasEmail({ firstName: u.first_name || '', leyes });
        return {
          from: process.env.RESEND_FROM || 'GovTalent <hola@govtalent.app>',
          to: u.email,
          subject: prueba ? `[Prueba] ${subject}` : subject,
          html,
        };
      });
      if (dry) {
        enviados += correos.length;
        continue;
      }
      try {
        await enviarLote(correos);
        enviados += correos.length;
        if (!prueba) {
          await db
            .from('usuario_marcas')
            .upsert(lote.map(({ u }) => ({ user_id: u.id, clave: CLAVE_CORREO })), {
              onConflict: 'user_id,clave',
              ignoreDuplicates: true,
            });
        }
      } catch (e) {
        fallos.push(e.message);
      }
    }
    informe.enviados = enviados;
    if (fallos.length) informe.fallos = fallos.slice(0, 3);
    informe.ms = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    informe.error = e.message;
    return NextResponse.json(informe, { status: 500 });
  }
}
