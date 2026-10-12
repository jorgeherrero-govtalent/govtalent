// =====================================================================
// PARLAMENT DE CATALUNYA — composición (diputados, grupos, comisiones,
// Mesa, Junta de Portaveus y Diputació Permanent)
// lib/ccaa/composicion/cataluna.js
//
// Fuentes (www.parlament.cat/web/composicio/…, permitidas por su
// robots.txt; nunca /ext, /pls ni /apl):
//   · ple-parlament/index.html — los 135 diputados por grupo, con su foto
//     y su código (p_codi). Las fotos están en /apl/gimg (prohibido al
//     robot): se guarda la dirección y la carga el navegador de quien mira,
//     como en la propia web; el robot no la descarga.
//   · diputats-fitxa/index.html?p_codi=N — circunscripción, grupo, correo
//     publicado, redes, legislaturas y cargos con fecha de alta y de baja.
//   · president-mesa, junta-portaveus y diputacio-permanent — la
//     composición vigente de los tres órganos de gobierno.
//   · grups-parlamentaris/index.html — el código de cada grupo.
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
  const g = t.match(/Grup parlamentari: (.+?) \. Membre\. Alta: (\d{2})\.(\d{2})\.(\d{4})/);
  const legislaturas = ((t.match(/Membre de la legislatura: (.+?) Agenda d'avui/) || [])[1] || '')
    .split(',')
    .map((x) => x.trim().split(' ')[0])
    .filter(Boolean);
  const email = (html.match(/[\w.+-]+@parlament\.cat/gi) || []).find((e) => !/^(info|parlament)@/i.test(e))?.toLowerCase() || null;
  const twitter = (html.match(/href="(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"]+)"/i) || [])[1] || null;
  const foto = (html.match(/src="(https:\/\/www\.parlament\.cat\/apl\/gimg\/imatgeweb\?[^"]+)"/) || [])[1]?.trim() || null;

  // «Repr.» (representant) lleva punto y partiría el cargo en dos.
  const zona = ((t.split('Càrrecs parlamentaris')[1] || '').split(/ Més informació| Activitat Iniciatives/)[0]).replace(/\bRepr\.\s/g, 'Representant ');
  const cargos = [];
  const RE = /\s*(.+?)\s?\.\s([^.]+?)\.\s+Alta:\s(\d{2})\.(\d{2})\.(\d{4})(?:,\s*BOPC,\s*\d+)?\.(?:\s+Baixa\s(\d{2})\.(\d{2})\.(\d{4})(?:,\s*BOPC,\s*\d+)?\.)?/g;
  let m;
  while ((m = RE.exec(zona))) {
    cargos.push({
      organo: m[1].trim(),
      cargo: m[2].trim(),
      cargo_norm: normCargo(m[2]),
      fecha_inicio: iso(m[3], m[4], m[5]),
      fecha_fin: m[6] ? iso(m[6], m[7], m[8]) : null,
      vigente: !m[6],
    });
  }
  return {
    circunscripcion: circ,
    grupo: g ? g[1].trim() : null,
    fecha_alta: g ? iso(g[2], g[3], g[4]) : null,
    legislaturas,
    email,
    twitter,
    foto,
    cargos,
    vigentes: cargos.filter((c) => c.vigente),
  };
}

/**
 * Cargos vigentes de la ficha → filas de comisión. La Mesa y los
 * portavoces de una comisión vienen como órganos aparte («Mesa de la
 * Comissió de Cultura», «Portaveus dels grups parlamentaris en la Comissió
 * de Cultura»): se pasan a su comisión, y la fila «Membre» se queda solo si
 * no hay un cargo de más peso. Mesa del Parlament, Junta de Portaveus y
 * Diputació Permanent se leen de sus páginas, no de aquí; las ponencias no
 * se guardan.
 */
export function cargosDeComision(vigentes) {
  const porComision = new Map();
  for (const c of vigentes) {
    const o = c.organo;
    if (/^(Ponència|Presidència i Mesa|Diputació Permanent|Mesa de la Diputació Permanent|Junta de Portaveus)/i.test(o)) continue;
    // Una comisión sin cargo propio seguida de su ponencia llega pegada («Comissió … (CDSI) Ponència: …»): es la ponencia.
    if (/\sPonència:/.test(o)) continue;
    let nombre = o;
    let rol = false;
    let m;
    if ((m = o.match(/^Mesa de la (Comissió .+)$/i))) { nombre = m[1]; rol = true; }
    else if ((m = o.match(/^Portaveus dels grups parlamentaris (?:en|a|de) la (Comissió .+)$/i))) { nombre = m[1]; rol = true; }
    nombre = nombre.replace(/\s*\([A-Z]{1,14}\)$/, '').trim();
    const k = idOrgano(nombre);
    if (!porComision.has(k)) porComision.set(k, { id: k, nombre, tipo: tipoComision(nombre), filas: [] });
    porComision.get(k).filas.push({ ...c, organo: nombre, rol });
  }
  for (const v of porComision.values()) {
    const roles = v.filas.filter((f) => f.rol);
    if (roles.length) v.filas = roles;
  }
  return [...porComision.values()];
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
  if (!paso || paso === 'fichas') salida.fichas = await pasoFichas(db, web, { dry, n: n || (dry ? 2 : 200), soloId, forzar, tiempo });
  if ((!paso && !tiempo()) || paso === 'organos') salida.organos = await pasoOrganos(db, web, { dry });
  if (!dry) {
    await recontar(db);
    // Comisiones u órganos que ya no tienen a nadie (renombrados o mal leídos antes).
    const { data: usados } = await db.from('ccaa_cargos').select('comision_id').eq('parlamento', P).eq('activo', true).not('comision_id', 'is', null);
    const vivos = new Set((usados || []).map((r) => r.comision_id));
    const { data: todas } = await db.from('ccaa_comisiones').select('id').eq('parlamento', P);
    const vacias = (todas || []).map((r) => r.id).filter((id) => !vivos.has(id));
    if (vacias.length && vivos.size) {
      await db.from('ccaa_comisiones').delete().in('id', vacias);
      salida.comisiones_vacias_borradas = vacias.length;
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

  const res = { pendientes: lista.length, leidas: 0, cargos: 0, errores: [] };
  const muestras = [];
  for (const d of lista) {
    if (tiempo()) { res.cortado_por_tiempo = true; break; }
    let f;
    try {
      f = leerFicha(await web.texto(urlFicha(d.id_fuente)));
    } catch (e) {
      res.errores.push(`${d.nombre}: ${e.message}`.slice(0, 160));
      continue;
    }
    const comisiones = cargosDeComision(f.vigentes);
    if (dry) {
      muestras.push({ nombre: d.nombre, circunscripcion: f.circunscripcion, grupo: f.grupo, email: f.email, legislaturas: f.legislaturas, comisiones: comisiones.map((c) => `${c.nombre} [${c.tipo}]: ${c.filas.map((x) => x.cargo).join(', ')}`) });
      res.leidas += 1;
      continue;
    }
    const ahora = new Date().toISOString();
    if (comisiones.length) {
      const { error: ec } = await db.from('ccaa_comisiones').upsert(
        comisiones.map((c) => ({ id: c.id, parlamento: P, legislatura: LEGISLATURA, nombre: c.nombre, tipo: c.tipo, slug: c.id.replace(':', '-'), activo: true })),
        { onConflict: 'id', ignoreDuplicates: true }
      );
      if (ec) { res.errores.push(`comisiones ${d.nombre}: ${ec.message}`); continue; }
    }
    const filas = comisiones.flatMap((c) =>
      c.filas.map((x) => ({
        parlamento: P,
        legislatura: LEGISLATURA,
        nombre: d.nombre,
        diputado_id: d.id,
        grupo_id: d.grupo_id || null,
        comision_id: c.id,
        organo: c.nombre,
        cargo: x.cargo,
        cargo_norm: x.cargo_norm,
        fecha_inicio: x.fecha_inicio,
        fecha_fin: null,
        activo: true,
        fuente: 'ficha',
      }))
    );
    await db.from('ccaa_cargos').delete().eq('diputado_id', d.id).eq('fuente', 'ficha');
    if (filas.length) {
      const { error: ek } = await db.from('ccaa_cargos').insert(filas);
      if (ek) { res.errores.push(`cargos ${d.nombre}: ${ek.message}`); continue; }
    }
    await db.from('ccaa_diputados').update({
      datos: { legislaturas: f.legislaturas },
      ficha_leida_at: ahora,
      updated_at: ahora,
      ...(f.circunscripcion ? { circunscripcion: f.circunscripcion } : {}),
      ...(f.email ? { email: f.email } : {}),
      ...(f.twitter ? { twitter: f.twitter } : {}),
      ...(f.fecha_alta ? { fecha_alta: f.fecha_alta } : {}),
    }).eq('id', d.id);
    res.leidas += 1;
    res.cargos += filas.length;
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

async function recontar(db) {
  const { data: ds } = await db.from('ccaa_diputados').select('grupo_id').eq('parlamento', P).eq('activo', true);
  const cuenta = {};
  for (const d of ds || []) if (d.grupo_id) cuenta[d.grupo_id] = (cuenta[d.grupo_id] || 0) + 1;
  for (const [id, k] of Object.entries(cuenta)) await db.from('ccaa_grupos').update({ n_diputados: k }).eq('id', id);
}
