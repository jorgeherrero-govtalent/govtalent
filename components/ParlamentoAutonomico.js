'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PARLAMENTOS_UI, base, colorGrupo, esComision } from '@/lib/ccaa/composicionUI';

/**
 * Piezas comunes de las pantallas de un parlamento autonómico. Son copia
 * de las del Congreso (PestanasCongreso, Photo y GroupTag del directorio
 * de diputados, Avatar de comisiones): mismo tamaño, mismos colores y
 * mismo orden de pestañas, para que la Asamblea de Madrid se lea igual
 * que el Congreso.
 */

const VERDE = '#1d6f5c';

export function PestanasParlamento({ p }) {
  const pathname = usePathname();
  const b = base(p);
  const PESTANAS = [
    { href: `${b}/comisiones`, label: 'Comisiones' },
    { href: `${b}/diputados`, label: 'Diputados' },
    { href: `${b}/organos-gobierno`, label: 'Órganos de gobierno' },
    { href: `${b}/grupos`, label: 'Grupos parlamentarios' },
  ];
  return (
    <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14, flexWrap: 'wrap' }}>
      {PESTANAS.map((t) => {
        const activa = pathname === t.href || pathname.startsWith(t.href + '/');
        return activa ? (
          <span
            key={t.href}
            aria-current="page"
            style={{ fontSize: 13, fontWeight: 600, color: VERDE, borderBottom: `2px solid ${VERDE}`, paddingBottom: 8 }}
          >
            {t.label}
          </span>
        ) : (
          <Link key={t.href} href={t.href} style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Cabecera de las cuatro pestañas: «Asamblea de Madrid, 135 diputados, 4 grupos, …, XIII Legislatura». */
export function CabeceraParlamento({ p, titulo, datos }) {
  const cfg = PARLAMENTOS_UI[p];
  const nCom = datos ? datos.comisiones.filter(esComision).length : null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 6 }}>
        <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
          Instituciones
        </Link>
        {' › '}
        <Link href="/institutions/comunidades" style={{ color: '#999', textDecoration: 'none' }}>
          Comunidades autónomas
        </Link>
        {' › '}
        <span style={{ color: '#666' }}>{cfg.nombre}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{titulo || cfg.nombre}</h1>
        {cfg.fichaComunidad ? (
          <Link href={`/institutions/comunidades/${cfg.fichaComunidad}`} style={{ fontSize: 12, color: '#1d6f5c', textDecoration: 'none' }}>
            Contacto institucional →
          </Link>
        ) : null}
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>
        {datos ? datos.diputados.length : '—'} diputados, {datos ? datos.grupos.length : '—'} grupos, {nCom ?? '—'} comisiones,{' '}
        {cfg.legislatura} Legislatura
      </p>
    </div>
  );
}

/** Pantalla de «no existe» o «aún sin datos», con la misma tarjeta vacía del resto. */
export function Vacio({ icono = 'ti-building-bank', texto, children }) {
  return (
    <div className="card">
      <div className="empty-state">
        <i className={`ti ${icono}`}></i>
        {texto}
        {children}
      </div>
    </div>
  );
}

function iniciales(nombre) {
  return (nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(' ')
    .filter((x) => x && /^[A-Za-z]/.test(x) && x[0] === x[0].toUpperCase())
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Foto cuadrada con reserva de espacio y respaldo a iniciales (lista de diputados). */
export function Photo({ url, name, size = 36, radius = 8 }) {
  const [failed, setFailed] = useState(false);
  const b = { width: size, height: size, borderRadius: radius, flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };
  if (!url || failed) {
    return (
      <div
        style={{ ...b, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8d8b83', fontSize: Math.round(size * 0.32), fontWeight: 600 }}
        aria-hidden="true"
      >
        {iniciales(name)}
      </div>
    );
  }
  return <img src={url} alt="" width={size} height={size} style={b} onError={() => setFailed(true)} />;
}

/** Avatar redondo (comisiones, órganos, grupos). */
export function Avatar({ nombre, url, size = 30, borde, tono = 'verde' }) {
  const [falla, setFalla] = useState(false);
  const b = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    background: tono === 'verde' ? '#e8f4f0' : '#ece9e2',
    border: borde ? '2px solid #fff' : 'none',
  };
  if (url && !falla) return <img src={url} alt="" width={size} height={size} style={b} onError={() => setFalla(true)} />;
  return (
    <div
      style={{ ...b, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tono === 'verde' ? VERDE : '#8d8b83', fontSize: Math.round(size * 0.33), fontWeight: 700 }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </div>
  );
}

export function GroupTag({ grupo }) {
  if (!grupo) return <span style={{ fontSize: 11.5, color: '#aaa' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: colorGrupo(grupo), flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, color: '#555' }}>{grupo.sigla || grupo.nombre}</span>
    </span>
  );
}

/**
 * Marca del grupo: la sigla en su color y, encima, el logo que publica el
 * parlamento cuando carga (como LogoGrupo del Congreso: nunca hay hueco).
 */
export function LogoGrupoCcaa({ grupo, size = 38, radius = 9 }) {
  const [cargado, setCargado] = useState(false);
  const [falla, setFalla] = useState(false);
  const c = colorGrupo(grupo);
  const sigla = (grupo?.sigla || '').replace('Más Madrid', 'MM');
  return (
    <span
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `${c}1f`,
        color: c,
        fontSize: Math.max(9, Math.round(size * 0.3)),
        fontWeight: 700,
        overflow: 'hidden',
      }}
    >
      {sigla}
      {grupo?.logo_url && !falla && (
        <img
          src={grupo.logo_url}
          alt=""
          width={size}
          height={size}
          onLoad={() => setCargado(true)}
          onError={() => setFalla(true)}
          style={{ position: 'absolute', inset: 0, width: size, height: size, objectFit: 'cover', background: '#fff', opacity: cargado ? 1 : 0 }}
        />
      )}
    </span>
  );
}
