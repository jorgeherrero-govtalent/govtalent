'use client';

import { useEffect, useState } from 'react';
import { subscribeToast } from '@/lib/toast';

/**
 * Los avisos que aparecen abajo a la derecha.
 *
 * Fondo oscuro sobre el fondo claro de la plataforma: destaca sin
 * necesidad de sombras fuertes ni bordes. Es lo que hacen Linear y
 * Vercel.
 *
 * El color del icono dice qué ha pasado —confirmación, información o
 * error— en vez de salir verde siempre, que era el problema del anterior.
 *
 * Los estilos van en línea y no en la clase .toast del CSS: así el
 * aspecto vive junto al componente y no hay que buscarlo en otro
 * archivo para cambiar un color.
 */

const ESTILOS = {
  success: { icon: 'check', color: '#4ade9f' },
  info: { icon: 'info-circle', color: '#a5a0f5' },
  error: { icon: 'alert-circle', color: '#fb923c' },
};

export default function Toast() {
  const [avisos, setAvisos] = useState([]);

  useEffect(() => {
    function alRecibir(aviso) {
      // Compatibilidad: si alguien llama al emisor antiguo con una
      // cadena, se envuelve como confirmación.
      const a = typeof aviso === 'string' ? { id: Date.now(), msg: aviso, type: 'success', duration: 4000 } : aviso;
      // Como mucho tres a la vez: pulsando seguir varias veces seguidas
      // se acumularían y taparían media pantalla. Los más antiguos salen.
      setAvisos((prev) => [...prev, a].slice(-3));
      setTimeout(() => {
        setAvisos((prev) => prev.filter((x) => x.id !== a.id));
      }, a.duration || 4000);
    }
    // subscribeToast devuelve la función para darse de baja, así no hay
    // que acordarse de llamar a removeToastListener.
    return subscribeToast(alRecibir);
  }, []);

  if (avisos.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        maxWidth: 'min(360px, calc(100vw - 40px))',
        pointerEvents: 'none',
      }}
      role="status"
      aria-live="polite"
    >
      {avisos.map((a) => {
        const e = ESTILOS[a.type] || ESTILOS.success;
        return (
          <div
            key={a.id}
            style={{
              background: '#292524',
              borderRadius: 9,
              padding: '12px 14px',
              display: 'flex',
              gap: 12,
              alignItems: a.action ? 'center' : 'flex-start',
              boxShadow: '0 8px 24px rgba(0,0,0,.18)',
              pointerEvents: 'auto',
              animation: 'gt-toast-in .18s ease-out',
            }}
          >
            <i
              className={`ti ti-${e.icon}`}
              style={{ fontSize: 14, color: e.color, flexShrink: 0, marginTop: a.action ? 0 : 2 }}
              aria-hidden="true"
            ></i>
            <div style={{ fontSize: 12.5, color: '#e7e5e4', lineHeight: 1.5, flex: 1, minWidth: 0 }}>{a.msg}</div>
            {a.action && (
              <button
                type="button"
                onClick={() => {
                  a.action.onClick?.();
                  setAvisos((prev) => prev.filter((x) => x.id !== a.id));
                }}
                style={{
                  fontSize: 12,
                  color: '#a5a0f5',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {a.action.label}
              </button>
            )}
          </div>
        );
      })}

      <style jsx global>{`
        @keyframes gt-toast-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
