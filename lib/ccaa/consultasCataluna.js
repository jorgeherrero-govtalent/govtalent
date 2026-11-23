// =====================================================================
// Consultas públicas de la Generalitat de Catalunya
// lib/ccaa/consultasCataluna.js
//
// Fuente (verificada el 23-11-2026): Participa gencat
// (participa.gencat.cat), hecho con Decidim. Su API GraphQL pública
// (POST /api, sin clave) da en una sola petición todos los procesos con
// su grupo, fechas, fases, departamento, descripción y adjuntos.
//
// Solo se guardan los del grupo «Normativa» (la sección «Participació en
// normativa», /regulations): consultas públicas previas y participación
// en la elaboración de proyectos de decreto, orden o ley. Los del grupo
// «Procés» (planes, PDU, presupuestos participativos) no son normativa.
// Histórico desde 2023, como Madrid.
//
// El plazo para opinar es el de la fase «Participació»; si el proceso no
// la tiene, sus fechas generales.
//
// Se pide como GovTalentBot (lib/govtalentBot.js); el robots.txt no veta
// /api.
// =====================================================================

import { fetchGob } from '@/lib/fetchGob';
import { HEADERS_BOT } from '@/lib/govtalentBot';
import { textoPlano } from '@/lib/ccaa/web';

const BASE = 'https://participa.gencat.cat';
const DESDE = '2023-01-01';

const CONSULTA = `{
  participatoryProcesses {
    id slug startDate endDate
    title { translation(locale: "ca") }
    subtitle { translation(locale: "ca") }
    shortDescription { translation(locale: "ca") }
    participatoryProcessGroup { title { translation(locale: "ca") } }
    developerGroup { translation(locale: "ca") }
    steps { title { translation(locale: "ca") } startDate endDate }
    attachments { url title { translation(locale: "ca") } }
  }
}`;

const tr = (x) => (x?.translation || '').replace(/\s+/g, ' ').trim() || null;

/**
 * Fecha (AAAA-MM-DD, hora de Madrid) de un instante de la API. Un fin a
 * las 00:00 es «hasta el día anterior incluido» (el XAC acaba
 * «2026-11-25T00:00:00+01:00»: se puede participar hasta el 24).
 */
export function diaMadrid(ts, esFin = false) {
  if (!ts) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  let d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const hora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  if (esFin && hora === '00:00') d = new Date(d.getTime() - 60_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

/** Un proceso de la API → fila de consultas_publicas, o null si no es normativa. */
export function filaDeProceso(p) {
  const grupo = tr(p.participatoryProcessGroup?.title);
  if (!grupo || !/^normativa$/i.test(grupo)) return null;
  if ((p.startDate || '') < DESDE) return null;
  const titulo = tr(p.title);
  if (!titulo) return null;
  const subtitulo = tr(p.subtitle);

  const fase = (p.steps || []).find((s) => /particip/i.test(tr(s.title) || ''));
  const inicio = fase ? diaMadrid(fase.startDate) : p.startDate;
  const fin = fase ? diaMadrid(fase.endDate, true) : p.endDate;

  const documentos = (p.attachments || [])
    .filter((a) => a.url)
    .map((a) => ({ nombre: tr(a.title) || 'Documento', url: a.url.startsWith('http') ? a.url : `${BASE}${a.url}` }));

  return {
    tipo: /consulta (p[uú]blica )?pr[eè]via/i.test(`${subtitulo || ''} ${titulo}`) ? 'consulta_previa' : 'audiencia_publica',
    titulo,
    ministerio: tr(p.developerGroup) || 'Generalitat de Catalunya',
    // La entradilla del proceso; el subtítulo, si no la hay.
    resumen: textoPlano(tr(p.shortDescription) || '') || subtitulo,
    fecha_inicio: inicio,
    fecha_fin: fin,
    documentos: documentos.length ? documentos : null,
    url: `${BASE}/processes/${p.slug}`,
  };
}

/** Todas las consultas normativas desde 2023, en una petición. */
export async function leerConsultas() {
  const res = await fetchGob(`${BASE}/api`, {
    method: 'POST',
    headers: { ...HEADERS_BOT, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: CONSULTA }),
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${BASE}/api`);
  const j = await res.json();
  if (j.errors?.length) throw new Error(`API: ${j.errors.map((e) => e.message).join('; ').slice(0, 300)}`);
  return (j.data?.participatoryProcesses || []).map(filaDeProceso).filter(Boolean);
}
