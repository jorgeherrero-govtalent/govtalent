import tls from 'node:tls';
import https from 'node:https';

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
 * Segundo intento por node:https, con el intermedio añadido a las raíces
 * que Node ya trae. Devuelve lo mismo que usa quien llama: ok, status y
 * text().
 */
function fetchConIntermedio(url, { headers = {}, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers,
        // Las raíces de siempre MÁS el intermedio. No se sustituye el
        // almacén: se amplía.
        ca: [...tls.rootCertificates, FNMT_AC_COMPONENTES_INFORMATICOS],
      },
      (res) => {
        const trozos = [];
        res.on('data', (t) => trozos.push(t));
        res.on('end', () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: async () => Buffer.concat(trozos).toString('utf8'),
          }),
        );
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

export async function fetchGob(url, opciones = {}) {
  try {
    return await fetch(url, opciones);
  } catch (err) {
    if (!esErrorDeCertificado(err)) throw err;
    return fetchConIntermedio(url, { headers: opciones.headers });
  }
}
