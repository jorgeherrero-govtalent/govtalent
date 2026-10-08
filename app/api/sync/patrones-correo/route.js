// =====================================================================
// SYNC — Patrones de correo por dominio (sql/86, paso 1)
// app/api/sync/patrones-correo/route.js
//
// Lee todos los correos del directorio, deduce el patrón de cada dominio
// y el dominio de cada institución, y cuenta a cuántas personas sin
// correo se les podría ofrecer uno probable. ?dry=1 no escribe.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import {
  deducirPatron,
  aplicarPatron,
  DESCRIPCION,
  DOMINIOS_GENERICOS,
  MIN_FIABILIDAD,
  MIN_MUESTRAS,
} from '@/lib/patronesCorreo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const correos = (v) =>
  String(v || '')
    .split(/[,;\s]+/)
    .map((x) => x.replace(/^mailto:/i, '').trim().toLowerCase())
    .filter((x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(x));

async function handler(request) {
  const sp = new URL(request.url).searchParams;
  const secreto = process.env.CRON_SECRET;
  const debugKey = process.env.DEBUG_KEY;
  const auth = request.headers.get('authorization');
  const autorizado =
    (!secreto && !debugKey) || (secreto && auth === `Bearer ${secreto}`) || (debugKey && sp.get('key') === debugKey);
  if (!autorizado) return Response.json({ error: 'no autorizado' }, { status: 401 });
  const dry = sp.get('dry') === '1';

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Todo el directorio, por páginas.
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('directorio_pro')
      .select('id, nombre, institucion, email, email_unidad')
      .range(desde, desde + 999);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  // Muestras por dominio (correos personales) y dominios por institución.
  const porDominio = new Map();
  const vistos = new Set(); // una persona sale en varias fuentes: cada correo cuenta una vez
  const instDom = new Map(); // institucion -> Map(dominio -> n)
  for (const f of filas) {
    for (const e of correos(f.email)) {
      const dom = e.split('@')[1];
      if (DOMINIOS_GENERICOS.has(dom) || vistos.has(e)) continue;
      vistos.add(e);
      if (!porDominio.has(dom)) porDominio.set(dom, []);
      porDominio.get(dom).push({ nombre: f.nombre, email: e });
    }
    if (f.institucion) {
      for (const e of [...correos(f.email), ...correos(f.email_unidad)]) {
        const dom = e.split('@')[1];
        if (DOMINIOS_GENERICOS.has(dom)) continue;
        if (!instDom.has(f.institucion)) instDom.set(f.institucion, new Map());
        const m = instDom.get(f.institucion);
        m.set(dom, (m.get(dom) || 0) + 1);
      }
    }
  }

  const patrones = [];
  for (const [dominio, muestras] of porDominio) {
    const r = deducirPatron(muestras);
    if (!r) continue;
    patrones.push({
      dominio,
      patron: r.patron,
      aciertos: r.aciertos,
      muestras: r.muestras,
      fiabilidad: r.fiabilidad,
      alternativas: r.alternativas,
      actualizado: new Date().toISOString(),
    });
  }
  const dominiosInst = [];
  for (const [institucion, m] of instDom) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [dominio, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    dominiosInst.push({ institucion, dominio, n, cuota: Math.round((n / total) * 1000) / 1000, actualizado: new Date().toISOString() });
  }

  // Cuántas personas sin correo recibirían uno probable.
  const fiables = new Map(
    patrones.filter((p) => p.patron && p.fiabilidad >= MIN_FIABILIDAD && p.muestras >= MIN_MUESTRAS).map((p) => [p.dominio, p])
  );
  const domPorInst = new Map(dominiosInst.filter((d) => d.cuota >= 0.6 && d.n >= 3).map((d) => [d.institucion, d.dominio]));
  const sinCorreo = filas.filter((f) => !correos(f.email).length);
  const ofrecibles = [];
  const yaOfrecidos = new Set();
  for (const f of sinCorreo) {
    const dom = domPorInst.get(f.institucion);
    const p = dom && fiables.get(dom);
    if (!p) continue;
    const email = aplicarPatron(f.nombre, p.patron, dom);
    if (!email || yaOfrecidos.has(email)) continue;
    yaOfrecidos.add(email);
    ofrecibles.push({ nombre: f.nombre, institucion: f.institucion, email, fiabilidad: p.fiabilidad });
  }

  const informe = {
    dry_run: dry,
    n_leidos: filas.length,
    dominios_con_muestras: patrones.length,
    dominios_fiables: fiables.size,
    instituciones_con_dominio: domPorInst.size,
    personas_sin_correo: sinCorreo.length,
    correos_probables: ofrecibles.length,
    mejores_dominios: patrones
      .filter((p) => p.muestras >= MIN_MUESTRAS)
      .sort((a, b) => b.muestras - a.muestras)
      .slice(0, 25)
      .map((p) => ({ dominio: p.dominio, patron: DESCRIPCION[p.patron] || p.patron, fiabilidad: p.fiabilidad, muestras: p.muestras })),
    por_fiabilidad: {
      '≥95 %': ofrecibles.filter((o) => o.fiabilidad >= 0.95).length,
      '90–95 %': ofrecibles.filter((o) => o.fiabilidad >= 0.9 && o.fiabilidad < 0.95).length,
      '80–90 %': ofrecibles.filter((o) => o.fiabilidad < 0.9).length,
    },
    muestra: ofrecibles.sort(() => Math.random() - 0.5).slice(0, 15),
  };
  if (dry) return Response.json(informe);

  for (let i = 0; i < patrones.length; i += 500) {
    const { error } = await supabase.from('email_patrones').upsert(patrones.slice(i, i + 500), { onConflict: 'dominio' });
    if (error) return Response.json({ ...informe, error: error.message }, { status: 500 });
  }
  for (let i = 0; i < dominiosInst.length; i += 500) {
    const { error } = await supabase
      .from('email_dominios_institucion')
      .upsert(dominiosInst.slice(i, i + 500), { onConflict: 'institucion' });
    if (error) return Response.json({ ...informe, error: error.message }, { status: 500 });
  }
  informe.n_escritos = patrones.length + dominiosInst.length;
  return Response.json(informe);
}

export const GET = conRegistro('/api/sync/patrones-correo', handler);
