// =====================================================================
// Asamblea de Madrid — lector
// lib/ccaa/madrid.js
//
// Fuente: el catálogo de datos abiertos de la propia Asamblea
// (asambleamadrid.es/servicios/datos-abiertos), fichero
// «ExpedientesAsambleaMadrid» = ARCHIVO.F_PRINCIPALES_OPENDATA_VIEW.csv.
// Un CSV de ~110 MB con todos los expedientes de todas las legislaturas:
//
//   DESCRIPCION, SIGLAS, LEGISLATURA, EXP_REG, EXP_ANO, NUM_LEY,
//   PROCEDIMIENTO, ASUNTO, PLENO_COMIS, STATUS, RESULTADO_TRAM, FECHA
//
// Se toman los proyectos (PL) y proposiciones de ley (PROPL) de la XIII:
// número (PL-3/2026), título, tipo, fecha de entrada, estado y resultado.
// No trae plazos de enmiendas: esos están en el BOAM. Sus PDF vienen
// cifrados, pero el mismo catálogo publica el índice del BOAM y una
// versión en texto (DOCX) de cada número, que es lo que se lee con IA
// (app/api/sync/parlamentos-autonomicos, leerBoamDocx).
//
// La web principal está detrás de Sucuri; el mismo fichero se pide al
// subdominio ctyp.asambleamadrid.es (la carpeta /static/doc/ es la misma),
// como GovTalentBot y respetando su robots.txt. Antes de descargarlo se
// mira su Last-Modified: si no ha cambiado desde la última lectura, no se
// descarga.
// =====================================================================

import Papa from 'papaparse';
import { fechaDeTexto } from '@/lib/ccaa/web';

const BASE = 'https://ctyp.asambleamadrid.es/static/doc';
const CSV = `${BASE}/opendata/ARCHIVO.F_PRINCIPALES_OPENDATA_VIEW.csv`;
// Índice del BOAM («BoletinesOficialesAsambleaMadrid»): número, fichero de
// texto (BOAM_13_00172.docx) y páginas. ~125 KB.
const CSV_BOAM = `${BASE}/opendata/SGP_ADMIN.OPENDATA_BOAM_VIEW.csv`;
const PRIMERA_CARGA_BOAM = 6;

const cinco = (n) => String(n).padStart(5, '0');
/** PDF oficial del BOAM (cifrado: solo para enlazarlo). */
export const urlPdfBoam = (n) => `${BASE}/publicaciones/BOAM_13_${cinco(n)}.pdf`;
/** Dónde puede estar la versión en texto (DOCX), por orden. */
export const urlsDocx = (n) => {
  const f = `BOAM_13_${cinco(parseInt(n, 10))}.docx`;
  return [`${BASE}/opendata/${f}`, `${BASE}/publicaciones/${f}`, `${BASE}/opendata/BOAM/${f}`];
};
const LEGISLATURA = 'XIII';
const SIGLAS = new Set(['PL', 'PROPL']);
const BUSCADOR = 'https://www.asambleamadrid.es/actividad/iniciativas';

const RESULTADO = { APROBADA: 'aprobada', RECHAZADA: 'rechazada', DECAIDA: 'caducada', DECAÍDA: 'caducada', RETIRADA: 'retirada', CADUCADA: 'caducada', INADMITIDA: 'inadmitida' };

const limpio = (v) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return !t || t === '-' ? null : t;
};

export function filaAExpediente(r) {
  const siglas = limpio(r.SIGLAS);
  const reg = limpio(r.EXP_REG);
  const ano = limpio(r.EXP_ANO);
  const titulo = limpio(r.ASUNTO);
  if (!siglas || !reg || !ano || !titulo) return null;
  const estado = (limpio(r.STATUS) || '').toUpperCase();
  const res = (limpio(r.RESULTADO_TRAM) || '').toUpperCase();
  const resultado = RESULTADO[res] || RESULTADO[estado] || null;
  const fecha = fechaDeTexto(r.FECHA);
  return {
    num_expediente: `${siglas}-${reg}/${ano}`,
    titulo,
    tipo: limpio(r.DESCRIPCION),
    comision: limpio(r.PLENO_COMIS),
    fecha_presentacion: fecha,
    situacion: [estado, res && res !== estado ? res : null].filter(Boolean).join(' · ') || null,
    is_closed: estado !== 'PENDIENTE',
    resultado,
    url: BUSCADOR,
    raw: { procedimiento: limpio(r.PROCEDIMIENTO), num_ley: limpio(r.NUM_LEY), fuente: 'opendata' },
    tramites: fecha ? [{ tipo: 'registro', fecha, descripcion: `Entrada del expediente (${limpio(r.DESCRIPCION) || siglas})`, organo: null }] : [],
  };
}

export async function leer(web, ctx = {}) {
  // ¿Ha cambiado el fichero desde la última lectura?
  let modificado = null;
  try {
    modificado = (await web.cabecera(CSV)).modificado;
  } catch (e) {
    if (e.robots) throw e;
  }
  if (ctx.diagnostico) ctx.diagnostico.madrid = { csv: CSV, last_modified: modificado, ultima_lectura: ctx.ultimaSync || null };
  const boletines = await boletinesNuevos(web, ctx);
  if (modificado && ctx.ultimaSync && new Date(modificado) <= new Date(ctx.ultimaSync) && !ctx.forzar) {
    if (ctx.diagnostico) ctx.diagnostico.madrid.sin_cambios = true;
    return { expedientes: [], boletines };
  }

  const r = await web.grande(CSV);
  if (!/^﻿?DESCRIPCION,SIGLAS,LEGISLATURA/.test(r.texto.slice(0, 200))) {
    if (ctx.diagnostico) ctx.diagnostico.madrid.error = `Cabecera inesperada: ${r.texto.slice(0, 200)}`;
    return { expedientes: [], boletines };
  }
  const expedientes = [];
  Papa.parse(r.texto.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
    step: ({ data }) => {
      if (data.LEGISLATURA !== LEGISLATURA || !SIGLAS.has(data.SIGLAS)) return;
      const e = filaAExpediente(data);
      if (e) expedientes.push(e);
    },
  });
  if (ctx.diagnostico) Object.assign(ctx.diagnostico.madrid, { mb: Math.round(r.bytes / 1048576), expedientes: expedientes.length });
  return { expedientes, boletines };
}

/** BOAM de la XIII posteriores al último guardado, del índice de datos abiertos. */
async function boletinesNuevos(web, ctx) {
  try {
    const texto = await web.texto(CSV_BOAM);
    const numeros = [];
    Papa.parse(texto.replace(/^\uFEFF/, ''), {
      header: true,
      skipEmptyLines: true,
      step: ({ data }) => {
        const leg = data['OPENDATA_BOAM_VIEW.LEGISLATURA'];
        const n = parseInt(data['OPENDATA_BOAM_VIEW.NUMERO'], 10);
        const fichero = data['OPENDATA_BOAM_VIEW.FICHERO_TEXTO'] || '';
        // Los fascículos (BOAM_x_000nn_fasciculoN) se dejan para más adelante.
        if (leg === '13' && Number.isFinite(n) && /^BOAM_13_\d{5}\.docx$/i.test(fichero)) numeros.push(n);
      },
    });
    const ultimo = Math.max(0, ...numeros);
    const desde = Math.max((ctx.ultimoNumero || 0) + 1, ultimo - PRIMERA_CARGA_BOAM + 1);
    if (ctx.diagnostico) Object.assign(ctx.diagnostico.madrid, { boam_ultimo_publicado: ultimo, boam_ultimo_guardado: ctx.ultimoNumero || null });
    return [...new Set(numeros)].filter((n) => n >= desde).sort((a, b) => a - b).map((n) => ({
      id: `madrid:BOAM-13-${n}`,
      numero: String(n),
      fecha: null,
      titulo: `BOAM n.º ${n}`,
      url: urlPdfBoam(n),
      url_pdf: urlPdfBoam(n),
    }));
  } catch (e) {
    if (e.robots) throw e;
    if (ctx.diagnostico) ctx.diagnostico.madrid.boam_error = e.message;
    return [];
  }
}
