// =====================================================================
// PARLAMENTOS AUTONÓMICOS — sincronización común de la composición
// lib/ccaa/composicion/comun.js
//
// Para los parlamentos cuyo lector solo tiene que decir QUÉ hay (Valencia,
// La Rioja, Andalucía…): el lector de cada uno devuelve diputados, órganos
// con sus miembros, la ficha de cada diputado y el personal de los grupos,
// y aquí se guarda todo en las tablas de sql/91 de la misma forma que
// Madrid y Cataluña. Un lector es un objeto con:
//
//   P, LEGISLATURA, siglaGrupo(nombre)
//   leerDiputados(web) → [{ id_fuente, nombre, apellidos_nombre?, sexo?,
//                           grupo, circunscripcion?, foto_url?, url_ficha?,
//                           email?, twitter? }]
//   leerOrganos(web, diputados) → [{ nombre, tipo, miembros: [{ id_fuente?
//                           | nombre, cargo }] }]
//   leerFicha?(web, d) → { email?, circunscripcion?, twitter?, foto_url?,
//                          sexo?, datos? }
//   leerTecnicos?(web) → [{ nombre, grupo, cargo }]
// =====================================================================

import { slugTexto } from '@/lib/ccaa/composicion/madrid';

const DIAS_FICHA = 6;

export const clave = (n) => slugTexto(String(n || '').replace(/\s+/g, ' ').trim());

/** «Abad Soler, Ramón» → «Ramón Abad Soler». */
export function nombreNatural(oficial) {
  const [ap, nom] = String(oficial || '').split(',').map((s) => s.trim());
  return nom ? `${nom} ${ap}` : String(oficial || '').trim();
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'san']);
/**
 * «Diego Antonio Bengoa de la Cruz» → «Bengoa de la Cruz, Diego Antonio»:
 * dos apellidos al final, cada uno con sus partículas delante («de la»).
 */
export function apellidosNombre(nombre) {
  const p = String(nombre || '').split(' ').filter(Boolean);
  if (p.length < 3) return p.length === 2 ? `${p[1]}, ${p[0]}` : nombre;
  const apellido = (fin) => {
    let i = fin;
    while (i > 1 && PARTICULAS.has(p[i - 1].toLowerCase())) i -= 1;
    return i;
  };
  const i2 = apellido(p.length - 1);
  const i1 = i2 > 1 ? apellido(i2 - 1) : i2;
  return `${p.slice(i1).join(' ')}, ${p.slice(0, i1).join(' ')}`;
}

export function normCargo(cargo) {
  const c = String(cargo || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (/suplente/.test(c)) return 'suplente';
  if (/^vicepresident/.test(c)) return 'vicepresidencia';
  if (/^president/.test(c)) return 'presidencia';
  if (/^secretari/.test(c)) return 'secretaria';
  if (/^portavoz adjunt|^portavoz suplente|^síndic adjunt|^sindic adjunt/.test(c)) return 'portavoz_adjunto';
  if (/^portavoz|^s[ií]ndic/.test(c)) return 'portavoz';
  if (/^titular/.test(c)) return 'titular';
  if (/^vocal|^miembro|^representante|^diputad/.test(c)) return 'vocal';
  return 'otro';
}

export function tipoOrgano(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (/^mesa\b|junta de (portavoces|s[ií]ndics)|diputaci[oó]n permanente/.test(n)) return 'organo';
  if (/investigaci[oó]n/.test(n)) return 'investigacion';
  if (/estudio/.test(n)) return 'estudio';
  if (/^comisi[oó]n/.test(n)) return 'permanente';
  return 'otro';
}

/** Cargo con mayúscula inicial y el resto como lo escribe la fuente («PORTAVOZ COMISIÓN» → «Portavoz comisión»). */
export function cargoLegible(c) {
  const s = String(c || '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

export async function sincronizar(mod, db, web, { dry = false, paso = null, n = 0, soloId = null, forzar = false, tiempo = () => false } = {}) {
  const salida = {};
  const P = mod.P;
  let diputados = null;
  if (!paso || paso === 'listado') {
    diputados = await mod.leerDiputados(web);
    salida.listado = await guardarListado(mod, db, diputados, { dry });
  }
  if (mod.leerFicha && (!paso || paso === 'fichas') && !tiempo()) {
    salida.fichas = await pasoFichas(mod, db, web, { dry, n: n || (dry ? 2 : 200), soloId, forzar, tiempo, diputados });
  }
  if ((!paso && !tiempo()) || paso === 'organos') salida.organos = await pasoOrganos(mod, db, web, { dry, diputados });
  if (mod.leerTecnicos && ((!paso && !tiempo()) || paso === 'equipo')) salida.equipo = await pasoTecnicos(mod, db, web, { dry });
  if (!dry) {
    await recontar(db, P);
    salida.comisiones_vacias_borradas = await borrarVacias(db, P);
  }
  return salida;
}

const idGrupo = (mod, nombre) => `${mod.P}:${slugTexto(mod.siglaGrupo(nombre) || nombre)}`;

async function guardarListado(mod, db, diputados, { dry }) {
  const P = mod.P;
  const ahora = new Date().toISOString();
  if (diputados.length < 15) throw new Error(`El listado ha salido con ${diputados.length} diputados`);
  const grupos = new Map();
  for (const d of diputados) {
    if (!d.grupo) continue;
    const id = idGrupo(mod, d.grupo);
    if (!grupos.has(id)) {
      grupos.set(id, {
        id,
        parlamento: P,
        legislatura: mod.LEGISLATURA,
        nombre: d.grupo,
        sigla: mod.siglaGrupo(d.grupo),
        slug: id.replace(':', '-'),
        logo_url: d.grupo_logo || null,
        id_fuente: d.grupo_id_fuente || null,
        url: d.grupo_url || null,
        n_diputados: 0,
        activo: true,
        fuente: mod.FUENTE,
        synced_at: ahora,
      });
    }
    grupos.get(id).n_diputados += 1;
  }
  const filas = diputados.map((d) => ({
    id: `${P}:${d.id_fuente}`,
    parlamento: P,
    legislatura: mod.LEGISLATURA,
    nombre: d.nombre,
    apellidos_nombre: d.apellidos_nombre || apellidosNombre(d.nombre),
    slug: `${P}-${slugTexto(d.nombre)}`,
    grupo_id: d.grupo ? idGrupo(mod, d.grupo) : null,
    ...(d.sexo ? { sexo: d.sexo } : {}),
    ...(d.circunscripcion ? { circunscripcion: d.circunscripcion } : {}),
    ...(d.foto_url ? { foto_url: d.foto_url } : {}),
    ...(d.email ? { email: d.email } : {}),
    ...(d.twitter ? { twitter: d.twitter } : {}),
    url_ficha: d.url_ficha || null,
    id_fuente: d.id_fuente,
    activo: true,
    fuente: mod.FUENTE,
    fuente_fecha: ahora,
    updated_at: ahora,
  }));
  // Mismo slug para dos personas (homónimos): se desempata con el id.
  const vistos = new Map();
  for (const f of filas) {
    if (vistos.has(f.slug)) f.slug = `${f.slug}-${slugTexto(f.id_fuente).slice(0, 6)}`;
    vistos.set(f.slug, true);
  }
  if (dry) return { diputados: filas.length, grupos: [...grupos.values()].map((g) => `${g.sigla || g.nombre} ${g.n_diputados}`), muestra: filas.slice(0, 3) };

  const { error: eg } = await db.from('ccaa_grupos').upsert([...grupos.values()], { onConflict: 'id' });
  if (eg) throw new Error(`grupos: ${eg.message}`);
  const { error: ed } = await db.from('ccaa_diputados').upsert(filas, { onConflict: 'id' });
  if (ed) throw new Error(`diputados: ${ed.message}`);
  const ids = filas.map((f) => f.id);
  const { data: bajas } = await db.from('ccaa_diputados').update({ activo: false, updated_at: ahora })
    .eq('parlamento', P).eq('activo', true).not('id', 'in', `(${ids.map((i) => `"${i}"`).join(',')})`).select('id');
  if (bajas?.length) await db.from('ccaa_cargos').update({ activo: false }).in('diputado_id', bajas.map((b) => b.id));
  return { diputados: filas.length, grupos: grupos.size, con_correo: filas.filter((f) => f.email).length, bajas: bajas?.length || 0 };
}

async function pasoFichas(mod, db, web, { dry, n, soloId, forzar, tiempo, diputados }) {
  const P = mod.P;
  const limite = new Date(Date.now() - DIAS_FICHA * 86400000).toISOString();
  let lista;
  if (dry) {
    lista = (diputados || (await mod.leerDiputados(web))).slice(0, 2).map((d) => ({ id: `${P}:${d.id_fuente}`, ...d }));
  } else {
    let q = db.from('ccaa_diputados').select('id, id_fuente, nombre, url_ficha').eq('parlamento', P).eq('activo', true);
    if (soloId) q = q.eq('id_fuente', soloId);
    else if (!forzar) q = q.or(`ficha_leida_at.is.null,ficha_leida_at.lt.${limite}`);
    const { data, error } = await q.order('ficha_leida_at', { ascending: true, nullsFirst: true }).limit(n);
    if (error) throw new Error(`fichas pendientes: ${error.message}`);
    lista = data || [];
  }
  const res = { pendientes: lista.length, leidas: 0, errores: [] };
  const muestras = [];
  for (const d of lista) {
    if (tiempo()) { res.cortado_por_tiempo = true; break; }
    let f;
    try {
      f = await mod.leerFicha(web, d);
    } catch (e) {
      res.errores.push(`${d.nombre}: ${e.message}`.slice(0, 160));
      continue;
    }
    res.leidas += 1;
    if (dry) { muestras.push({ nombre: d.nombre, ...f }); continue; }
    const ahora = new Date().toISOString();
    const cambios = { ficha_leida_at: ahora, updated_at: ahora };
    for (const k of ['email', 'circunscripcion', 'twitter', 'foto_url', 'sexo', 'datos', 'fecha_alta']) if (f[k]) cambios[k] = f[k];
    await db.from('ccaa_diputados').update(cambios).eq('id', d.id);
  }
  if (dry) res.muestras = muestras;
  if (!res.errores.length) delete res.errores;
  return res;
}

async function pasoOrganos(mod, db, web, { dry, diputados }) {
  const P = mod.P;
  const { data: dips } = await db.from('ccaa_diputados').select('id, id_fuente, nombre, apellidos_nombre, grupo_id').eq('parlamento', P).eq('activo', true);
  const lista = dips?.length ? dips : (diputados || []).map((d) => ({ id: `${P}:${d.id_fuente}`, id_fuente: d.id_fuente, nombre: d.nombre, apellidos_nombre: d.apellidos_nombre, grupo_id: null }));
  const porFuente = new Map(lista.map((d) => [String(d.id_fuente), d]));
  const porNombre = new Map();
  for (const d of lista) {
    porNombre.set(clave(d.nombre), d);
    if (d.apellidos_nombre) porNombre.set(clave(d.apellidos_nombre), d);
  }
  const organos = await mod.leerOrganos(web, lista);
  const res = {};
  const filas = [];
  const comisiones = new Map();
  for (const o of organos) {
    const id = `${P}:${slugTexto(o.nombre)}`;
    comisiones.set(id, { id, parlamento: P, legislatura: mod.LEGISLATURA, nombre: o.nombre, tipo: o.tipo || tipoOrgano(o.nombre), slug: id.replace(':', '-'), url: o.url || null, activo: true });
    const sin = [];
    const vistos = new Set();
    for (const m of o.miembros) {
      const d = (m.id_fuente && porFuente.get(String(m.id_fuente))) || porNombre.get(clave(m.nombre)) || porNombre.get(clave(nombreNatural(m.nombre)));
      if (!d) { sin.push(m.nombre || m.id_fuente); continue; }
      const k = `${d.id}|${m.cargo}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      const cargo = cargoLegible(m.cargo) || 'Vocal';
      filas.push({
        parlamento: P,
        legislatura: mod.LEGISLATURA,
        nombre: d.nombre,
        diputado_id: d.id,
        grupo_id: d.grupo_id || null,
        comision_id: id,
        organo: o.nombre,
        cargo,
        cargo_norm: m.cargo_norm || normCargo(cargo),
        fecha_inicio: m.fecha_inicio || null,
        activo: true,
        fuente: 'organo',
      });
    }
    res[o.nombre] = o.miembros.length + (sin.length ? ` (sin casar: ${sin.slice(0, 5).join(', ')}${sin.length > 5 ? '…' : ''})` : '');
  }
  if (dry) return res;
  if (!filas.length) return { ...res, aviso: 'Sin miembros: no se toca lo guardado' };
  const { error: ec } = await db.from('ccaa_comisiones').upsert([...comisiones.values()], { onConflict: 'id' });
  if (ec) throw new Error(`órganos: ${ec.message}`);
  await db.from('ccaa_cargos').delete().eq('parlamento', P).eq('fuente', 'organo');
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await db.from('ccaa_cargos').insert(filas.slice(i, i + 500));
    if (error) throw new Error(`cargos: ${error.message}`);
  }
  return { organos: organos.length, cargos: filas.length };
}

async function pasoTecnicos(mod, db, web, { dry }) {
  const P = mod.P;
  const tecnicos = await mod.leerTecnicos(web);
  if (dry) return { tecnicos: tecnicos.length, muestra: tecnicos.slice(0, 5) };
  if (!tecnicos.length) return { tecnicos: 0, aviso: 'Sin técnicos: no se toca lo guardado' };
  const { data: grupos } = await db.from('ccaa_grupos').select('id, nombre').eq('parlamento', P);
  const porNombre = new Map((grupos || []).map((g) => [clave(g.nombre), g.id]));
  const filas = tecnicos.map((t) => ({
    parlamento: P,
    legislatura: mod.LEGISLATURA,
    nombre: t.nombre,
    diputado_id: null,
    grupo_id: porNombre.get(clave(t.grupo)) || (grupos || []).find((g) => mod.siglaGrupo(g.nombre) && mod.siglaGrupo(g.nombre) === mod.siglaGrupo(t.grupo))?.id || null,
    comision_id: null,
    organo: t.grupo,
    cargo: t.cargo || 'Personal del grupo',
    cargo_norm: 'tecnico',
    activo: true,
    fuente: 'personal',
  }));
  await db.from('ccaa_cargos').delete().eq('parlamento', P).eq('fuente', 'personal');
  const { error } = await db.from('ccaa_cargos').insert(filas);
  if (error) throw new Error(`personal: ${error.message}`);
  return { tecnicos: filas.length, sin_grupo: filas.filter((f) => !f.grupo_id).length };
}

async function recontar(db, P) {
  const { data: ds } = await db.from('ccaa_diputados').select('grupo_id').eq('parlamento', P).eq('activo', true);
  const cuenta = {};
  for (const d of ds || []) if (d.grupo_id) cuenta[d.grupo_id] = (cuenta[d.grupo_id] || 0) + 1;
  for (const [id, k] of Object.entries(cuenta)) await db.from('ccaa_grupos').update({ n_diputados: k }).eq('id', id);
}

async function borrarVacias(db, P) {
  const { data: usados } = await db.from('ccaa_cargos').select('comision_id').eq('parlamento', P).eq('activo', true).not('comision_id', 'is', null);
  const vivos = new Set((usados || []).map((r) => r.comision_id));
  if (!vivos.size) return 0;
  const { data: todas } = await db.from('ccaa_comisiones').select('id').eq('parlamento', P);
  const vacias = (todas || []).map((r) => r.id).filter((id) => !vivos.has(id));
  if (vacias.length) await db.from('ccaa_comisiones').delete().in('id', vacias);
  return vacias.length;
}
