// =====================================================================
// Plataforma de Contratación del Sector Público (PLACSP): datos abiertos
// lib/contratacion/placsp.js
//
// Se leen los ficheros de datos abiertos que publica Hacienda para su
// reutilización y procesamiento automático (Ley 37/2007), igual que los
// datos abiertos del Congreso: descarga directa de los ficheros, sin pasar
// por el portal. Formato: ATOM con entradas CODICE; cada fichero trae
// hasta 500 entradas y enlaza con el siguiente (rel="next"). Una misma
// licitación aparece una vez por cada cambio. Las bajas van en
// <at:deleted-entry>.
//
// Especificación: «Formato de sindicación y reutilización de datos sobre
// licitaciones publicadas en la PLACSP» (DGPE). Documento de diseño del
// proyecto: claude/licitaciones-contratos.md.
// =====================================================================

import { fetchGob } from '@/lib/fetchGob';
import { HEADERS_BOT } from '@/lib/govtalentBot';

export const FEEDS = {
  perfiles: 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom',
  agregacion: 'https://contrataciondelestado.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom',
  menores: 'https://contrataciondelestado.es/sindicacion/sindicacion_1143/contratosMenoresPerfilesContratantes.atom',
};

const TIMEOUT_MS = 60000;

/** Descarga un fichero ATOM. Devuelve { status, texto, bytes, modificado, tipo }. */
export async function descargar(url) {
  const res = await fetchGob(url, {
    headers: { ...HEADERS_BOT, Accept: 'application/atom+xml,application/xml,*/*' },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    texto: buf.toString('utf8'),
    bytes: buf.length,
    modificado: res.headers.get('last-modified'),
    tipo: res.headers.get('content-type'),
  };
}

// ---- Lectura del XML ----------------------------------------------------
// Los prefijos de CODICE en estos ficheros son fijos (cbc, cac,
// cbc-place-ext, cac-place-ext), así que basta con expresiones regulares.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function bloques(xml, etiqueta) {
  const re = new RegExp(`<${esc(etiqueta)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(etiqueta)}>`, 'g');
  return [...String(xml || '').matchAll(re)].map((m) => m[1]);
}

function bloque(xml, etiqueta) {
  return bloques(xml, etiqueta)[0] ?? null;
}

function texto(xml, etiqueta) {
  const b = bloque(xml, etiqueta);
  return b == null ? null : desescapar(b.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()) || null;
}

/** Valor de una etiqueta con un atributo concreto (p. ej. schemeName="DIR3"). */
function conAtributo(xml, etiqueta, atributo, valor) {
  const re = new RegExp(`<${esc(etiqueta)}[^>]*\\s${esc(atributo)}="${esc(valor)}"[^>]*>([^<]*)</${esc(etiqueta)}>`);
  const m = String(xml || '').match(re);
  return m ? desescapar(m[1].trim()) : null;
}

function desescapar(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&');
}

const numero = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Cabecera del fichero: fecha de actualización, enlace al siguiente y bajas. */
export function leerCabecera(xml) {
  const cabecera = String(xml || '').split('<entry')[0];
  const next = (cabecera.match(/<link[^>]*rel="next"[^>]*href="([^"]+)"/) || cabecera.match(/<link[^>]*href="([^"]+)"[^>]*rel="next"/) || [])[1] || null;
  return {
    actualizado: texto(cabecera, 'updated'),
    siguiente: next,
    bajas: (String(xml || '').match(/<at:deleted-entry\b/g) || []).length,
  };
}

/** Entradas del fichero, con los datos que necesita GovTalent. */
export function leerEntradas(xml) {
  return bloques(xml, 'entry').map(leerEntrada);
}

function leerEntrada(e) {
  const cfs = bloque(e, 'cac-place-ext:ContractFolderStatus') || e;
  const organo = bloque(cfs, 'cac-place-ext:LocatedContractingParty') || '';
  const proyecto = bloque(cfs, 'cac:ProcurementProject') || '';
  const presupuesto = bloque(proyecto, 'cac:BudgetAmount') || '';
  const plazo = bloque(cfs, 'cac:TenderSubmissionDeadlinePeriod') || '';
  const resultados = bloques(cfs, 'cac:TenderResult');

  return {
    id: texto(e, 'id'),
    url: desescapar((e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '') || null,
    actualizado: texto(e, 'updated'),
    titulo: texto(e, 'title'),
    expediente: texto(cfs, 'cbc:ContractFolderID'),
    estado: texto(cfs, 'cbc-place-ext:ContractFolderStatusCode'),
    organo: {
      nombre: texto(bloque(organo, 'cac:PartyName') || '', 'cbc:Name'),
      dir3: conAtributo(organo, 'cbc:ID', 'schemeName', 'DIR3'),
      nif: conAtributo(organo, 'cbc:ID', 'schemeName', 'NIF'),
      ubicacion: texto(bloque(organo, 'cac-place-ext:ParentLocatedParty') || '', 'cbc:Name'),
    },
    tipo: texto(proyecto, 'cbc:TypeCode'),
    subtipo: texto(proyecto, 'cbc:SubTypeCode'),
    cpv: bloques(proyecto, 'cbc:ItemClassificationCode').map((c) => c.trim()).filter(Boolean),
    valor_estimado: numero(texto(presupuesto, 'cbc:EstimatedOverallContractAmount')),
    importe_sin_iva: numero(texto(presupuesto, 'cbc:TaxExclusiveAmount')),
    importe_total: numero(texto(presupuesto, 'cbc:TotalAmount')),
    nuts: texto(bloque(proyecto, 'cac:RealizedLocation') || '', 'cbc:CountrySubentityCode'),
    procedimiento: texto(bloque(cfs, 'cac:TenderingProcess') || '', 'cbc:ProcedureCode'),
    fin_ofertas: [texto(plazo, 'cbc:EndDate'), texto(plazo, 'cbc:EndTime')].filter(Boolean).join('T') || null,
    adjudicaciones: resultados.map((r) => ({
      resultado: texto(r, 'cbc:ResultCode'),
      fecha: texto(r, 'cbc:AwardDate'),
      ofertas: numero(texto(r, 'cbc:ReceivedTenderQuantity')),
      adjudicatario: texto(bloque(r, 'cac:WinningParty') || '', 'cbc:Name'),
      nif: texto(bloque(bloque(r, 'cac:WinningParty') || '', 'cac:PartyIdentification') || '', 'cbc:ID'),
      importe: numero(texto(bloque(r, 'cac:AwardedTenderedProject') || '', 'cbc:TaxExclusiveAmount')),
    })),
    anuncios: bloques(cfs, 'cac-place-ext:ValidNoticeInfo').map((n) => ({
      tipo: texto(n, 'cbc-place-ext:NoticeTypeCode'),
      fecha: texto(n, 'cbc:IssueDate'),
    })),
  };
}
