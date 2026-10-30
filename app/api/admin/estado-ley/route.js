// =====================================================================
// Correo «Estado de la ley»: el punto de partida de una ley autonómica
// app/api/admin/estado-ley/route.js
//
// Lo que ha pasado hasta hoy en la tramitación de una ley, con el diseño
// de los correos de GovTalent (estadoLeyEmail, maqueta «resumen» elegida
// por Jorge el 30-10-2026), enviado por Resend desde hola@govtalent.app.
// Primer uso: la Ley LIDER (madrid:PL-10/2026) para Carlos Ruiz.
//
// Uso (clave de depuración):
//   ?key=…&ley=<expediente>&email=<usuario>            vista previa (HTML)
//   ?key=…&ley=…&email=…&enviar=1                      envía al usuario
//   ?key=…&ley=…&email=…&enviar=1&para=<dirección>     envía la versión de
//        ese usuario a otra dirección, para probarla. Solo direcciones
//        internas (@govtalent.app, @apinstitute.com).
//   &variante=cronologia|fases|resumen                 otra maqueta
//
// El saludo y el nombre de la alarma salen del usuario: su nombre y la
// alarma activa que encontró la ley (relevancia 2 o 3), si la tiene.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { estadoLeyEmail } from '@/lib/email/templates';
import { separarDuplicados } from '@/lib/ccaa/duplicados';

export const dynamic = 'force-dynamic';

const INTERNOS = /@(govtalent\.app|apinstitute\.com)$/i;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) return Response.json({ error: 'no autorizado' }, { status: 401 });
  const leyId = sp.get('ley');
  const email = (sp.get('email') || '').trim().toLowerCase();
  if (!leyId || !email) return Response.json({ error: 'faltan ley y email' }, { status: 400 });
  const para = (sp.get('para') || '').trim().toLowerCase();
  if (para && !INTERNOS.test(para)) return Response.json({ error: 'para solo admite direcciones internas' }, { status: 400 });
  const variante = ['cronologia', 'fases', 'resumen'].includes(sp.get('variante')) ? sp.get('variante') : 'resumen';
  const db = admin();

  const { data: ley } = await db.from('ccaa_expedientes').select('id, parlamento, num_expediente, titulo, titulo_es, comision, slug, is_closed').eq('id', leyId).maybeSingle();
  if (!ley?.slug) return Response.json({ error: 'ley no encontrada' }, { status: 404 });
  const { data: usuario } = await db.from('users').select('id, email, first_name').ilike('email', email).maybeSingle();
  if (!usuario) return Response.json({ error: 'usuario no encontrado' }, { status: 404 });

  const { data: alarmas } = await db.from('sector_alert_matches').select('alert_id, sector_alerts!inner(nombre, activa)')
    .eq('user_id', usuario.id).eq('kind', 'ccaa').eq('ref_id', leyId).eq('descartado', false).gte('relevancia', 2).eq('sector_alerts.activa', true).limit(1);
  const alarma = alarmas?.[0]?.sector_alerts?.nombre || null;

  const { data: tram } = await db.from('ccaa_tramites').select('id, expediente_id, tipo, fecha, plazo_hasta, descripcion, organo, boletin_id, pagina, url, origen, created_at').eq('expediente_id', leyId);
  // El mismo acto por la ficha y por el boletín, una sola vez.
  const sep = await separarDuplicados(db, tram || [], Date.now() + 365 * 86400000);
  const lista = sep.avisar;
  const bolIds = [...new Set(lista.map((t) => t.boletin_id).filter(Boolean))];
  const { data: bols } = bolIds.length ? await db.from('ccaa_boletines').select('id, numero').in('id', bolIds) : { data: [] };
  const bolDe = new Map((bols || []).map((b) => [b.id, b.numero]));

  const { subject, html } = estadoLeyEmail({
    firstName: usuario.first_name || '',
    ley: { parlamento: ley.parlamento, num: ley.num_expediente, titulo: ley.titulo_es || ley.titulo, comision: ley.comision, slug: ley.slug, is_closed: ley.is_closed },
    tramites: lista.filter((t) => t.fecha).map((t) => ({
      tipo: t.tipo,
      fecha: t.fecha,
      descripcion: t.descripcion,
      plazo_hasta: t.plazo_hasta,
      boletin: bolDe.get(t.boletin_id) || null,
      pagina: t.pagina,
      url: t.url,
      cita: bolDe.get(t.boletin_id) || null,
    })),
    alarma,
    variante,
  });

  if (sp.get('enviar') !== '1') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-asunto': encodeURIComponent(subject) } });

  const destino = para || usuario.email;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'GovTalent <hola@govtalent.app>', to: destino, subject: para ? `[Prueba] ${subject}` : subject, html }),
  });
  if (!res.ok) return Response.json({ ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
  return Response.json({ ok: true, enviado_a: destino, asunto: subject, alarma, tramites: lista.length });
}
