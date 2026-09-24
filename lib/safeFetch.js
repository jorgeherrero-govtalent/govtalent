import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Comprueba si una IP (v4 o v6) pertenece a un rango privado, de loopback,
// link-local o de otro tipo reservado que no debería ser accesible desde
// un servidor público. Se usa para bloquear SSRF hacia la red interna.
function isPrivateOrReservedIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / metadata cloud
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast / reservado
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.split(':').pop();
      if (net.isIPv4(v4)) return isPrivateOrReservedIp(v4);
    }
    return false;
  }
  return true; // formato no reconocido: bloqueamos por precaución
}

async function resolveAndValidateHostname(hostname) {
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error('No se pudo resolver ese dominio');
  }
  if (!addresses.length) throw new Error('No se pudo resolver ese dominio');
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error('Esa dirección no está permitida');
    }
  }
}

/**
 * Descarga el texto de una URL validando que sea segura (solo https,
 * sin apuntar a IPs privadas/internas, con límite de tamaño, tiempo y
 * redirecciones). Pensado para leer páginas web públicas suministradas
 * por el usuario (ej. la web de una organización), nunca recursos internos.
 */
/**
 * Opciones:
 *   maxBytes   tope de lectura (5 MB por defecto)
 *   timeoutMs  tiempo máximo por petición (8 s por defecto)
 *   truncar    si la página pasa del tope, devolver lo leído hasta ahí en
 *              vez de fallar. Para quien solo necesita el principio (el
 *              <head> con título y descripción, y el primer texto): las
 *              portadas corporativas grandes pesan varios MB de HTML.
 *   navegador  identificarse como un navegador normal. Muchas webs
 *              corporativas bloquean a los bots en su cortafuegos.
 */
export async function safeFetchText(inputUrl, options = {}) {
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const truncar = !!options.truncar;
  const cabeceras = options.navegador
    ? {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      }
    : { 'User-Agent': 'Mozilla/5.0 (compatible; GovTalentBot/1.0)' };

  let currentUrl = inputUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('Solo se permiten URLs https');
    }
    await resolveAndValidateHostname(parsed.hostname);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      res = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: cabeceras,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('La web tardó demasiado en responder');
      throw new Error('No se pudo acceder a esa web');
    }
    clearTimeout(timeoutId);

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirección sin destino válido');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!res.ok) {
      throw new Error(`La web respondió con un error (${res.status})`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) {
      throw new Error('Esa URL no es una página web de texto');
    }

    const contentLength = res.headers.get('content-length');
    if (!truncar && contentLength && Number(contentLength) > maxBytes) {
      throw new Error('La página es demasiado grande');
    }

    if (!res.body?.getReader) {
      const text = await res.text();
      if (text.length > maxBytes) {
        if (truncar) return text.slice(0, maxBytes);
        throw new Error('La página es demasiado grande');
      }
      return text;
    }

    const reader = res.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > maxBytes) {
        reader.cancel().catch(() => {});
        if (truncar) {
          chunks.push(value);
          break;
        }
        throw new Error('La página es demasiado grande');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
  }

  throw new Error('Demasiadas redirecciones');
}
