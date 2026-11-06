// =====================================================================
// TED (Tenders Electronic Daily): anuncios de poderes adjudicadores
// españoles, por la Search API v3 (anónima, sin clave).
// lib/contratacion/ted.js
//
// POST https://api.ted.europa.eu/v3/notices/search con una consulta en la
// sintaxis «expert search» de TED. Paginación ITERATION: cada respuesta
// trae iterationNextToken hasta que se acaba. Máximo 250 por página.
// Los textos vienen por idioma ({ spa: [...], eng: [...] }).
// No se usan los paquetes diarios (/packages/): los prohíbe su robots.txt.
// =====================================================================

import { HEADERS_BOT } from '@/lib/govtalentBot';

export const URL_TED = 'https://api.ted.europa.eu/v3/notices/search';

export const CAMPOS_TED = [
  'publication-number',
  'publication-date',
  'notice-title',
  'notice-type',
  'form-type',
  'buyer-name',
  'buyer-country',
  'classification-cpv',
  'deadline-receipt-tender-date-lot',
  'estimated-value-proc',
  'procedure-type',
  'contract-nature',
  'place-of-performance',
  'links',
];

/** AAAAMMDD de una fecha. */
export const aTed = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

export async function buscarTed({ desde, token = null, limite = 250, campos = CAMPOS_TED }) {
  const body = {
    query: `buyer-country=ESP AND publication-date>=${desde} SORT BY publication-number ASC`,
    fields: campos,
    limit: limite,
    scope: 'ALL',
    paginationMode: 'ITERATION',
    ...(token ? { iterationNextToken: token } : {}),
  };
  const res = await fetch(URL_TED, {
    method: 'POST',
    headers: { ...HEADERS_BOT, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  const texto = await res.text();
  if (!res.ok) {
    const e = new Error(`TED HTTP ${res.status}: ${texto.slice(0, 600)}`);
    e.status = res.status;
    throw e;
  }
  const data = JSON.parse(texto);
  return { notices: data.notices || [], total: data.totalNoticeCount ?? null, token: data.iterationNextToken || null };
}

/** Un texto por idioma: castellano, inglés o el primero que haya. */
function idioma(v) {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.length ? idioma(v[0]) : null;
  if (typeof v === 'object') {
    const k = ['spa', 'eng'].find((x) => v[x] != null) || Object.keys(v)[0];
    return k ? idioma(v[k]) : null;
  }
  return null;
}

const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map((x) => idioma(x)).filter(Boolean);
const numero = (v) => {
  const s = idioma(v);
  return s == null || s === '' || Number.isNaN(Number(s)) ? null : Number(s);
};

/** Fecha TED («2026-11-20+01:00», «2026-11-20T14:00:00+01:00») → timestamp local. */
function fechaLocal(v) {
  const s = lista(v).sort()[0];
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?))?/);
  return m ? `${m[1]}T${m[2] || '23:59:00'}`.slice(0, 19) : null;
}

export function aFilaTed(n) {
  const pub = idioma(n['publication-number']);
  if (!pub) return null;
  const id = `ted:${pub}`;
  const fechaPub = idioma(n['publication-date']);
  return {
    id,
    fuente: 'ted',
    id_fuente: pub,
    expediente: null,
    titulo: idioma(n['notice-title']),
    url: `https://ted.europa.eu/es/notice/-/detail/${pub}`,
    estado: idioma(n['form-type']),
    tipo: idioma(n['contract-nature']),
    subtipo: idioma(n['notice-type']),
    procedimiento: idioma(n['procedure-type']),
    organo_nombre: idioma(n['buyer-name']),
    organo_dir3: null,
    organo_nif: null,
    organo_ubicacion: null,
    cpv: [...new Set(lista(n['classification-cpv']))],
    nuts: lista(n['place-of-performance'])[0] || null,
    valor_estimado: numero(n['estimated-value-proc']),
    importe_sin_iva: null,
    importe_total: null,
    fin_ofertas: fechaLocal(n['deadline-receipt-tender-date-lot']),
    es_menor: false,
    ted_ref: pub,
    anuncios: [{ tipo: idioma(n['notice-type']), fecha: fechaPub ? fechaPub.slice(0, 10) : null }],
    datos: { links: n.links || null },
    actualizado_fuente: fechaPub ? new Date(`${fechaPub.slice(0, 10)}T00:00:00+01:00`).toISOString() : null,
    eliminado: false,
    updated_at: new Date().toISOString(),
  };
}
