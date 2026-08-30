'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import OrganosGobiernoTab from '@/components/OrganosGobiernoTab';
import PestanasCongreso from '@/components/PestanasCongreso';

/**
 * Órganos de gobierno del Congreso.
 *
 * Cuarta vista de la misma sección, junto a Diputados, Grupos
 * parlamentarios y Comisiones. Mesa, Junta de Portavoces y Diputación
 * Permanente no tramitan leyes: gobiernan la cámara, fijan el orden del
 * día y califican las iniciativas. Mezclarlas con las comisiones
 * legislativas obligaba a compararlas con algo que no se les parece.
 */
export default function OrganosGobiernoPage() {
  const supabase = createClient();
  const [cifras, setCifras] = useState({ diputados: null, grupos: null, comisiones: null });

  useEffect(() => {
    Promise.all([
      supabase.from('deputies').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('parliamentary_groups').select('id', { count: 'exact', head: true }).eq('active', true),
      // Sin los de gobierno: el contador de la cabecera debe decir lo
      // mismo que muestra la pestaña de Comisiones.
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

      <OrganosGobiernoTab />
    </div>
  );
}
