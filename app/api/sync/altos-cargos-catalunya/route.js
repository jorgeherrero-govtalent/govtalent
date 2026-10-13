// =====================================================================
// SYNC — Altos cargos de la Generalitat de Catalunya
// app/api/sync/altos-cargos-catalunya/route.js
//
// Fuente: datos abiertos de la Generalitat, «Agenda pública amb grups
// d'interès dels alts càrrecs» (analisi.transparenciacatalunya.cat,
// dataset hd8k-y28e). Cada fila es una reunión con el nombre, el cargo,
// el departamento y la unidad de quien la tiene; de ahí sale quién ocupa
// hoy cada cargo (su fila más reciente).
//
// Se guardan en fuentes_personas (sql/78) con la fuente
// «Visor de l'activitat directiva (Generalitat)»: institución
// «Generalitat de Catalunya», unidad = departamento. Sin correo: el
// directorio les deduce el de gencat.cat (lib/correosProbables.js).
// Quien ya está en el directorio con la Generalitat (Agenda de la
// Comunicación) no se duplica.
//
// ?dry=1 no escribe · ?meses=12 ventana (por defecto 12) · ?key=DEBUG_KEY
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { limpiar } from '@/lib/patronesCorreo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API = 'https://analisi.transparenciacatalunya.cat/resource/hd8k-y28e.json';
const FUENTE = "Visor de l'activitat directiva (Generalitat)";
const INSTITUCION = 'Generalitat de Catalunya';

const clave = (t) => limpiar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const limpio = (t) => String(t || '').replace(/\s+/g, ' ').trim();

// Nivel del cargo, con los del directorio (lib/contactosFiltros.js, BANDAS).
function banda(cargo) {
  const c = limpiar(cargo);
  if (/^(president|vicepresident|conseller)/.test(c)) return 'alta_direccion';
  if (/^secretari/.test(c) && !/executiv|tecnic|de govern|general tecnic/.test(c)) return 'alta_direccion';
  if (/^secretari general/.test(c)) return 'alta_direccion';
  if (/^director(a)? general/.test(c)) return 'alta_direccion';
  if (/^subdirect|^cap de la subdirecci/.test(c)) return 'subdireccion';
  if (/^(director|directora|delegat|delegada|comissionat|comissionada|cap del gabinet|gerent)/.test(c)) return 'direccion';
  return 'mando_intermedio';
}

async function handler(request) {
  const sp = new URL(request.url).searchParams;
  const secreto = process.env.CRON_SECRET;
  const debugKey = process.env.DEBUG_KEY;
  const auth = request.headers.get('authorization');
  const autorizado =
    (!secreto && !debugKey) || (secreto && auth === `Bearer ${secreto}`) || (debugKey && sp.get('key') === debugKey);
  if (!autorizado) return Response.json({ error: 'no autorizado' }, { status: 401 });
  const dry = sp.get('dry') === '1';
  const meses = Math.min(36, Math.max(1, Number(sp.get('meses')) || 12));

  const desde = new Date(Date.now() - meses * 30 * 86400000).toISOString().slice(0, 10);

  // Todas las reuniones de la ventana, de la más reciente a la más antigua.
  const filas = [];
  for (let offset = 0; offset < 200000; offset += 50000) {
    const q = new URLSearchParams({
      $select: 'nom_i_cognoms,c_rrec,departament,unitat_org_nica,tipologia,data',
      $where: `data >= '${desde}T00:00:00'`,
      $order: 'data DESC',
      $limit: '50000',
      $offset: String(offset),
    });
    const r = await fetch(`${API}?${q}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; GovTalentBot/1.0; +https://govtalent.app/bot)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) return Response.json({ error: `Socrata ${r.status}`, detalle: (await r.text()).slice(0, 300) }, { status: 502 });
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < 50000) break;
  }

  // Una persona = su fila más reciente (el cargo que ocupa ahora).
  const porPersona = new Map();
  for (const f of filas) {
    const nombre = limpio(f.nom_i_cognoms);
    const cargo = limpio(f.c_rrec);
    if (!nombre || !cargo || nombre.split(' ').length < 2) continue;
    const k = clave(nombre);
    if (!porPersona.has(k)) {
      porPersona.set(k, {
        nombre,
        cargo,
        departamento: limpio(f.departament) || null,
        unidad: limpio(f.unitat_org_nica) || null,
        tipologia: limpio(f.tipologia) || null,
        ultima: String(f.data || '').slice(0, 10) || null,
      });
    }
  }

  // Quien ya está en el directorio con la Generalitat no se duplica.
  const { data: ya } = await supabase().from('directorio_pro').select('nombre').eq('institucion', INSTITUCION).limit(5000);
  const yaEstan = new Set((ya || []).map((r) => clave(r.nombre)));

  const hoy = new Date().toISOString().slice(0, 10);
  const registros = [];
  for (const [k, p] of porPersona) {
    if (yaEstan.has(k)) continue;
    registros.push({
      fuente: FUENTE,
      fuente_fecha: p.ultima || hoy,
      fuente_clave: `gencat-visor:${k}`,
      jurisdiccion: 'España',
      tipo_institucion: 'autonómico',
      institucion: INSTITUCION,
      unidad: p.departamento,
      categoria_unidad: 'Departamentos',
      nombre: p.nombre,
      cargo: p.cargo,
      banda: banda(p.cargo),
      es_titular: true,
      localidad: 'Barcelona',
      provincia: 'Barcelona',
      extra: { unidad_organica: p.unidad, tipologia: p.tipologia, ultima_reunion: p.ultima },
      activo: true,
    });
  }

  const informe = {
    dry_run: dry,
    reuniones_leidas: filas.length,
    desde,
    personas: porPersona.size,
    ya_en_directorio: porPersona.size - registros.length,
    a_cargar: registros.length,
    por_nivel: Object.fromEntries(
      ['alta_direccion', 'direccion', 'subdireccion', 'mando_intermedio'].map((b) => [b, registros.filter((r) => r.banda === b).length])
    ),
    muestra_secretarios: registros
      .filter((r) => /^secretari/i.test(limpiar(r.cargo)))
      .slice(0, 25)
      .map((r) => `${r.nombre} · ${r.cargo} · ${r.unidad || ''}`),
  };
  if (dry) return Response.json(informe);

  for (let i = 0; i < registros.length; i += 500) {
    const { error } = await supabase().from('fuentes_personas').upsert(registros.slice(i, i + 500), { onConflict: 'fuente_clave' });
    if (error) return Response.json({ ...informe, error: error.message }, { status: 500 });
  }
  // Quien ya no sale en la ventana (ha dejado el cargo): inactivo.
  const vigentes = new Set(registros.map((r) => r.fuente_clave));
  const { data: cargados } = await supabase().from('fuentes_personas').select('id, fuente_clave').eq('fuente', FUENTE).eq('activo', true);
  const bajas = (cargados || []).filter((r) => !vigentes.has(r.fuente_clave)).map((r) => r.id);
  for (let i = 0; i < bajas.length; i += 500) {
    await supabase().from('fuentes_personas').update({ activo: false }).in('id', bajas.slice(i, i + 500));
  }
  informe.n_escritos = registros.length;
  informe.n_bajas = bajas.length;
  return Response.json(informe);
}

let cliente = null;
function supabase() {
  if (!cliente) {
    cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return cliente;
}

export const GET = conRegistro('/api/sync/altos-cargos-catalunya', handler);
