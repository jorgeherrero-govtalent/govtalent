/**
 * Cruce de los nombramientos y ceses del BOE con el directorio.
 *
 * Funciones puras (sin base de datos), para poder probarlas con datos
 * exportados. Las usa /api/sync/boe-cargos.
 *
 * Dos destinos:
 *
 *   - 'age': una unidad de age_units (DIR3 y organigrama propio). El
 *     volcado escribe en government_officials.
 *   - 'agenda': una entidad de directorio_entidades. Hoy solo
 *     Delegaciones y Subdelegaciones del Gobierno y Direcciones Insulares,
 *     que no existen en age_units y vienen de la Agenda de la
 *     Comunicación. El volcado escribe en directorio_contactos.
 *
 * Lección de octubre de 2026: la similitud de texto sola no basta. Con el
 * rango quitado, "Delegada del Gobierno en la Comunidad Autónoma de
 * Andalucía" se parecía un 0,58 a "Abogacía del Estado en la Comunidad
 * Autónoma de Andalucía", y el volcado dio de alta a cuatro delegados del
 * Gobierno como titulares de Abogacías del Estado. Ahora el cruce exige
 * que el tipo de cargo y el tipo de unidad sean compatibles, y la
 * similitud se mide sin las palabras genéricas.
 */

// ---------------------------------------------------------------------
// Extracción
// ---------------------------------------------------------------------

const RE_NOMBRA = /se (?:nombra|designa)\s+(.+?)\s+a\s+(?:don|doña|D\.|Dª)\s+(.+?)\.?$/i;
const RE_CESE = /se dispone el cese de\s+(?:don|doña|D\.|Dª)\s+(.+?)\s+como\s+(.+?)\.?$/i;

export function extraer(titulo) {
  const n = titulo.match(RE_NOMBRA);
  if (n) return { accion: 'nombramiento', cargo: n[1].trim(), persona: n[2].trim() };
  const c = titulo.match(RE_CESE);
  if (c) return { accion: 'cese', persona: c[1].trim(), cargo: c[2].trim() };
  return null;
}

export const RE_EXTERIOR = /^(embajador|embajadora|c[oó]nsul|enviad[oa] especial|representante permanente)/i;

const RE_ORGANISMO =
  /\b(?:del?|de la|de los|de las)\s+(?:Organismo Aut[oó]nomo\s+)?((?:Comisi[oó]n Nacional|Instituto|Agencia|Consejo|Fondo|Autoridad|Centro|Oficina|Museo|Biblioteca|Fábrica|Entidad|Servicio P[uú]blico|Confederaci[oó]n)\b.+)$/i;

export function organismoDe(cargo) {
  const m = cargo.match(RE_ORGANISMO);
  if (!m) return null;
  return m[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// ---------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------

export function clave(texto) {
  if (!texto) return '';
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(
      /\b(directora|subdirectora|presidenta|secretaria|consejera|delegada|subdelegada|interventora|abogada|vicepresidenta)\b/g,
      (m) =>
        ({
          directora: 'director',
          subdirectora: 'subdirector',
          presidenta: 'presidente',
          vicepresidenta: 'vicepresidente',
          secretaria: 'secretario',
          consejera: 'consejero',
          delegada: 'delegado',
          subdelegada: 'subdelegado',
          interventora: 'interventor',
          abogada: 'abogado',
        }[m] || m)
    )
    .replace(/\borganismo autonomo\b/g, ' ')
    .replace(/\b(de|del|la|el|los|las|y)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const RE_PREFIJO_DIR3 =
  /^(d\.g\.|direcci[oó]n general|s\. de e\.|secretar[ií]a de estado|s\.gral\.|secretar[ií]a general|s\.g\.|subdirecci[oó]n general|subsecretar[ií]a|gabinete)\s*(del?\s+|de la\s+|)/i;

const RE_RANGO =
  /^(director general|directora general|director|directora|presidente|presidenta|vicepresidente|vicepresidenta|secretario general|secretaria general|secretario de estado|secretaria de estado|subsecretario|subsecretaria|consejero|consejera|subdirector general|subdirectora general|interventor general|interventora general|delegado|delegada)\s*(del?\s+|de la\s+|de los\s+|de las\s+)?(organismo aut[oó]nomo\s+)?/i;

export function materiaDe(cargo, organismo) {
  return clave((organismo || cargo || '').replace(RE_RANGO, ''));
}

// Palabras que aparecen en cientos de nombres de unidad y no distinguen
// una de otra. Se quitan solo para medir la similitud; la clave exacta y
// cargo_unit_map siguen usando la materia completa.
const GENERICAS = new Set(
  (
    'entidad publica empresarial organismo autonomo sociedad mercantil estatal sa mp oa epe ' +
    'comunidad autonoma gobierno ministerio ministro ministra en para'
  ).split(' ')
);

export function distintiva(texto) {
  return texto
    .split(' ')
    .filter((p) => p && !GENERICAS.has(p))
    .join(' ');
}

function trigramas(t) {
  const p = `  ${t} `;
  const s = new Set();
  for (let i = 0; i < p.length - 2; i++) s.add(p.slice(i, i + 3));
  return s;
}

export function similitud(a, b) {
  if (!a || !b) return 0;
  const ta = trigramas(a);
  const tb = trigramas(b);
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes += 1;
  return comunes / (ta.size + tb.size - comunes);
}

export const UMBRAL_AUTO = 0.55;

// ---------------------------------------------------------------------
// Tipos: qué clase de puesto es y qué clase de unidad es
// ---------------------------------------------------------------------

/**
 * El tipo de puesto según su rango. Un "Director General de la Agencia
 * Estatal…" es titular de un organismo, no de una dirección general, y
 * por eso el organismo manda cuando lo hay.
 */
export function tipoCargo(cargo, organismo) {
  const k = clave(cargo);
  if (/^(sub)?delegado gobierno en\b/.test(k)) return 'delegacion';
  if (/^director insular\b/.test(k)) return 'delegacion';
  if (/^secretario estado\b/.test(k)) return 'secretaria_estado';
  if (/^subsecretari[oa]\b/.test(k)) return 'subsecretaria';
  if (/^secretario general\b/.test(k)) return 'secretaria_general';
  if (/^subdirector general\b/.test(k)) return 'subdireccion_general';
  if (/^(director|jefe) gabinete\b/.test(k)) return 'gabinete';
  if (/^abogado\b/.test(k)) return 'abogacia';
  if (organismo) return 'organismo';
  if (/^director general\b/.test(k)) return 'direccion_general';
  return 'organismo';
}

/** El tipo de unidad, por su categoría y, si es genérica, por su nombre. */
export function tipoUnidad(u) {
  switch (u.categoria) {
    case 'secretaria_estado':
    case 'subsecretaria':
    case 'secretaria_general':
    case 'direccion_general':
    case 'subdireccion_general':
    case 'gabinete':
    case 'ministerio':
      return u.categoria;
    case 'organismo_autonomo':
    case 'entidad_derecho_publico':
    case 'agencia_estatal':
    case 'entidad_gestora':
    case 'sociedad_mercantil':
      return 'organismo';
    default: {
      const n = clave(u.nombre);
      if (/^abogacia\b/.test(n)) return 'abogacia';
      if (/^(d g|direccion general)\b/.test(n)) return 'direccion_general';
      if (/^(s g|subdireccion general)\b/.test(n)) return 'subdireccion_general';
      if (/^(s gral|secretaria general)\b/.test(n)) return 'secretaria_general';
      if (/^(s e|secretaria estado)\b/.test(n)) return 'secretaria_estado';
      if (/^subsecretaria\b/.test(n)) return 'subsecretaria';
      if (/^gabinete\b/.test(n)) return 'gabinete';
      if (/^(sub)?delegacion\b/.test(n)) return 'delegacion';
      return 'organismo';
    }
  }
}

export function compatibles(tc, tu) {
  if (tc === tu) return true;
  // "Director General del Servicio Jurídico de la Seguridad Social": el
  // puesto se llama dirección general y la unidad es un servicio.
  if (tc === 'direccion_general' && tu === 'organismo') return true;
  return false;
}

// ---------------------------------------------------------------------
// Delegaciones del Gobierno
// ---------------------------------------------------------------------

const RE_TERRITORIO =
  /^(sub)?delegad[oa] del gobierno en\s+(.+)$|^director[a]? insular de la administraci[oó]n general del estado en\s+(.+)$/i;

/** Nombre canónico del territorio, para comparar con la entidad. */
export function claveTerritorio(t) {
  let k = clave(t)
    .replace(/\bciudad autonoma\b/g, ' ')
    .replace(/\bcomunidad autonoma\b/g, ' ')
    .replace(/\bcomunidad foral\b/g, ' ')
    .replace(/\bcomunitat\b/g, ' ')
    .replace(/\bcomunidad\b/g, ' ')
    .replace(/\bprincipado\b/g, ' ')
    .replace(/\bregion\b/g, ' ')
    .replace(/\ben\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const alias = {
    'valenciana': 'valenciana',
    'illes balears': 'illes balears',
    'islas baleares': 'illes balears',
    'araba alava': 'alava',
    'alava': 'alava',
    'ibiza formentera': 'ibiza formentera',
    'eivissa formentera': 'ibiza formentera',
  };
  return alias[k] || k;
}

/**
 * Si el cargo es de una Delegación o Subdelegación del Gobierno o una
 * Dirección Insular, devuelve { rango, territorio }.
 *   rango: 'delegado' | 'subdelegado' | 'director_insular'
 */
export function cargoTerritorial(cargo) {
  const m = cargo.match(RE_TERRITORIO);
  if (!m) return null;
  if (m[3]) return { rango: 'director_insular', territorio: claveTerritorio(m[3]) };
  return { rango: m[1] ? 'subdelegado' : 'delegado', territorio: claveTerritorio(m[2]) };
}

const GRUPO_POR_RANGO = {
  delegado: 'Delegaciones del Gobierno',
  subdelegado: 'Subdelegaciones del Gobierno',
  director_insular: 'Directores Insulares de la Administración General del Estado',
};

/**
 * Busca la entidad del directorio. La Subdelegación de Madrid no existe
 * como entidad aparte: la subdelegada figura dentro de la Delegación, así
 * que si no hay entidad del grupo propio se prueba en cualquiera del
 * mismo territorio.
 */
export function entidadTerritorial(ct, entidades) {
  const delTerritorio = entidades.filter((e) => claveTerritorio(e.organizacion) === ct.territorio);
  return (
    delTerritorio.find((e) => e.grupo === GRUPO_POR_RANGO[ct.rango]) ||
    (ct.rango === 'subdelegado' ? delTerritorio.find((e) => e.grupo === GRUPO_POR_RANGO.delegado) : null) ||
    null
  );
}

// ---------------------------------------------------------------------
// Cruce completo de un documento
// ---------------------------------------------------------------------

/**
 * Prepara los índices una vez por ejecución.
 *   unidades: [{ dir3_code, nombre, categoria }]
 *   mapa:     [{ clave_cargo, dir3_code, ignorar }]
 *   entidades:[{ id, organizacion, grupo }]
 */
export function indices({ unidades, mapa, entidades }) {
  const equivalencias = new Map((mapa || []).map((m) => [m.clave_cargo, m]));
  // Una clave puede corresponder a varias unidades de distinto tipo:
  // "vivienda agenda urbana" es a la vez la Secretaría de Estado y la
  // Subsecretaría. Antes se quedaba la primera y Leire Iglesias acabó de
  // "Secretaria" en la Subsecretaría.
  const porClave = new Map();
  const lista = [];
  for (const u of unidades || []) {
    const k = clave(u.nombre.replace(RE_PREFIJO_DIR3, ''));
    if (!k) continue;
    const item = { u, k, kd: distintiva(k), tipo: tipoUnidad(u) };
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(item);
    lista.push(item);
  }
  return { equivalencias, porClave, lista, entidades: entidades || [] };
}

export function cruzar(doc, idx) {
  const e = extraer(doc.titulo);
  if (!e) return null;

  const esExterior = RE_EXTERIOR.test(e.cargo);
  const organismo = organismoDe(e.cargo);
  const materia = materiaDe(e.cargo, organismo);
  const tc = tipoCargo(e.cargo, organismo);

  const base = {
    boe_id: doc.id,
    fecha: doc.fecha_publicacion,
    departamento: doc.departamento,
    titulo: doc.titulo,
    accion: e.accion,
    persona: e.persona,
    cargo: e.cargo,
    organismo,
    es_exterior: esExterior,
    dir3_code: null,
    entidad_id: null,
    destino: null,
  };

  if (esExterior) return { ...base, estado: 'descartado', nota: 'exterior' };

  // Delegaciones, Subdelegaciones y Direcciones Insulares: a la entidad
  // del directorio, nunca a age_units.
  const ct = cargoTerritorial(e.cargo);
  if (ct) {
    const ent = entidadTerritorial(ct, idx.entidades);
    if (ent) {
      return {
        ...base,
        destino: 'agenda',
        entidad_id: ent.id,
        estado: 'casado',
        nota: `territorial, ${ct.rango}, ${ent.organizacion}`,
      };
    }
    return {
      ...base,
      estado: 'sin_equivalencia',
      nota: `territorial, ${ct.rango}, sin entidad para «${ct.territorio}»`,
    };
  }

  // a) Equivalencia decidida a mano
  const eq = idx.equivalencias.get(materia);
  if (eq) {
    if (eq.ignorar) return { ...base, estado: 'descartado', nota: 'ignorado' };
    return { ...base, destino: 'age', dir3_code: eq.dir3_code, estado: 'casado', nota: 'mapa' };
  }

  // b) Clave exacta, solo con una unidad de tipo compatible
  const exactas = (idx.porClave.get(materia) || []).filter((x) => compatibles(tc, x.tipo));
  if (exactas.length === 1) {
    return { ...base, destino: 'age', dir3_code: exactas[0].u.dir3_code, estado: 'casado', nota: 'exacto' };
  }
  if (exactas.length > 1) {
    return {
      ...base,
      estado: 'sin_equivalencia',
      nota: `ambiguo: ${exactas.map((x) => `${x.u.nombre} (${x.u.dir3_code})`).join(' / ')}`.slice(0, 500),
    };
  }

  // c) Similitud sobre lo distintivo, solo entre tipos compatibles
  const md = distintiva(materia);
  let mejor = null;
  let mejorSim = 0;
  let mejorCualquiera = null;
  let simCualquiera = 0;
  if (md) {
    for (const x of idx.lista) {
      const sim = similitud(md, x.kd);
      if (sim > simCualquiera) {
        simCualquiera = sim;
        mejorCualquiera = x;
      }
      if (!compatibles(tc, x.tipo)) continue;
      if (sim > mejorSim) {
        mejorSim = sim;
        mejor = x;
      }
    }
  }
  if (mejor && mejorSim >= UMBRAL_AUTO) {
    return {
      ...base,
      destino: 'age',
      dir3_code: mejor.u.dir3_code,
      estado: 'casado',
      nota: `similitud, sim ${mejorSim.toFixed(2)}`,
    };
  }
  const sug = mejor && mejorSim >= 0.35 ? mejor : mejorCualquiera && simCualquiera >= 0.35 ? mejorCualquiera : null;
  const simSug = sug === mejor ? mejorSim : simCualquiera;
  return {
    ...base,
    estado: 'sin_equivalencia',
    nota: sug
      ? `sugerencia: ${sug.u.nombre} (${sug.u.dir3_code}, ${simSug.toFixed(2)}${compatibles(tc, sug.tipo) ? '' : ', otro tipo'})`
      : null,
  };
}
