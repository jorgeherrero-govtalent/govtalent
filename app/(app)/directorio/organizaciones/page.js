'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DirectorioPestanasMovil from '@/components/DirectorioPestanasMovil';
import { SECCIONES_DIRECTORIO, FUSIONES } from '@/lib/directorio';

/**
 * Organizaciones: quien no es institución pero cuenta en asuntos públicos.
 *
 * Dos bloques, con las mismas tarjetas que Instituciones (maqueta elegida
 * el 05-10-2026, opción 1):
 *   - Organizaciones: patronales y asociaciones sectoriales (una sola
 *     tarjeta con dos pestañas), sociedades estatales y corporaciones de
 *     derecho público.
 *   - Medios y actores sociales: prensa, radio y televisión, partidos,
 *     sindicatos, ONG y organismos internacionales.
 *
 * A diferencia de Instituciones, aquí las cifras se consultan en vivo: salen
 * de una sola fuente cargada de una vez (la Agenda de la Comunicación) y
 * no hay una cifra «de oficio» con la que contradecirse.
 */

const MORADO = '#6d5aef';

const CARD = {
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 1px 2px rgba(0,0,0,.04)',
  padding: '22px 24px',
  minHeight: 150,
  textDecoration: 'none',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const BLOQUES = [
  {
    id: 'organizaciones',
    titulo: 'Organizaciones',
    subtitulo: 'Quién representa intereses y gestiona empresa pública',
  },
  {
    id: 'medios',
    titulo: 'Medios y actores sociales',
    subtitulo: 'Medios de comunicación, partidos, sindicatos, ONG y organismos internacionales',
  },
];

function etiqueta(seccion, cifra) {
  if (!cifra) return seccion.unidad;
  if (cifra.personas === null || cifra.personas === undefined) return seccion.unidad;
  return `${seccion.unidad}, ${cifra.personas.toLocaleString('es-ES')} contactos`;
}

// Las secciones fusionadas (FUSIONES) se pintan como una sola tarjeta que
// enlaza a la primera; sus cifras se suman.
function tarjetasDe(bloque, cifras) {
  const vistas = new Set();
  const out = [];
  for (const s of SECCIONES_DIRECTORIO.filter((x) => x.bloque === bloque)) {
    if (!s.fusion) {
      out.push({ seccion: s, cifra: cifras[s.slug] });
      continue;
    }
    if (vistas.has(s.fusion)) continue;
    vistas.add(s.fusion);
    const grupo = SECCIONES_DIRECTORIO.filter((x) => x.fusion === s.fusion);
    const partes = grupo.map((x) => cifras[x.slug]).filter(Boolean);
    const cifra = partes.length
      ? {
          organizaciones: partes.reduce((n, p) => n + (p.organizaciones || 0), 0),
          personas: partes.some((p) => typeof p.personas === 'number')
            ? partes.reduce((n, p) => n + (p.personas || 0), 0)
            : null,
        }
      : null;
    out.push({ seccion: { ...FUSIONES[s.fusion], slug: s.slug }, cifra });
  }
  return out;
}

function Tarjeta({ seccion, cifra, cargando }) {
  return (
    <Link href={`/directorio/organizaciones/${seccion.slug}`} className="bento" style={CARD}>
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.2px', marginBottom: 5 }}>{seccion.titulo}</div>
        <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.55 }}>{seccion.descripcion}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, paddingTop: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 23, fontWeight: 600, color: MORADO, lineHeight: 1 }}>
          {cargando || !cifra ? '—' : cifra.organizaciones.toLocaleString('es-ES')}
        </span>
        <span style={{ fontSize: 12, color: '#8b8780' }}>{etiqueta(seccion, cifra)}</span>
      </div>
    </Link>
  );
}

export default function OrganizacionesPage() {
  const [cifras, setCifras] = useState({});
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch('/api/directorio?vista=resumen')
      .then((r) => (r.ok ? r.json() : { cifras: {} }))
      .then((d) => {
        if (vivo) setCifras(d.cifras || {});
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <DirectorioPestanasMovil activa="organizaciones" />
      {BLOQUES.map((b, i) => (
        <section key={b.id} style={{ marginTop: i === 0 ? 0 : 40 }}>
          <div style={{ marginBottom: 18 }}>
            {i === 0 ? (
              <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>{b.titulo}</h1>
            ) : (
              <h2 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>{b.titulo}</h2>
            )}
            <p style={{ fontSize: 13, color: '#8b8780', margin: '4px 0 0' }}>{b.subtitulo}</p>
          </div>
          <div
            className="reg-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}
          >
            {tarjetasDe(b.id, cifras).map(({ seccion, cifra }) => (
              <Tarjeta key={seccion.slug} seccion={seccion} cifra={cifra} cargando={cargando} />
            ))}
          </div>
        </section>
      ))}

    </div>
  );
}
