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

  const dominioPersona = new Map();
  for (const f of sinCorreo) {
    const unidad = 'email_unidad' in f ? f.email_unidad : unidadPorId.get(f.id);
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

  const out = {};
  for (const f of sinCorreo) {
    const dom = dominioPersona.get(f.id);
    if (!dom) continue;
    const pat = patPorDom.get(dom);
    const v = verif.get(f.id);
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
      const email = aplicarPatron(f.nombre, pat.patron, dom);
      if (!email) continue;
      out[f.id] = {
        email,
        dominio: dom,
        patron: pat.patron,
        descripcion: DESCRIPCION[pat.patron] || pat.patron,
        fiabilidad: Number(pat.fiabilidad),
        muestras: pat.muestras,
        verificado: false,
        baja: Number(pat.fiabilidad) < MIN_FIABILIDAD || pat.muestras < MIN_MUESTRAS,
        verificable: !catchAll.has(dom),
        origen: 'dominio',
        familia: null,
      };
      continue;
    }
    const fam = await familia(dom);
    if (!fam) continue;
    const email = aplicarPatron(f.nombre, fam.patron, dom);
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
