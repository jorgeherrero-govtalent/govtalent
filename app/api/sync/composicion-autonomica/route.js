// =====================================================================
// SYNC — Composición de los parlamentos autonómicos
// app/api/sync/composicion-autonomica/route.js
//
// Diputados, grupos, comisiones y cargos (sql/91). De momento, la
// Asamblea de Madrid (lib/ccaa/composicion/madrid.js), leída de
// ctyp.asambleamadrid.es/es/web/guest/… como GovTalentBot:
//
//   1. listado  · página de grupos (logo, escaños, constitución) y las 7
//                 páginas del listado de diputados (id, nombre, grupo,
//                 color, correo, foto, Twitter). Los que dejan de salir
//                 pasan a inactivos.
//   2. fichas   · la ficha de cada diputado: cargos vigentes con su
//                 órgano (comisiones con vocales, Mesa, Junta de
//                 Portavoces, Diputación Permanente), legislaturas y
//                 recuentos de actividad. Por tandas: primero las que
//                 nunca se leyeron y luego las de más de 6 días.
//   3. equipo   · técnicos de los grupos parlamentarios vigentes, del CSV
//                 de datos abiertos «OcupacionesDiputadosAsambleaMadrid».
//
// Uso:
//   cron (CRON_SECRET)                       listado + fichas + equipo, hasta agotar el tiempo
//   ?key=<DEBUG_KEY>&p=madrid                igual, a mano
//   ?key=<DEBUG_KEY>&p=madrid&paso=fichas&n=40
//   ?key=<DEBUG_KEY>&p=madrid&dry=1          lee el listado y 2 fichas, sin guardar
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import { conRegistro } from '@/lib/syncLog';
import { crearWeb } from '@/lib/ccaa/web';
import * as madrid from '@/lib/ccaa/composicion/madrid';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FIN_MS = 260000;
const DIAS_FICHA = 6;
const CSV_OCUPACIONES = 'https://ctyp.asambleamadrid.es/static/doc/opendata/SGP_ADMIN.OPENDATA_OCUPACIONES_ASAMBLEA.csv';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

const P = 'madrid';
const L = madrid.LEGISLATURA;
const { slugTexto, siglaGrupo } = madrid;
const idGrupo = (nombre) => `${P}:${slugTexto(siglaGrupo(nombre) || nombre.replace(/^Grupo Parlamentario\s*/i, ''))}`;
const idComision = (organo) => `${P}:${slugTexto(organo)}`;
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'san']);

/** «María del Mar Espinar Mesa-Moles» → «Espinar Mesa-Moles, María del Mar» (dos apellidos al final). */
function apellidosNombre(nombre) {
  const p = nombre.split(' ').filter(Boolean);
  if (p.length < 3) return nombre;
  let i = p.length - 2;
  while (i > 1 && PARTICULAS.has(p[i - 1].toLowerCase())) i -= 1;
  return `${p.slice(i).join(' ')}, ${p.slice(0, i).join(' ')}`;
}

export const GET = conRegistro('/api/sync/composicion-autonomica', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });
  if ((sp.get('p') || P) !== P) return Response.json({ error: 'por ahora solo p=madrid' }, { status: 400 });

  const dry = sp.get('dry') === '1';
  const paso = sp.get('paso');
  const db = admin();
  const web = crearWeb();
  const salida = {};
  const tiempo = () => Date.now() - t0 > FIN_MS;

  try {
    if (!paso || paso === 'listado') salida.listado = await pasoListado(db, web, { dry, tiempo });
    if (!paso || paso === 'fichas') salida.fichas = await pasoFichas(db, web, { dry, tiempo, n: parseInt(sp.get('n') || '0', 10) || (dry ? 2 : 200), soloId: sp.get('diputado') });
    if ((!paso && !tiempo()) || paso === 'equipo') salida.equipo = await pasoEquipo(db, web, { dry });
    if (!dry) await recontar(db);
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e).slice(0, 500), ms: Date.now() - t0, ...salida }, { status: 500 });
  }
  return Response.json({ ok: true, dry, ms: Date.now() - t0, ...salida });
}

// ---------------------------------------------------------------------
async function pasoListado(db, web, { dry, tiempo }) {
  const ahora = new Date().toISOString();
  const gruposWeb = madrid.leerGrupos(await web.texto(`${madrid.GUEST}/composicion/grupos-parlamentarios`));
  const { total, diputados } = await madrid.leerListado(web, { tiempoAgotado: tiempo });
  if (!diputados.length) throw new Error('El listado de diputados ha salido vacío');
  if (total && diputados.length < total * 0.9) throw new Error(`Listado incompleto: ${diputados.length} de ${total}`);

  // Grupos: los de la página de grupos y, por si acaso, los que salgan en el listado.
  const grupos = new Map();
  for (const g of gruposWeb) grupos.set(idGrupo(g.nombre), { ...g });
  for (const d of diputados) {
    if (!d.grupo) continue;
    const id = idGrupo(d.grupo);
    const g = grupos.get(id) || { nombre: d.grupo };
    if (!g.color && d.grupo_color) g.color = d.grupo_color;
    grupos.set(id, g);
  }
  const filasGrupos = [...grupos.entries()].map(([id, g]) => ({
    id,
    parlamento: P,
    legislatura: L,
    nombre: g.nombre,
    sigla: siglaGrupo(g.nombre),
    slug: id.replace(':', '-'),
    color: g.color || null,
    logo_url: g.logo_url || null,
    fecha_constitucion: g.fecha_constitucion || null,
    id_fuente: g.id_fuente || null,
    url: g.id_fuente ? `${madrid.ORIGEN}/composicion/grupos-parlamentarios/ficha-del-grupo?grupoParlamentario=${g.id_fuente}` : null,
    n_diputados: diputados.filter((d) => d.grupo && idGrupo(d.grupo) === id).length,
    activo: true,
    fuente: 'asambleamadrid.es',
    synced_at: ahora,
  }));

  const filas = diputados.map((d) => ({
    id: `${P}:${d.id_fuente}`,
    parlamento: P,
    legislatura: L,
    nombre: d.nombre,
    apellidos_nombre: apellidosNombre(d.nombre),
    slug: `${P}-${slugTexto(d.nombre)}`,
    grupo_id: d.grupo ? idGrupo(d.grupo) : null,
    circunscripcion: 'Comunidad de Madrid',
    foto_url: madrid.urlFoto(d.id_fuente),
    email: d.email,
    twitter: d.twitter,
    url_ficha: madrid.urlFicha(d.id_fuente),
    id_fuente: d.id_fuente,
    activo: true,
    fuente: 'asambleamadrid.es',
    fuente_fecha: ahora,
    updated_at: ahora,
  }));
  if (dry) return { total, diputados: filas.length, grupos: filasGrupos, muestra: filas.slice(0, 3) };

  const { error: eg } = await db.from('ccaa_grupos').upsert(filasGrupos, { onConflict: 'id' });
  if (eg) throw new Error(`grupos: ${eg.message}`);
  const { error: ed } = await db.from('ccaa_diputados').upsert(filas, { onConflict: 'id' });
  if (ed) throw new Error(`diputados: ${ed.message}`);
  // Los que ya no salen en el listado dejan de estar activos.
  const ids = filas.map((f) => f.id);
  const { data: bajas } = await db.from('ccaa_diputados').update({ activo: false, updated_at: ahora })
    .eq('parlamento', P).eq('activo', true).not('id', 'in', `(${ids.map((i) => `"${i}"`).join(',')})`).select('id');
  if (bajas?.length) await db.from('ccaa_cargos').update({ activo: false }).in('diputado_id', bajas.map((b) => b.id));
  return { total, diputados: filas.length, con_correo: filas.filter((f) => f.email).length, grupos: filasGrupos.length, bajas: bajas?.length || 0 };
}

// ---------------------------------------------------------------------
async function pasoFichas(db, web, { dry, tiempo, n, soloId }) {
  const limite = new Date(Date.now() - DIAS_FICHA * 86400000).toISOString();
  let q = db.from('ccaa_diputados').select('id, id_fuente, nombre, grupo_id').eq('parlamento', P).eq('activo', true);
  if (soloId) q = q.eq('id_fuente', soloId);
  else q = q.or(`ficha_leida_at.is.null,ficha_leida_at.lt.${limite}`).order('ficha_leida_at', { ascending: true, nullsFirst: true });
  const { data: pendientes, error } = await q.limit(n);
  if (error) throw new Error(`fichas pendientes: ${error.message}`);
  const res = { pendientes: pendientes?.length || 0, leidas: 0, cargos: 0, errores: [] };
  const muestras = [];

  for (const d of pendientes || []) {
    if (tiempo()) { res.cortado_por_tiempo = true; break; }
    let f;
    try {
      f = madrid.leerFicha(await web.texto(madrid.urlFicha(d.id_fuente)));
    } catch (e) {
      res.errores.push(`${d.nombre}: ${e.message}`.slice(0, 160));
      continue;
    }
    const vigentes = f.vigentes;
    if (dry) { muestras.push({ nombre: d.nombre, ...f, cargos: undefined }); res.leidas += 1; continue; }

    const ahora = new Date().toISOString();
    const comisiones = new Map();
    const cargos = [];
    let sexo = null;
    for (const c of vigentes) {
      if (/^asamblea de madrid$/i.test(c.organo)) {
        sexo = /diputada/i.test(c.cargo) ? 'M' : /diputado/i.test(c.cargo) ? 'H' : sexo;
        continue;
      }
      const esGrupo = /^grupo parlamentario/i.test(c.organo);
      const comisionId = esGrupo ? null : idComision(c.organo);
      if (comisionId && !comisiones.has(comisionId)) {
        comisiones.set(comisionId, { id: comisionId, parlamento: P, legislatura: L, nombre: c.organo, tipo: madrid.tipoOrgano(c.organo), slug: comisionId.replace(':', '-'), activo: true });
      }
      cargos.push({
        parlamento: P,
        legislatura: L,
        nombre: d.nombre,
        diputado_id: d.id,
        grupo_id: esGrupo ? idGrupo(c.organo) : d.grupo_id,
        comision_id: comisionId,
        organo: c.organo,
        cargo: c.cargo,
        cargo_norm: c.cargo_norm,
        fecha_inicio: c.fecha_inicio,
        fecha_fin: null,
        activo: true,
        fuente: 'ficha',
      });
    }
    if (comisiones.size) {
      const { error: ec } = await db.from('ccaa_comisiones').upsert([...comisiones.values()], { onConflict: 'id', ignoreDuplicates: true });
      if (ec) { res.errores.push(`comisiones ${d.nombre}: ${ec.message}`); continue; }
    }
    // Se sustituyen los cargos de la ficha de este diputado por los vigentes.
    await db.from('ccaa_cargos').delete().eq('diputado_id', d.id).eq('fuente', 'ficha');
    if (cargos.length) {
      const { error: ek } = await db.from('ccaa_cargos').insert(cargos);
      if (ek) { res.errores.push(`cargos ${d.nombre}: ${ek.message}`); continue; }
    }
    const cambios = {
      datos: { legislaturas: f.legislaturas, actividad: f.actividad },
      ficha_leida_at: ahora,
      updated_at: ahora,
      ...(sexo ? { sexo } : {}),
      ...(f.email ? { email: f.email } : {}),
      ...(vigentes.find((c) => /^asamblea de madrid$/i.test(c.organo)) ? { fecha_alta: vigentes.find((c) => /^asamblea de madrid$/i.test(c.organo)).fecha_inicio } : {}),
    };
    await db.from('ccaa_diputados').update(cambios).eq('id', d.id);
    res.leidas += 1;
    res.cargos += cargos.length;
  }
  if (dry) res.muestras = muestras;
  if (!res.errores.length) delete res.errores;
  return res;
}

// ---------------------------------------------------------------------
// Técnicos de los grupos: filas vigentes (FECHA_FIN «-») de la legislatura.
async function pasoEquipo(db, web, { dry }) {
  const texto = await web.texto(CSV_OCUPACIONES);
  const filas = [];
  const { data: grupos } = await db.from('ccaa_grupos').select('id, nombre').eq('parlamento', P);
  const porNombre = new Map((grupos || []).map((g) => [slugTexto(g.nombre), g.id]));
  Papa.parse(texto.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
    step: ({ data: r }) => {
      if (String(r.LEGISLATURA) !== String(madrid.LEG_NUM)) return;
      if (!/t[eé]cnic/i.test(r.CARGO || '')) return;
      if ((r.FECHA_FIN || '').trim() !== '-') return;
      const g = String(r.GRUPO_PARLAMENTARIO || '').replace(/\s*\(leg\..*$/i, '').trim();
      const grupoId = porNombre.get(slugTexto(g)) || null;
      const ini = (r.FECHA_INICIO || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      filas.push({
        parlamento: P,
        legislatura: L,
        nombre: String(r.NOMBRE || '').trim(),
        diputado_id: null,
        grupo_id: grupoId,
        comision_id: null,
        organo: g || null,
        cargo: /administrativ/i.test(r.CARGO) ? 'Técnico / administrativo del grupo' : 'Técnico del grupo',
        cargo_norm: 'tecnico',
        fecha_inicio: ini ? `${ini[3]}-${ini[2]}-${ini[1]}` : null,
        activo: true,
        fuente: 'ocupaciones',
      });
    },
  });
  if (dry) return { tecnicos: filas.length, muestra: filas.slice(0, 3) };
  if (filas.length < 5) return { tecnicos: filas.length, aviso: 'Muy pocos técnicos: no se toca lo guardado' };
  await db.from('ccaa_cargos').delete().eq('parlamento', P).eq('fuente', 'ocupaciones');
  const { error } = await db.from('ccaa_cargos').insert(filas);
  if (error) throw new Error(`equipo: ${error.message}`);
  return { tecnicos: filas.length, sin_grupo: filas.filter((f) => !f.grupo_id).length };
}

async function recontar(db) {
  const { data: ds } = await db.from('ccaa_diputados').select('grupo_id').eq('parlamento', P).eq('activo', true);
  const cuenta = {};
  for (const d of ds || []) if (d.grupo_id) cuenta[d.grupo_id] = (cuenta[d.grupo_id] || 0) + 1;
  for (const [id, n] of Object.entries(cuenta)) await db.from('ccaa_grupos').update({ n_diputados: n }).eq('id', id);
}
