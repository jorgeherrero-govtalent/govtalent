import tls from 'node:tls';
import https from 'node:https';
import crypto from 'node:crypto';

/**
 * fetch para portales de la Administración española.
 *
 * El problema que resuelve: varias sedes ministeriales —cultura.gob.es,
 * juventudeinfancia.gob.es, participacion.inclusion.gob.es— tienen un
 * certificado válido de la FNMT pero NO envían el certificado intermedio
 * durante el saludo TLS. Node no puede entonces construir la cadena
 * hasta la raíz y aborta con "unable to get local issuer certificate".
 * En el navegador no se nota porque Chrome descarga por su cuenta el
 * intermedio que falta; Node no hace eso.
 *
 * Lo que hacemos NO es desactivar la verificación, que sería la solución
 * rápida y la mala: convertiría una suplantación de esos dominios en
 * datos que GovTalent publica como oficiales. Lo que hacemos es aportar
 * el intermedio que el servidor se deja, de modo que la cadena se valide
 * igualmente contra la raíz de FNMT — que ya viene en el almacén de
 * confianza de Node y por tanto no estamos añadiendo confianza nueva.
 *
 * El reintento solo se dispara ante un error de certificado. Cualquier
 * otro fallo —404, 403, timeout— se propaga tal cual.
 */

// AC Componentes Informáticos (FNMT-RCM), intermedio emitido por AC RAIZ
// FNMT-RCM. Obtenido de http://www.cert.fnmt.es/certs/ACCOMP.crt, que es
// la dirección que los propios certificados de esas sedes declaran en su
// campo "CA Issuers". Válido hasta el 24/06/2028.
const FNMT_AC_COMPONENTES_INFORMATICOS = `-----BEGIN CERTIFICATE-----
MIIG1jCCBL6gAwIBAgIQNMarBE42mRJRyCULbJTWwDANBgkqhkiG9w0BAQsFADA7
MQswCQYDVQQGEwJFUzERMA8GA1UECgwIRk5NVC1SQ00xGTAXBgNVBAsMEEFDIFJB
SVogRk5NVC1SQ00wHhcNMTMwNjI0MTA1MjU5WhcNMjgwNjI0MTA1MjU5WjBHMQsw
CQYDVQQGEwJFUzERMA8GA1UECgwIRk5NVC1SQ00xJTAjBgNVBAsMHEFDIENvbXBv
bmVudGVzIEluZm9ybcOhdGljb3MwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQCXVx8rdbF7/xY44CaSqzzGo5BhvzA8knxC/3KJYVzTf+CkOvMxMUDub8b0
h38MDujm/RKZhBNOWbKhxF3U61ZVhcR9xOCciuS/soT80m3BByxAKcZsNka0jCA4
XRkglDaAFxCHEZ06MOnvXsSOZDfPYahbQ3VFCVycJuhlHdAwSpmceQwcRYkR6YgX
wTiyzCNGivMKAmRS3dItqDOmDW/nxiDFq/Jd8VWY7GFkwbbAeqYId8FjN8zfvafu
nsB9SLFkUjPPMeqfmC7Bdh7HMxLpaOXROwH201cmlebiPkn0xSFxXFqwhhr6yN8U
QYZ3O/+xdHLrS6DS9+CJUF6d09ijAgMBAAGjggLIMIICxDASBgNVHRMBAf8ECDAG
AQH/AgEAMA4GA1UdDwEB/wQEAwIBBjAdBgNVHQ4EFgQUGfhYLxTWpsybBJgIDUzX
qwCng2UwgZgGCCsGAQUFBwEBBIGLMIGIMEkGCCsGAQUFBzABhj1odHRwOi8vb2Nz
cGZubXRyY21jYS5jZXJ0LmZubXQuZXMvb2NzcGZubXRyY21jYS9PY3NwUmVzcG9u
ZGVyMDsGCCsGAQUFBzAChi9odHRwOi8vd3d3LmNlcnQuZm5tdC5lcy9jZXJ0cy9B
Q1JBSVpGTk1UUkNNLmNydDAfBgNVHSMEGDAWgBT3fcX9xOiaG3dkp/UdoMy/h2Ca
bTCB6wYDVR0gBIHjMIHgMIHdBgRVHSAAMIHUMCkGCCsGAQUFBwIBFh1odHRwOi8v
d3d3LmNlcnQuZm5tdC5lcy9kcGNzLzCBpgYIKwYBBQUHAgIwgZkMgZZTdWpldG8g
YSBsYXMgY29uZGljaW9uZXMgZGUgdXNvIGV4cHVlc3RhcyBlbiBsYSBEZWNsYXJh
Y2nDs24gZGUgUHLDoWN0aWNhcyBkZSBDZXJ0aWZpY2FjacOzbiBkZSBsYSBGTk1U
LVJDTSAoIEMvIEpvcmdlIEp1YW4sIDEwNi0yODAwOS1NYWRyaWQtRXNwYcOxYSkw
gdQGA1UdHwSBzDCByTCBxqCBw6CBwIaBkGxkYXA6Ly9sZGFwZm5tdC5jZXJ0LmZu
bXQuZXMvQ049Q1JMLE9VPUFDJTIwUkFJWiUyMEZOTVQtUkNNLE89Rk5NVC1SQ00s
Qz1FUz9hdXRob3JpdHlSZXZvY2F0aW9uTGlzdDtiaW5hcnk/YmFzZT9vYmplY3Rj
bGFzcz1jUkxEaXN0cmlidXRpb25Qb2ludIYraHR0cDovL3d3dy5jZXJ0LmZubXQu
ZXMvY3Jscy9BUkxGTk1UUkNNLmNybDANBgkqhkiG9w0BAQsFAAOCAgEAo2bsQ2xL
Dcyodieqjd+uy/lfxDw/MbrAq/ZaNFkIlcypUYamOM4vrm5rz8oLjPCoLkJ48P+n
P08Gkcl5Q6q6VFcZLia+U3gfHXrkyqToQlrtViGCGH3xA4u56XtMHGXSdk9vQ0yD
nW5f7bUEkp+uvcKewrOvNcpbIAgD4eU7gdOS0w7BagcFRBgTKBw2s3z73fRZtouJ
g/atmWYtXbBsfNjph+pCh+h5sbSyZUVzO5AemyjpYYYNMWDQrTXq+7O8zIPuPaNE
SjEexuzn+VjHG90RlUK1LygARi+Ir0opD2w6erb/hK8Eea7MFdKQ2ASqNBGJggNo
5vfPVvjHiL+Antmh7mQSKL+4YwFU64d4KK9k0C1mbJethDQFKcjTK1vMvnXFiups
IuyTqwKauo7u2zMKzY4r3VYOW9TpMyLPFIY8pII5GyNzXlL0F4nscOvduTEPEYqx
eNJfpDDPY/DO8WfxgdRTy2W3D/UoAulb+Y+nuzGGCtFQrsSMQX487R+aY0nWot/h
ajef6BcPuxhDfQrg5IafrISVmcJAplb3tXhh0sz7RbYz6jf1bke4eU5fnrTMtGlV
teUL2vjrfUPHW07kBJuaQ7sxORNV3bpHisOnHj+AriQzCn5vINpSHW6hTm7IfRkb
ltu/aQrsMuUhP7HE/v+uXe5CuboV5ubZhHU=
-----END CERTIFICATE-----`;

// Códigos con los que OpenSSL reporta una cadena que no se puede cerrar.
const ERRORES_DE_CERTIFICADO = new Set([
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_SIGNATURE_FAILURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
]);

function esErrorDeCertificado(err) {
  const codigo = err?.cause?.code || err?.code || '';
  if (ERRORES_DE_CERTIFICADO.has(codigo)) return true;
  const texto = `${err?.message || ''} ${err?.cause?.message || ''}`;
  return /certificate|CERT_|issuer/i.test(texto);
}

/**
 * Segundo intento por node:https, con intermedios añadidos a las raíces
 * que Node ya trae. Devuelve lo mismo que usa quien llama: ok, status,
 * headers.get() y text().
 */
function fetchConIntermedio(url, { headers = {}, timeoutMs = 20000, intermedios = [FNMT_AC_COMPONENTES_INFORMATICOS], saltos = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers,
        // Las raíces de siempre MÁS los intermedios. No se sustituye el
        // almacén: se amplía.
        ca: [...tls.rootCertificates, ...intermedios],
      },
      (res) => {
        // Redirecciones: se siguen (hasta 5), con los mismos intermedios.
        const destino = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && destino && saltos < 5) {
          res.resume();
          resolve(fetchConIntermedio(new URL(destino, url).toString(), { headers, timeoutMs, intermedios, saltos: saltos + 1 }));
          return;
        }
        const trozos = [];
        res.on('data', (t) => trozos.push(t));
        res.on('end', () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            url,
            headers: { get: (k) => res.headers[String(k).toLowerCase()] ?? null },
            text: async () => Buffer.concat(trozos).toString('utf8'),
            // Binario intacto (PDF, DOCX…). Sin esto, quien pedía el cuerpo
            // lo recibía pasado por UTF-8 y los PDF llegaban corruptos: así
            // fallaban los del BOAM (09-10-2026), con errores de cifrado.
            arrayBuffer: async () => {
              const b = Buffer.concat(trozos);
              return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
            },
          }),
        );
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------
// Intermedios por AIA (añadido el 04-10-2026, para las Cortes de Castilla
// y León y cualquier otro servidor que se deje el intermedio y no sea de
// la FNMT).
//
// Es lo mismo que hace Chrome: el certificado del servidor dice en su
// campo «CA Issuers» (AIA) dónde descargar el certificado de quien lo
// emitió. Lo descargamos y repetimos la petición con él añadido. La
// cadena se sigue verificando entera contra las raíces de Node: si el
// intermedio descargado no enlaza con una raíz de confianza, la petición
// falla igual. No se desactiva ninguna verificación.
//
// Para leer ese campo hace falta ver el certificado del servidor, y como
// su cadena está incompleta eso exige un saludo TLS sin verificar. En esa
// conexión no se envía ni se recibe nada más: se lee el certificado y se
// cierra.
// ---------------------------------------------------------------------

const cacheAIA = new Map(); // host → [PEM]

function certificadoDelServidor(host, port = 443) {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate(false);
      s.end();
      resolve(c);
    });
    s.setTimeout(10000, () => s.destroy(new Error('timeout')));
    s.on('error', reject);
  });
}

function urlsCAIssuers(infoAccess) {
  // En getPeerCertificate es un objeto { 'CA Issuers - URI': [...] }; en
  // X509Certificate es un texto con líneas «CA Issuers - URI:http://…».
  if (!infoAccess) return [];
  if (typeof infoAccess === 'object') return infoAccess['CA Issuers - URI'] || [];
  return [...String(infoAccess).matchAll(/CA Issuers - URI:(\S+)/g)].map((m) => m[1]);
}

async function descargarCertificado(url) {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`AIA ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // DER o PEM. (Los .p7c no se tratan: no se han visto en estas sedes.)
  return new crypto.X509Certificate(buf);
}

async function intermediosPorAIA(host) {
  if (cacheAIA.has(host)) return cacheAIA.get(host);
  const hoja = await certificadoDelServidor(host);
  const pems = [];
  let siguientes = urlsCAIssuers(hoja?.infoAccess);
  // Hasta tres niveles, por si hay más de un intermedio.
  for (let nivel = 0; nivel < 3 && siguientes.length; nivel++) {
    const cert = await descargarCertificado(siguientes[0]);
    if (cert.subject === cert.issuer) break; // es una raíz: no se añade
    pems.push(cert.toString());
    siguientes = urlsCAIssuers(cert.infoAccess);
  }
  cacheAIA.set(host, pems);
  return pems;
}

export async function fetchGob(url, opciones = {}) {
  try {
    return await fetch(url, opciones);
  } catch (err) {
    if (!esErrorDeCertificado(err)) throw err;
    try {
      return await fetchConIntermedio(url, { headers: opciones.headers });
    } catch (err2) {
      if (!esErrorDeCertificado(err2)) throw err2;
      const intermedios = await intermediosPorAIA(new URL(url).hostname);
      if (!intermedios.length) throw err2;
      return fetchConIntermedio(url, { headers: opciones.headers, intermedios: [FNMT_AC_COMPONENTES_INFORMATICOS, ...intermedios] });
    }
  }
}
