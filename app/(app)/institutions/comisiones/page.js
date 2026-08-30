'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ComisionesTab from '@/components/ComisionesTab';
import PestanasCongreso from '@/components/PestanasCongreso';

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
      // Sin los de gobierno: el titular debe decir lo mismo que muestra la lista.
      supabase.from('es_committees').select('id', { count: 'exact', head: true }).neq('kind', 'gobierno'),
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

      <PestanasCongreso />

      <ComisionesTab />
    </div>
  );
}
