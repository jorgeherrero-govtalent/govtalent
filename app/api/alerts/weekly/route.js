// =====================================================================
// CORREO — resumen semanal
// app/api/alerts/weekly/route.js
//
// Se ejecuta los lunes por la mañana y va A TODOS los usuarios, sigan
// algo o no. Antes solo salía si tenías seguimientos y además se habían
// movido; con eso, quien está en Free —que no puede seguir ni tener
// alertas— no recibía nunca nada.
//
// QUÉ LLEVA, EN ESTE ORDEN:
//   1. Plazos de lo que sigues (solo si sigues algo)
//   2. Novedades de lo que sigues
//   3. Lo publicado en el BOE esta semana, de tus temas
//
// El tercer bloque es la base y nunca está vacío: el BOE publica a
// diario. Los dos primeros son el extra de quien tiene seguimientos.
//
// SIGUE SIN MANDARSE SI NO HAY ABSOLUTAMENTE NADA —fin de semana largo,
// agosto cerrado—, porque un correo que dice "no ha pasado nada" es lo
// que hace que la gente se dé de baja. Pero eso ahora es raro.
//
// alert_deliveries evita mandar dos veces el mismo evento: si el proceso
// se reintenta, nadie recibe repetido.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin enviar
//   ?key=<DEBUG_KEY>&user=<id>    solo a un usuario
//   ?key=<DEBUG_KEY>              envío real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { weeklyDigestEmail } from '@/lib/email/templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';
const PRESUPUESTO_MS = 45000;

// Cuántos días atrás se miran los cambios. Una semana más un día de
// margen, por si el proceso falló el lunes anterior.
const VENTANA_DIAS = 8;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

async function enviar({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'GovTalent <hola@govtalent.app>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const dry = sp.get('dry') === '1';
  const soloUsuario = sp.get('user');
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry };

  try {
    const desde = new Date(Date.now() - VENTANA_DIAS * 86400000).toISOString();

    // Quién sigue algo. Se agrupa en memoria porque son pocos usuarios y
    // así se evita una consulta por persona.
    let q = supabase.from('follows').select('user_id, kind, ref_id, label');
    if (soloUsuario) q = q.eq('user_id', soloUsuario);
    const { data: seguimientos, error: errF } = await q;
    if (errF) throw new Error(`No se pudieron leer los seguimientos: ${errF.message}`);

    const porUsuario = new Map();
    for (const f of seguimientos || []) {
      if (!porUsuario.has(f.user_id)) porUsuario.set(f.user_id, []);
      porUsuario.get(f.user_id).push(f);
    }

    informe.usuarios_con_seguimiento = porUsuario.size;

    // El destinatario ya no es "quien sigue algo" sino todo el mundo: el
    // bloque del BOE se envía sigas o no, que es lo que hace que un
    // usuario Free reciba algo.
    let qu = supabase
      .from('users')
      .select('id, email, first_name')
      .not('email', 'is', null);
    if (soloUsuario) qu = qu.eq('id', soloUsuario);
    const { data: todosLosUsuarios, error: errU } = await qu;
    if (errU) throw new Error(`No se pudieron leer los usuarios: ${errU.message}`);

    // Los eventos de la ventana, de todo lo seguido
    const refs = [...new Set((seguimientos || []).map((f) => f.ref_id))];
    const { data: eventos, error: errE } = await supabase
      .from('follow_events')
      .select('id, kind, ref_id, event_type, title, detail, occurred_at')
      .gte('occurred_at', desde)
      .in('ref_id', refs.slice(0, 1000))
      .order('occurred_at', { ascending: false });
    if (errE) throw new Error(`No se pudieron leer los eventos: ${errE.message}`);

    // Lo publicado en el BOE durante la ventana. Se pide una vez para
    // todos y luego se filtra por los temas de cada uno.
    const { data: boeSemana } = await supabase
      .from('boe_directory')
      .select('id, slug, titulo, departamento, rango, sector, sectores, seccion, fecha_publicacion')
      .gte('fecha_publicacion', desde.slice(0, 10))
      // Solo I y III: disposiciones generales y otras disposiciones. La
      // II son nombramientos y ceses, que ocupan sitio en un resumen
      // semanal sin afectar a casi nadie.
      .in('seccion', ['1', '3'])
      .order('fecha_publicacion', { ascending: false })
      .limit(200);

    // Los temas de cada usuario, con sus palabras clave: es lo que
    // decide qué parte del BOE le toca.
    const { data: temasUsuario } = await supabase
      .from('user_topics')
      .select('user_id, topics(id, label, keywords)');

    const temasDe = new Map();
    for (const t of temasUsuario || []) {
      if (!t.topics) continue;
      if (!temasDe.has(t.user_id)) temasDe.set(t.user_id, []);
      temasDe.get(t.user_id).push(t.topics);
    }

    // Lo ya enviado, para no repetir
    const { data: enviados } = await supabase
      .from('alert_deliveries')
      .select('user_id, event_id')
      .gte('sent_at', desde);
    const yaEnviado = new Set((enviados || []).map((d) => `${d.user_id}|${d.event_id}`));

    // Las preferencias: quien haya dicho que no, no recibe
    const { data: prefs } = await supabase.from('alert_preferences').select('user_id, frequency, email');
    const prefDe = new Map((prefs || []).map((p) => [p.user_id, p]));


    const resultados = [];
    let enviadosOk = 0;
    let sinNada = 0;
    const entregas = [];

    for (const u of todosLosUsuarios || []) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }

      const userId = u.id;
      const sigue = porUsuario.get(userId) || [];

      const pref = prefDe.get(userId);
      if (pref && (pref.email === false || pref.frequency === 'ninguno')) continue;
      if (!u.email) continue;

      // Los eventos de lo que sigue esta persona, sin los ya enviados
      const claves = new Set(sigue.map((f) => `${f.kind}|${f.ref_id}`));
      const suyos = (eventos || []).filter(
        (e) => claves.has(`${e.kind}|${e.ref_id}`) && !yaEnviado.has(`${userId}|${e.id}`)
      );

      // Los plazos se separan de las novedades: son lo más urgente y van
      // primero, con su contador de días.
      const plazos = [];
      const novedades = [];
      for (const e of suyos) {
        const f = sigue.find((x) => x.kind === e.kind && x.ref_id === e.ref_id);
        const item = {
          title: f?.label || e.title,
          detail: e.detail,
          ruta: '/seguimiento',
          fuente: null,
        };
        if (e.event_type === 'plazo_proximo') {
          // El número de días viene en el texto: "Quedan 7 días de plazo"
          const m = String(e.detail || '').match(/(\d+)/);
          plazos.push({ ...item, dias: m ? parseInt(m[1], 10) : 0, fuente: e.kind === 'ley' ? 'Congreso' : 'Comisión Europea' });
        } else {
          novedades.push(item);
        }
      }
      plazos.sort((a, b) => a.dias - b.dias);

      // El BOE de la semana, filtrado por los temas de esta persona. Si
      // no tiene temas se manda lo de secciones I y II, que es lo que
      // afecta a cualquiera del sector.
      const misTemas = temasDe.get(userId) || [];
      const palabras = misTemas.flatMap((t) => (t.keywords || []).map((k) => k.toLowerCase()));

      const publicado = (boeSemana || [])
        .filter((d) => {
          if (palabras.length === 0) return true;
          const titulo = String(d.titulo || '').toLowerCase();
          // Palabra completa, no trozo: sin esto "gas" pescaría "gastos".
          return palabras.some((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(titulo));
        })
        .slice(0, 6)
        .map((d) => ({
          title: d.titulo,
          detail: [d.rango, d.departamento].filter(Boolean).join(' · '),
          ruta: `/boe/${d.slug}`,
          sector: d.sector || null,
        }));

      // Solo se salta a quien no tiene absolutamente nada: ni plazos, ni
      // novedades, ni BOE. Con el BOE publicando a diario, eso es raro.
      if (plazos.length === 0 && novedades.length === 0 && publicado.length === 0) {
        sinNada += 1;
        continue;
      }

      const { subject, html } = weeklyDigestEmail({
        firstName: u.first_name || '',
        novedades: novedades.slice(0, 8),
        plazos: plazos.slice(0, 6),
        publicado,
        totalSeguidos: sigue.length,
        unsubscribeUrl: `${SITE_URL}/seguimiento?ajustes=1`,
      });

      resultados.push({
        user_id: userId,
        email: u.email,
        subject,
        plazos: plazos.length,
        novedades: novedades.length,
        publicado: publicado.length,
      });

      if (!dry) {
        try {
          await enviar({ to: u.email, subject, html });
          enviadosOk += 1;
          for (const e of suyos) entregas.push({ user_id: userId, event_id: e.id, channel: 'email' });
        } catch (err) {
          resultados[resultados.length - 1].error = err.message;
        }
      }
    }

    informe.eventos_en_ventana = (eventos || []).length;
    informe.usuarios_totales = (todosLosUsuarios || []).length;
    informe.boe_en_ventana = (boeSemana || []).length;
    informe.destinatarios = resultados.length;
    informe.sin_nada = sinNada;

    if (dry) {
      informe.muestra = resultados.slice(0, 5);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // Se anota lo entregado después de enviar: si el envío falla, no se
    // marca y se reintentará la semana siguiente.
    if (entregas.length > 0) {
      const { error } = await supabase
        .from('alert_deliveries')
        .upsert(entregas, { onConflict: 'user_id,event_id,channel' });
      if (error) informe.error_registro = error.message;
    }

    informe.enviados = enviadosOk;
    informe.fallidos = resultados.filter((r) => r.error).length;
    informe.detalle_fallos = resultados.filter((r) => r.error).slice(0, 3);
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
