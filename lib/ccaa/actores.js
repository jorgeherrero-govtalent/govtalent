/**
 * Quién decide y quién presenta una ley autonómica.
 *
 * Mismo bloque que la ficha del Congreso, con los datos que ya tenemos:
 * la comisión y sus cargos salen de la composición (ccaa_comisiones,
 * ccaa_cargos, ccaa_diputados, ccaa_grupos), y quién enmienda y quién
 * comparece salen de los trámites del boletín. Solo lee: no escribe nada.
 *
 * Disciplina de nulos: si la comisión de la ley no casa con ninguna de la
 * composición, se muestra como texto, sin inventar enlace ni cargos.
 */

const GOBIERNO = {
  madrid: 'Consejo de Gobierno de la Comunidad de Madrid',
  cataluna: 'Govern de la Generalitat de Catalunya',
  andalucia: 'Consejo de Gobierno de la Junta de Andalucía',
  rioja: 'Gobierno de La Rioja',
  valencia: 'Consell de la Generalitat Valenciana',
  aragon: 'Gobierno de Aragón',
  asturias: 'Consejo de Gobierno del Principado de Asturias',
  cantabria: 'Gobierno de Cantabria',
  castillayleon: 'Junta de Castilla y León',
};

// Las leyes que presenta el Gobierno. Las proposiciones las presentan
// los grupos y su autor viene en la ficha.
const DEL_GOBIERNO = ['proyecto_ley', 'presupuestos', 'acompanamiento', 'decreto_ley'];

export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Quién presenta la ley: el autor de la ficha o, si es del Gobierno, el Gobierno. */
export function presentaLey(e) {
  if (e.autor) return e.autor;
  if (DEL_GOBIERNO.includes(e.tipo_norm)) return GOBIERNO[e.parlamento] || 'Gobierno autonómico';
  return null;
}

/** La comisión de la composición con el mismo nombre que la de la ley. */
export function casarComision(nombre, comisiones) {
  const n = norm(nombre);
  if (!n) return null;
  return comisiones.find((c) => norm(c.nombre) === n) || null;
}

/** Nombres por los que el boletín llama a un grupo: «GP Socialista», «Grupo Más Madrid»… */
function aliasGrupo(g) {
  const nucleo = String(g.nombre || '')
    .replace(/^(Grupo Parlamentario|Grup Parlamentari|G\.\s?P\.|Grupo|Grup)\s+/i, '')
    .replace(/^(de la|del|de|d')\s*/i, '')
    .trim();
  const sinLugar = nucleo
    .replace(/\s+(en|de)\s+(Madrid|Andaluc[ií]a|Catalu[nñ]a|Catalunya|La Rioja)$/i, '')
    .replace(/\s+Cortes Valencianas$/i, '');
  const extra = { PSOE: ['Socialista'], PP: ['Popular', 'Partit Popular'], PSC: ['Socialistes'] }[g.sigla] || [];
  return [...new Set([nucleo, sinLugar, g.sigla, ...extra].filter(Boolean).map(norm))].sort((a, b) => b.length - a.length);
}

/** Grupos que nombra un texto del boletín. */
function gruposDelTexto(texto, grupos) {
  const t = norm(texto);
  const encontrados = [];
  const re = /(?:\bgp\b|\bg\. ?p\.|grupo parlamentario|grup parlamentari|\bgrupo\b|\bgrup\b)\s+/g;
  let m;
  while ((m = re.exec(t))) {
    const resto = t.slice(m.index + m[0].length).replace(/^(de la|del|de|d')\s*/, '');
    const g = grupos.find((x) => aliasGrupo(x).some((a) => resto === a || resto.startsWith(`${a} `) || resto.startsWith(`${a} (`) || resto.startsWith(`${a},`) || resto.startsWith(`${a}.`) || resto.startsWith(`${a})`)));
    if (g && !encontrados.includes(g)) encontrados.push(g);
  }
  return encontrados;
}

/**
 * Quién ha enmendado la ley, separando la totalidad del articulado.
 * totalidadRechazada: el Pleno rechazó todas las enmiendas a la totalidad.
 */
export function enmendantes(tramites, grupos) {
  const totalidad = [];
  const articulado = [];
  const rechazados = new Set();
  for (const t of tramites) {
    if (t.tipo !== 'enmiendas_totalidad' && t.tipo !== 'enmiendas_parciales') continue;
    const gs = gruposDelTexto(t.descripcion, grupos);
    const lista = t.tipo === 'enmiendas_totalidad' ? totalidad : articulado;
    for (const g of gs) if (!lista.includes(g)) lista.push(g);
    if (t.tipo === 'enmiendas_totalidad' && /rechaz/i.test(t.descripcion || '')) gs.forEach((g) => rechazados.add(g.id));
  }
  return {
    totalidad,
    articulado,
    totalidadRechazada: totalidad.length > 0 && totalidad.every((g) => rechazados.has(g.id)),
  };
}

/** Quién comparece: la entidad o el cargo, no el texto entero del trámite. */
export function comparecienteDe(descripcion) {
  const d = String(descripcion || '');
  const conEntidad = d.match(/comparecencia de (?:D\.ª\s*|Dña\.\s*|D\.\s*)?([^,(]+?)\s*\(([^)]+)\)/i);
  if (conEntidad && !/^RGEP/i.test(conEntidad[2])) return conEntidad[2].trim();
  const representante = d.match(/comparecencia de un representante de (?:la |el |los |las )?(.+?)\s+(?:en|para|sobre)\s/i);
  if (representante) return representante[1].trim();
  const cargo = d.match(
    /comparecencia\s+(?:C-\S+\s+)?(?:RGEP\S+\s+)?del?\s+(?:la\s+)?((?:Directora?|Consejer[oa]|Viceconsejer[oa]|Secretari[oa]|President[ea])\b[^,]+?)\s+(?:en|y|para|sobre)\s/i
  );
  if (cargo) return cargo[1].trim();
  return null;
}

export function comparecientes(tramites) {
  const nombres = [];
  for (const t of tramites) {
    if (t.tipo !== 'comparecencias') continue;
    const n = comparecienteDe(t.descripcion);
    if (n && !nombres.some((x) => norm(x) === norm(n))) nombres.push(n);
  }
  return nombres;
}

const ORDEN_CARGO = { presidencia: 0, vicepresidencia: 1, secretaria: 2, portavoz: 3, portavoz_adjunto: 4, vocal: 5 };

/**
 * Mesa y portavoces de la comisión a partir de sus cargos. Cada cargo
 * llega con su diputado y su grupo ya resueltos.
 */
export function cargosDeComision(cargos) {
  const activos = cargos.filter((c) => c.activo !== false).sort((a, b) => (ORDEN_CARGO[a.cargo_norm] ?? 9) - (ORDEN_CARGO[b.cargo_norm] ?? 9));
  const miembros = new Set(activos.map((c) => c.diputado_id || norm(c.nombre)));
  const uno = (k) => activos.find((c) => c.cargo_norm === k) || null;
  const adjuntos = activos.filter((c) => c.cargo_norm === 'portavoz_adjunto');
  const portavoces = activos
    .filter((c) => c.cargo_norm === 'portavoz')
    .map((p) => ({ ...p, adjunto: adjuntos.find((a) => a.grupo?.id && a.grupo.id === p.grupo?.id) || null }));
  return {
    n_miembros: miembros.size,
    presidencia: uno('presidencia'),
    vicepresidencia: uno('vicepresidencia'),
    secretaria: uno('secretaria'),
    portavoces,
  };
}
