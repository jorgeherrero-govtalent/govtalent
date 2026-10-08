// Correos probables, paso 2: ¿existe la dirección? (sql/87)
// MillionVerifier, API en tiempo real. Clave en MILLIONVERIFIER_API_KEY.
// Solo servidor.

const API = 'https://api.millionverifier.com/api/v3/';

export const hayVerificador = () => !!process.env.MILLIONVERIFIER_API_KEY;

// «OK», «catch-all», «Invalid»… → ok · catch_all · invalid · unknown · disposable · error
function normalizar(r) {
  const t = String(r || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (['ok', 'catch_all', 'invalid', 'unknown', 'disposable'].includes(t)) return t;
  return t ? 'unknown' : 'error';
}

/** Comprueba un correo contra su servidor. { resultado, subresultado, calidad, creditos, crudo } */
export async function verificarCorreo(email, { timeout = 15 } = {}) {
  const url = `${API}?api=${encodeURIComponent(process.env.MILLIONVERIFIER_API_KEY || '')}&email=${encodeURIComponent(email)}&timeout=${timeout}`;
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout((timeout + 10) * 1000) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return { resultado: 'error', subresultado: `http ${r.status}`, crudo: j };
    if (j.error) return { resultado: 'error', subresultado: String(j.error).slice(0, 200), crudo: j };
    return {
      resultado: normalizar(j.result),
      subresultado: j.subresult || null,
      calidad: j.quality || null,
      creditos: j.credits ?? null,
      crudo: j,
    };
  } catch (e) {
    return { resultado: 'error', subresultado: String(e?.message || e).slice(0, 200) };
  }
}

/** Créditos que quedan en la cuenta. */
export async function creditosVerificador() {
  try {
    const r = await fetch(`${API}credits?api=${encodeURIComponent(process.env.MILLIONVERIFIER_API_KEY || '')}`, { cache: 'no-store' });
    return await r.json();
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}
