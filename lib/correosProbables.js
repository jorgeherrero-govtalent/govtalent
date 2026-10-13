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

/**
 * filas: [{ id, nombre, institucion, email }] →
 *   { id: { email, dominio, patron, descripcion, fiabilidad, muestras, verificado, baja, verificable } }
 * baja: el patrón acierta en menos del 80 % o se apoya en menos de 5 correos.
 * verificable: false si el dominio acepta cualquier dirección (catch-all).
 */
export async function correosProbables(admin, filas) {
  const sinCorreo = filas.filter((f) => f && !f.email && f.institucion && f.nombre);
  if (!sinCorreo.length) return {};
  const insts = [...new Set(sinCorreo.map((f) => f.institucion))];
  const { data: doms } = await admin
    .from('email_dominios_institucion')
    .select('institucion, dominio, n, cuota')
    .in('institucion', insts)
    .gte('cuota', 0.6)
    .gte('n', 3);
  const domPorInst = new Map((doms || []).map((d) => [d.institucion, d.dominio]));
  const dominios = [...new Set([...domPorInst.values()])].filter((d) => !DOMINIOS_GENERICOS.has(d));
  if (!dominios.length) return {};
  // Verificados (paso 2, sql/87): 'ok' se enseña aunque el patrón no
  // llegue al 80 %; 'no_existe' no se enseña.
  const verif = new Map();
  const ids = sinCorreo.map((f) => f.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin
      .from('correos_verificados')
      .select('persona_id, email, resultado, patron')
      .in('persona_id', ids.slice(i, i + 500));
    for (const v of data || []) verif.set(v.persona_id, v);
  }
  const { data: pats } = await admin
    .from('email_patrones')
    .select('dominio, patron, fiabilidad, muestras, catch_all')
    .in('dominio', dominios)
    .gte('muestras', MIN_MUESTRAS_CATCH_ALL);
  const patPorDom = new Map((pats || []).filter((p) => p.patron).map((p) => [p.dominio, p]));
  const out = {};
  for (const f of sinCorreo) {
    const dom = domPorInst.get(f.institucion);
    const pat = dom && patPorDom.get(dom);
    if (!pat) continue;
    const v = verif.get(f.id);
    if (v?.resultado === 'no_existe') continue;
    if (v?.resultado === 'ok' && v.email) {
      out[f.id] = {
        email: v.email,
        dominio: dom,
        patron: v.patron,
        descripcion: DESCRIPCION[v.patron] || v.patron,
        fiabilidad: Number(pat.fiabilidad),
        muestras: pat.muestras,
        verificado: true,
        baja: false,
        verificable: true,
      };
      continue;
    }
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
      verificable: pat.catch_all !== true,
    };
  }
  return out;
}
