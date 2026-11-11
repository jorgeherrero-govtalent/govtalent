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

const TIMEOUT_MS = 150000; // cada página pesa ~5 MB y el servidor es lento

/** Solo la cabecera HTTP: Last-Modified, para saber si el fichero cambió. */
export async function cabecera(url) {
  const res = await fetchGob(url, {
    method: 'HEAD',
    headers: HEADERS_BOT,
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  return { status: res.status, modificado: res.headers.get('last-modified') };
}

/** Descarga un fichero ATOM. Devuelve { status, texto, bytes, modificado, tipo }. */
export async function descargar(url, { siModificadoDesde = null } = {}) {
  const res = await fetchGob(url, {
    headers: {
      ...HEADERS_BOT,
      Accept: 'application/atom+xml,application/xml,*/*',
      ...(siModificadoDesde ? { 'If-Modified-Since': siModificadoDesde } : {}),
    },
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
  return b == null ? null : desescapar(b.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()).trim() || null;
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
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
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

/** Bajas del fichero: [{ ref, cuando }]. */
export function leerBajas(xml) {
  return [...String(xml || '').matchAll(/<at:deleted-entry\b([^>]*)>/g)].map((m) => ({
    ref: (m[1].match(/\bref="([^"]+)"/) || [])[1] || null,
    cuando: (m[1].match(/\bwhen="([^"]+)"/) || [])[1] || null,
  })).filter((b) => b.ref);
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
  const periodo = bloque(proyecto, 'cac:PlannedPeriod') || '';
  const duracion = (periodo.match(/<cbc:DurationMeasure[^>]*unitCode="([^"]+)"[^>]*>([^<]+)</) || []);
  const parte = bloque(organo, 'cac:Party') || organo;
  const contacto = bloque(parte, 'cac:Contact') || '';
  const documento = (tipo) => (d) => ({
    tipo,
    nombre: texto(d, 'cbc:ID'),
    url: texto(bloque(d, 'cac:ExternalReference') || '', 'cbc:URI'),
  });

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
      lote: texto(bloque(r, 'cac:AwardedTenderedProject') || '', 'cbc:ProcurementProjectLotID'),
      formalizacion: texto(bloque(r, 'cac:Contract') || '', 'cbc:IssueDate'),
    })),
    anuncios: bloques(cfs, 'cac-place-ext:ValidNoticeInfo').map((n) => ({
      tipo: texto(n, 'cbc-place-ext:NoticeTypeCode'),
      fecha: texto(n, 'cbc:IssueDate'),
      medio: texto(n, 'cbc-place-ext:PublicationMediaName'),
    })),
    // Para la ficha y Vencimientos (11-11-2026).
    ficha: {
      duracion: duracion[2] ? { valor: numero(duracion[2].trim()), unidad: duracion[1] } : null,
      inicio: texto(periodo, 'cbc:StartDate'),
      fin: texto(periodo, 'cbc:EndDate'),
      prorrogas:
        texto(bloque(proyecto, 'cac:ContractExtension') || '', 'cbc:Description') ||
        texto(bloque(proyecto, 'cac:ContractExtension') || '', 'cbc:OptionsDescription'),
      criterios: bloques(cfs, 'cac:AwardingCriteria').map((c) => ({
        tipo: texto(c, 'cbc:AwardingCriteriaTypeCode'),
        descripcion: texto(c, 'cbc:Description'),
        peso: numero(texto(c, 'cbc:WeightNumeric')),
      })),
      documentos: [
        ...bloques(cfs, 'cac:LegalDocumentReference').map(documento('administrativo')),
        ...bloques(cfs, 'cac:TechnicalDocumentReference').map(documento('tecnico')),
        ...bloques(cfs, 'cac:AdditionalDocumentReference').map(documento('otro')),
      ].filter((d) => d.url),
      lotes: bloques(cfs, 'cac:ProcurementProjectLot').map((l) => ({
        id: texto(l, 'cbc:ID'),
        objeto: texto(l, 'cbc:Name'),
        importe: numero(texto(l, 'cbc:TaxExclusiveAmount')),
      })),
      contacto: {
        nombre: texto(contacto, 'cbc:Name'),
        telefono: texto(contacto, 'cbc:Telephone'),
        email: texto(contacto, 'cbc:ElectronicMail'),
        web: texto(parte, 'cbc:WebsiteURI'),
        ciudad: texto(bloque(parte, 'cac:PostalAddress') || '', 'cbc:CityName'),
      },
      perfil: texto(organo, 'cbc:BuyerProfileURIID'),
      fondos_ue: (cfs.match(/<cbc:FundingProgramCode[^>]*name="([^"]+)"/) || [])[1] || null,
      urgencia: texto(bloque(cfs, 'cac:TenderingProcess') || '', 'cbc:UrgencyCode'),
      sara: texto(bloque(cfs, 'cac:TenderingProcess') || '', 'cbc:OverThresholdIndicator') === 'true',
    },
  };
}

// ---- De entrada a filas de la base de datos -----------------------------

/** Id estable de la fuente: el número final del <id> de la entrada. */
export function idFuente(idEntrada) {
  const m = String(idEntrada || '').match(/(\d+)\s*$/);
  return m ? m[1] : null;
}

// NIF de persona jurídica: letra de sociedad o entidad + 7 dígitos + control.
// Lo demás (DNI, NIE, K/L/M) es persona física y no se guarda (RGPD).
const NIF_JURIDICA = /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/i;

export function esPersonaJuridica(nif) {
  return NIF_JURIDICA.test(String(nif || '').replace(/[\s.-]/g, ''));
}

const FECHA = /^\d{4}-\d{2}-\d{2}/;

/**
 * Fin previsto del contrato, sin prórrogas: el del periodo de ejecución si
 * viene; si no, la formalización (o la adjudicación) más la duración.
 */
function finContrato(entrada, formalizacion) {
  const f = entrada.ficha;
  if (!f) return null;
  if (FECHA.test(f.fin || '')) return f.fin.slice(0, 10);
  const d = f.duracion;
  if (!d?.valor) return null;
  const base =
    (FECHA.test(f.inicio || '') && f.inicio.slice(0, 10)) ||
    formalizacion ||
    entrada.adjudicaciones.map((a) => a.fecha).filter((x) => FECHA.test(x || '')).sort()[0]?.slice(0, 10);
  if (!base) return null;
  const fecha = new Date(`${base}T12:00:00Z`);
  const v = Number(d.valor);
  if (d.unidad === 'ANN') fecha.setUTCMonth(fecha.getUTCMonth() + Math.round(v * 12));
  else if (d.unidad === 'MON') fecha.setUTCMonth(fecha.getUTCMonth() + Math.round(v));
  else if (d.unidad === 'DAY') fecha.setUTCDate(fecha.getUTCDate() + Math.round(v));
  else return null;
  return fecha.toISOString().slice(0, 10);
}

export function aFilas(entrada, fuente) {
  const idf = idFuente(entrada.id);
  if (!idf) return null;
  const formalizacion =
    entrada.adjudicaciones
      .map((a) => a.formalizacion)
      .filter((x) => FECHA.test(x || ''))
      .sort()[0]
      ?.slice(0, 10) || null;
  const id = `${fuente}:${idf}`;
  const expediente = {
    id,
    fuente,
    id_fuente: idf,
    expediente: entrada.expediente,
    titulo: entrada.titulo,
    url: entrada.url,
    estado: entrada.estado,
    tipo: entrada.tipo,
    subtipo: entrada.subtipo,
    procedimiento: entrada.procedimiento,
    organo_nombre: entrada.organo.nombre,
    organo_dir3: entrada.organo.dir3,
    organo_nif: entrada.organo.nif,
    organo_ubicacion: entrada.organo.ubicacion,
    cpv: entrada.cpv,
    nuts: entrada.nuts,
    valor_estimado: entrada.valor_estimado,
    importe_sin_iva: entrada.importe_sin_iva,
    importe_total: entrada.importe_total,
    fin_ofertas: /^\d{4}-\d{2}-\d{2}/.test(entrada.fin_ofertas || '') ? entrada.fin_ofertas.slice(0, 19) : null,
    es_menor: fuente === 'menores',
    anuncios: entrada.anuncios,
    datos: entrada.ficha || null,
    fecha_formalizacion: formalizacion,
    fin_contrato: finContrato(entrada, formalizacion),
    actualizado_fuente: entrada.actualizado,
    eliminado: false,
    updated_at: new Date().toISOString(),
  };
  const adjudicaciones = entrada.adjudicaciones
    .filter((a) => a.adjudicatario || a.resultado)
    .map((a, i) => {
      const juridica = esPersonaJuridica(a.nif);
      return {
        expediente_id: id,
        orden: i + 1,
        resultado: a.resultado,
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(a.fecha || '') ? a.fecha : null,
        ofertas: a.ofertas,
        adjudicatario: a.adjudicatario,
        nif: juridica ? a.nif.replace(/[\s.-]/g, '').toUpperCase() : null,
        persona_fisica: !!a.nif && !juridica,
        importe: a.importe,
      };
    });
  const evento = {
    expediente_id: id,
    actualizado_fuente: entrada.actualizado,
    estado: entrada.estado,
    anuncios: entrada.anuncios,
  };
  return { expediente, adjudicaciones, evento };
}
