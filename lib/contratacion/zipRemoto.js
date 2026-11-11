// =====================================================================
// Leer un ZIP remoto por partes, sin descargarlo entero.
// lib/contratacion/zipRemoto.js
//
// Los históricos de la Plataforma son ZIP de cientos de MB (un año entero
// puede pasar de 1 GB) con cientos de ficheros ATOM dentro. Con peticiones
// HTTP Range se lee primero el directorio central (al final del ZIP) y
// después cada fichero por separado, de modo que una función de Vercel
// puede procesar unos cuantos ficheros por pasada y seguir en la próxima.
// Soporta ZIP64 (ficheros de más de 4 GB).
// =====================================================================

import zlib from 'node:zlib';
import { Unzip, UnzipInflate } from 'fflate';
import { fetchGob } from '@/lib/fetchGob';
import { HEADERS_BOT } from '@/lib/govtalentBot';

const TIMEOUT_MS = 120000;

async function rango(url, desde, hasta) {
  const res = await fetchGob(url, {
    headers: { ...HEADERS_BOT, Range: `bytes=${desde}-${hasta}` },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) {
    const e = new Error('no existe');
    e.status = 404;
    throw e;
  }
  if (res.status !== 206) {
    // Sin soporte de Range no se descarga el fichero entero aquí.
    try {
      await res.body?.cancel();
    } catch {}
    const e = new Error(`el servidor no admite descargas parciales (HTTP ${res.status})`);
    e.status = res.status;
    throw e;
  }
  const total = Number((res.headers.get('content-range') || '').split('/')[1]) || null;
  return { buf: Buffer.from(await res.arrayBuffer()), total };
}

/** Tamaño del ZIP (por Content-Range de una petición de 1 byte). */
export async function tamano(url) {
  const { total } = await rango(url, 0, 0);
  if (!total) throw new Error('sin Content-Range: no se sabe el tamaño');
  return total;
}

const u16 = (b, o) => b.readUInt16LE(o);
const u32 = (b, o) => b.readUInt32LE(o);
const u64 = (b, o) => Number(b.readBigUInt64LE(o));

/**
 * Índice del ZIP: [{ nombre, metodo, comprimido, original, offset }].
 * Lee el final del fichero, encuentra el directorio central (EOCD o
 * ZIP64) y lo descarga.
 */
export async function indice(url) {
  const total = await tamano(url);
  const cola = Math.min(total, 66000 + 20 + 56);
  const { buf: fin } = await rango(url, total - cola, total - 1);

  let p = -1;
  for (let i = fin.length - 22; i >= 0; i--) {
    if (u32(fin, i) === 0x06054b50) {
      p = i;
      break;
    }
  }
  if (p < 0) throw new Error('no es un ZIP (sin directorio central)');

  let entradas = u16(fin, p + 10);
  let tamDir = u32(fin, p + 12);
  let offDir = u32(fin, p + 16);

  // ZIP64: el localizador va justo antes del EOCD.
  if (offDir === 0xffffffff || tamDir === 0xffffffff || entradas === 0xffff) {
    const l = p - 20;
    if (l < 0 || u32(fin, l) !== 0x07064b50) throw new Error('ZIP64 sin localizador');
    const offEocd64 = u64(fin, l + 8);
    const { buf: e64 } = await rango(url, offEocd64, offEocd64 + 56 - 1);
    if (u32(e64, 0) !== 0x06064b50) throw new Error('ZIP64 mal formado');
    entradas = u64(e64, 32);
    tamDir = u64(e64, 40);
    offDir = u64(e64, 48);
  }

  const { buf: dir } = await rango(url, offDir, offDir + tamDir - 1);
  const lista = [];
  let o = 0;
  for (let n = 0; n < entradas && o + 46 <= dir.length; n++) {
    if (u32(dir, o) !== 0x02014b50) throw new Error('directorio central mal formado');
    const metodo = u16(dir, o + 10);
    let comprimido = u32(dir, o + 20);
    let original = u32(dir, o + 24);
    const lNombre = u16(dir, o + 28);
    const lExtra = u16(dir, o + 30);
    const lComent = u16(dir, o + 32);
    let offset = u32(dir, o + 42);
    const nombre = dir.slice(o + 46, o + 46 + lNombre).toString('utf8');
    // Campo extra ZIP64 (0x0001): los valores a 0xffffffff van aquí, en orden.
    let x = o + 46 + lNombre;
    const finExtra = x + lExtra;
    while (x + 4 <= finExtra) {
      const id = u16(dir, x);
      const len = u16(dir, x + 2);
      if (id === 0x0001) {
        let y = x + 4;
        if (original === 0xffffffff) {
          original = u64(dir, y);
          y += 8;
        }
        if (comprimido === 0xffffffff) {
          comprimido = u64(dir, y);
          y += 8;
        }
        if (offset === 0xffffffff) offset = u64(dir, y);
      }
      x += 4 + len;
    }
    if (!nombre.endsWith('/')) lista.push({ nombre, metodo, comprimido, original, offset });
    o = finExtra + lComent;
  }
  return { total, entradas: lista };
}

/** Contenido de un fichero del ZIP, como texto UTF-8. */
export async function leerFichero(url, e) {
  // Cabecera local: 30 bytes + nombre + extra (su extra puede no coincidir
  // con el del directorio central: se pide algo de margen).
  const margen = 30 + 1024;
  const { buf } = await rango(url, e.offset, e.offset + margen + e.comprimido - 1);
  if (u32(buf, 0) !== 0x04034b50) throw new Error(`cabecera local mal formada en ${e.nombre}`);
  const inicio = 30 + u16(buf, 26) + u16(buf, 28);
  const datos = buf.subarray(inicio, inicio + e.comprimido);
  if (e.metodo === 0) return datos.toString('utf8');
  if (e.metodo === 8) return zlib.inflateRawSync(datos).toString('utf8');
  throw new Error(`método de compresión ${e.metodo} no soportado en ${e.nombre}`);
}

// ---- Sin descargas parciales: el ZIP entero, en flujo ----------------
// La Plataforma no admite Range (responde 200 con el fichero entero). Se
// descarga en flujo y se descomprime al vuelo: cada fichero ATOM se
// procesa en cuanto termina, sin guardar el ZIP en memoria. Para seguir
// donde se quedó otra pasada, los ficheros anteriores a `desde` se
// atraviesan sin descomprimir (hay que descargarlos igualmente).


/**
 * Recorre los ficheros .atom del ZIP en orden.
 * onFichero({ indice, nombre, texto }) es async: la descarga espera a que
 * termine antes de seguir. debeParar() → true corta la descarga.
 * Devuelve { indice: siguiente fichero por procesar, terminado, bytes }.
 */
export async function recorrerZip(url, { desde = 0, onFichero, debeParar }) {
  const res = await fetchGob(url, { headers: HEADERS_BOT, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(780000) });
  if (res.status === 404) {
    const e = new Error('no existe');
    e.status = 404;
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);

  const cola = [];
  let n = -1; // índice del último .atom visto
  let error = null;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (f) => {
    if (!/\.atom$/i.test(f.name)) return;
    n += 1;
    if (n < desde) return; // ya procesado en otra pasada: no se descomprime
    const indiceFichero = n;
    const partes = [];
    f.ondata = (err, dato, final) => {
      if (err) {
        error = err;
        return;
      }
      if (dato?.length) partes.push(dato);
      if (final) cola.push({ indice: indiceFichero, nombre: f.name, texto: Buffer.concat(partes.map((p) => Buffer.from(p))).toString('utf8') });
    };
    f.start();
  };

  const lector = res.body.getReader();
  let siguiente = desde;
  let bytes = 0;
  let terminado = false;
  try {
    for (;;) {
      if (debeParar()) break;
      const { value, done } = await lector.read();
      if (value) {
        bytes += value.length;
        unzip.push(value, false);
      }
      if (done) unzip.push(new Uint8Array(0), true);
      if (error) throw error;
      while (cola.length) {
        const f = cola.shift();
        await onFichero(f);
        siguiente = f.indice + 1;
        if (debeParar()) break;
      }
      if (done) {
        terminado = !cola.length && !debeParar();
        break;
      }
    }
  } finally {
    try {
      await lector.cancel();
    } catch {}
  }
  return { indice: siguiente, terminado, bytes, ficheros_vistos: n + 1 };
}
