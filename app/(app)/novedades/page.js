'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AlarmasTab from '@/components/AlarmasTab';
import SeguimientoLista from '@/components/SeguimientoLista';
import AgenteAlarmasModal from '@/components/AgenteAlarmasModal';

/**
 * Seguimiento (así se llama la pantalla desde el 18-11-2026; la ruta sigue
 * siendo /novedades): la bandeja de lo que te afecta y lo que sigues.
 * Arriba, «Tus agentes» y «Nuevo agente», que abre la ventana del agente.
 *
 *   «Novedades»      lo que encuentran tus alarmas y lo que cambia en lo
 *                    que sigues, en una lista. Comparte componente con
 *                    /alarmas, donde se crean y editan.
 *   «Lo que sigues»  las normas, personas e instituciones que sigues, por
 *                    fuente (?ver=seguimiento).
 *
 * Cada novedad se abre en una ventana (AlarmasTab), no en otra página.
 */

const PESTANAS = [
  { v: 'novedades', etiqueta: 'Novedades' },
  { v: 'seguimiento', etiqueta: 'Lo que sigues' },
];

function Novedades() {
  const router = useRouter();
  const sp = useSearchParams();
  const ver = sp?.get('ver') === 'seguimiento' ? 'seguimiento' : 'novedades';
  const [agente, setAgente] = useState(false);

  return (
    <>
      <div className="sec" style={{ maxWidth: 1040, paddingBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-.3px' }}>Seguimiento</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/alarmas" className="btn-o" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <i className="ti ti-adjustments-horizontal" aria-hidden="true"></i>
              Tus agentes
            </Link>
            <button type="button" className="btn-ai" onClick={() => setAgente(true)}>
              <i className="ti ti-sparkles" aria-hidden="true"></i>
              Nuevo agente
            </button>
          </div>
        </div>
        <div role="tablist" aria-label="Seguimiento" style={{ display: 'flex', gap: 22, borderBottom: '1px solid #e5e4de' }}>
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
                  fontSize: 14.5,
                  fontWeight: on ? 600 : 500,
                  padding: '4px 0 10px',
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
      {agente && <AgenteAlarmasModal onClose={() => setAgente(false)} />}
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
