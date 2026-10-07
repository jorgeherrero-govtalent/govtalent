// =====================================================================
// SYNC — Candidaturas a las Cortes Generales (sql/83)
// app/api/sync/candidaturas/route.js
//
// Lee del BOE el documento de candidaturas (presentadas o proclamadas) y
// guarda un candidato por fila. Se lanza a mano el día que salga, con el
// identificador que traiga la alarma:
//
//   ?key=<DEBUG_KEY>&boe=BOE-A-2026-XXXXX&eleccion=2026-11-29&estado=presentada&dry=1
//
//   boe       identificador del BOE (uno o varios separados por comas: si
//             cada junta sale en una disposición distinta)
//   eleccion  fecha de la elección (AAAA-MM-DD)
//   estado    presentada | proclamada
//   dry=1     no escribe: devuelve recuentos por circunscripción y muestra
//
// Probado con el 23J: BOE-A-2023-14733 (candidaturas presentadas).
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { lineasDeHtml, leerCandidaturas } from '@/lib/candidaturas';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CABECERAS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 GovTalent',
  Accept: 'text/html',
};

async function documento(id) {
  const url = `https://www.boe.es/diario_boe/txt.php?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: CABECERAS, cache: 'no-store' });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  return res.text();
}

async function handler(request) {
  const sp = new URL(request.url).searchParams;
  const secreto = process.env.CRON_SECRET;
  const debugKey = process.env.DEBUG_KEY;
  const auth = request.headers.get('authorization');
  const autorizado =
    (!secreto && !debugKey) || (secreto && auth === `Bearer ${secreto}`) || (debugKey && sp.get('key') === debugKey);
  if (!autorizado) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const ids = String(sp.get('boe') || '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^BOE-[A-Z]-\d{4}-\d+$/.test(x));
  const eleccion = sp.get('eleccion');
  const estado = sp.get('estado') === 'proclamada' ? 'proclamada' : 'presentada';
  const dry = sp.get('dry') === '1';
  if (!ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(eleccion || '')) {
    return Response.json({ error: 'Faltan boe=BOE-A-… y eleccion=AAAA-MM-DD' }, { status: 400 });
  }

  const informe = { dry_run: dry, eleccion, estado, documentos: ids };
  const filas = [];
  const circs = new Set();
  const avisos = [];
  for (const id of ids) {
    const html = await documento(id);
    const r = leerCandidaturas(lineasDeHtml(html));
    for (const f of r.filas) filas.push({ ...f, fuente_boe: id });
    r.circunscripciones.forEach((c) => circs.add(c));
    avisos.push(...r.avisos);
  }

  // Sin duplicados por la clave única (por si una junta corrige y repite).
  const vistos = new Map();
  for (const f of filas) vistos.set([f.camara, f.circunscripcion, f.candidatura, f.suplente, f.orden].join('|'), f);
  const unicas = [...vistos.values()];

  informe.n_leidos = unicas.length;
  informe.circunscripciones = circs.size;
  informe.por_camara = unicas.reduce((a, f) => ((a[f.camara] = (a[f.camara] || 0) + 1), a), {});
  informe.candidaturas_congreso = new Set(unicas.filter((f) => f.camara === 'congreso').map((f) => `${f.circunscripcion}|${f.candidatura}`)).size;
  informe.siglas_mas_frecuentes = Object.entries(
    unicas.filter((f) => f.camara === 'congreso' && !f.suplente && f.orden === 1).reduce((a, f) => ((a[f.siglas || f.candidatura] = (a[f.siglas || f.candidatura] || 0) + 1), a), {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  informe.avisos = avisos.slice(0, 20);

  if (dry) {
    const madrid = unicas.filter((f) => /madrid/i.test(f.circunscripcion) && f.camara === 'congreso');
    informe.lista_circunscripciones = [...circs];
    informe.muestra_madrid = madrid.filter((f) => f.num_candidatura <= 2).slice(0, 12);
    return Response.json(informe);
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const ahora = new Date().toISOString();
  const payload = unicas.map((f) => ({ ...f, eleccion, estado, updated_at: ahora }));
  let escritas = 0;
  for (let i = 0; i < payload.length; i += 1000) {
    const { error } = await supabase
      .from('candidatos')
      .upsert(payload.slice(i, i + 1000), { onConflict: 'eleccion,camara,circunscripcion,candidatura,suplente,orden' });
    if (error) return Response.json({ ...informe, error: error.message }, { status: 500 });
    escritas += Math.min(1000, payload.length - i);
  }
  informe.n_escritos = escritas;
  return Response.json(informe);
}

export const GET = conRegistro('/api/sync/candidaturas', handler);
