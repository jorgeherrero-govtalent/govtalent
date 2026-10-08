// Correos probables (sql/86): de una persona del directorio a su correo
// deducido, con el patrón de su organismo. Solo servidor.

import { aplicarPatron, DESCRIPCION, MIN_FIABILIDAD, MIN_MUESTRAS, DOMINIOS_GENERICOS } from '@/lib/patronesCorreo';

// Mientras se valida, solo lo ven estas cuentas. Para abrirlo a todos
// los usuarios con Directorio: CORREOS_PROBABLES_PARA=* en Vercel.
export function puedeVerProbables(email) {
  const lista = (process.env.CORREOS_PROBABLES_PARA || 'info@apinstitute.com,jorge.herrero@apinstitute.com')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes('*') || lista.includes(String(email || '').toLowerCase());
}

/**
 * filas: [{ id, nombre, institucion, email }] → { id: { email, dominio, patron, descripcion, fiabilidad, muestras } }
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
    .select('dominio, patron, fiabilidad, muestras')
    .in('dominio', dominios)
    .gte('muestras', MIN_MUESTRAS);
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
      };
      continue;
    }
    if (Number(pat.fiabilidad) < MIN_FIABILIDAD) continue;
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
    };
  }
  return out;
}
