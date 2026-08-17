'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import LeyesList from '@/components/LeyesList';
import ActividadList from '@/components/ActividadList';

/**
 * Actividad parlamentaria del Congreso.
 *
 * Tres pestañas porque son cosas distintas: las leyes crean norma y
 * tienen recorrido, plazos y ponentes; las proposiciones no de ley piden
 * algo al Gobierno; las comparecencias son alguien que va a explicarse.
 *
 * Con 4.465 PNL y 3.025 comparecencias frente a 517 leyes, mezclarlas en
 * una sola lista haría desaparecer lo más accionable.
 */

const PESTANAS = [
  { id: 'leyes', label: 'Leyes' },
  { id: 'pnl', label: 'Proposiciones no de ley' },
  { id: 'comparecencia', label: 'Comparecencias' },
];

function FlagES() {
  return (
    <span
      role="img"
      aria-label="España"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 20,
        height: 14,
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ height: '25%', background: '#C60B1E' }} />
      <span style={{ height: '50%', background: '#FFC400' }} />
      <span style={{ height: '25%', background: '#C60B1E' }} />
    </span>
  );
}

// useSearchParams obliga a envolver en Suspense: sin él la compilación
// falla al prerenderizar.
export default function ActividadPage() {
  return (
    <Suspense
      fallback={
        <div className="sec" style={{ maxWidth: 1000 }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <Actividad />
    </Suspense>
  );
}

function Actividad() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [cifras, setCifras] = useState({ leyes: null, pnl: null, comparecencia: null });

  // La pestaña vive en la URL para que se pueda compartir y el atrás del
  // navegador la deshaga.
  const tab = useMemo(() => {
    const t = searchParams.get('tipo');
    return PESTANAS.some((p) => p.id === t) ? t : 'leyes';
  }, [searchParams]);

  function cambiarTab(id) {
    const p = new URLSearchParams(searchParams.toString());
    if (id === 'leyes') p.delete('tipo');
    else p.set('tipo', id);
    // Los filtros de la pestaña anterior no valen en la nueva.
    p.delete('comision');
    router.push(`/congreso${p.toString() ? `?${p.toString()}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    Promise.all([
      supabase.from('es_initiatives').select('num_expediente', { count: 'exact', head: true }),
      supabase.from('es_activity').select('num_expediente', { count: 'exact', head: true }).eq('kind', 'pnl'),
      supabase.from('es_activity').select('num_expediente', { count: 'exact', head: true }).eq('kind', 'comparecencia'),
    ]).then(([l, p, c]) =>
      setCifras({ leyes: l.count ?? null, pnl: p.count ?? null, comparecencia: c.count ?? null })
    );
  }, []);

  return (
    <div className="sec" style={{ maxWidth: 1000 }}>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
        <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
          Regulatorio
        </Link>
        {' › '}
        <span style={{ color: '#666' }}>Actividad parlamentaria</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <FlagES />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Actividad parlamentaria</h1>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Congreso de los Diputados · XV Legislatura</p>
      </div>

      <div style={{ display: 'flex', gap: 22, borderBottom: '.5px solid #e0dfd8', marginBottom: 15, overflowX: 'auto' }}>
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => cambiarTab(p.id)}
            style={{
              fontSize: 13,
              fontWeight: tab === p.id ? 600 : 400,
              color: tab === p.id ? '#6d5aef' : '#888',
              border: 'none',
              borderBottom: `2px solid ${tab === p.id ? '#6d5aef' : 'transparent'}`,
              background: 'none',
              padding: '0 0 9px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {p.label}{' '}
            <span style={{ color: tab === p.id ? '#a99ff0' : '#bbb' }}>
              {cifras[p.id] === null ? '' : cifras[p.id].toLocaleString('es-ES')}
            </span>
          </button>
        ))}
      </div>

      {tab === 'leyes' ? <LeyesList /> : <ActividadList kind={tab} />}
    </div>
  );
}
