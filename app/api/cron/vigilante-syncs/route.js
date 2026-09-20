// =====================================================================
// VIGILANTE — aviso por correo cuando un sync falla
// app/api/cron/vigilante-syncs/route.js
//
// Una vez al día, a las 12:00 UTC (14:00 en Madrid): ya han corrido todos
// los crones del día, incluido el último, consultas a las 11:00 UTC.
//
// POR QUÉ EXISTE. La pantalla /backoffice/syncs contesta "¿qué corrió
// anoche?", pero solo si alguien entra a mirarla. El encadenado de la
// actividad del Congreso estuvo roto desde el 17 de agosto y nadie lo
// supo: no hay vigilancia que dependa de acordarse.
//
// SOLO ESCRIBE CUANDO HAY ALGO QUE CONTAR. Un correo diario de "todo
// bien" se deja de leer a la semana, y entonces vuelve a no haber
// vigilancia. Va uno solo, con todas las rutas con problema juntas.
//
// SALVO LOS LUNES. Si el vigilante se rompe no llega ningún correo, y
// "no llega correo" significaría "todo bien": el fallo más peligroso es
// justo el del vigilante. Por eso los lunes escribe siempre, aunque esté
// todo correcto. Si un lunes no llega nada, es que hay que mirar.
//
// El veredicto de cada ruta lo calcula lib/estadoSyncs.js, el mismo que
// pinta la pantalla. Dos formas de enseñar un único cálculo: así no
// pueden decir cosas distintas.
//
// Uso a mano:
//   ?key=<DEBUG_KEY>&dry=1      mira y no envía; devuelve el asunto
//   ?key=<DEBUG_KEY>&forzar=1   envía aunque esté todo al día
//   ?key=<DEBUG_KEY>            como el cron
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { estadoDeSyncs, EXPLICACION } from '@/lib/estadoSyncs';
import { conRegistro } from '@/lib/syncLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Se puede cambiar sin tocar código; el valor por defecto evita que un
// despliegue sin la variable deje la vigilancia muda.
const DESTINO = process.env.AVISOS_EMAIL || 'jorgerafaelherrerovidal@gmail.com';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

// Las horas se enseñan en hora de Madrid, que es desde donde se mira.
// Vercel programa en UTC y el correo no es sitio para hacer conversiones
// mentales a las dos de la tarde.
function horaLocal(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function programadaLocal(r) {
  const d = new Date(Date.UTC(2026, 0, 1, r.hora_utc, r.minuto_utc));
  const hhmm = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
  return r.cadencia === 'semanal' ? `${hhmm}, semanal` : hhmm;
}

const duracion = (ms) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`);

// El correo no lo lee un navegador moderno: lo lee Gmail. Tabla, estilos
// en línea y nada de clases.
function escapar(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fila(r, malo) {
  const color = malo ? '#c2534e' : '#1d6f5c';
  const detalle = r.detalle ? `<div style="color:#8a867e;font-size:11.5px;margin-top:4px;word-break:break-word;">${escapar(String(r.detalle).slice(0, 400))}</div>` : '';
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f2f0ec;">
        <div style="font-size:13.5px;color:#1a1a18;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapar(r.ruta)}</div>
        <div style="font-size:12.5px;color:${color};margin-top:3px;font-weight:600;">${escapar(EXPLICACION[r.veredicto] || r.veredicto)}</div>
        <div style="font-size:12px;color:#8a867e;margin-top:3px;">
          Programada ${escapar(programadaLocal(r))} · última ${escapar(horaLocal(r.ultima_ejecucion))} · ${escapar(duracion(r.duracion_ms))}
          · leídos ${r.n_leidos ?? '—'} · escritos ${r.n_escritos ?? '—'}
        </div>
        ${detalle}
      </td>
    </tr>`;
}

function correo({ problemas, resumen, esLunes }) {
  const titulo = problemas.length
    ? `${problemas.length} sync${problemas.length === 1 ? '' : 's'} con problemas`
    : 'Todos los syncs al día';

  const intro = problemas.length
    ? 'Estas rutas no han hecho lo que tenían que hacer:'
    : `Las ${resumen.total} rutas programadas han corrido como debían. Este correo llega todos los lunes aunque esté todo bien: si algún lunes no llega, es que el propio aviso está roto.`;

  const tabla = problemas.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;">${problemas.map((r) => fila(r, true)).join('')}</table>`
    : '';

  const semanal = esLunes && problemas.length
    ? `<p style="margin:0 0 18px;color:#8a867e;font-size:12.5px;">El resto, ${resumen.al_dia} de ${resumen.total}, está al día.</p>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;">
          <tr><td style="padding:26px 30px 30px;color:#3a3a36;font-size:14.5px;line-height:1.55;">
            <h2 style="margin:0 0 6px;font-size:18px;color:#1a1a18;">${escapar(titulo)}</h2>
            <p style="margin:0 0 16px;color:#8a867e;font-size:12.5px;">${escapar(horaLocal(new Date().toISOString()))} · ${resumen.al_dia} de ${resumen.total} al día</p>
            <p style="margin:0 0 14px;">${intro}</p>
            ${tabla}
            ${semanal}
            <a href="${SITE_URL}/backoffice/syncs" style="display:inline-block;background:#1d6f5c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:13.5px;font-weight:500;">Ver la pantalla de syncs</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { asunto: `GovTalent · ${titulo}`, html };
}

export const GET = conRegistro('/api/cron/vigilante-syncs', handler);

async function handler(request) {
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const forzar = sp.get('forzar') === '1';
  const informe = { inicio: new Date().toISOString(), dry_run: dry, destino: DESTINO };

  const estado = await estadoDeSyncs(admin());
  if (estado.error) {
    return NextResponse.json({ ...informe, error: `No se pudo leer sync_log: ${estado.error}` }, { status: 500 });
  }

  const problemas = estado.rutas.filter((r) => r.veredicto !== 'al_dia');
  const esLunes = new Date().getUTCDay() === 1;

  informe.n_leidos = estado.rutas.length;
  informe.al_dia = estado.resumen.al_dia;
  informe.con_problema = problemas.length;
  informe.rutas_con_problema = problemas.map((r) => `${r.ruta} (${r.veredicto})`);
  informe.es_lunes = esLunes;

  // Sin registro no se avisa de nada: significa que la tabla está vacía
  // —registro recién desplegado—, y mandar veintidós "nunca" sería una
  // falsa alarma de las que enseñan a ignorar el correo.
  if (estado.resumen.sin_registro) {
    informe.n_escritos = 0;
    informe.nota = 'sync_log está vacío: no se avisa hasta que haya registros.';
    return NextResponse.json(informe);
  }

  if (!problemas.length && !esLunes && !forzar) {
    informe.n_escritos = 0;
    informe.nota = `Todo al día (${estado.resumen.al_dia} de ${estado.resumen.total}). Sin correo.`;
    return NextResponse.json(informe);
  }

  const { asunto, html } = correo({ problemas, resumen: estado.resumen, esLunes });
  informe.asunto = asunto;

  if (dry) {
    informe.n_escritos = 0;
    informe.nota = 'Prueba en seco: no se envía.';
    return NextResponse.json(informe);
  }

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: DESTINO,
    subject: asunto,
    html,
  });

  // Un aviso que no sale es peor que no tener aviso: se devuelve como
  // error para que la propia pantalla de syncs lo enseñe en rojo.
  if (error) {
    informe.n_escritos = 0;
    return NextResponse.json({ ...informe, error: `Resend rechazó el aviso: ${error.message || error}` }, { status: 500 });
  }

  informe.n_escritos = 1;
  informe.email_id = data?.id || null;
  informe.nota = `Aviso enviado a ${DESTINO}: ${asunto}.`;
  return NextResponse.json(informe);
}
