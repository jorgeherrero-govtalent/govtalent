// =====================================================================
// PARLAMENT DE CATALUNYA — composición (diputados, grupos, comisiones,
// Mesa, Junta de Portaveus y Diputació Permanent)
// lib/ccaa/composicion/cataluna.js
//
// Fuentes (www.parlament.cat/web/composicio/…, permitidas por su
// robots.txt; nunca /ext, /pls ni /apl):
//   - ple-parlament/index.html — los 135 diputados por grupo, con su foto
//     y su código (p_codi). Las fotos están en /apl/gimg (prohibido al
//     robot): se guarda la dirección y la carga el navegador de quien mira,
//     como en la propia web; el robot no la descarga.
//   - diputats-fitxa/index.html?p_codi=N — circunscripción, grupo, correo
//     publicado, redes, legislaturas y la fecha de alta en cada comisión.
//   - comissions/index.html y comissions/informacio-comissio/index.html?p_codi=N
//     — las comisiones vigentes y, de cada una, su Mesa y sus miembros por
//     grupo (con quién es portavoz). Desde noviembre de 2026 las fichas ya
//     no dicen el cargo en cada comisión («Comissió … (CISP). . Alta: …»),
//     así que la composición se lee de la página de la comisión.
//   - president-mesa, junta-portaveus y diputacio-permanent — la
//     composición vigente de los tres órganos de gobierno.
//   - grups-parlamentaris/index.html — el código de cada grupo.
//
// Mismas tablas que Madrid (sql/91). Ids: 'cataluna:683' (diputado),
// 'cataluna:erc' (grupo), 'cataluna:comissio-de-cultura' (órgano).
// =====================================================================

import { textoPlano } from '@/lib/ccaa/web';
import { slugTexto } from '@/lib/ccaa/composicion/madrid';

export const P = 'cataluna';
export const LEGISLATURA = 'XV';
const W = 'https://www.parlament.cat/web/composicio';
const DIAS_FICHA = 6;

export const urlFicha = (codi) => `${W}/diputats-fitxa/index.html?p_codi=${codi}`;

// Tratamientos que preceden al nombre: «M. H. Sr.», «I. Sra.», «H. Sr.»,
// «Il·lma. Sra.», «Excma. Sra.», o solo «Sr.».
const TRACT = /^(?:(?:M\.\s*H\.|Il·lm[ae]?\.|Il\.lm[ae]?\.|Excm[ae]?\.|Hble\.|H\.|I\.)\s+)*(Sra?\.)\s+/;

export function sinTratamiento(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  const m = s.match(TRACT);
  return { nombre: m ? s.slice(m[0].length).trim() : s, sexo: m ? (m[1] === 'Sra.' ? 'M' : 'H') : null };
}

const clave = (n) => slugTexto(n);

export function siglaGrupo(nombre) {
  const t = String(nombre || '').toLowerCase();
  if (/socialistes/.test(t)) return 'PSC';
  if (/junts/.test(t)) return 'Junts';
  if (/esquerra republicana/.test(t)) return 'ERC';
  if (/partit popular/.test(t)) return 'PP';
  if (/vox/.test(t)) return 'VOX';
  if (/comuns/.test(t)) return 'Comuns';
  if (/candidatura d.unitat popular|\bcup\b/.test(t)) return 'CUP';
  if (/grup mixt/.test(t)) return 'Mixt';
  return null;
}
export const idGrupo = (nombre) => `${P}:${slugTexto(siglaGrupo(nombre) || nombre)}`;
export const idOrgano = (nombre) => `${P}:${slugTexto(nombre)}`;

export function normCargo(cargo) {
  const c = String(cargo || '').toLowerCase().trim();
  if (/^president[a]?-portaveu/.test(c)) return 'portavoz';
  if (/^vicepresident/.test(c)) return 'vicepresidencia';
  if (/^president/.test(c)) return 'presidencia';
  if (/^secret[aà]ri/.test(c)) return 'secretaria';
  if (/^portaveu (adjunt|suplent)/.test(c)) return 'portavoz_adjunto';
  if (/^portaveu/.test(c)) return 'portavoz';
  if (/suplent/.test(c)) return 'suplente';
  if (/^membre/.test(c)) return 'vocal';
  return 'otro';
}

function tipoComision(nombre) {
  if (/^comissió d.investigació/i.test(nombre)) return 'investigacion';
  if (/^comissió d.estudi/i.test(nombre)) return 'estudio';
  if (/^comissió/i.test(nombre)) return 'permanente';
  return 'otro';
}

const sinScripts = (h) => h.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
const iso = (d, m, a) => `${a}-${m}-${d}`;

// ---------------------------------------------------------------------
// Ple: diputados por grupo.
// ---------------------------------------------------------------------
export function leerPle(html) {
  const salida = new Map();
  const RE = /<a title="Vegeu la fitxa de ([^"]+)" href="[^"]*diputats-fitxa\/index\.html\?p_codi=(\d+)"[^>]*>\s*<img[^>]+src="([^"]+)"/g;
  const partes = html.split(/class="titol_pod">/);
  // partes[0]: la Mesa (cada miembro lleva su grupo en un <p class="marg-1">).
  for (let i = 0; i < partes.length; i += 1) {
    const parte = partes[i];
    const grupoBloque = i === 0 ? null : textoPlano(parte.slice(0, parte.indexOf('</a>'))).trim();
    for (const m of parte.matchAll(RE)) {
      const { nombre, sexo } = sinTratamiento(m[1]);
      let grupo = grupoBloque;
      if (!grupo) {
        const resto = parte.slice(m.index, m.index + 1500);
        grupo = textoPlano((resto.match(/<p class="marg-1">([^<]*Grup[^<]*)<\/p>/) || [])[1] || '').trim() || null;
      }
      const previo = salida.get(m[2]);
      // El bloque del grupo manda sobre la Mesa.
      if (!previo || (grupoBloque && !previo.deBloque)) {
        salida.set(m[2], { id_fuente: m[2], nombre, sexo, grupo, foto_url: m[3].trim(), deBloque: !!grupoBloque });
      }
    }
  }
  return [...salida.values()].map(({ deBloque: _d, ...d }) => d);
}

/** grups-parlamentaris/index.html → { nombre del grupo: p_codi }. */
export function leerGrupos(html) {
  const out = {};
  for (const m of html.matchAll(/grup-parlamentari\/index\.html\?p_codi=(\d+)&(?:amp;)?p_legislatura=15"[^>]*>([^<]+)</g)) {
    const nombre = textoPlano(m[2]).trim();
    if (nombre && !out[nombre]) out[nombre] = m[1];
  }
  return out;
}

// ---------------------------------------------------------------------
// Ficha del diputado.
// ---------------------------------------------------------------------
export function leerFicha(html) {
  const t = textoPlano(sinScripts(html)).replace(/\s+/g, ' ');
  const circ = (t.match(/Circumscripció electoral de ([A-Za-zÀ-ÿ]+)/) || [])[1] || null;
  const g = t.match(/Grup parlamentari: (.+?) ?\. [^.]*\. Alta: (\d{2})\.(\d{2})\.(\d{4})/);
  const legislaturas = ((t.match(/Membre de la legislatura: (.+?) Agenda d'avui/) || [])[1] || '')
    .split(',')
    .map((x) => x.trim().split(' ')[0])
    .filter(Boolean);
  const email = (html.match(/[\w.+-]+@parlament\.cat/gi) || []).find((e) => !/^(info|parlament)@/i.test(e))?.toLowerCase() || null;
  const twitter = (html.match(/href="(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"]+)"/i) || [])[1] || null;
  const foto = (html.match(/src="(https:\/\/www\.parlament\.cat\/apl\/gimg\/imatgeweb\?[^"]+)"/) || [])[1]?.trim() || null;

  // Fecha de alta vigente en cada comisión, por el código de la comisión.
  const altas = {};
  const RE = /informacio-comissio\/index\.html\?p_codi=(\d+)"[^>]*>[^<]*<\/a>\s*\.[^<]*?Alta:\s*(\d{2})\.(\d{2})\.(\d{4})([^<]*)/g;
  for (const m of html.matchAll(RE)) {
    if (/Baixa/i.test(m[5])) continue;
    altas[m[1]] = iso(m[2], m[3], m[4]);
  }
  return {
    circunscripcion: circ,
    grupo: g ? g[1].trim() : null,
    fecha_alta: g ? iso(g[2], g[3], g[4]) : null,
    legislaturas,
    email,
    twitter,
    foto,
    altas,
  };
}

// ---------------------------------------------------------------------
// Comisiones: índice y composición de cada una.
// ---------------------------------------------------------------------
export const urlComision = (codi) => `${W}/comissions/informacio-comissio/index.html?p_codi=${codi}`;
const sinSigla = (n) => String(n || '').replace(/\s*\([A-Z]{1,14}\)$/, '').trim();

/** comissions/index.html → [{ codi, nombre, tipo }], sin las que ya han terminado sus trabajos. */
export function leerIndiceComisiones(html) {
  const out = [];
  const vistos = new Set();
  let seccion = '';
  const RE = /<h2 class="titol_caixa"><span>([^<]+)<\/span>|<h3><a href="[^"]*informacio-comissio\/index\.html\?[^"]*p_codi=(\d+)"[^>]*>([^<]+)<\/a>/g;
  for (const m of html.matchAll(RE)) {
    if (m[1]) { seccion = textoPlano(m[1]).trim(); continue; }
    if (/finalitzat/i.test(seccion) || vistos.has(m[2])) continue;
    vistos.add(m[2]);
    const nombre = sinSigla(textoPlano(m[3]).trim());
    const tipo = /investigaci/i.test(seccion) ? 'investigacion' : /estudi/i.test(seccion) ? 'estudio' : tipoComision(nombre) === 'otro' ? 'permanente' : tipoComision(nombre);
    out.push({ codi: m[2], nombre, tipo });
  }
  return out;
}

/** Personas de un bloque de la página: [{ id_fuente, nombre, cargo }] (cargo vacío si no lo dice). */
function personasDe(bloque) {
  const out = [];
  const RE = /<a title="Vegeu la fitxa de ([^"]+)" href="[^"]*diputats-fitxa\/index\.html\?p_codi=(\d+)"/g;
  const ms = [...bloque.matchAll(RE)];
  for (let i = 0; i < ms.length; i += 1) {
    const trozo = bloque.slice(ms[i].index, i + 1 < ms.length ? ms[i + 1].index : bloque.length);
    const cargo = textoPlano((trozo.match(/<p class="marg-0">\s*([^<\s][^<]*)<\/p>/) || [])[1] || '').trim();
    out.push({ id_fuente: ms[i][2], nombre: sinTratamiento(textoPlano(ms[i][1])).nombre, cargo: cargo || null });
  }
  return out;
}

/**
 * Página de una comisión → { mesa, miembros }. La Mesa va en su bloque,
 * con el cargo; los miembros, en «Grups parlamentaris», y solo el portavoz
 * lleva cargo. El «Personal de suport» (letrado, gestora) no se lee.
 */
export function leerComision(html) {
  const iMesa = html.search(/<h2>\s*Mesa\s*<\/h2>/);
  const iGrupos = html.search(/<h2>\s*Grups parlamentaris\s*<\/h2>/);
  let fin = html.search(/<h2>\s*Personal de suport\s*<\/h2>/);
  if (fin < 0) fin = html.indexOf('ccentral_blau');
  if (fin < 0) fin = html.length;
  const mesa = iMesa >= 0 ? personasDe(html.slice(iMesa, iGrupos > iMesa ? iGrupos : fin)) : [];
  const miembros = iGrupos >= 0 ? personasDe(html.slice(iGrupos, fin)) : [];
  return { mesa: mesa.filter((x) => x.cargo), miembros };
}

/**
 * Filas de cargo de una comisión: quien está en la Mesa o es portavoz sale
 * con ese cargo (los dos, si tiene los dos); el resto, como «Membre».
 */
export function filasDeComision({ mesa, miembros }) {
  const filas = [];
  const conRol = new Set();
  const vistos = new Set();
  const poner = (x, cargo) => {
    const k = `${x.id_fuente}|${cargo}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    filas.push({ id_fuente: x.id_fuente, nombre: x.nombre, cargo, cargo_norm: normCargo(cargo) });
  };
  for (const x of mesa) { poner(x, x.cargo); conRol.add(x.id_fuente); }
  for (const x of miembros) if (x.cargo && !/^membre$/i.test(x.cargo)) { poner(x, x.cargo); conRol.add(x.id_fuente); }
  for (const x of miembros) if (!conRol.has(x.id_fuente)) poner(x, 'Membre');
  return filas;
}

// ---------------------------------------------------------------------
// Órganos de gobierno: Mesa, Junta de Portaveus y Diputació Permanent.
// ---------------------------------------------------------------------
function lineas(html) {
  return textoPlano(sinScripts(html)).split('\n').map((x) => x.trim()).filter(Boolean);
}

/** «Nombre» seguido de «Cargo Grup Parlamentari …» → [{ nombre, cargo }]. */
export function leerOrganoPorParejas(html) {
  const ls = lineas(html);
  const out = [];
  for (let i = 0; i < ls.length - 1; i += 1) {
    if (!TRACT.test(ls[i]) || TRACT.test(ls[i + 1])) continue;
    const m = ls[i + 1].match(/^(.+?)\s+Grup (?:Parlamentari|Mixt)\b/);
    if (m) out.push({ nombre: sinTratamiento(ls[i]).nombre, cargo: m[1].trim() });
  }
  return out;
}

/** Diputació Permanent: su Mesa por parejas y, después de «Grups parlamentaris», los miembros. */
export function leerDiputacio(html) {
  const ls = lineas(html);
  const k = ls.indexOf('Grups parlamentaris');
  const mesa = leerOrganoPorParejas(html).filter((x) => !/^Membre$/i.test(x.cargo));
  const miembros = [];
  if (k >= 0) {
    for (let i = k + 1; i < ls.length; i += 1) {
      if (/^Agenda$/.test(ls[i])) break;
      if (TRACT.test(ls[i])) miembros.push({ nombre: sinTratamiento(ls[i]).nombre, cargo: 'Membre' });
    }
  }
  const enMesa = new Set(mesa.map((x) => clave(x.nombre)));
  return [...mesa, ...miembros.filter((x) => !enMesa.has(clave(x.nombre)))];
}

// ---------------------------------------------------------------------
// Sincronización.
// ---------------------------------------------------------------------
export async function sincronizar(db, web, { dry = false, paso = null, n = 0, soloId = null, forzar = false, tiempo = () => false } = {}) {
  const salida = {};
  if (!paso || paso === 'listado') salida.listado = await pasoListado(db, web, { dry });
  if ((!paso && !tiempo()) || paso === 'organos') salida.organos = await pasoOrganos(db, web, { dry });
  if ((!paso && !tiempo()) || paso === 'comisiones') salida.comisiones = await pasoComisiones(db, web, { dry, n, tiempo });
  // Las fichas, al final: son 135 páginas y no deben dejar sin tiempo a lo demás.
  if ((!paso && !tiempo()) || paso === 'fichas') salida.fichas = await pasoFichas(db, web, { dry, n: n || (dry ? 2 : 200), soloId, forzar, tiempo });
  if (!dry) {
    await recontar(db);
    // Comisiones que ya no existen: solo se borran si en esta pasada se han
    // leído bien todas. Una lectura fallida no puede vaciar el directorio.
    if (salida.comisiones?.guardado) {
      const { data: usados } = await db.from('ccaa_cargos').select('comision_id').eq('parlamento', P).eq('activo', true).not('comision_id', 'is', null);
      const vivos = new Set((usados || []).map((r) => r.comision_id));
      const { data: todas } = await db.from('ccaa_comisiones').select('id').eq('parlamento', P);
      const vacias = (todas || []).map((r) => r.id).filter((id) => !vivos.has(id));
      if (vacias.length && vivos.size) {
        await db.from('ccaa_comisiones').delete().in('id', vacias);
        salida.comisiones_vacias_borradas = vacias.length;
      }
    }
  }
  return salida;
}

async function pasoListado(db, web, { dry }) {
  const ahora = new Date().toISOString();
  const diputados = leerPle(await web.texto(`${W}/ple-parlament/index.html`));
  if (diputados.length < 100) throw new Error(`El Ple ha salido con ${diputados.length} diputados`);
  let codis = {};
  try {
    codis = leerGrupos(await web.texto(`${W}/grups-parlamentaris/index.html`));
  } catch {
    // Sin la página de grupos se sigue: el código solo sirve para el enlace.
  }
  const codiPorClave = Object.fromEntries(Object.entries(codis).map(([nom, c]) => [clave(nom), c]));

  const grupos = new Map();
  for (const d of diputados) {
    if (!d.grupo) continue;
    const id = idGrupo(d.grupo);
    if (!grupos.has(id)) {
      const codi = codiPorClave[clave(d.grupo)] || null;
      grupos.set(id, {
        id,
        parlamento: P,
        legislatura: LEGISLATURA,
        nombre: d.grupo,
        sigla: siglaGrupo(d.grupo),
        slug: id.replace(':', '-'),
        id_fuente: codi,
        url: codi ? `${W}/grups-parlamentaris/grup-parlamentari/index.html?p_codi=${codi}&p_legislatura=15` : null,
        fecha_constitucion: '2024-06-10',
        n_diputados: 0,
        activo: true,
        fuente: 'parlament.cat',
        synced_at: ahora,
      });
    }
    grupos.get(id).n_diputados += 1;
  }

  const filas = diputados.map((d) => ({
    id: `${P}:${d.id_fuente}`,
    parlamento: P,
    legislatura: LEGISLATURA,
    nombre: d.nombre,
    apellidos_nombre: apellidosNombre(d.nombre),
    slug: `${P}-${slugTexto(d.nombre)}`,
    grupo_id: d.grupo ? idGrupo(d.grupo) : null,
    ...(d.sexo ? { sexo: d.sexo } : {}),
    foto_url: d.foto_url,
    url_ficha: urlFicha(d.id_fuente),
    id_fuente: d.id_fuente,
    activo: true,
    fuente: 'parlament.cat',
    fuente_fecha: ahora,
    updated_at: ahora,
  }));
  if (dry) return { diputados: filas.length, grupos: [...grupos.values()].map((g) => `${g.sigla} ${g.n_diputados} (${g.id_fuente || '?'})`), muestra: filas.slice(0, 3) };

  const { error: eg } = await db.from('ccaa_grupos').upsert([...grupos.values()], { onConflict: 'id' });
  if (eg) throw new Error(`grupos: ${eg.message}`);
  const { error: ed } = await db.from('ccaa_diputados').upsert(filas, { onConflict: 'id' });
  if (ed) throw new Error(`diputados: ${ed.message}`);
  const ids = filas.map((f) => f.id);
  const { data: bajas } = await db.from('ccaa_diputados').update({ activo: false, updated_at: ahora })
    .eq('parlamento', P).eq('activo', true).not('id', 'in', `(${ids.map((i) => `"${i}"`).join(',')})`).select('id');
  if (bajas?.length) await db.from('ccaa_cargos').update({ activo: false }).in('diputado_id', bajas.map((b) => b.id));
  return { diputados: filas.length, grupos: grupos.size, bajas: bajas?.length || 0 };
}

const PARTICULAS = new Set(['de', 'del', 'la', 'les', 'i', 'y', 'dels']);
/** «Raquel Sans Guerra» → «Sans Guerra, Raquel»; «Josep Rull i Andreu» → «Rull i Andreu, Josep». */
function apellidosNombre(nombre) {
  const p = nombre.split(' ').filter(Boolean);
  if (p.length < 3) return p.length === 2 ? `${p[1]}, ${p[0]}` : nombre;
  // Dos apellidos al final, con su «i» o su partícula delante si la hay.
  let i = p.length - 2;
  if (PARTICULAS.has(p[i].toLowerCase())) i -= 1;
  while (i > 1 && PARTICULAS.has(p[i - 1].toLowerCase())) i -= 1;
  return `${p.slice(i).join(' ')}, ${p.slice(0, i).join(' ')}`;
}

async function pasoFichas(db, web, { dry, n, soloId, forzar, tiempo }) {
  const limite = new Date(Date.now() - DIAS_FICHA * 86400000).toISOString();
  let q = db.from('ccaa_diputados').select('id, id_fuente, nombre, grupo_id').eq('parlamento', P).eq('activo', true);
  if (soloId) q = q.eq('id_fuente', soloId);
  else if (!forzar) q = q.or(`ficha_leida_at.is.null,ficha_leida_at.lt.${limite}`);
  const { data: pendientes, error } = await q.order('ficha_leida_at', { ascending: true, nullsFirst: true }).limit(n);
  if (error) throw new Error(`fichas pendientes: ${error.message}`);
  let lista = pendientes || [];
  // En prueba y sin nada guardado aún: dos del Ple.
  if (dry && !lista.length) lista = leerPle(await web.texto(`${W}/ple-parlament/index.html`)).slice(0, 2).map((d) => ({ id: `${P}:${d.id_fuente}`, id_fuente: d.id_fuente, nombre: d.nombre }));

  const res = { pendientes: lista.length, leidas: 0, fechas: 0, errores: [] };
  const muestras = [];
  const { data: coms } = await db.from('ccaa_comisiones').select('id, url').eq('parlamento', P).not('url', 'is', null);
  const comisionPorCodi = new Map((coms || []).map((c) => [(c.url.match(/p_codi=(\d+)/) || [])[1], c.id]));
  for (const d of lista) {
    if (tiempo()) { res.cortado_por_tiempo = true; break; }
    let f;
    try {
      f = leerFicha(await web.texto(urlFicha(d.id_fuente)));
    } catch (e) {
      res.errores.push(`${d.nombre}: ${e.message}`.slice(0, 160));
      continue;
    }
    if (dry) {
      muestras.push({ nombre: d.nombre, circunscripcion: f.circunscripcion, grupo: f.grupo, email: f.email, legislaturas: f.legislaturas, altas: f.altas });
      res.leidas += 1;
      continue;
    }
    const ahora = new Date().toISOString();
    // La fecha de alta va solo en la fila de miembro: la del cargo de Mesa o de portavoz no se publica.
    for (const [codi, fecha] of Object.entries(f.altas)) {
      const comisionId = comisionPorCodi.get(codi);
      if (!comisionId) continue;
      await db.from('ccaa_cargos').update({ fecha_inicio: fecha }).eq('diputado_id', d.id).eq('comision_id', comisionId).eq('fuente', 'comision').eq('cargo_norm', 'vocal');
      res.fechas += 1;
    }
    await db.from('ccaa_diputados').update({
      datos: { legislaturas: f.legislaturas, altas: f.altas },
      ficha_leida_at: ahora,
      updated_at: ahora,
      ...(f.circunscripcion ? { circunscripcion: f.circunscripcion } : {}),
      ...(f.email ? { email: f.email } : {}),
      ...(f.twitter ? { twitter: f.twitter } : {}),
      ...(f.fecha_alta ? { fecha_alta: f.fecha_alta } : {}),
    }).eq('id', d.id);
    res.leidas += 1;
  }
  if (dry) res.muestras = muestras;
  if (!res.errores.length) delete res.errores;
  return res;
}

const ORGANOS = [
  { nombre: 'Mesa del Parlament', ruta: '/president-mesa/index.html', leer: leerOrganoPorParejas },
  { nombre: 'Junta de Portaveus', ruta: '/junta-portaveus/index.html', leer: leerOrganoPorParejas },
  { nombre: 'Diputació Permanent', ruta: '/diputacio-permanent/index.html', leer: leerDiputacio },
];

async function pasoOrganos(db, web, { dry }) {
  const { data: dips } = await db.from('ccaa_diputados').select('id, nombre, grupo_id').eq('parlamento', P).eq('activo', true);
  const porClave = new Map((dips || []).map((d) => [clave(d.nombre), d]));
  const res = {};
  const filas = [];
  for (const o of ORGANOS) {
    let miembros;
    try {
      miembros = o.leer(await web.texto(`${W}${o.ruta}`));
    } catch (e) {
      res[o.nombre] = { error: e.message };
      continue;
    }
    const sin = [];
    for (const m of miembros) {
      const d = porClave.get(clave(m.nombre));
      if (!d) { sin.push(m.nombre); continue; }
      filas.push({
        parlamento: P,
        legislatura: LEGISLATURA,
        nombre: d.nombre,
        diputado_id: d.id,
        grupo_id: d.grupo_id,
        comision_id: idOrgano(o.nombre),
        organo: o.nombre,
        cargo: m.cargo === 'Membre' && o.nombre === 'Diputació Permanent' ? 'Membre' : m.cargo,
        cargo_norm: o.nombre === 'Diputació Permanent' && m.cargo === 'Membre' ? 'titular' : normCargo(m.cargo),
        activo: true,
        fuente: 'organo',
      });
    }
    res[o.nombre] = { miembros: miembros.length, ...(sin.length ? { sin_casar: sin } : {}) };
  }
  if (dry) return res;
  if (!filas.length) return { ...res, aviso: 'Sin miembros: no se toca lo guardado' };
  await db.from('ccaa_comisiones').upsert(
    ORGANOS.map((o) => ({ id: idOrgano(o.nombre), parlamento: P, legislatura: LEGISLATURA, nombre: o.nombre, tipo: 'organo', slug: idOrgano(o.nombre).replace(':', '-'), activo: true })),
    { onConflict: 'id', ignoreDuplicates: true }
  );
  await db.from('ccaa_cargos').delete().eq('parlamento', P).eq('fuente', 'organo');
  const { error } = await db.from('ccaa_cargos').insert(filas);
  if (error) throw new Error(`órganos: ${error.message}`);
  return res;
}

/**
 * Comisiones: el índice y la página de cada una. Se guarda todo de una vez
 * y solo si la lectura es completa: con una página sin leer, o con menos
 * del 80 % de las comisiones con miembros, no se toca lo guardado.
 */
async function pasoComisiones(db, web, { dry, n, tiempo }) {
  let indice = leerIndiceComisiones(await web.texto(`${W}/comissions/index.html`));
  if (indice.length < 15) throw new Error(`El índice de comisiones ha salido con ${indice.length}`);
  if (dry) indice = indice.slice(0, n || 3);
  const { data: dips } = await db.from('ccaa_diputados').select('id, id_fuente, nombre, grupo_id, datos').eq('parlamento', P).eq('activo', true);
  const porCodi = new Map((dips || []).map((d) => [String(d.id_fuente), d]));

  const res = { comisiones: indice.length, cargos: 0, errores: [] };
  let fallos = 0;
  const comisiones = [];
  const filas = [];
  const muestras = [];
  for (const c of indice) {
    if (tiempo()) { res.cortado_por_tiempo = true; break; }
    let leida;
    try {
      leida = filasDeComision(leerComision(await web.texto(urlComision(c.codi))));
    } catch (e) {
      res.errores.push(`${c.nombre}: ${e.message}`.slice(0, 160));
      fallos += 1;
      continue;
    }
    // Una comisión recién creada puede no tener aún miembros: no se guarda, y no es un fallo.
    if (!leida.length) { res.errores.push(`${c.nombre}: sin miembros`); continue; }
    const id = idOrgano(c.nombre);
    comisiones.push({ id, parlamento: P, legislatura: LEGISLATURA, nombre: c.nombre, tipo: c.tipo, slug: id.replace(':', '-'), url: urlComision(c.codi), activo: true });
    const sin = [];
    for (const x of leida) {
      const d = porCodi.get(x.id_fuente);
      if (!d) { sin.push(x.nombre); continue; }
      filas.push({
        parlamento: P,
        legislatura: LEGISLATURA,
        nombre: d.nombre,
        diputado_id: d.id,
        grupo_id: d.grupo_id || null,
        comision_id: id,
        organo: c.nombre,
        cargo: x.cargo,
        cargo_norm: x.cargo_norm,
        fecha_inicio: x.cargo_norm === 'vocal' ? d.datos?.altas?.[c.codi] || null : null,
        fecha_fin: null,
        activo: true,
        fuente: 'comision',
      });
    }
    if (sin.length) res.errores.push(`${c.nombre}: sin casar ${sin.slice(0, 4).join(', ')}`);
    if (dry) muestras.push({ nombre: c.nombre, tipo: c.tipo, miembros: leida.length, cargos: leida.filter((x) => x.cargo !== 'Membre').map((x) => `${x.cargo}: ${x.nombre}`) });
  }
  res.cargos = filas.length;
  if (!res.errores.length) delete res.errores;
  if (dry) return { ...res, muestras };
  if (res.cortado_por_tiempo || fallos || comisiones.length < indice.length * 0.8 || !filas.length) {
    return { ...res, guardado: false, aviso: 'Lectura incompleta: no se toca lo guardado' };
  }
  const { error: ec } = await db.from('ccaa_comisiones').upsert(comisiones, { onConflict: 'id' });
  if (ec) throw new Error(`comisiones: ${ec.message}`);
  // Fuera lo anterior: las filas de esta misma lectura y las que salían de las fichas.
  const { error: eb } = await db.from('ccaa_cargos').delete().eq('parlamento', P).in('fuente', ['comision', 'ficha']);
  if (eb) throw new Error(`cargos (borrado): ${eb.message}`);
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await db.from('ccaa_cargos').insert(filas.slice(i, i + 500));
    if (error) throw new Error(`cargos: ${error.message}`);
  }
  return { ...res, guardado: true };
}

async function recontar(db) {
  const { data: ds } = await db.from('ccaa_diputados').select('grupo_id').eq('parlamento', P).eq('activo', true);
  const cuenta = {};
  for (const d of ds || []) if (d.grupo_id) cuenta[d.grupo_id] = (cuenta[d.grupo_id] || 0) + 1;
  for (const [id, k] of Object.entries(cuenta)) await db.from('ccaa_grupos').update({ n_diputados: k }).eq('id', id);
}
