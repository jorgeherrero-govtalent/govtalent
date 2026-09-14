'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { teamSeats, esPlanTeams } from '@/lib/plan';

// Etiquetas de rol. De momento son informativas: no restringen el acceso a
// ningún módulo, y eso se dice explícitamente en la interfaz para que nadie
// asigne un rol creyendo que así cierra el acceso a una parte del producto.
const ROLES = {
  admin: 'Administrador',
  editor: 'Miembro',
};

function iniciales(nombre, email) {
  const base = (nombre || '').trim();
  if (base) {
    const partes = base.split(/\s+/);
    return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
  }
  return (email || '?').slice(0, 2).toUpperCase();
}

/**
 * El equipo de la organización.
 *
 * Solo tiene sentido en Teams: el resto de planes son de un usuario. El
 * plan en sí vive en la pestaña Plan, no aquí.
 */
export default function BloqueEquipo({ org }) {
  const supabase = createClient();
  const [miembros, setMiembros] = useState(null);

  const esTeams = esPlanTeams(org);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      if (!org?.id || !esTeams) return;
      const { data } = await supabase
        .from('organization_members')
        .select('user_id, role, users(first_name, last_name, email)')
        .eq('organization_id', org.id);
      if (!cancelado) setMiembros(data || []);
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, esTeams]);

  if (!esTeams) return null;

  const plazas = teamSeats(org);
  const usados = miembros?.length ?? null;
  const libres = usados === null ? null : Math.max(0, plazas - usados);

  return (
    <div className="card" style={{ padding: 20, marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 11, color: '#a8a49c', letterSpacing: '.4px' }}>EQUIPO</span>
        <span style={{ fontSize: 12, color: '#a8a49c' }}>
          {libres === null
            ? ''
            : libres === 0
              ? 'Sin plazas libres'
              : `${libres} ${libres === 1 ? 'plaza libre' : 'plazas libres'} de ${plazas}`}
        </span>
      </div>

      {(miembros || []).map((m, i) => {
        const p = m.users || {};
        const nombre = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        return (
          <div
            key={m.user_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderTop: i === 0 ? 'none' : '.5px solid #f7f6f3',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: m.role === 'admin' ? '#f0eefe' : '#e8f4f0',
                color: m.role === 'admin' ? '#3c3489' : '#0f6e56',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {iniciales(nombre, p.email)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#1a1a18' }}>{nombre || p.email}</div>
              {nombre && <div style={{ fontSize: 11.5, color: '#a8a49c' }}>{p.email}</div>}
            </div>
            <span
              style={{
                fontSize: 11.5,
                background: '#f5f4f1',
                color: '#57534e',
                borderRadius: 6,
                padding: '5px 10px',
                whiteSpace: 'nowrap',
              }}
            >
              {ROLES[m.role] || m.role}
            </span>
          </div>
        );
      })}

      <p style={{ fontSize: 11.5, color: '#a8a49c', margin: '12px 0 0', lineHeight: 1.55 }}>
        Por ahora los roles son informativos: todos los miembros acceden a todos los módulos.
      </p>

      {libres === 0 && (
        <p style={{ fontSize: 12.5, color: '#8b8780', margin: '10px 0 0', lineHeight: 1.6 }}>
          ¿Necesitáis más de {plazas} personas? Escríbenos a{' '}
          <a href="mailto:hola@govtalent.app" style={{ color: '#1d6f5c' }}>
            hola@govtalent.app
          </a>
          .
        </p>
      )}
    </div>
  );
}
