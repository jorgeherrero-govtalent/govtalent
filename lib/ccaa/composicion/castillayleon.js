// =====================================================================
// CORTES DE CASTILLA Y LEÓN — composición
// lib/ccaa/composicion/castillayleon.js
//
// www.ccyl.es (ASP.NET MVC). Todas las páginas de composición pintan la
// misma tarjeta: foto (/Content/img/procuradores/XII/PRC12<código>.jpg),
// nombre y apellidos (cc_org_Procurador / cc_org_PersonaApellidos), grupo
// (cc_org_ProcuradorGrupoParlamentario), provincia y «Ver ficha»
// (Procurador?Legislatura=12&CodigoPersona=<código>). En los órganos, el
// cargo va en cc_org_ProcuradorResponsabilidad y la portavocía en la
// comisión en cc_org_ProcuradorPortavoz («Portavoz G.P. Popular»).
//   - Organizacion/PlenoPorGrupos — los 82.
//   - Organizacion/ComposicionCargos?Legislatura=12&CodigoOrgano=TS12NN —
//     cada órgano (TS1299 la Mesa); las comisiones salen de
//     Parlamento/Comisiones. Junta de Portavoces y Diputación Permanente
//     se buscan por código entre TS1201 y TS1211 (su página propia
//     muestra aún la XI legislatura).
// El robots.txt prohíbe los listados por provincia y alfabético
// (param1=provincia|alfabetico) y la agenda; nada de eso se usa. La
// ficha no publica correo (solo un formulario) y no se lee.
// Se guarda con lib/ccaa/composicion/comun.js.
// =====================================================================

import { textoPlano } from '@/lib/ccaa/web';

export const P = 'castillayleon';
export const LEGISLATURA = 'XII';
export const FUENTE = 'ccyl.es';
const O = 'https://www.ccyl.es';
const ORGANO = (c) => `${O}/Organizacion/ComposicionCargos?Legislatura=12&CodigoOrgano=${c}`;

export function siglaGrupo(nombre) {
  const t = String(nombre || '').toLowerCase();
  if (/popular/.test(t)) return 'PP';
  if (/socialista/.test(t)) return 'PSOE';
  if (/vox/.test(t)) return 'VOX';
  if (/upl/.test(t)) return 'UPL';
  if (/mixto/.test(t)) return 'Mixto';
  return null;
}

const limpiar = (t) => textoPlano(t).replace(/\s+/g, ' ').trim();
const nombreGrupo = (g) => (g ? `Grupo Parlamentario ${g}` : null);

/** Tarjetas de cualquier página de composición. */
export function leerTarjetas(html) {
  const out = [];
  for (const b of String(html || '').split(/<div class="list-group-item panel-default-cortes">/i).slice(1)) {
    const codigo = (b.match(/CodigoPersona=(\w+)/) || [])[1];
    if (!codigo) continue;
    const nombre = (b.match(/<p class="cc_org_Procurador">([\s\S]*?)<span class="cc_org_PersonaApellidos">/i) || [])[1];
    const apellidos = (b.match(/cc_org_PersonaApellidos">\s*<strong>([\s\S]*?)<\/strong>/i) || [])[1];
    // El grupo va dos veces: una dentro de un comentario (plantilla sin rellenar).
    const sinComentarios = b.replace(/<!--[\s\S]*?-->/g, ' ');
    const grupo = (sinComentarios.match(/cc_org_ProcuradorGrupoParlamentario">([^<]*)</i) || [])[1];
    const provincia = (sinComentarios.match(/cc_org_ProcuradorGrupoProvincia">([^<]*)</i) || [])[1];
    const cargo = (sinComentarios.match(/cc_org_ProcuradorResponsabilidad">([^<]*)</i) || [])[1];
    const portavoz = (sinComentarios.match(/cc_org_ProcuradorPortavoz">([^<]*)</i) || [])[1];
    const foto = (sinComentarios.match(/<img[^>]+src="(\/Content\/img\/procuradores\/[^"]+)"/i) || [])[1];
    const n = limpiar(nombre || '');
    const a = limpiar(apellidos || '');
    out.push({
      id_fuente: codigo,
      nombre: `${n} ${a}`.trim(),
      apellidos_nombre: a && n ? `${a}, ${n}` : null,
      grupo: limpiar(grupo || '') || null,
      provincia: limpiar(provincia || '') || null,
      cargo: limpiar(cargo || '') || null,
      portavoz: limpiar(portavoz || '') || null,
      foto_url: foto ? `${O}${foto}` : null,
    });
  }
  return out;
}

export async function leerDiputados(web) {
  const tarjetas = leerTarjetas(await web.texto(`${O}/Organizacion/PlenoPorGrupos`));
  const out = new Map();
  for (const t of tarjetas) {
    if (out.has(t.id_fuente)) continue;
    out.set(t.id_fuente, {
      id_fuente: t.id_fuente,
      nombre: t.nombre,
      apellidos_nombre: t.apellidos_nombre,
      grupo: nombreGrupo(t.grupo),
      circunscripcion: t.provincia,
      foto_url: t.foto_url,
      url_ficha: `${O}/Organizacion/Procurador?Legislatura=12&CodigoPersona=${t.id_fuente}`,
    });
  }
  return [...out.values()];
}

const tipoDe = (nombre) => (/^mesa|junta de portavoces|diputaci[oó]n permanente/i.test(nombre) ? 'organo' : /investigaci/i.test(nombre) ? 'investigacion' : /estudio/i.test(nombre) ? 'estudio' : 'permanente');

/** Nombre del órgano en el <h1> de su página. */
const tituloDe = (html) => limpiar((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');

function miembrosDe(html) {
  const vistos = new Set();
  const out = [];
  for (const t of leerTarjetas(html)) {
    if (vistos.has(t.id_fuente)) continue;
    vistos.add(t.id_fuente);
    let cargo = t.cargo;
    if (!cargo && t.portavoz) cargo = /adjunt/i.test(t.portavoz) ? 'Portavoz adjunto' : 'Portavoz';
    out.push({ id_fuente: t.id_fuente, nombre: t.nombre, cargo: cargo || 'Vocal' });
  }
  return out;
}

export async function leerOrganos(web) {
  const codigos = new Map(); // código → nombre del índice
  codigos.set('TS1299', 'Mesa de las Cortes de Castilla y León');
  try {
    const indice = await web.texto(`${O}/Parlamento/Comisiones`);
    for (const m of indice.matchAll(/CodigoOrgano=(TS12\d{2})"[^>]*>([\s\S]*?)<\/a>/gi)) {
      if (!codigos.has(m[1])) codigos.set(m[1], limpiar(m[2]));
    }
  } catch {
    // Sin índice: solo Mesa y los códigos bajos.
  }
  // Junta de Portavoces y Diputación Permanente: entre los códigos bajos.
  for (let i = 1; i <= 11; i += 1) {
    const c = `TS12${String(i).padStart(2, '0')}`;
    if (!codigos.has(c)) codigos.set(c, null);
  }

  const organos = [];
  for (const [codigo, nombreIndice] of codigos) {
    let html;
    try {
      html = await web.texto(ORGANO(codigo));
    } catch {
      continue;
    }
    const titulo = tituloDe(html) || nombreIndice;
    if (!titulo) continue;
    // De los códigos bajos solo interesan la Junta y la Diputación Permanente (el Pleno no).
    if (!nombreIndice && !/junta de portavoces|diputaci[oó]n permanente/i.test(titulo)) continue;
    const nombre = /^mesa/i.test(titulo) ? 'Mesa de las Cortes de Castilla y León' : titulo;
    const miembros = miembrosDe(html);
    if (!miembros.length) continue;
    organos.push({ nombre, tipo: tipoDe(nombre), url: ORGANO(codigo), miembros });
  }
  return organos;
}
