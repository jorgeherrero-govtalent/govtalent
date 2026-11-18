'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ESTILOS } from '@/components/licitaciones/NuevaBusqueda';

// La misma clave que exporta AlarmasTab. Se repite aquí para no cargar
// ese componente entero en el menú solo por una cadena.
const CLAVE_PEDIDO = 'govtalent.alarmas.pedido';

const MORADO = '#6d5aef';

// Las mismas ideas que en la página de Alarmas: el mismo agente.
const IDEAS = ['Todo lo que afecte a mi sector', 'Los cambios de una ley concreta', 'Consultas públicas de un ministerio'];

const OPCIONES = [
  { v: 'crear', label: 'Describe lo que quieres vigilar', icono: 'ti-sparkles' },
  { v: 'alarmas', label: 'Tus alarmas', icono: 'ti-bell', href: '/alarmas' },
  { v: 'novedades', label: 'Lo que han detectado', icono: 'ti-inbox', href: '/novedades' },
];

/**
 * «AI Agent» del menú (18-11-2026): la ventana para crear una alarma, con
 * el mismo diseño que «Búsqueda de contactos» (components/contactos/
 * NuevaBusquedaContactos.js): opciones a la izquierda y una sola caja a la
 * derecha.
 *
 * Lo que se escribe no se procesa aquí: se guarda en la pestaña y se abre
 * /alarmas, que se lo pide al agente con su progreso a la vista
 * (AlarmasTab lee CLAVE_PEDIDO al cargar). Los límites por plan también
 * se aplican allí.
 */
export default function AgenteAlarmasModal({ onClose }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const cajaRef = useRef(null);
  const [texto, setTexto] = useState('');
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    const tecla = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = antes;
    };
  }, [onClose]);

  function ir(href) {
    onClose();
    router.push(href);
  }

  function enviar(e) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t) {
      cajaRef.current?.focus();
      return;
    }
    try {
      window.sessionStorage.setItem(CLAVE_PEDIDO, t);
    } catch {}
    onClose();
    // AlarmasTab solo lee el pedido al cargar: si ya estamos allí, se recarga.
    if (pathname.startsWith('/alarmas')) window.location.assign('/alarmas');
    else router.push('/alarmas');
  }

  function usarIdea(idea) {
    setTexto(`${idea}: `);
    setTimeout(() => {
      const el = cajaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  }

  if (!montado) return null;

  return createPortal(
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{ESTILOS}</style>
      <div className="gt-nb" role="dialog" aria-modal="true" aria-label="AI Agent">
        <nav className="gt-nb-izq" aria-label="Alarmas">
          <b className="gt-nb-h">AI Agent</b>
          {OPCIONES.map((o) => (
            <button
              key={o.v}
              type="button"
              className={`gt-nb-op${o.v === 'crear' ? ' on' : ''}`}
              onClick={() => (o.href ? ir(o.href) : cajaRef.current?.focus())}
              aria-current={o.v === 'crear' ? 'true' : undefined}
            >
              <span className="gt-nb-op-ic">
                <i className={`ti ${o.icono}`} aria-hidden="true" />
              </span>
              <span style={{ flex: 1 }}>{o.label}</span>
            </button>
          ))}
        </nav>
        <div className="gt-nb-der">
          <button type="button" className="modal-x gt-nb-cerrar" onClick={onClose} aria-label="Cerrar">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
          <span className="gt-nb-etq">
            <i className="ti ti-sparkles" style={{ color: MORADO }} aria-hidden="true" /> Alarma con IA
          </span>
          <div className="gt-nb-centro">
            <b className="gt-nb-pregunta">¿Qué quieres vigilar?</b>
            <form onSubmit={enviar} className="gt-nb-caja">
              <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <i className="ti ti-sparkles" style={{ color: MORADO, fontSize: 18, marginTop: 2 }} aria-hidden="true" />
                <textarea
                  ref={cajaRef}
                  autoFocus
                  rows={3}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) enviar(e);
                  }}
                  placeholder="Normas y consultas que afecten a una aseguradora con sede en Madrid"
                  aria-label="Describe lo que quieres vigilar"
                  maxLength={600}
                />
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="gt-nb-enviar" disabled={!texto.trim()} aria-label="Crear la alarma">
                  <i className="ti ti-arrow-up" aria-hidden="true" />
                </button>
              </span>
            </form>
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640 }}>
              {IDEAS.map((idea) => (
                <button key={idea} type="button" className="gt-nb-sug" onClick={() => usarIdea(idea)}>
                  {idea}
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
