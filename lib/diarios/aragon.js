// =====================================================================
// Boletín Oficial de Aragón (BOA) — lector
// lib/diarios/aragon.js
//
// La web del BOA es una aplicación Angular que lee los datos abiertos del
// propio boletín (CGI BRSCGI). La misma consulta que usa la web, en JSON
// (comprobado desde Vercel el 08-10-2026):
//   /cgi-bin/EBOA/BRSCGI?CMD=VERLST&BASE=BOLE&DOCS=1-200
//     &SEC=OPENDATABOAJSONAPP&OUTPUTMODE=JSON&SEPARADOR=&PUBL-C=AAAAMMDD
// Cada elemento: DOCN, FechaPublicacion, Numeroboletin, Seccion
// («I. Disposiciones Generales»), Subseccion, Rango, Emisor, Titulo y el
// Texto completo (que no se guarda). El robots.txt solo prohíbe unos
// VEROBJ concretos.
//
// Se piden hoy y ayer: el boletín sale de lunes a viernes y así no se
// pierde nada aunque una ejecución falle.
// =====================================================================

const CGI = 'https://www.boa.aragon.es/cgi-bin/EBOA/BRSCGI';

function fechaMadrid(desfaseDias = 0) {
  const d = new Date(Date.now() - desfaseDias * 86400000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
}

export async function leer(web, ctx = {}) {
  const entradas = [];
  const diag = [];
  for (const dia of [fechaMadrid(0), fechaMadrid(1)]) {
    const url = `${CGI}?CMD=VERLST&BASE=BOLE&DOCS=1-200&SEC=OPENDATABOAJSONAPP&OUTPUTMODE=JSON&SEPARADOR=&PUBL-C=${dia}`;
    const texto = await web.texto(url);
    let filas = [];
    try { filas = JSON.parse(texto); } catch { filas = []; }
    if (!Array.isArray(filas)) filas = [];
    diag.push({ dia, filas: filas.length });
    for (const f of filas) {
      if (!f.DOCN || !f.Titulo) continue;
      const fp = String(f.FechaPublicacion || dia);
      entradas.push({
        ref: f.DOCN,
        fecha: `${fp.slice(0, 4)}-${fp.slice(4, 6)}-${fp.slice(6, 8)}`,
        numero: f.Numeroboletin || null,
        seccion: [f.Seccion, f.Subseccion].filter(Boolean).join(' · ') || null,
        organo: f.Emisor || null,
        titulo: String(f.Titulo).replace(/\s+/g, ' ').trim(),
        // Vista del documento en el CGI del BOA por su número (DOCN).
        url: `${CGI}?CMD=VERDOC&BASE=BOLE&DOCN=${encodeURIComponent(f.DOCN)}`,
        url_pdf: null,
        publicado_en: null,
      });
    }
  }
  if (ctx.debug) ctx.diagnostico.aragon = { dias: diag, muestra: entradas.slice(0, 5).map(({ seccion, organo, titulo }) => ({ seccion, organo, titulo: titulo.slice(0, 120) })) };
  return entradas;
}
