'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AlarmasTab from '@/components/AlarmasTab';
import SeguimientoLista from '@/components/SeguimientoLista';

/**
 * Novedades: la bandeja de lo que te afecta y, desde el 18-11-2026, también
 * lo que sigues (antes, la página Seguimiento).
 *
 *   «Novedades»      lo que encuentran tus alarmas y lo que cambia en lo
 *                    que sigues, en una lista. Comparte componente con
 *                    /alarmas, donde se crean y editan.
 *   «Lo que sigues»  las normas, personas e instituciones que sigues, por
 *                    fuente (?ver=seguimiento).
 *
 * Las dos pestañas hacen de título de la página.
 */

const PESTANAS = [
  { v: 'novedades', etiqueta: 'Novedades' },
  { v: 'seguimiento', etiqueta: 'Lo que sigues' },
];

function Novedades() {
  const router = useRouter();
  const sp = useSearchParams();
  const ver = sp?.get('ver') === 'seguimiento' ? 'seguimiento' : 'novedades';

  return (
    <>
      <div className="sec" style={{ maxWidth: 1040, paddingBottom: 0 }}>
        <div role="tablist" aria-label="Novedades" style={{ display: 'flex', gap: 22, borderBottom: '1px solid #e5e4de' }}>
          {PESTANAS.map((p) => {
            const on = ver === p.v;
            return (
              <button
                key={p.v}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => router.replace(p.v === 'seguimiento' ? '/novedades?ver=seguimiento' : '/novedades', { scroll: false })}
                style={{
                  font: 'inherit',
                  fontSize: 21,
                  fontWeight: 600,
                  letterSpacing: '-.3px',
                  padding: '4px 0 12px',
                  border: 'none',
                  borderBottom: `2px solid ${on ? '#1a1a18' : 'transparent'}`,
                  marginBottom: -1,
                  background: 'none',
                  color: on ? '#1a1a18' : '#8b8780',
                  cursor: 'pointer',
                }}
              >
                {p.etiqueta}
              </button>
            );
          })}
        </div>
      </div>
      {ver === 'seguimiento' ? (
        <SeguimientoLista />
      ) : (
        <div className="sec" style={{ maxWidth: 1040 }}>
          <AlarmasTab seccion="novedades" sinTitulo />
        </div>
      )}
    </>
  );
}

export default function NovedadesPage() {
  return (
    <Suspense
      fallback={
        <div className="sec" style={{ maxWidth: 1040 }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <Novedades />
    </Suspense>
  );
}
