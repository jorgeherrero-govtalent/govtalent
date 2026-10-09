// =====================================================================
// ALARMAS — incorporar una fuente nueva a las alarmas que ya existen
// app/api/alarmas/incorporar/route.js
//
// La vigilancia solo mira lo nuevo de los últimos 7 días
// (regulatorio_reciente). Cuando entra una fuente nueva (p. ej. la
// Asamblea de Madrid y el Parlament de Catalunya, 09-10-2026), lo que ya
// estaba abierto en ella no es «nuevo» y las alarmas creadas antes no lo
// verían nunca. Esta ruta lo evalúa una vez, para cada alarma, con el
// mismo agente y el mismo criterio que al crear una alarma.
//
// Lo encontrado se guarda como coincidencia de la alarma (aparece en
// Novedades). Por defecto queda MARCADO COMO AVISADO: es lo que ya
// estaba abierto, no una novedad para el correo. Con ?avisar=1 queda
// pendiente y sale en el siguiente resumen de la alarma.
//
// Uso (solo con la clave de depuración):
//   ?key=<DEBUG_KEY>&p=madrid,cataluna                 todas las alarmas activas
//   ?key=<DEBUG_KEY>&p=madrid,cataluna&email=<correo>  solo las de un usuario
//   …&dry=1                                            evalúa y devuelve, sin guardar
//   …&avisar=1                                         que salga en el próximo correo
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evaluar, ordenar, costeUsd, MAX_CANDIDATOS, parlamentosDe } from '@/lib/agenteAlarmas';
import { PARLAMENTOS } from '@/lib/parlamentosAutonomicos';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }
  const parlamentos = (sp.get('p') || '').split(',').map((s) => s.trim()).filter((s) => PARLAMENTOS[s]);
  if (!parlamentos.length) return NextResponse.json({ error: `p debe ser una o varias de: ${Object.keys(PARLAMENTOS).join(', ')}` }, { status: 400 });
  const dry = sp.get('dry') === '1';
  const avisar = sp.get('avisar') === '1';
  const db = admin();
  const t0 = Date.now();

  // Alarmas activas (todas o las de un usuario).
  let userId = null;
  if (sp.get('email')) {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = (data?.users || []).find((x) => x.email?.toLowerCase() === sp.get('email').toLowerCase())?.id || null;
    if (!userId) return NextResponse.json({ error: 'usuario no encontrado' }, { status: 404 });
  }
  let q = db.from('sector_alerts').select('id, user_id, nombre, descripcion, criterios, keywords').eq('activa', true);
  if (userId) q = q.eq('user_id', userId);
  const { data: alarmas, error: ea } = await q;
  if (ea) return NextResponse.json({ error: ea.message }, { status: 500 });

  // Lo abierto de esos parlamentos.
  const nombres = parlamentos.map((p) => PARLAMENTOS[p].nombre);
  const { data: abiertos, error: eb } = await db
    .from('regulatorio_search')
    .select('kind, ref_id, titulo, contexto, fuente, ruta, plazo, fecha')
    .eq('kind', 'ccaa')
    .eq('activo', true)
    .or(parlamentos.map((p) => `ref_id.like.${p}:%`).join(','))
    .limit(2000);
  if (eb) return NextResponse.json({ error: eb.message }, { status: 500 });
  const lista = ordenar(abiertos || []);

  const informe = [];
  const costes = [];
  for (const a of alarmas || []) {
    if (Date.now() - t0 > 540000) { informe.push({ alarma: a.nombre, saltada: 'sin tiempo' }); continue; }
    const territorios = a.criterios?.territorios || [];
    const suyos = parlamentosDe(territorios);
    // Toda la lista para las alarmas de esas comunidades; para las demás,
    // solo lo que toca alguna palabra clave (como al crear una alarma).
    const claves = (a.keywords || []).filter((k) => k && k.length >= 3).map((k) => k.toLowerCase());
    const candidatos = lista.filter((r) => suyos.some((n) => String(r.contexto || '').startsWith(n))
      || claves.some((k) => String(r.titulo || '').toLowerCase().includes(k)));
    const { data: vistos } = await db.from('sector_alert_seen').select('kind, ref_id').eq('alert_id', a.id).eq('kind', 'ccaa');
    const yaVisto = new Set((vistos || []).map((v) => v.ref_id));
    const pendientes = candidatos.filter((r) => !yaVisto.has(r.ref_id));
    if (!pendientes.length) { informe.push({ alarma: a.nombre, candidatos: 0 }); continue; }

    const encaja = [];
    try {
      for (let i = 0; i < pendientes.length; i += MAX_CANDIDATOS) {
        const bloque = pendientes.slice(i, i + MAX_CANDIDATOS);
        encaja.push(...await evaluar(
          { descripcion: a.descripcion || (a.keywords || []).join(', '), criterios: a.criterios || {} },
          bloque,
          {
            maxResultados: 40,
            onUso: (u) => costes.push({
              origen: 'incorporar', user_id: a.user_id, alert_id: a.id, modelo: u.modelo,
              input_tokens: u.input_tokens || 0, cache_escritura: u.cache_creation_input_tokens || 0,
              cache_lectura: u.cache_read_input_tokens || 0, output_tokens: u.output_tokens || 0,
              coste_usd: Number(costeUsd(u).toFixed(6)),
            }),
          }
        ));
      }
    } catch (e) {
      informe.push({ alarma: a.nombre, error: e.message });
      continue;
    }

    informe.push({
      alarma: a.nombre,
      territorios,
      parlamentos_de_la_alarma: suyos.filter((n) => nombres.includes(n)),
      candidatos: pendientes.length,
      elegidos: encaja.map((m) => `[${m.relevancia}] ${m.titulo}`.slice(0, 160)),
    });
    if (dry) continue;

    const ahora = new Date().toISOString();
    if (encaja.length) {
      await db.from('sector_alert_matches').upsert(
        encaja.map((m) => ({ ...m, alert_id: a.id, user_id: a.user_id, canal: 'incorporacion', ...(avisar ? {} : { avisado_at: ahora }) })),
        { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true }
      );
    }
    await db.from('sector_alert_seen').upsert(
      pendientes.map((r) => ({ alert_id: a.id, kind: r.kind, ref_id: r.ref_id })),
      { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true }
    );
  }
  if (!dry && costes.length) await db.from('ai_costes').insert(costes);

  return NextResponse.json({ ok: true, dry, avisar, parlamentos, abiertos: lista.length, alarmas: (alarmas || []).length, ms: Date.now() - t0, informe });
}
