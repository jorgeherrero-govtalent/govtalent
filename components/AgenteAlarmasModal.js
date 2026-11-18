'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ESTILOS } from '@/components/licitaciones/NuevaBusqueda';

// La misma clave que exporta AlarmasTab. Se repite aquí para no cargar
// ese componente entero en el menú solo por una cadena.
const CLAVE_PEDIDO = 'govtalent.alarmas.pedido';

const MORADO = '#6d5aef';

// Las rutas para configurar el agente. Cada una cambia lo que se pide en
// la caja y sus ejemplos; «prefijo» se antepone a lo escrito para que el
// agente sepa qué tipo de monitorización se le pide.
const OPCIONES = [
  {
    v: 'propio',
    label: 'Crea tu propio agente',
    icono: 'ti-sparkles',
    titulo: 'Describe la normativa a monitorizar',
    hueco: 'Normas y consultas que afecten a una aseguradora con sede en Madrid',
    ejemplos: ['Ayudas y subvenciones a la rehabilitación de vivienda', 'Fiscalidad de las bebidas azucaradas', 'Regulación de la inteligencia artificial'],
  },
  {
    v: 'sector',
    label: 'Todo lo que afecte a un sector',
    icono: 'ti-building-factory-2',
    titulo: 'Describe el sector a monitorizar',
    hueco: 'Aseguradoras de salud con actividad en toda España',
    prefijo: 'Todo lo que afecte a este sector',
    ejemplos: ['Energías renovables', 'Industria farmacéutica', 'Banca y medios de pago'],
  },
  {
    v: 'ley',
    label: 'Los cambios de una ley concreta',
    icono: 'ti-file-text',
    titulo: 'Escribe la ley a monitorizar',
    hueco: 'Ley de Servicios de Atención a la Clientela',
    prefijo: 'Los cambios y la tramitación de esta ley',
    ejemplos: ['Ley de Vivienda', 'Reglamento europeo de IA', 'Ley General de Telecomunicaciones'],
  },
  {
    v: 'comision',
    label: 'Iniciativas de la Comisión Europea',
    icono: 'ti-building-bank',
    titulo: 'Describe el tema a monitorizar en la Comisión Europea',
    hueco: 'Propuestas y consultas sobre envases y residuos de envases',
    prefijo: 'Las iniciativas, propuestas y consultas de la Comisión Europea sobre este tema',
    ejemplos: ['Inteligencia artificial', 'Servicios digitales', 'Productos farmacéuticos'],
  },
  {
    v: 'territorio',
    label: 'Normativa de un territorio',
    icono: 'ti-map-pin',
    titulo: 'Escribe la comunidad autónoma y el tema',
    hueco: 'Turismo y vivienda de uso turístico en Canarias',
    prefijo: 'La normativa de este territorio',
    ejemplos: ['Comercio en Cataluña', 'Juego en la Comunidad de Madrid', 'Energía en Andalucía'],
  },
];

/**
 * «AI Agent» del menú (18-11-2026): la ventana para crear un agente, con
 * el mismo diseño que «Búsqueda de contactos» (components/contactos/
 * NuevaBusquedaContactos.js): a la izquierda las rutas para configurarlo y a
 * la derecha una sola caja.
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
  const [ruta, setRuta] = useState('propio');
  const op = OPCIONES.find((o) => o.v === ruta) || OPCIONES[0];
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

  function elegir(v) {
    setRuta(v);
    setTexto('');
    setTimeout(() => cajaRef.current?.focus(), 0);
  }

  function enviar(e) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t) {
      cajaRef.current?.focus();
      return;
    }
    try {
      window.sessionStorage.setItem(CLAVE_PEDIDO, op.prefijo ? `${op.prefijo}: ${t}` : t);
    } catch {}
    onClose();
    // AlarmasTab solo lee el pedido al cargar: si ya estamos allí, se recarga.
    if (pathname.startsWith('/alarmas')) window.location.assign('/alarmas');
    else router.push('/alarmas');
  }

  function usarIdea(idea) {
    setTexto(idea);
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
        <nav className="gt-nb-izq" aria-label="Tipo de agente">
          <b className="gt-nb-h">AI Agent</b>
          {OPCIONES.map((o) => (
            <button
              key={o.v}
              type="button"
              className={`gt-nb-op${o.v === ruta ? ' on' : ''}`}
              onClick={() => elegir(o.v)}
              aria-current={o.v === ruta ? 'true' : undefined}
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
            <i className="ti ti-sparkles" style={{ color: MORADO }} aria-hidden="true" /> Agente con IA
          </span>
          <div className="gt-nb-centro">
            <b className="gt-nb-pregunta">{op.titulo}</b>
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
                  placeholder={op.hueco}
                  aria-label={op.titulo}
                  maxLength={600}
                />
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="gt-nb-enviar" disabled={!texto.trim()} aria-label="Crear el agente">
                  <i className="ti ti-arrow-up" aria-hidden="true" />
                </button>
              </span>
            </form>
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640 }}>
              {op.ejemplos.map((idea) => (
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
