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
    // BOAM: el diccionario de cifrado está incompleto (le falta la clave
    // de propietario, /O), así que no hay contraseña que valga. Se prueba
    // a leerlo como si no estuviera cifrado; solo se acepta si sale texto
    // legible.
    // BOAM: el diccionario de cifrado (AES-256, R 6) no trae la clave de
    // propietario (/O). Chrome y Acrobat lo abren igual, con la contraseña
    // de usuario vacía, porque para eso solo hacen falta /U y /UE; MuPDF
    // exige que /O exista aunque no la use. Se le añade una /O de relleno
    // y se abre con la contraseña vacía, exactamente como un visor. Si el
    // PDF pidiera una contraseña de usuario de verdad, seguiría fallando.
    if (/owner password/i.test(e.message)) {
      const conO = conClavePropietarioDeRelleno(buf);
      if (conO) {
        try {
          const r = await conMupdf(conO, opciones);
          return { ...r, motor: 'mupdf-o-relleno' };
        } catch (e3) {
          if (e3.contrasena) throw e3;
        }
      }
    }
    if (/encryption|password|cifr/i.test(e.message)) {
      const sinCifrado = sinDiccionarioDeCifrado(buf);
      if (sinCifrado) {
        try {
          const r = await conMupdf(sinCifrado, opciones);
          if (legible(r.texto)) return { ...r, motor: 'mupdf-sin-encrypt' };
        } catch {
          // sigue con pdf.js
        }
      }
    }
    try {
      return await conPdfjs(buf, opciones);
    } catch (e2) {
      // Para el diagnóstico: cómo es el diccionario de cifrado.
      const latin = Buffer.from(buf).toString('latin1');
      const ref = (latin.match(/\/Encrypt\s+(\d+)\s+0\s+R/) || [])[1];
      const dic = ref ? (latin.match(new RegExp(`\\b${ref}\\s+0\\s+obj\\s*(<<[\\s\\S]{0,300}?>>)`)) || [])[1] : null;
      const claves = dic ? (dic.match(/\/[A-Za-z]+/g) || []).join(' ') : 'no localizado';
      throw new Error(`MuPDF: ${e.message} · pdf.js: ${e2.message} · Encrypt: ${claves}`.slice(0, 280));
    }
  }
}

/**
 * El PDF con una /O de relleno en el diccionario de cifrado, solo si es
 * AES-256 (R 5 o 6: la clave del fichero sale de /U y /UE con la
 * contraseña de usuario) y le falta /O. Con R 2-4 la /O interviene en la
 * clave, así que no se toca. MuPDF reconstruye las referencias (xref)
 * que se desplazan al insertar.
 */
function conClavePropietarioDeRelleno(buf) {
  const latin = Buffer.from(buf).toString('latin1');
  const ref = (latin.match(/\/Encrypt\s+(\d+)\s+0\s+R/) || [])[1];
  if (!ref) return null;
  const ini = latin.search(new RegExp(`(^|[\\r\\n\\s])${ref}\\s+0\\s+obj\\s*<<`));
  if (ini < 0) return null;
  const abre = latin.indexOf('<<', ini);
  // Diccionario completo, con sus << >> anidados.
  let prof = 0;
  let fin = -1;
  for (let i = abre; i < latin.length - 1; i += 1) {
    if (latin[i] === '<' && latin[i + 1] === '<') { prof += 1; i += 1; } else if (latin[i] === '>' && latin[i + 1] === '>') { prof -= 1; i += 1; if (prof === 0) { fin = i + 1; break; } }
  }
  if (fin < 0) return null;
  const dic = latin.slice(abre, fin);
  const r = parseInt((dic.match(/\/R\s+(\d+)/) || [])[1], 10);
  if (!(r >= 5) || /\/O\s*[<(]/.test(dic)) return null;
  const relleno = ` /O <${'00'.repeat(48)}>`;
  return Buffer.from(latin.slice(0, abre + 2) + relleno + latin.slice(abre + 2), 'latin1');
}

/** El PDF con la referencia /Encrypt anulada (misma longitud: los offsets no cambian). */
function sinDiccionarioDeCifrado(buf) {
  const b = Buffer.from(buf);
  const latin = b.toString('latin1');
  if (!latin.includes('/Encrypt')) return null;
  return Buffer.from(latin.replace(/\/Encrypt(\s)/g, '/Encrypx$1'), 'latin1');
}

/** ¿Texto real? Proporción de letras y alguna palabra esperable. */
function legible(t) {
  const sinMarcas = String(t || '').replace(/\[Página \d+\]/g, '');
  if (sinMarcas.length < 500) return false;
  const letras = (sinMarcas.match(/[a-záéíóúñü]/gi) || []).length;
  return letras / sinMarcas.length > 0.6 && /asamblea|madrid|boletín|boletin/i.test(sinMarcas);
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
