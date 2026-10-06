'use client';

/**
 * Aviso de Novedades: «Han caducado N leyes que sigues».
 *
 * Una sola novedad para todas las leyes caducadas con la disolución, en
 * lugar de un evento suelto por ley. Lleva a /novedades/disolucion, donde
 * se decide cuáles mantener. Deja de salir cuando el usuario ha decidido
 * (marca resuelto:caducadas-xv) o si no seguía ninguna.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { CLAVE_RESUELTO, FECHA_DISOLUCION, leyesCaducadasQueSigue } from '@/lib/caducadas';

const GRIS = '#8b8780';
const LINEA = '#e6e4dc';
const MORADO = '#6d5aef';

export default function AvisoCaducadas() {
  const supabase = createClient();
  const [leyes, setLeyes] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: marca } = await supabase
          .from('usuario_marcas')
          .select('clave')
          .eq('user_id', user.id)
          .eq('clave', CLAVE_RESUELTO)
          .limit(1)
          .maybeSingle();
        if (marca) return;
        const l = await leyesCaducadasQueSigue(supabase, user.id);
        if (vivo) setLeyes(l);
      } catch {
        // Un fallo aquí no puede romper Novedades: el aviso no sale.
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!leyes || leyes.length === 0) return null;
  const n = leyes.length;

  return (
    <Link
      href="/novedades/disolucion"
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        background: '#fff',
        border: `1px solid ${LINEA}`,
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 16,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: '#efeee9',
          color: '#5f5c56',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 600,
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {n}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: '#1a1a18' }}>
          {n === 1 ? 'Ha caducado 1 ley que sigues' : `Han caducado ${n} leyes que sigues`}
        </span>
        <span style={{ display: 'block', fontSize: 12.5, color: GRIS, marginTop: 2, lineHeight: 1.5 }}>
          Las Cortes se disolvieron el {FECHA_DISOLUCION}. Decide qué mantener para la próxima legislatura.
        </span>
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: MORADO, whiteSpace: 'nowrap' }}>Revisar →</span>
    </Link>
  );
}
