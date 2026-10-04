'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BuscadorGlobal from '@/components/BuscadorGlobal';
import MenuUsuario from '@/components/MenuUsuario';

/**
 * El menú lateral, calcado del de Enginy.
 *
 * Arriba, el contexto (tu organización o tú) con el menú de usuario y el
 * botón de plegar. Debajo, el buscador y la entrada principal destacada:
 * «Asistente», que es la home con la caja del agente. Después Novedades,
 * Alarmas y Seguimiento, y los módulos agrupados en secciones con título.
 * Abajo, la tarjeta del plan con las alarmas en uso y la ayuda.
 *
 * Solo en escritorio. En móvil siguen la barra superior reducida y
 * BarraMovil abajo (ver app/(app)/layout.js).
 *
 * Plegado se recuerda en este navegador: es una comodidad de cada uno,
 * no un ajuste de la cuenta.
 */

const CLAVE_PLEGADO = 'govtalent.menu.plegado';

// Qué rutas encienden cada entrada. Las fichas hijas también, para que el
// menú no se apague al entrar en un expediente.
// Las consultas públicas ya no tienen entrada propia en el menú (04-10-2026):
// se llega desde la portada de Regulatorio, así que encienden Regulatorio.
const enRegulatorio = (p) =>
  p.startsWith('/regulatorio') ||
  p.startsWith('/initiatives') ||
  p.startsWith('/procedures') ||
  p.startsWith('/congreso') ||
  p.startsWith('/boe');

const PRINCIPALES = [
  { href: '/', etiqueta: 'Asistente', icono: 'ti-sparkles', activo: (p) => p === '/' },
  { href: '/novedades', etiqueta: 'Novedades', icono: 'ti-inbox', activo: (p) => p.startsWith('/novedades'), contador: true },
  { href: '/alarmas', etiqueta: 'Alarmas', icono: 'ti-bell', activo: (p) => p.startsWith('/alarmas') },
  { href: '/seguimiento', etiqueta: 'Seguimiento', icono: 'ti-eye', activo: (p) => p.startsWith('/seguimiento') },
];

// Organizaciones y Empleos están ocultos desde el 04-10-2026 (y sus rutas
// redirigen a la portada: ver RUTAS_OCULTAS en middleware.js).
const SECCIONES = [
  {
    titulo: 'Vigilar',
    items: [
      { href: '/regulatorio', etiqueta: 'Regulatorio', icono: 'ti-timeline-event', activo: enRegulatorio },
      {
        href: '/parlamentos-autonomicos',
        etiqueta: 'Parlamentos autonómicos',
        icono: 'ti-building-community',
        activo: (p) => p.startsWith('/parlamentos-autonomicos'),
      },
    ],
  },
  {
    titulo: 'Directorio',
    items: [
      {
        href: '/institutions',
        etiqueta: 'Instituciones',
        icono: 'ti-building-bank',
        activo: (p) => p.startsWith('/institutions') || p.startsWith('/instituciones'),
      },
    ],
  },
  {
    titulo: 'Trabajo',
    items: [
      // Tareas (04-10-2026, sql/68): las sueltas y las acciones de Proyectos.
      { href: '/tareas', etiqueta: 'Tareas', icono: 'ti-checkbox', activo: (p) => p.startsWith('/tareas') },
      { href: '/projects', etiqueta: 'Proyectos', icono: 'ti-folder', activo: (p) => p.startsWith('/projects') },
    ],
  },
];

/** El anillo de la tarjeta del plan: alarmas activas sobre el límite. */
function Anillo({ usadas, limite, tam = 40 }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const parte = limite > 0 ? Math.min(1, usadas / limite) : 0;
  return (
    <svg width={tam} height={tam} viewBox="0 0 40 40" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="#e6e4dc" strokeWidth="4" />
      {parte > 0 && (
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="#6d5aef"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${c * parte} ${c}`}
          transform="rotate(-90 20 20)"
        />
      )}
    </svg>
  );
}

function Entrada({ item, pathname, plegado, novedades }) {
  const on = item.activo(pathname);
  const n = item.contador ? novedades : 0;
  return (
    <Link
      href={item.href}
      className={`gt-lat-it${on ? ' on' : ''}${item.morado ? ' morado' : ''}`}
      title={plegado ? item.etiqueta : undefined}
      aria-current={on ? 'page' : undefined}
      aria-label={n > 0 ? `${item.etiqueta}, ${n} sin ver` : undefined}
    >
      <i className={`ti ${item.icono}`} aria-hidden="true"></i>
      <span className="gt-lat-txt">{item.etiqueta}</span>
      {n > 0 && <span className="gt-lat-bd">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}

export default function MenuLateral({
  user,
  organizaciones = [],
  enOrganizacion = null,
  tieneOfertas = false,
  novedades = 0,
  alarmas = null, // { usadas, limite, esPro } o null mientras carga
  onSignOut,
}) {
  const pathname = usePathname() || '/';
  const [plegado, setPlegado] = useState(false);

  useEffect(() => {
    try {
      setPlegado(window.localStorage.getItem(CLAVE_PLEGADO) === '1');
    } catch {}
  }, []);

  function alternar() {
    setPlegado((v) => {
      try {
        window.localStorage.setItem(CLAVE_PLEGADO, v ? '0' : '1');
      } catch {}
      return !v;
    });
  }

  const esPro = !!alarmas?.esPro;

  return (
    <aside className={`gt-lat${plegado ? ' plegado' : ''}`} aria-label="Menú principal">
      <div className="gt-lat-ws">
        <MenuUsuario
          variante="lateral"
          compacto={plegado}
          user={user}
          organizaciones={organizaciones}
          enOrganizacion={enOrganizacion}
          tieneOfertas={tieneOfertas}
          onSignOut={onSignOut}
        />
        <button
          type="button"
          className="gt-lat-plegar"
          onClick={alternar}
          title={plegado ? 'Desplegar menú' : 'Plegar menú'}
          aria-label={plegado ? 'Desplegar menú' : 'Plegar menú'}
          aria-expanded={!plegado}
        >
          <i className={`ti ${plegado ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar'}`} aria-hidden="true"></i>
        </button>
      </div>

      {/* Fuera de la zona con scroll: el panel de resultados sale por la
          derecha del menú y un contenedor con overflow lo recortaría. */}
      <div className="gt-lat-busca">
        {plegado ? (
          <button
            type="button"
            className="gt-lat-it"
            title="Buscar"
            aria-label="Buscar"
            onClick={() => {
              alternar();
              setTimeout(() => window.dispatchEvent(new Event('gt-buscar')), 60);
            }}
          >
            <i className="ti ti-search" aria-hidden="true"></i>
          </button>
        ) : (
          <BuscadorGlobal variante="lateral" />
        )}
      </div>

      <nav className="gt-lat-scroll">
        {PRINCIPALES.map((it, i) => (
          <div key={it.href} className={i === 0 ? 'gt-lat-principal' : undefined}>
            <Entrada item={it} pathname={pathname} plegado={plegado} novedades={novedades} />
          </div>
        ))}
        {SECCIONES.map((s) => (
          <div key={s.titulo} className="gt-lat-grupo">
            <div className="gt-lat-sec">{s.titulo}</div>
            {s.items.map((it) => (
              <Entrada key={it.href} item={it} pathname={pathname} plegado={plegado} novedades={novedades} />
            ))}
          </div>
        ))}
      </nav>

      <div className="gt-lat-pie">
        {/* La oferta solo a quien no es Pro: a quien ya paga, una
            pastilla pidiendo dinero no le dice nada. */}
        {alarmas && !esPro && !plegado && (
          <Link href="/precios" target="_blank" rel="noreferrer" className="gt-lat-promo">
            <span className="gt-lat-promo-ic">
              <i className="ti ti-gift" aria-hidden="true"></i>
            </span>
            <span className="gt-lat-promo-txt">Founding Member: Pro a 30 €/año</span>
            <i className="ti ti-chevron-right" aria-hidden="true"></i>
          </Link>
        )}

        {alarmas &&
          (plegado ? (
            <Link
              href="/alarmas"
              className="gt-lat-anillo"
              title={`${alarmas.usadas} de ${alarmas.limite} ${alarmas.limite === 1 ? 'alarma' : 'alarmas'} · Plan ${esPro ? 'Pro' : 'Free'}`}
            >
              <Anillo usadas={alarmas.usadas} limite={alarmas.limite} tam={34} />
            </Link>
          ) : (
            <div className="gt-lat-plan">
              <div className="gt-lat-plan-t">
                <div>
                  <b>
                    {alarmas.usadas} de {alarmas.limite} {alarmas.limite === 1 ? 'alarma' : 'alarmas'}
                  </b>
                  <small>{esPro ? 'Plan Pro' : 'Plan Free · resumen los lunes'}</small>
                </div>
                <Anillo usadas={alarmas.usadas} limite={alarmas.limite} />
              </div>
              {esPro ? (
                <Link href="/account" className="gt-lat-btn">
                  Ver plan
                </Link>
              ) : (
                <Link href="/precios" target="_blank" rel="noreferrer" className="gt-lat-btn">
                  Mejorar plan
                </Link>
              )}
            </div>
          ))}

        <a href="mailto:hola@govtalent.app" className="gt-lat-it gt-lat-ayuda" title={plegado ? 'Ayuda' : undefined}>
          <i className="ti ti-help-circle" aria-hidden="true"></i>
          <span className="gt-lat-txt">Ayuda</span>
        </a>
      </div>
    </aside>
  );
}
