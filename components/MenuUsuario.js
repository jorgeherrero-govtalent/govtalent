'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { planLabel } from '@/lib/plan';

/**
 * El menú de la esquina: quién eres, qué plan tienes, en qué contexto
 * trabajas y cómo sumar tu organización.
 *
 * POR QUÉ UNO SOLO Y NO DOS. Antes había el menú "Tú" y, al lado, un
 * enlace a "Mi organización". Añadir encima un selector de contexto
 * habría dejado tres sitios distintos para preguntas muy parecidas.
 * Fundidos, el día que creas una organización aparece en la lista sin
 * que el menú cambie de forma.
 *
 * EL CONTEXTO NO ES UN ESTADO GUARDADO: lo decide la ruta. El selector
 * navega, y así un enlace siempre lleva a donde dice que lleva.
 */

const MORADO = '#6d5aef';
const VERDE = '#1d6f5c';
const BORDE = '#e0dfd8';

export default function MenuUsuario({
  user,
  organizaciones = [],
  enOrganizacion = null,
  tieneOfertas = false,
  onSignOut,
  // 'barra': el «Tú ▾» de la barra superior (móvil y páginas públicas).
  // 'lateral': el selector de arriba del menú lateral, como el espacio de
  // trabajo de Enginy; el panel se abre debajo y alineado a la izquierda.
  variante = 'barra',
  // Con el menú lateral plegado solo se ve el avatar.
  compacto = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0, left: null });
  const lateral = variante === 'lateral';
  const boton = useRef(null);

  const inicial = (user?.first_name || user?.email || '·').charAt(0).toUpperCase();
  const esPro = user?.plan === 'pro';

  function abrir() {
    const r = boton.current?.getBoundingClientRect();
    if (r && lateral) setPos({ top: r.bottom + 6, right: null, left: Math.max(12, r.left) });
    else if (r) setPos({ top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right), left: null });
    setAbierto(true);
  }

  useEffect(() => {
    if (!abierto) return;
    function tecla(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierto]);

  const fila = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '8px 9px',
    borderRadius: 8,
    textDecoration: 'none',
    color: '#555',
    fontSize: 12.5,
    width: '100%',
    background: 'none',
    border: 'none',
    textAlign: 'left',
  };

  // En el lateral se nombra el contexto en el que estás: la organización
  // si estás en su panel, si no tú. Es lo que enseña Enginy arriba.
  const orgActiva = enOrganizacion ? organizaciones.find((o) => o.slug === enOrganizacion) : null;
  const nombreContexto = orgActiva
    ? orgActiva.name
    : [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'Tu cuenta';
  const imagenContexto = orgActiva ? orgActiva.logo_url : user?.avatar_url;
  const inicialContexto = (orgActiva ? orgActiva.name : user?.first_name || user?.email || '·').charAt(0).toUpperCase();

  return (
    <div className={lateral ? 'gt-lat-yo' : 'nav-me'}>
      {lateral ? (
        <button
          type="button"
          className="gt-lat-ctx"
          ref={boton}
          onClick={() => (abierto ? setAbierto(false) : abrir())}
          aria-expanded={abierto}
          aria-haspopup="menu"
          title={compacto ? nombreContexto : undefined}
        >
          <span className={`gt-lat-ctx-av${orgActiva ? ' org' : ''}`}>
            {imagenContexto ? <img src={imagenContexto} alt="" /> : inicialContexto}
          </span>
          {!compacto && (
            <>
              <span className="gt-lat-ctx-n">{nombreContexto}</span>
              <i className={`ti ${abierto ? 'ti-chevron-up' : 'ti-chevron-down'}`} aria-hidden="true"></i>
            </>
          )}
        </button>
      ) : (
        <div
          className="ni"
          ref={boton}
          onClick={() => (abierto ? setAbierto(false) : abrir())}
          aria-expanded={abierto}
          aria-haspopup="menu"
        >
          <div className="nav-av">{user?.avatar_url ? <img src={user.avatar_url} alt="" /> : inicial}</div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            Tú <i className={`ti ${abierto ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 12 }}></i>
          </span>
        </div>
      )}

      {abierto &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div onClick={() => setAbierto(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }}></div>
            <div
              role="menu"
              style={{
                position: 'fixed',
                top: pos.top,
                ...(pos.left !== null ? { left: pos.left } : { right: pos.right }),
                width: 292,
                maxWidth: 'calc(100vw - 24px)',
                background: '#fff',
                border: `.5px solid ${BORDE}`,
                borderRadius: 12,
                boxShadow: '0 6px 24px rgba(0,0,0,.12)',
                padding: 7,
                zIndex: 301,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px' }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: '#e8f4f0',
                    color: VERDE,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    inicial
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{esPro ? 'Con suscripción' : 'Plan Free'}</div>
                </div>
                {!enOrganizacion && (
                  <i className="ti ti-check" style={{ fontSize: 14, color: VERDE, flexShrink: 0 }}></i>
                )}
              </div>

              {/* El upsell vive donde ya miras tu plan. Nada permanente en
                  la barra: una pastilla pidiendo dinero todo el rato deja
                  de mirarse y ocupa la esquina de la campana. */}
              {!esPro && (
                <div
                  style={{
                    background: '#faf9ff',
                    border: `.5px solid #d8d3f5`,
                    borderRadius: 9,
                    padding: '10px 11px',
                    margin: '4px 2px 8px',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Vigilancia normativa</div>
                  <div style={{ fontSize: 11.5, color: '#555', lineHeight: 1.5, marginBottom: 9 }}>
                    Seguimiento, alertas y proyectos.
                  </div>
                  {/* En pestaña nueva, igual que los demás enlaces a
                      precios de la aplicación: se está mirando algo y
                      consultar los planes no debería costar el sitio. */}
                  <Link
                    href="/precios"
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setAbierto(false)}
                    style={{
                      display: 'inline-block',
                      fontSize: 11.5,
                      background: MORADO,
                      color: '#fff',
                      padding: '5px 12px',
                      borderRadius: 7,
                      textDecoration: 'none',
                    }}
                  >
                    Ver planes
                  </Link>
                </div>
              )}

              {/* Sin organizaciones el título quedaba solo sobre un
                  hueco. */}
              {organizaciones.length > 0 && (
                <div
                  style={{
                    fontSize: 10,
                    color: '#a8a49c',
                    letterSpacing: '.3px',
                    padding: '6px 9px 5px',
                    borderTop: `.5px solid ${BORDE}`,
                    marginTop: 4,
                  }}
                >
                  ORGANIZACIONES
                </div>
              )}

              {organizaciones.map((o) => {
                const activa = enOrganizacion === o.slug;
                return (
                  <Link
                    key={o.slug}
                    href="/account"
                    onClick={() => setAbierto(false)}
                    style={{ ...fila, background: activa ? '#e8f4f0' : 'none' }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: '#f0f0eb',
                        border: `.5px solid ${BORDE}`,
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#7a736b',
                      }}
                    >
                      {o.logo_url ? (
                        <img src={o.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        (o.name || '?').charAt(0).toUpperCase()
                      )}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: activa ? '#1a1a18' : '#555',
                          fontWeight: activa ? 500 : 400,
                        }}
                      >
                        {o.name}
                      </span>
                      {/* El plan, debajo del nombre. Antes había un enlace
                          suelto llamado "Plan de la organización" que no
                          decía cuál era. */}
                      <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 1 }}>
                        Plan {planLabel(o)}
                      </span>
                    </span>
                    {activa && <i className="ti ti-check" style={{ fontSize: 14, color: VERDE, flexShrink: 0 }}></i>}
                  </Link>
                );
              })}


              {/* «Anuncia un empleo gratis» y «Ver mi perfil» están ocultos
                  desde el 04-10-2026, con Empleos y Organizaciones (ver
                  RUTAS_OCULTAS en middleware.js). */}

              <div style={{ borderTop: `.5px solid ${BORDE}`, marginTop: 6, paddingTop: 5 }}>
                <Link href="/account" onClick={() => setAbierto(false)} style={fila}>
                  <i className="ti ti-settings" style={{ fontSize: 15, width: 24, textAlign: 'center' }}></i>
                  Configuración
                </Link>
                {user?.role === 'platform_admin' && (
                  <Link href="/backoffice" onClick={() => setAbierto(false)} style={fila}>
                    <i
                      className="ti ti-shield-lock"
                      style={{ fontSize: 15, width: 24, textAlign: 'center', color: MORADO }}
                    ></i>
                    Acceso Backoffice
                  </Link>
                )}
                <button
                  onClick={() => {
                    setAbierto(false);
                    onSignOut();
                  }}
                  style={fila}
                >
                  <i className="ti ti-logout" style={{ fontSize: 15, width: 24, textAlign: 'center' }}></i>
                  Cerrar sesión
                </button>
              </div>

              {/* Dentro de la aplicación ya no hay pie de página: los
                  enlaces legales viven aquí. */}
              {lateral && (
                <div
                  style={{
                    borderTop: `.5px solid ${BORDE}`,
                    marginTop: 5,
                    padding: '8px 9px 3px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px 12px',
                    fontSize: 11,
                  }}
                >
                  {[
                    ['/legal', 'Aviso legal'],
                    ['/privacidad', 'Privacidad'],
                    ['/condiciones', 'Condiciones'],
                    ['/cookies', 'Cookies'],
                  ].map(([href, txt]) => (
                    <Link key={href} href={href} onClick={() => setAbierto(false)} style={{ color: '#8b8780', textDecoration: 'none' }}>
                      {txt}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
