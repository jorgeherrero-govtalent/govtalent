// =====================================================================
// Texto de un PDF, página a página
// lib/textoPdf.js
//
// Para los boletines que la API de Anthropic no acepta como PDF: los del
// BOAM (Asamblea de Madrid) vienen cifrados, aunque se abren sin
// contraseña como en cualquier visor (el BOAM 148 se lee sin problema).
// Si un PDF pidiera de verdad contraseña de apertura, no se intenta abrir. Se extrae el texto con pdf.js solo para que la IA saque
// los actos de tramitación; el texto no se guarda ni se muestra
// (decisión de Jorge del 09-10-2026).
//
// Devuelve el texto con una marca «[Página N]» al empezar cada página,
// para que la IA pueda citar la página del PDF.
// =====================================================================

// Primero MuPDF (repara PDF con referencias rotas y abre los que solo
// tienen contraseña de propietario); si falla, pdf.js.
export async function textoDePdf(buf, opciones = {}) {
  try {
    return await conMupdf(buf, opciones);
  } catch (e) {
    if (e.contrasena) throw e;
    try {
      return await conPdfjs(buf, opciones);
    } catch (e2) {
      throw new Error(`MuPDF: ${e.message} · pdf.js: ${e2.message}`);
    }
  }
}

async function conMupdf(buf, { maxPaginas = 400 } = {}) {
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(new Uint8Array(buf), 'application/pdf');
  if (doc.needsPassword() && !doc.authenticatePassword('')) {
    const e = new Error('El PDF pide contraseña de apertura');
    e.contrasena = true;
    throw e;
  }
  const total = Math.min(doc.countPages(), maxPaginas);
  const partes = [];
  for (let i = 0; i < total; i += 1) {
    const pagina = doc.loadPage(i);
    const texto = pagina.toStructuredText('preserve-whitespace').asText();
    partes.push(`[Página ${i + 1}]\n${texto.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')}`);
    pagina.destroy?.();
  }
  const paginas = doc.countPages();
  doc.destroy?.();
  return { texto: partes.join('\n\n'), paginas, motor: 'mupdf' };
}

async function conPdfjs(buf, { maxPaginas = 400 } = {}) {
  // En Node, pdf.js usa un «worker» en el mismo proceso. Se importa aquí
  // para que Vercel lo incluya en el despliegue (si no, lo busca en disco
  // y falla con «Setting up fake worker failed»).
  if (!globalThis.pdfjsWorker) globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    password: '',
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const partes = [];
  const total = Math.min(doc.numPages, maxPaginas);
  for (let i = 1; i <= total; i += 1) {
    const pagina = await doc.getPage(i);
    const contenido = await pagina.getTextContent();
    let linea = '';
    const lineas = [];
    for (const it of contenido.items) {
      if (!('str' in it)) continue;
      linea += it.str;
      if (it.hasEOL) { lineas.push(linea); linea = ''; } else if (it.str && !it.str.endsWith(' ')) linea += ' ';
    }
    if (linea) lineas.push(linea);
    partes.push(`[Página ${i}]\n${lineas.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')}`);
    pagina.cleanup();
  }
  await doc.destroy();
  return { texto: partes.join('\n\n'), paginas: doc.numPages, motor: 'pdfjs' };
}
