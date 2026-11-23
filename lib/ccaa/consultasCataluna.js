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
  }
}`;

// Los adjuntos van aparte y por tandas: hay adjuntos sin dirección
// (Attachment.url null) y, pedidos junto al resto, ese error deja sin
// datos la consulta entera (23-11-2026). Así, un adjunto roto solo deja
// sin documentos a su proceso.
const TANDA_ADJUNTOS = 25;

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

/** POST a la API GraphQL. Devuelve { data, errors } sin lanzar por errores parciales. */
async function graphql(query) {
  const res = await fetchGob(`${BASE}/api`, {
    method: 'POST',
    headers: { ...HEADERS_BOT, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query }),
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${BASE}/api`);
  return res.json();
}

/** Adjuntos de varios procesos, por id; los que fallen se quedan sin adjuntos. */
async function adjuntosDe(ids) {
  const out = new Map();
  const pedir = async (tanda) => {
    const q = `{ ${tanda.map((id) => `p${id}: participatoryProcess(id: ${Number(id)}) { attachments { url title { translation(locale: "ca") } } }`).join(' ')} }`;
    const j = await graphql(q);
    // Un adjunto sin dirección deja data a null para toda la tanda.
    if (!j.data) throw new Error('tanda sin datos');
    for (const id of tanda) out.set(String(id), j.data[`p${id}`]?.attachments || []);
  };
  for (let i = 0; i < ids.length; i += TANDA_ADJUNTOS) {
    const tanda = ids.slice(i, i + TANDA_ADJUNTOS);
    try {
      await pedir(tanda);
    } catch {
      // La tanda falló por algún adjunto roto: de uno en uno, para que solo
      // se quede sin documentos el proceso que lo tiene.
      for (const id of tanda) {
        try {
          await pedir([id]);
        } catch {
          out.set(String(id), []);
        }
      }
    }
  }
  return out;
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

/**
 * Todas las consultas normativas desde 2023. Los adjuntos se piden solo
 * de las que aún no están guardadas (`conocidas`, por URL) o siguen
 * abiertas; en el resto, documentos queda undefined y no se toca.
 */
export async function leerConsultas({ conocidas = new Set(), hoy } = {}) {
  const j = await graphql(CONSULTA);
  const procesos = j.data?.participatoryProcesses;
  if (!procesos) throw new Error(`API: ${(j.errors || []).map((e) => e.message).join('; ').slice(0, 300) || 'sin datos'}`);
  const filas = procesos.filter(Boolean).map((p) => ({ p, f: filaDeProceso(p) })).filter((x) => x.f);
  const pedir = filas.filter(({ f }) => !conocidas.has(f.url) || !f.fecha_fin || !hoy || f.fecha_fin >= hoy);
  const adjuntos = await adjuntosDe(pedir.map(({ p }) => p.id));
  return filas.map(({ p, f }) => {
    if (!adjuntos.has(String(p.id))) {
      const { documentos, ...resto } = f; // eslint-disable-line no-unused-vars
      return resto;
    }
    return filaDeProceso({ ...p, attachments: adjuntos.get(String(p.id)) });
  });
}
