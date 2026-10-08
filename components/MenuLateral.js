'use client';

import { useEffect, useState } from 'react';
import { creditosIncluidos, miles } from '@/lib/precios';
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
 * En móvil (08-10-2026) es el mismo menú, en cajón: el botón de menú de
 * la barra superior lo abre por encima de la página (movilAbierto) y se
 * cierra al tocar un enlace, el fondo, la X o Escape. Así el móvil tiene
 * todas las entradas sin mantener una segunda lista. BarraMovil sigue
 * abajo como atajos.
 *
 * Plegado se recuerda en este navegador: es una comodidad de cada uno,
 * no un ajuste de la cuenta.
 */

const CLAVE_PLEGADO = 'govtalent.menu.plegado';

// Qué rutas encienden cada entrada. Las fichas hijas también, para que el
// menú no se apague al entrar en un expediente.
// Regulatorio se divide en Unión Europea y España (05-10-2026). Lo que no
// es de Bruselas (consultas, búsqueda, el propio /regulatorio) cuelga de
// España.
const enUnionEuropea = (p) =>
  p.startsWith('/regulatorio/union-europea') || p.startsWith('/initiatives') || p.startsWith('/procedures');
const enEspana = (p) =>
  (p.startsWith('/regulatorio') && !p.startsWith('/regulatorio/union-europea')) ||
  p.startsWith('/congreso') ||
  p.startsWith('/boe') ||
  p.startsWith('/parlamentos-autonomicos');

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
    titulo: 'Regulatorio',
    items: [
      { href: '/regulatorio/union-europea', etiqueta: 'Unión Europea', icono: 'ti-world', activo: enUnionEuropea },
      { href: '/regulatorio/espana', etiqueta: 'España', icono: 'ti-building-community', activo: enEspana },
    ],
  },
  {
    titulo: 'Directorio',
    items: [
      // Tres entradas desde el 05-10-2026: Instituciones, Organizaciones
      // (patronales, asociaciones, empresa pública, medios y actores
      // sociales) y la Base de datos de cargos, que antes era la tarjeta
      // negra de Instituciones.
      {
        href: '/institutions',
        etiqueta: 'Instituciones',
        icono: 'ti-building-bank',
        activo: (p) =>
          p.startsWith('/institutions') || (p.startsWith('/instituciones') && !p.startsWith('/instituciones/directorio')),
      },
      {
        href: '/directorio/organizaciones',
        etiqueta: 'Organizaciones',
        icono: 'ti-users',
        activo: (p) => p.startsWith('/directorio/organizaciones'),
      },
      {
        href: '/instituciones/directorio',
        etiqueta: 'Base de datos',
        icono: 'ti-database',
        activo: (p) => p.startsWith('/instituciones/directorio'),
      },
    ],
  },
  // Buscar y enriquecer (07-10-2026, sql/75-76): el buscador de contactos
  // en lenguaje natural, con créditos para enriquecer, y las listas que
  // avisan de los cambios.
  {
    titulo: 'Buscar y enriquecer',
    items: [
      {
        href: '/contactos',
        etiqueta: 'Contactos',
        icono: 'ti-user-search',
        activo: (p) => p.startsWith('/contactos') && !p.startsWith('/contactos/listas'),
      },
      { href: '/contactos/listas', etiqueta: 'Listas', icono: 'ti-list-details', activo: (p) => p.startsWith('/contactos/listas') },
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
  movilAbierto = false,
  onCerrarMovil,
}) {
  const pathname = usePathname() || '/';
  const [plegadoGuardado, setPlegado] = useState(false);
  // En el cajón del móvil siempre desplegado: plegado no cabe el texto.
  const plegado = plegadoGuardado && !movilAbierto;

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
    <aside
      id="gt-menu-principal"
      className={`gt-lat${plegado ? ' plegado' : ''}${movilAbierto ? ' movil-abierto' : ''}`}
      aria-label="Menú principal"
      onClick={(e) => {
        // Un enlace del cajón cierra el cajón, también si es la página en
        // la que ya estás (ahí la ruta no cambia y no se cerraría solo).
        if (movilAbierto && e.target.closest('a')) onCerrarMovil?.();
      }}
    >
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
        <button type="button" className="gt-lat-cerrar" onClick={() => onCerrarMovil?.()} aria-label="Cerrar menú">
          <i className="ti ti-x" aria-hidden="true"></i>
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
        {alarmas &&
          (plegado ? (
            <Link
              href="/alarmas"
              className="gt-lat-anillo"
              title={`${alarmas.usadas} de ${alarmas.limite} ${alarmas.limite === 1 ? 'alarma' : 'alarmas'} · ${esPro ? `${miles(creditosIncluidos(1))} créditos de IA al mes` : 'Plan Free'}`}
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
                  <small>{esPro ? `${miles(creditosIncluidos(1))} créditos de IA al mes` : 'Plan Free · resumen los lunes'}</small>
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
