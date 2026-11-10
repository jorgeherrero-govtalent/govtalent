'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Las caras de la ilustración de Instituciones en la portada de Directorio:
 * los cinco primeros miembros del Gobierno en orden de protocolo, leídos de
 * government_members para que cambien solos con cada remodelación. Mientras
 * cargan (o si alguno no tiene foto) se ve un círculo gris.
 */
const TONOS = ['#d9d6cc', '#c9c5b9', '#e1ded5', '#bfbbae', '#d2cec3'];

export default function DirectorioCaras() {
  const [miembros, setMiembros] = useState(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('government_members')
      .select('full_name, photo_url, foto_storage_url, order_index')
      .eq('active', true)
      .order('order_index', { ascending: true })
      .limit(5)
      .then(({ data }) => setMiembros(data || []));
  }, []);

  const lista = miembros && miembros.length ? miembros : TONOS.map(() => null);
  return (
    <span style={{ display: 'flex', paddingLeft: 7 }}>
      {lista.map((m, i) => {
        const foto = m && (m.foto_storage_url || m.photo_url);
        const estilo = { width: 30, height: 30, borderRadius: '50%', border: '2px solid #fff', marginLeft: -7, flexShrink: 0, background: TONOS[i % TONOS.length] };
        return foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={foto} alt={m.full_name} title={m.full_name} loading="lazy" style={{ ...estilo, objectFit: 'cover', objectPosition: 'center top' }} />
        ) : (
          <span key={i} style={estilo} />
        );
      })}
    </span>
  );
}
