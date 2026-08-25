'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * La barra de módulos, abajo, en móvil.
 *
 * POR QUÉ ABAJO Y NO ARRIBA: los cuatro son sitios donde se está, no
 * acciones que se ejecutan, y abajo quedan al alcance del pulgar. Arriba
 * no cabían: los elementos llevan flex-shrink:0 y se desbordaban.
 *
 * Y deja sitio para el quinto cuando llegue Talento.
 */

const VERDE = '#1d6f5c';

const MODULOS = [
  {
    href: '/regulatorio',
    etiqueta: 'Regulatorio',
    icono: 'ti-timeline-event',
    // Las rutas hijas también marcan activo, o la barra se apaga al
    // entrar en un expediente.
    activo: (p) =>
      p.startsWith('/regulatorio') ||
      p.startsWith('/initiatives') ||
      p.startsWith('/procedures') ||
      p.startsWith('/congreso'),
  },
  {
    href: '/institutions',
    etiqueta: 'Instituciones',
    icono: 'ti-building-bank',
    activo: (p) => p.startsWith('/institutions') || p.startsWith('/organizations'),
  },
  { href: '/projects', etiqueta: 'Proyectos', icono: 'ti-folder', activo: (p) => p.startsWith('/projects') },
  { href: '/jobs', etiqueta: 'Empleos', icono: 'ti-briefcase', activo: (p) => p.startsWith('/jobs') },
];

export default function BarraMovil() {
  const pathname = usePathname() || '/';
  const [escribiendo, setEscribiendo] = useState(false);

  // Con el teclado abierto, una barra fija se queda flotando encima y
  // tapa justo el campo en el que escribes. Se esconde mientras haya un
  // campo enfocado y vuelve al salir.
  useEffect(() => {
    function mirar() {
      const el = document.activeElement;
      const etiqueta = el?.tagName;
      setEscribiendo(
        etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || el?.isContentEditable === true
      );
    }
    document.addEventListener('focusin', mirar);
    document.addEventListener('focusout', mirar);
    return () => {
      document.removeEventListener('focusin', mirar);
      document.removeEventListener('focusout', mirar);
    };
  }, []);

  return (
    <>
      <style>{`
        .gt-movil { display: none; }
        @media (max-width: 720px) {
          .gt-movil {
            display: flex;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 190;
            background: #fff;
            border-top: .5px solid #e5e4de;
            /* Los últimos 34px de un iPhone son de la barra de gestos:
               sin esto los iconos quedan debajo de la raya. */
            padding-bottom: env(safe-area-inset-bottom, 0px);
          }
          .gt-movil.escondida { display: none; }
          /* Hueco al final de la página para que la barra no tape lo
             último de cada pantalla. */
          body { padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>

      <nav className={`gt-movil ${escribiendo ? 'escondida' : ''}`} aria-label="Módulos">
        {MODULOS.map((m) => {
          const on = m.activo(pathname);
          return (
            <Link
              key={m.href}
              href={m.href}
              aria-current={on ? 'page' : undefined}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '8px 2px 7px',
                textDecoration: 'none',
                color: on ? VERDE : '#8b8780',
              }}
            >
              <i className={`ti ${m.icono}`} style={{ fontSize: 19 }} aria-hidden="true"></i>
              <span style={{ fontSize: 10, fontWeight: on ? 600 : 400, whiteSpace: 'nowrap' }}>
                {m.etiqueta}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
