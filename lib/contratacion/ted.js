// =====================================================================
// TED (Tenders Electronic Daily): anuncios de poderes adjudicadores
// españoles y, desde el 11-11-2026, de las instituciones, órganos y
// agencias de la UE (los de otros países de la UE no interesan), por la
// Search API v3 (anónima, sin clave). Cada fila lleva su ámbito: espana
// o ue.
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
  'buyer-legal-type',
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

// buyer-legal-type de eForms: eu-ins-bod-ag es institución, órgano u
// organismo de la UE. (eu-int-org, «organización internacional europea»,
// lo usan mal ayuntamientos y ministerios de varios países: fuera.)
export const TIPOS_UE = ['eu-ins-bod-ag'];

// Aun así hay organismos nacionales que se declaran institución de la UE
// (ayuntamientos croatas, un banco central…). Solo pasa como «ue» si el
// nombre lo es.
const NOMBRE_UE = /europ|union|commission|frontex|eurojust|europol|eurofound|cedefop|joint undertaking|fusion for energy|eu-lisa|\bEU\b/i;

export async function buscarTed({ desde, token = null, limite = 250, campos = CAMPOS_TED }) {
  const body = {
    query: `(buyer-country=ESP OR buyer-legal-type IN (${TIPOS_UE.join(', ')})) AND publication-date>=${desde} SORT BY publication-number`,
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

// espana, ue o null (no interesa: organismo de otro país).
function ambitoTed(pais, tiposComprador, nombreComprador) {
  const tipoUe = tiposComprador.some((t) => TIPOS_UE.includes(String(t).toLowerCase()));
  if (tipoUe && NOMBRE_UE.test(nombreComprador || '')) return 'ue';
  return pais === 'ESP' ? 'espana' : null;
}

export function aFilaTed(n) {
  const pub = idioma(n['publication-number']);
  if (!pub) return null;
  const id = `ted:${pub}`;
  const fechaPub = idioma(n['publication-date']);
  const pais = (lista(n['buyer-country'])[0] || '').toUpperCase() || null;
  const ambito = ambitoTed(pais, lista(n['buyer-legal-type']), idioma(n['buyer-name']));
  if (!ambito) return null;
  return {
    id,
    fuente: 'ted',
    pais,
    ambito,
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
    datos: { xml: n.links?.xml?.MUL || null, pdf: n.links?.pdf?.SPA || null },
    actualizado_fuente: fechaPub ? new Date(`${fechaPub.slice(0, 10)}T00:00:00+01:00`).toISOString() : null,
    eliminado: false,
    updated_at: new Date().toISOString(),
  };
}
