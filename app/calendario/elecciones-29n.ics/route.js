// =====================================================================
// Calendario de las elecciones generales del 29N, para suscribirse
// app/calendario/elecciones-29n.ics/route.js
//
// Dirección fija y pública: Google, Apple y Outlook la piden sin sesión
// cada cierto tiempo. Si cambia una fecha en lib/calendarioElectoral.js,
// el calendario de cada usuario se actualiza solo.
//
// Los eventos son de día completo. En iCalendar el final de un evento de
// día completo es el día siguiente al último (DTEND exclusivo).
// =====================================================================

import { HITOS, ELECCIONES } from '@/lib/calendarioElectoral';

export const dynamic = 'force-static';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app').replace(/\/$/, '');

function fechaIcs(iso) {
  return iso.replace(/-/g, '');
}

function diaSiguiente(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + 1));
  return f.toISOString().slice(0, 10);
}

// Texto según RFC 5545: se escapan barra, coma, punto y coma y saltos.
function texto(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Líneas de más de 75 octetos se parten con salto + espacio.
function plegar(linea) {
  const bytes = Buffer.from(linea, 'utf8');
  if (bytes.length <= 75) return linea;
  const partes = [];
  let actual = '';
  for (const ch of linea) {
    const limite = partes.length === 0 ? 75 : 74;
    if (Buffer.byteLength(actual + ch, 'utf8') > limite) {
      partes.push(actual);
      actual = ch;
    } else {
      actual += ch;
    }
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

export function GET() {
  const sello = '20261006T000000Z';
  const eventos = HITOS.filter((h) => h.enCalendario).flatMap((h) => [
    'BEGIN:VEVENT',
    `UID:${h.id}-elecciones-29n@govtalent.app`,
    `DTSTAMP:${sello}`,
    `DTSTART;VALUE=DATE:${fechaIcs(h.inicio)}`,
    `DTEND;VALUE=DATE:${fechaIcs(diaSiguiente(h.fin))}`,
    `SUMMARY:${texto(`${h.titulo} · Elecciones 29N`)}`,
    `DESCRIPTION:${texto(`${h.descripcion}\n\nGovTalent: ${SITE_URL}/novedades`)}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ]);

  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GovTalent//Elecciones 29N//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${texto(`${ELECCIONES.nombre} 29N`)}`,
    'X-WR-TIMEZONE:Europe/Madrid',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...eventos,
    'END:VCALENDAR',
  ];

  return new Response(lineas.map(plegar).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="elecciones-29n.ics"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
