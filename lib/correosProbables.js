// Correos probables (sql/86): de una persona del directorio a su correo
// deducido, con el patrón de su organismo. Solo servidor.

import { aplicarPatron, DESCRIPCION, MIN_FIABILIDAD, MIN_MUESTRAS, MIN_MUESTRAS_CATCH_ALL, DOMINIOS_GENERICOS } from '@/lib/patronesCorreo';

// Siempre un correo (13-10-2026, decisión de Jorge): a quien está en el
// directorio y no tiene correo publicado se le enseña el deducido por el
// patrón de su organismo, con el acierto del patrón, sin umbral. Por debajo
// de MIN_FIABILIDAD o con menos de MIN_MUESTRAS correos conocidos se marca
// «baja». Las rutas que lo llaman ya exigen el Directorio.
// Interruptor de emergencia: CORREOS_PROBABLES=off en Vercel.
export function puedeVerProbables() {
  return String(process.env.CORREOS_PROBABLES || '').toLowerCase() !== 'off';
}

const dominioDe = (v) => {
  const m = String(v || '')
    .split(/[,;\s]+/)
    .map((x) => x.replace(/^mailto:/i, '').trim().toLowerCase())
    .find((x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(x));
  const d = m ? m.split('@')[1] : null;
  return d && !DOMINIOS_GENERICOS.has(d) ? d : null;
};

// Familia de un dominio, para los que no tienen patrón propio: los
// organismos de una misma familia suelen construir igual las direcciones.
export function familiaDe(dominio) {
  const d = String(dominio || '');
  if (d.endsWith('.gob.es')) return 'gob.es';
  if (d.endsWith('europa.eu')) return 'europa.eu';
  const tld = d.split('.').pop();
  return tld || null;
}

// Patrón habitual de cada familia: el que usan más organismos entre los
// dominios con patrón sólido (un dominio grande, como congreso.es, no
// impone el suyo); empate: el que más correos reales reproduce.
// Respaldo: el más común de todos. Se calcula una vez por petición.
async function tablaFamilias(admin) {
  const porFamilia = new Map();
  const { data } = await admin
    .from('email_patrones')
    .select('dominio, patron, aciertos')
    .not('patron', 'is', null)
    .gte('muestras', MIN_MUESTRAS)
    .gte('fiabilidad', 0.5);
  const cuenta = new Map();
  for (const p of data || []) {
    for (const fam of [familiaDe(p.dominio), '*']) {
      if (!cuenta.has(fam)) cuenta.set(fam, new Map());
      const m = cuenta.get(fam);
      m.set(p.patron, (m.get(p.patron) || 0) + 1e6 + (Number(p.aciertos) || 0));
    }
  }
  for (const [fam, m] of cuenta) porFamilia.set(fam, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return porFamilia;
}

const familias = new WeakMap();
async function patronDeFamilia(admin, dom) {
  if (!familias.has(admin)) familias.set(admin, tablaFamilias(admin));
  const porFamilia = await familias.get(admin);
  const fam = familiaDe(dom);
  if (porFamilia.has(fam)) return { patron: porFamilia.get(fam), familia: fam };
  return porFamilia.has('*') ? { patron: porFamilia.get('*'), familia: null } : null;
}

/**
 * Correo probable de alguien que no está en el directorio, con el dominio
 * ya conocido (búsqueda fuera de GovTalent). Mismo formato que
 * correosProbables, sin `id`. null si no se puede construir.
 */
export async function probableParaDominio(admin, nombre, dominio) {
  const dom = String(dominio || '').toLowerCase().trim();
  if (!dom || DOMINIOS_GENERICOS.has(dom) || !nombre) return null;
  const { data: pat } = await admin
    .from('email_patrones')
    .select('patron, fiabilidad, muestras, catch_all')
    .eq('dominio', dom)
    .maybeSingle();
  const verificable = pat?.catch_all !== true;
  if (pat?.patron && pat.muestras >= MIN_MUESTRAS_CATCH_ALL) {
    const email = aplicarPatron(nombre, pat.patron, dom);
    if (email) {
      return {
        email,
        dominio: dom,
        patron: pat.patron,
        descripcion: DESCRIPCION[pat.patron] || pat.patron,
        fiabilidad: Number(pat.fiabilidad),
        muestras: pat.muestras,
        verificado: false,
        baja: Number(pat.fiabilidad) < MIN_FIABILIDAD || pat.muestras < MIN_MUESTRAS,
        verificable,
        origen: 'dominio',
        familia: null,
      };
    }
  }
  const fam = await patronDeFamilia(admin, dom);
  const email = fam && aplicarPatron(nombre, fam.patron, dom);
  if (!email) return null;
  return {
    email,
    dominio: dom,
    patron: fam.patron,
    descripcion: DESCRIPCION[fam.patron] || fam.patron,
    fiabilidad: null,
    muestras: 0,
    verificado: false,
    baja: true,
    verificable,
    origen: 'familia',
    familia: fam.familia,
  };
}

// Organismos con personalidad propia: tienen su propio dominio de correo
// (aepd.es, ine.es, agenciatributaria.es…), no el del ministerio del que
// dependen. Un cargo de la AGE que cuelga de uno de ellos no puede llevar
// el correo del ministerio (01-11-2026, Lorenzo Cotino en la AEPD salía
// con @digital.gob.es).
const CATEGORIAS_ORGANISMO = new Set([
  'organismo_autonomo',
  'entidad_derecho_publico',
  'agencia_estatal',
  'entidad_gestora',
  'sociedad_mercantil',
]);

const normalizar = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function dominioMasFrecuente(correos) {
  const cuenta = new Map();
  for (const c of correos) {
    const d = dominioDe(c);
    if (d) cuenta.set(d, (cuenta.get(d) || 0) + 1);
  }
  let mejor = null;
  for (const [d, n] of cuenta) if (!mejor || n > mejor[1]) mejor = [d, n];
  return mejor ? mejor[0] : null;
}

/**
 * ids de cargos de la AGE (es-ejecutivo:<uuid>) → { organismo, dominio }
 * del organismo con personalidad propia del que dependen. Sin entrada si
 * dependen directamente del ministerio. dominio null si el organismo no
 * tiene ningún correo conocido: entonces no se deduce ninguno.
 */
export async function organismosDeCargos(admin, ids) {
  const out = new Map();
  const uuids = ids.filter((id) => String(id).startsWith('es-ejecutivo:')).map((id) => String(id).slice('es-ejecutivo:'.length));
  if (!uuids.length) return out;

  const cargoPorId = new Map();
  for (let i = 0; i < uuids.length; i += 300) {
    const { data } = await admin.from('government_officials').select('id, dir3_code').in('id', uuids.slice(i, i + 300));
    for (const r of data || []) if (r.dir3_code) cargoPorId.set(`es-ejecutivo:${r.id}`, r.dir3_code);
  }
  if (!cargoPorId.size) return out;

  // La cadena de unidades hacia arriba, hasta el primer organismo.
  const unidades = new Map();
  let pendientes = [...new Set(cargoPorId.values())];
  for (let nivel = 0; nivel < 8 && pendientes.length; nivel++) {
    const nuevos = pendientes.filter((c) => !unidades.has(c));
    if (!nuevos.length) break;
    const { data } = await admin.from('age_units').select('dir3_code, nombre, categoria, superior_code, unit_email').in('dir3_code', nuevos);
    for (const u of data || []) unidades.set(u.dir3_code, u);
    for (const c of nuevos) if (!unidades.has(c)) unidades.set(c, null);
    pendientes = (data || []).filter((u) => !CATEGORIAS_ORGANISMO.has(u.categoria) && u.superior_code).map((u) => u.superior_code);
  }
  const organismoDe = (code) => {
    let c = code;
    for (let i = 0; i < 8 && c; i++) {
      const u = unidades.get(c);
      if (!u) return null;
      if (CATEGORIAS_ORGANISMO.has(u.categoria)) return u;
      c = u.superior_code;
    }
    return null;
  };

  const organismos = new Map();
  for (const [id, code] of cargoPorId) {
    const org = organismoDe(code);
    if (org) {
      out.set(id, { organismo: org });
      organismos.set(org.dir3_code, org);
    }
  }
  if (!organismos.size) return out;

  // Dominio de cada organismo, por orden: el puesto a mano (sql/96); el
  // de una institución del directorio con su mismo nombre; el más
  // frecuente en los correos de sus unidades y de sus cargos.
  const dominioOrg = new Map();
  const nombres = [...organismos.values()].map((o) => o.nombre).filter(Boolean);
  if (nombres.length) {
    const { data: man } = await admin.from('email_dominios_manual').select('institucion, dominio').in('institucion', nombres);
    const porNombre = new Map((man || []).map((m) => [normalizar(m.institucion), m.dominio]));
    for (const o of organismos.values()) {
      const d = porNombre.get(normalizar(o.nombre));
      if (d) dominioOrg.set(o.dir3_code, d);
    }
  }
  for (const o of organismos.values()) {
    if (dominioOrg.has(o.dir3_code)) continue;
    const clave = normalizar(o.nombre);
    if (clave.length < 8) continue;
    const { data: insts } = await admin
      .from('email_dominios_institucion')
      .select('institucion, dominio, n, cuota')
      .ilike('institucion', `%${String(o.nombre).replace(/\s*\([^)]*\)\s*/g, ' ').trim().replace(/[%_]/g, '')}%`)
      .limit(10);
    const buena = (insts || [])
      .filter((d) => !DOMINIOS_GENERICOS.has(d.dominio) && normalizar(d.institucion).includes(clave))
      .sort((a, b) => b.n - a.n)[0];
    if (buena) dominioOrg.set(o.dir3_code, buena.dominio);
  }
  const faltan = [...organismos.keys()].filter((c) => !dominioOrg.has(c));
  if (faltan.length) {
    // Unidades que cuelgan de cada organismo (hasta cuatro niveles).
    const raizDe = new Map(faltan.map((c) => [c, c]));
    let frontera = [...faltan];
    for (let nivel = 0; nivel < 4 && frontera.length; nivel++) {
      const { data } = await admin.from('age_units').select('dir3_code, superior_code, unit_email').in('superior_code', frontera.slice(0, 1000));
      frontera = [];
      for (const u of data || []) {
        if (raizDe.has(u.dir3_code)) continue;
        raizDe.set(u.dir3_code, raizDe.get(u.superior_code));
        frontera.push(u.dir3_code);
        if (u.unit_email) unidades.set(u.dir3_code, { ...u });
      }
    }
    const codigos = [...raizDe.keys()];
    const correosPor = new Map(faltan.map((c) => [c, []]));
    for (const c of codigos) {
      const u = unidades.get(c);
      if (u?.unit_email) correosPor.get(raizDe.get(c))?.push(u.unit_email);
    }
    for (let i = 0; i < codigos.length; i += 300) {
      const { data } = await admin
        .from('government_officials')
        .select('dir3_code, email, unit_email')
        .in('dir3_code', codigos.slice(i, i + 300));
      for (const r of data || []) {
        const lista = correosPor.get(raizDe.get(r.dir3_code));
        if (!lista) continue;
        if (r.email) lista.push(r.email);
        if (r.unit_email) lista.push(r.unit_email);
      }
    }
    for (const [c, lista] of correosPor) {
      const d = dominioMasFrecuente(lista);
      if (d) dominioOrg.set(c, d);
    }
  }

  for (const [id, v] of out) v.dominio = dominioOrg.get(v.organismo.dir3_code) || null;
  return out;
}

/**
 * filas: [{ id, nombre, institucion, email, email_unidad? }] →
 *   { id: { email, dominio, patron, descripcion, fiabilidad, muestras, verificado, baja, verificable, origen, familia } }
 *
 * Dominio, por orden: el de la institución si es claro (≥60 % de sus correos
 * y al menos 3); si no, el del correo de su unidad; si no, el puesto a mano
 * (sql/96); si no, el más frecuente de la institución aunque no sea claro.
 * Patrón: el del dominio (origen 'dominio', con 3 correos conocidos o más);
 * si no lo tiene, el habitual de su familia (origen 'familia', siempre baja).
 * baja: el patrón acierta en menos del 80 %, se apoya en menos de 5 correos
 *   o es el de la familia.
 * verificable: false si el dominio acepta cualquier dirección (catch-all) o
 *   si ya se comprobó que no existe ninguna forma.
 * noConfirmado: se comprobó en su servidor y ninguna forma existe.
 */
export async function correosProbables(admin, filas) {
  const sinCorreo = filas.filter((f) => f && !f.email && f.institucion && f.nombre);
  if (!sinCorreo.length) return {};

  // El correo de la unidad (la ruta de las fichas no lo trae).
  const faltaUnidad = sinCorreo.filter((f) => !('email_unidad' in f)).map((f) => f.id);
  const unidadPorId = new Map();
  for (let i = 0; i < faltaUnidad.length; i += 500) {
    const { data } = await admin.from('directorio_pro').select('id, email_unidad').in('id', faltaUnidad.slice(i, i + 500));
    for (const r of data || []) unidadPorId.set(r.id, r.email_unidad);
  }

  const insts = [...new Set(sinCorreo.map((f) => f.institucion))];
  const domClaro = new Map();
  const domCualquiera = new Map();
  for (let i = 0; i < insts.length; i += 300) {
    const { data: doms } = await admin
      .from('email_dominios_institucion')
      .select('institucion, dominio, n, cuota')
      .in('institucion', insts.slice(i, i + 300));
    for (const d of doms || []) {
      if (DOMINIOS_GENERICOS.has(d.dominio)) continue;
      domCualquiera.set(d.institucion, d.dominio);
      if (Number(d.cuota) >= 0.6 && d.n >= 3) domClaro.set(d.institucion, d.dominio);
    }
  }

  // Dominios puestos a mano (sql/96) para instituciones sin ningún correo.
  const domManual = new Map();
  for (let i = 0; i < insts.length; i += 300) {
    const { data } = await admin.from('email_dominios_manual').select('institucion, dominio').in('institucion', insts.slice(i, i + 300));
    for (const d of data || []) domManual.set(d.institucion, d.dominio);
  }

  // Cargos que dependen de un organismo con dominio propio: su dominio, o
  // ninguno si no se conoce (nunca el del ministerio).
  const deOrganismo = await organismosDeCargos(admin, sinCorreo.map((f) => f.id)).catch(() => new Map());

  const dominioPersona = new Map();
  for (const f of sinCorreo) {
    const unidad = 'email_unidad' in f ? f.email_unidad : unidadPorId.get(f.id);
    const org = deOrganismo.get(f.id);
    if (org) {
      const dom = dominioDe(unidad) || org.dominio;
      if (dom) dominioPersona.set(f.id, dom);
      continue;
    }
    const dom =
      domClaro.get(f.institucion) || dominioDe(unidad) || domManual.get(f.institucion) || domCualquiera.get(f.institucion);
    if (dom) dominioPersona.set(f.id, dom);
  }
  const dominios = [...new Set(dominioPersona.values())];
  if (!dominios.length) return {};

  // Verificados (paso 2, sql/87): 'ok' se enseña como verificado;
  // 'no_existe' (ninguna forma existe) se enseña como «No confirmado», para
  // que siempre haya un correo; 'catch_all' ya no se ofrece verificar.
  const verif = new Map();
  const ids = sinCorreo.map((f) => f.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin
      .from('correos_verificados')
      .select('persona_id, email, resultado, patron')
      .in('persona_id', ids.slice(i, i + 500));
    for (const v of data || []) verif.set(v.persona_id, v);
  }

  const patPorDom = new Map();
  const catchAll = new Set();
  for (let i = 0; i < dominios.length; i += 300) {
    const { data: pats } = await admin
      .from('email_patrones')
      .select('dominio, patron, fiabilidad, muestras, catch_all')
      .in('dominio', dominios.slice(i, i + 300));
    for (const p of pats || []) {
      if (p.catch_all === true) catchAll.add(p.dominio);
      if (p.patron && p.muestras >= MIN_MUESTRAS_CATCH_ALL) patPorDom.set(p.dominio, p);
    }
  }

  const familia = (dom) => patronDeFamilia(admin, dom);

  // Cortes de Castilla-La Mancha: los diputados llevan el sufijo de su grupo
  // («jmcaballero_gps»). Sin grupo conocido, el correo sale sin sufijo y baja.
  const sufijoClm = new Map();
  const idsClm = sinCorreo.filter((f) => dominioPersona.get(f.id) === 'cortesclm.es' && String(f.id).startsWith('ccaa-legislativo:')).map((f) => f.id.replace(/^ccaa-legislativo:/, ''));
  if (idsClm.length) {
    const { data } = await admin.from('ccaa_diputados').select('id, ccaa_grupos(sigla)').in('id', idsClm);
    const SUF = { PSOE: 'gps', PP: 'gpp', VOX: 'gpv' };
    for (const d of data || []) sufijoClm.set(`ccaa-legislativo:${d.id}`, SUF[d.ccaa_grupos?.sigla] || null);
  }
  const conSufijo = (f, email) => {
    if (!email || !sufijoClm.has(f.id)) return { email, sinGrupo: false };
    const suf = sufijoClm.get(f.id);
    return suf ? { email: email.replace('@', `_${suf}@`), sinGrupo: false } : { email, sinGrupo: true };
  };

  const out = {};
  for (const f of sinCorreo) {
    const dom = dominioPersona.get(f.id);
    if (!dom) continue;
    const pat = patPorDom.get(dom);
    const v0 = verif.get(f.id);
    const v = v0 && (!v0.email || String(v0.email).toLowerCase().endsWith(`@${dom}`)) ? v0 : null;
    if (v?.resultado === 'no_existe' && v.email) {
      out[f.id] = {
        email: v.email,
        dominio: dom,
        patron: v.patron,
        descripcion: DESCRIPCION[v.patron] || v.patron,
        fiabilidad: pat ? Number(pat.fiabilidad) : null,
        muestras: pat ? pat.muestras : 0,
        verificado: false,
        baja: true,
        verificable: false,
        noConfirmado: true,
        origen: pat ? 'dominio' : 'familia',
        familia: null,
      };
      continue;
    }
    if (v?.resultado === 'catch_all') catchAll.add(dom);
    if (v?.resultado === 'ok' && v.email) {
      out[f.id] = {
        email: v.email,
        dominio: dom,
        patron: v.patron,
        descripcion: DESCRIPCION[v.patron] || v.patron,
        fiabilidad: pat ? Number(pat.fiabilidad) : null,
        muestras: pat ? pat.muestras : 0,
        verificado: true,
        baja: false,
        verificable: true,
        origen: 'verificado',
        familia: null,
      };
      continue;
    }
    if (pat) {
      const { email, sinGrupo } = conSufijo(f, aplicarPatron(f.nombre, pat.patron, dom));
      if (!email) continue;
      out[f.id] = {
        email,
        dominio: dom,
        patron: pat.patron,
        descripcion: DESCRIPCION[pat.patron] || pat.patron,
        fiabilidad: Number(pat.fiabilidad),
        muestras: pat.muestras,
        verificado: false,
        baja: sinGrupo || Number(pat.fiabilidad) < MIN_FIABILIDAD || pat.muestras < MIN_MUESTRAS,
        verificable: !catchAll.has(dom),
        origen: 'dominio',
        familia: null,
      };
      continue;
    }
    const fam = await familia(dom);
    if (!fam) continue;
    const { email } = conSufijo(f, aplicarPatron(f.nombre, fam.patron, dom));
    if (!email) continue;
    out[f.id] = {
      email,
      dominio: dom,
      patron: fam.patron,
      descripcion: DESCRIPCION[fam.patron] || fam.patron,
      fiabilidad: null,
      muestras: 0,
      verificado: false,
      baja: true,
      verificable: !catchAll.has(dom),
      origen: 'familia',
      familia: fam.familia,
    };
  }
  return out;
}
