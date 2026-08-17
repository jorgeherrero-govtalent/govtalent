'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import ComisionesTab from '@/components/ComisionesTab';

/**
 * Comisiones del Congreso.
 *
 * Comparte cabecera y pestañas con Diputados y Grupos parlamentarios: son
 * tres vistas del mismo órgano —por persona, por partido y por comisión—
 * y conviene que se sientan como una sola sección.
 */
export default function ComisionesPage() {
  const supabase = createClient();
  const [cifras, setCifras] = useState({ diputados: null, grupos: null, comisiones: null });

  useEffect(() => {
    Promise.all([
      supabase.from('deputies').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('parliamentary_groups').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('es_committees').select('id', { count: 'exact', head: true }),
    ]).then(([d, g, c]) =>
      setCifras({ diputados: d.count ?? null, grupos: g.count ?? null, comisiones: c.count ?? null })
    );
  }, []);

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Congreso de los Diputados</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>
          {cifras.diputados ?? '—'} diputados · {cifras.grupos ?? '—'} grupos · {cifras.comisiones ?? '—'} comisiones ·
          XV Legislatura
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14 }}>
        <Link href="/institutions/deputies" style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}>
          Diputados
        </Link>
        <Link href="/institutions/groups" style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}>
          Grupos parlamentarios
        </Link>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#1d6f5c',
            borderBottom: '2px solid #1d6f5c',
            paddingBottom: 8,
          }}
        >
          Comisiones
        </span>
      </div>

      <ComisionesTab />
    </div>
  );
}
