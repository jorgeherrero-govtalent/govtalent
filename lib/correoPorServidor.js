// «Buscar correo», primer intento (sql/86 y 87): deducir la dirección con el
// patrón del dominio de su organización y comprobarla en su servidor de
// correo (MillionVerifier). Rápido y barato (< 0,01 € por persona). Si no se
// confirma, la ruta sigue con la búsqueda con IA (lib/enriquecer.js).
// Solo servidor.

import { aplicarPatron, DOMINIOS_GENERICOS, MIN_MUESTRAS, limpiar } from '@/lib/patronesCorreo';
import { verificarCorreo, hayVerificador } from '@/lib/verificarCorreo';

// Sin patrón conocido para el dominio: las formas más habituales.
const PATRONES_HABITUALES = ['nombre.apellido', 'inicialapellido', 'nombre.apellidos', 'nombre.apellidoapellido'];
const MAX_VARIANTES = 4;
const MIN_ALTERNATIVA = 0.08;

const normalizarInst = (t) => limpiar(t).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Dominio de correo de una organización: exacto, o el que más se parezca. */
export async function dominioDe(admin, institucion) {
  const inst = String(institucion || '').trim();
  if (!inst) return null;
  const { data: exacto } = await admin
    .from('email_dominios_institucion')
    .select('dominio, n, cuota')
    .eq('institucion', inst)
    .gte('cuota', 0.6)
    .gte('n', 3)
    .maybeSingle();
  if (exacto?.dominio) return exacto.dominio;
  // «CNMC» → «Comisión Nacional de los Mercados y la Competencia (CNMC)».
  const q = inst.replace(/[%_,()]/g, ' ').trim();
  if (q.length < 3) return null;
  const { data: parecidas } = await admin
    .from('email_dominios_institucion')
    .select('institucion, dominio, n, cuota')
    .ilike('institucion', `%${q}%`)
    .gte('cuota', 0.6)
    .gte('n', 3)
    .order('n', { ascending: false })
    .limit(10);
  const buscado = normalizarInst(inst);
  const candidatas = (parecidas || []).filter((p) => normalizarInst(p.institucion).includes(buscado));
  // Solo si todas apuntan al mismo dominio: si no, es ambiguo.
  const doms = [...new Set(candidatas.map((c) => c.dominio))];
  return doms.length === 1 ? doms[0] : null;
}

async function comprobar(admin, email) {
  const { data } = await admin.from('email_verificaciones').select('resultado').eq('email', email).maybeSingle();
  if (data) return data.resultado;
  const v = await verificarCorreo(email, { timeout: 25 });
  // «unknown» suele ser un servidor lento: no se guarda, para reintentar.
  if (v.resultado !== 'error' && v.resultado !== 'unknown') {
    await admin
      .from('email_verificaciones')
      .upsert({ email, resultado: v.resultado, subresultado: v.subresultado, calidad: v.calidad, verificado_at: new Date().toISOString() });
  }
  return v.resultado;
}

/**
 * persona: { nombre, institucion }
 * → { email, dominio, patron, probados } si el servidor confirma una dirección; si no, null.
 */
export async function correoPorServidor(admin, persona) {
  if (!hayVerificador() || !persona?.nombre) return null;
  const dominio = await dominioDe(admin, persona.institucion);
  if (!dominio || DOMINIOS_GENERICOS.has(dominio)) return null;

  const { data: pat } = await admin
    .from('email_patrones')
    .select('patron, fiabilidad, muestras, alternativas, catch_all')
    .eq('dominio', dominio)
    .maybeSingle();
  // Acepta cualquier dirección: comprobar no sirve.
  if (pat?.catch_all) return null;

  const patrones = [];
  if (pat?.patron && pat.muestras >= MIN_MUESTRAS) {
    patrones.push(pat.patron, ...(pat.alternativas || []).filter((a) => a.fiabilidad >= MIN_ALTERNATIVA).map((a) => a.patron));
  }
  for (const p of PATRONES_HABITUALES) if (!patrones.includes(p)) patrones.push(p);

  const variantes = [];
  for (const p of patrones) {
    const e = aplicarPatron(persona.nombre, p, dominio);
    if (e && !variantes.some((v) => v.email === e)) variantes.push({ email: e, patron: p });
    if (variantes.length >= MAX_VARIANTES) break;
  }

  // En paralelo: cada comprobación puede tardar 15–20 s (la de cnmc.es
  // tardó 18 s) y en serie se iría a más de un minuto. Cuesta algún crédito
  // de verificación más, pero son céntimos de céntimo.
  const resultados = await Promise.all(variantes.map((v) => comprobar(admin, v.email)));
  const probados = variantes.map((v, i) => ({ ...v, resultado: resultados[i] }));
  if (resultados.includes('catch_all')) {
    if (pat) await admin.from('email_patrones').update({ catch_all: true }).eq('dominio', dominio);
    return null;
  }
  // Por orden de probabilidad: la primera que existe.
  const ok = probados.find((p) => p.resultado === 'ok');
  return ok ? { email: ok.email, dominio, patron: ok.patron, probados } : null;
}
