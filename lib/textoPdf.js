// =====================================================================
// Texto de un PDF, página a página
// lib/textoPdf.js
//
// Para los boletines que la API de Anthropic no acepta como PDF: los del
// BOAM (Asamblea de Madrid) vienen con contraseña de propietario, la que
// restringe copiar o imprimir, aunque se abren sin contraseña como en
// cualquier visor. Se extrae el texto con pdf.js solo para que la IA saque
// los actos de tramitación; el texto no se guarda ni se muestra
// (decisión de Jorge del 09-10-2026).
//
// Devuelve el texto con una marca «[Página N]» al empezar cada página,
// para que la IA pueda citar la página del PDF.
// =====================================================================

export async function textoDePdf(buf, { maxPaginas = 400 } = {}) {
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
  return { texto: partes.join('\n\n'), paginas: doc.numPages };
}
