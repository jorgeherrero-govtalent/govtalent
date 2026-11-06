// =====================================================================
// SYNC — Licitaciones y contratos (PLACSP)
// app/api/sync/contratacion/route.js
//
// Paso 1 (06-11-2026): prueba de acceso y de lectura. Descarga la primera
// página de cada feed de datos abiertos de la Plataforma de Contratación
// (lib/contratacion/placsp.js), la interpreta y devuelve un resumen.
// TODAVÍA NO GUARDA NADA: las tablas se crean en el paso siguiente.
//
// Uso:
//   ?key=<DEBUG_KEY>                     los tres feeds, resumen
//   ?key=<DEBUG_KEY>&feed=menores        uno solo (perfiles|agregacion|menores)
//   ?key=<DEBUG_KEY>&muestras=5          cuántas entradas de ejemplo
//   ?key=<DEBUG_KEY>&paginas=3           seguir rel="next" (máximo 5)
//   ?key=<DEBUG_KEY>&crudo=1             además, el principio del XML
// =====================================================================

import { conRegistro } from '@/lib/syncLog';
import { FEEDS, descargar, leerCabecera, leerEntradas } from '@/lib/contratacion/placsp';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const GET = conRegistro('/api/sync/contratacion', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && String(sp.get('key') || '').toLowerCase() === process.env.DEBUG_KEY.toLowerCase();
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const elegido = sp.get('feed');
  const muestras = Math.min(20, Math.max(0, parseInt(sp.get('muestras') || '3', 10) || 0));
  const paginas = Math.min(5, Math.max(1, parseInt(sp.get('paginas') || '1', 10) || 1));
  const crudo = sp.get('crudo') === '1';

  const res = { ok: true, prueba: true, feeds: {} };
  for (const [nombre, url] of Object.entries(FEEDS)) {
    if (elegido && elegido !== nombre) continue;
    const salida = { url, paginas: [] };
    let siguiente = url;
    const entradas = [];
    try {
      for (let p = 0; p < paginas && siguiente; p += 1) {
        const r = await descargar(siguiente);
        const cab = leerCabecera(r.texto);
        const lista = r.status === 200 ? leerEntradas(r.texto) : [];
        entradas.push(...lista);
        salida.paginas.push({
          url: siguiente, status: r.status, tipo: r.tipo, bytes: r.bytes, last_modified: r.modificado,
          actualizado: cab.actualizado, entradas: lista.length, bajas: cab.bajas, siguiente: cab.siguiente,
        });
        if (crudo && p === 0) salida.xml_inicio = r.texto.slice(0, 4000);
        if (r.status !== 200) {
          salida.error_cuerpo = r.texto.slice(0, 600);
          break;
        }
        siguiente = cab.siguiente;
      }
      const fechas = entradas.map((e) => e.actualizado).filter(Boolean).sort();
      salida.resumen = {
        entradas: entradas.length,
        mas_antigua: fechas[0] || null,
        mas_reciente: fechas[fechas.length - 1] || null,
        con_expediente: entradas.filter((e) => e.expediente).length,
        con_organo_dir3: entradas.filter((e) => e.organo.dir3).length,
        con_organo_nif: entradas.filter((e) => e.organo.nif).length,
        con_cpv: entradas.filter((e) => e.cpv.length).length,
        con_fin_ofertas: entradas.filter((e) => e.fin_ofertas).length,
        con_adjudicatario: entradas.filter((e) => e.adjudicaciones.some((a) => a.adjudicatario)).length,
        estados: contar(entradas.map((e) => e.estado)),
        tipos: contar(entradas.map((e) => e.tipo)),
      };
      salida.muestras = entradas.slice(0, muestras);
    } catch (e) {
      salida.error = String(e.message || e).slice(0, 500);
    }
    res.feeds[nombre] = salida;
  }
  res.ms = Date.now() - t0;
  return Response.json(res);
}

function contar(valores) {
  const m = {};
  for (const v of valores) m[v ?? '(vacío)'] = (m[v ?? '(vacío)'] || 0) + 1;
  return m;
}
