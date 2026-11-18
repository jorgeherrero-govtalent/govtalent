'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Isotipo } from '@/components/Logo';
import { URL_EXTENSION } from '@/lib/extension';

/**
 * Configuración → Extensión de Chrome (18-11-2026).
 *
 * La misma idea que «Asistentes de IA» (components/BloqueAsistentes.js):
 * una tarjeta con lo que es y el botón «Instalar», que abre una guía por
 * pasos con el mismo diseño que la de Claude y ChatGPT, cada paso con su
 * dibujo. Debajo, lo que se puede hacer con ella.
 *
 * La extensión usa la sesión de GovTalent del propio navegador, así que
 * no hay nada que conectar ni que revocar desde aquí.
 */

const BORDE = '#e8e6df';
const GRIS = '#6f6c64';
const MORADO = '#6d5aef';
const TINTA = '#1a1a18';
const CAJA = { background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 10 };

// Los mismos botones que la guía de los asistentes.
const BOTON = { background: MORADO, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const BOTON_FILA = { background: '#fff', color: TINTA, border: `1px solid ${BORDE}`, borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const BOTON_GRIS = { ...BOTON_FILA, background: '#e9e8e2', border: 'none', padding: '8px 14px' };

const PASOS = [
  { dibujo: 'tienda', titulo: 'Añádela a Chrome', texto: 'Abre la ficha de GovTalent en Chrome Web Store, pulsa «Añadir a Chrome» y acepta.' },
  { dibujo: 'fijar', titulo: 'Fíjala en la barra', texto: 'Abre el icono de extensiones de Chrome, la pieza de puzle, y pulsa la chincheta junto a GovTalent para tenerla siempre a mano.' },
  { dibujo: 'sesion', titulo: 'Inicia sesión en GovTalent', texto: 'La extensión usa tu sesión de govtalent.app en ese mismo navegador. Si no has entrado, te lo pide.' },
  { dibujo: 'panel', titulo: 'Ábrela donde estés', texto: 'En un perfil de LinkedIn o en la web de una institución, pulsa el icono de GovTalent: el panel se abre a la derecha.' },
];

const USOS = [
  { icono: 'ti-brand-linkedin', color: '#0a66c2', fondo: '#e8f1fa', titulo: 'En LinkedIn', texto: 'Con un perfil abierto, te dice si esa persona está en GovTalent y te enseña su cargo, su correo y su organización.' },
  { icono: 'ti-world', titulo: 'En cualquier web', texto: 'Reconoce de qué organización es la página y te enseña sus personas. El buscador está siempre visible.' },
  { icono: 'ti-pointer', titulo: 'Con el botón derecho', texto: 'Selecciona un nombre en cualquier página y elige «Buscar en GovTalent».' },
  { icono: 'ti-mail-search', titulo: 'Quien no está en GovTalent', texto: 'Puedes buscar su correo desde el panel, con tus créditos, y guardarlo en una lista.' },
];

// ---------------------------------------------------------------------
// Los dibujos de la guía
// ---------------------------------------------------------------------
//
// Como en la guía de los asistentes: una ventana del navegador sobre el
// fondo «aurora», con lo que hay que pulsar marcado en morado y el cursor
// encima. No copian la pantalla real de Chrome: enseñan dónde está cada
// cosa.

const LINEA = { height: 7, borderRadius: 4, background: '#e6e4dd', display: 'block' };
const MARCA = { boxShadow: `0 0 0 2px ${MORADO}, 0 0 0 6px rgba(109,90,239,.18)`, background: '#f0eefe', borderRadius: 8 };

function Cursor({ style }) {
  return (
    <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true" style={{ position: 'absolute', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', ...style }}>
      <path d="M3 2l15 9.5-6.6 1.3 4 7.6-2.9 1.5-4-7.7L3 18.5z" fill="#fff" stroke={TINTA} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

const Marca = ({ lado = 16 }) => (
  <span style={{ width: lado, height: lado, display: 'inline-flex', flexShrink: 0 }}>
    <Isotipo size={lado} />
  </span>
);

/** La ventana del navegador: los tres puntos, la barra de direcciones y, a la derecha, las extensiones. */
function Navegador({ direccion, barra, children }) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 380, background: '#fff', borderRadius: 12, boxShadow: '0 18px 40px rgba(0,0,0,.35)', overflow: 'hidden', fontSize: 12, color: TINTA }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${BORDE}`, background: '#faf9f5', position: 'relative' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d9d6cd' }}></span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d9d6cd' }}></span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d9d6cd' }}></span>
        <span style={{ flex: 1, marginLeft: 6, height: 20, borderRadius: 10, background: '#efeee8', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 10.5, color: GRIS, overflow: 'hidden', whiteSpace: 'nowrap' }}>{direccion}</span>
        {barra}
      </div>
      {children}
    </div>
  );
}

function Dibujo({ tipo }) {
  let dentro = null;

  if (tipo === 'tienda') {
    dentro = (
      <Navegador direccion="chromewebstore.google.com">
        <div style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center', position: 'relative' }}>
          <span style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Marca lado={26} />
          </span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>GovTalent</span>
            <span style={{ ...LINEA, width: 110 }}></span>
          </div>
          <span style={{ ...MARCA, padding: '7px 11px', fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap' }}>Añadir a Chrome</span>
          <Cursor style={{ right: 26, top: 44 }} />
        </div>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ ...LINEA, width: '92%' }}></span>
          <span style={{ ...LINEA, width: '74%' }}></span>
          <span style={{ ...LINEA, width: '58%' }}></span>
        </div>
      </Navegador>
    );
  } else if (tipo === 'fijar') {
    dentro = (
      <Navegador
        direccion="linkedin.com"
        barra={
          <span style={{ ...MARCA, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-puzzle" style={{ fontSize: 14, color: MORADO }}></i>
          </span>
        }
      >
        <div style={{ minHeight: 150, position: 'relative', padding: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '45%' }}>
            <span style={{ ...LINEA, width: '90%' }}></span>
            <span style={{ ...LINEA, width: '70%' }}></span>
            <span style={{ ...LINEA, width: '80%' }}></span>
          </div>
          <div style={{ position: 'absolute', top: 6, right: 8, width: 190, background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 10, boxShadow: '0 10px 24px rgba(0,0,0,.18)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10.5, color: GRIS, padding: '2px 6px 4px' }}>Extensiones</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px' }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: '#d9d6cd' }}></span>
              <span style={{ ...LINEA, flex: 1 }}></span>
              <i className="ti ti-pin" style={{ fontSize: 13, color: '#b9b6ad' }}></i>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px' }}>
              <Marca />
              <span style={{ flex: 1, fontWeight: 600 }}>GovTalent</span>
              <span style={{ ...MARCA, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-pin" style={{ fontSize: 13, color: MORADO }}></i>
              </span>
            </div>
            <Cursor style={{ right: 4, top: 74 }} />
          </div>
        </div>
      </Navegador>
    );
  } else if (tipo === 'sesion') {
    dentro = (
      <Navegador direccion="govtalent.app">
        <div style={{ padding: '18px 16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'relative' }}>
          <Marca lado={24} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Entra en tu cuenta</span>
          <span style={{ width: 200, height: 26, borderRadius: 7, border: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', padding: '0 9px' }}>
            <span style={{ ...LINEA, width: 90 }}></span>
          </span>
          <span style={{ width: 200, height: 26, borderRadius: 7, border: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', padding: '0 9px' }}>
            <span style={{ ...LINEA, width: 60 }}></span>
          </span>
          <span style={{ ...MARCA, width: 200, textAlign: 'center', padding: '7px 0', fontWeight: 600, boxSizing: 'border-box' }}>Entrar</span>
          <Cursor style={{ right: 96, bottom: 6 }} />
        </div>
      </Navegador>
    );
  } else {
    dentro = (
      <Navegador
        direccion="linkedin.com/in/…"
        barra={
          <span style={{ ...MARCA, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Marca lado={14} />
          </span>
        }
      >
        <div style={{ display: 'flex', minHeight: 150 }}>
          <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ width: 38, height: 38, borderRadius: '50%', background: '#e6e4dd' }}></span>
            <span style={{ ...LINEA, width: '80%', height: 9 }}></span>
            <span style={{ ...LINEA, width: '60%' }}></span>
            <span style={{ ...LINEA, width: '70%' }}></span>
          </div>
          <div style={{ width: 168, borderLeft: `1px solid ${BORDE}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 9, background: '#fcfbf8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#e6e4dd', flexShrink: 0 }}></span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ ...LINEA, width: '90%', height: 8, background: '#cfccc3' }}></span>
                <span style={{ ...LINEA, width: '60%' }}></span>
              </div>
            </div>
            <span style={{ fontSize: 10.5, color: GRIS }}>Cargo</span>
            <span style={{ ...LINEA, width: '85%' }}></span>
            <span style={{ fontSize: 10.5, color: GRIS }}>Correo</span>
            <span style={{ ...LINEA, width: '70%' }}></span>
            <span style={{ fontSize: 10.5, color: GRIS }}>Organización</span>
            <span style={{ ...LINEA, width: '78%' }}></span>
          </div>
        </div>
      </Navegador>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{ position: 'relative', overflow: 'hidden', background: '#0f1b33', borderRadius: 12, padding: '26px 22px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 230 }}
    >
      <span style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: '#3b6fd9', filter: 'blur(64px)', opacity: 0.55, left: -80, top: -90 }}></span>
      <span style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: MORADO, filter: 'blur(72px)', opacity: 0.7, right: -100, bottom: -110 }}></span>
      {dentro}
    </div>
  );
}

// ---------------------------------------------------------------------
// La guía de instalación
// ---------------------------------------------------------------------

function GuiaExtension({ onClose }) {
  const [paso, setPaso] = useState(0);
  const total = PASOS.length;
  const p = PASOS[paso];
  const ultimo = paso === total - 1;

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onClose]);

  return createPortal(
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="guia-ext-titulo" style={{ maxWidth: 520, padding: 0 }}>
        <div className="modal-head" style={{ padding: '18px 22px', marginBottom: 0 }}>
          <h2 id="guia-ext-titulo" style={{ fontSize: 17 }}>
            Instalar la extensión de Chrome
          </h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Cerrar">
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12.5, color: GRIS }}>
            Paso {paso + 1} de {total}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.3px', lineHeight: 1.2 }}>{p.titulo}</div>
          <div style={{ fontSize: 14, color: GRIS, lineHeight: 1.5 }}>{p.texto}</div>

          {paso === 0 && (
            <a href={URL_EXTENSION} target="_blank" rel="noopener noreferrer" style={{ ...BOTON_FILA, alignSelf: 'flex-start', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-brand-chrome" aria-hidden="true"></i>
              Abrir Chrome Web Store
            </a>
          )}

          <Dibujo key={p.dibujo} tipo={p.dibujo} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '14px 22px', borderTop: `1px solid ${BORDE}` }}>
          <button type="button" style={BOTON_GRIS} onClick={onClose}>
            Cancelar
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {paso > 0 && (
              <button type="button" style={BOTON_FILA} onClick={() => setPaso(paso - 1)}>
                Atrás
              </button>
            )}
            <button type="button" style={BOTON} onClick={() => (ultimo ? onClose() : setPaso(paso + 1))}>
              {ultimo ? 'Finalizar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------

export default function BloqueExtension() {
  const [guia, setGuia] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <style>{`
        .ext-usos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 760px) { .ext-usos { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ ...CAJA, padding: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 46, height: 46, borderRadius: 11, background: '#f7f6f2', border: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-brand-chrome" style={{ fontSize: 26, color: TINTA }} aria-hidden="true"></i>
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>GovTalent para Chrome</div>
          <div style={{ fontSize: 13.5, color: GRIS, marginTop: 3, lineHeight: 1.55 }}>
            Consulta GovTalent desde LinkedIn o desde cualquier web: quién es, su cargo, su correo y su organización.
          </div>
        </div>
        <button type="button" className="btn-ai" onClick={() => setGuia(true)}>
          Instalar
        </button>
      </div>

      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 10 }}>Qué puedes hacer</div>
        <div className="ext-usos">
          {USOS.map((u) => (
            <div key={u.titulo} style={{ ...CAJA, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: u.fondo || '#f0eefe', color: u.color || MORADO, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${u.icono}`} style={{ fontSize: 19 }} aria-hidden="true"></i>
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{u.titulo}</div>
                <div style={{ fontSize: 13.5, color: GRIS, marginTop: 2, lineHeight: 1.55 }}>{u.texto}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {guia && <GuiaExtension onClose={() => setGuia(false)} />}
    </div>
  );
}
