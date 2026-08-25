'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { getEffectiveTier } from '@/lib/plan';

/**
 * Configuración de la organización.
 *
 * Dos cosas, y las dos con condiciones:
 *
 *   Gestionar equipo    llega con Teams. Se enseña apagado en vez de
 *                       esconderlo: saber que existe es parte de la
 *                       razón para contratarlo.
 *
 *   Desactivar página   quita la organización de la vista pública sin
 *                       borrar nada. NO es eliminar: las ofertas
 *                       publicadas y las candidaturas recibidas son
 *                       datos de terceros, y borrarlos afecta a gente
 *                       que se postuló de buena fe.
 */

const BORDE = '#e0dfd8';

export default function ConfiguracionOrganizacion() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return setCargando(false);
    const { data } = await supabase
      .from('organization_members')
      .select('organizations(id, name, slug, plan, plan_status, trial_ends_at, is_public)')
      .eq('user_id', auth.user.id)
      .limit(1)
      .maybeSingle();
    setOrg(data?.organizations || null);
    setCargando(false);
  }

  async function cambiarVisibilidad(publica) {
    if (!org) return;
    setGuardando(true);
    const { error } = await supabase.from('organizations').update({ is_public: publica }).eq('id', org.id);
    setGuardando(false);
    setConfirmar(false);
    if (error) {
      toast('No se ha podido cambiar la visibilidad');
      return;
    }
    setOrg({ ...org, is_public: publica });
    toast(publica ? 'Tu página vuelve a estar visible' : 'Tu página ya no es visible');
  }

  if (cargando) return <div className="spinner"></div>;
  if (!org) {
    return (
      <div className="empty-state">
        <i className="ti ti-building-off"></i>
        Todavía no administras ninguna organización.
      </div>
    );
  }

  const esTeams = getEffectiveTier(org) === 'pro';
  const visible = org.is_public !== false;

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Configuración</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 22 }}>
        Quién puede gestionar esta página y si aparece en GovTalent.
      </p>

      <div className="card" style={{ padding: '18px 20px', marginBottom: 12, opacity: esTeams ? 1 : 0.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {!esTeams && <i className="ti ti-lock" style={{ fontSize: 15, color: '#8b8780' }}></i>}
          <span style={{ fontSize: 14, fontWeight: 600 }}>Gestionar equipo</span>
          {!esTeams && (
            <span
              style={{
                fontSize: 10.5,
                background: '#f0eefe',
                color: '#3c3489',
                borderRadius: 20,
                padding: '2px 9px',
              }}
            >
              Teams
            </span>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: '#555', lineHeight: 1.6, marginBottom: esTeams ? 12 : 0 }}>
          Invita a compañeros a gestionar las ofertas y los candidatos, y decide qué puede hacer cada uno.
        </p>
        {esTeams && (
          <button className="btn-o" style={{ fontSize: 12.5 }} disabled>
            Próximamente
          </button>
        )}
      </div>

      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          {visible ? 'Desactivar tu página' : 'Reactivar tu página'}
        </div>
        <p style={{ fontSize: 12.5, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>
          {visible ? (
            <>
              Tu página dejará de aparecer en GovTalent y tus ofertas no se mostrarán a nadie. No se borra nada:
              las candidaturas recibidas siguen en Gestionar candidatos, y puedes volver a activarla cuando
              quieras.
            </>
          ) : (
            <>
              Tu página no es visible ahora mismo. Nadie puede encontrarla ni ver tus ofertas.
            </>
          )}
        </p>

        {visible ? (
          <button
            onClick={() => setConfirmar(true)}
            style={{
              background: 'none',
              border: `.5px solid ${BORDE}`,
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12.5,
              color: '#555',
            }}
          >
            Desactivar
          </button>
        ) : (
          <button className="btn-p" style={{ fontSize: 12.5 }} disabled={guardando} onClick={() => cambiarVisibilidad(true)}>
            {guardando ? 'Activando…' : 'Reactivar la página'}
          </button>
        )}
      </div>

      {/* Se pregunta porque afecta a lo que ven terceros: quien tenga tu
          oferta guardada dejará de verla. */}
      {confirmar && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setConfirmar(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h2>Desactivar la página</h2>
              <div className="modal-x" onClick={() => setConfirmar(false)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.65 }}>
              «{org.name}» dejará de aparecer en GovTalent y tus ofertas no se mostrarán. Quien las tuviera
              guardadas dejará de verlas. No se borra nada y puedes reactivarla cuando quieras.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-o" onClick={() => setConfirmar(false)}>
                Cancelar
              </button>
              <button className="btn-ai" disabled={guardando} onClick={() => cambiarVisibilidad(false)}>
                {guardando ? 'Desactivando…' : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: '#999', lineHeight: 1.6, marginTop: 18 }}>
        Para borrar la organización por completo, escríbenos a hola@govtalent.app. Las candidaturas recibidas
        son datos de las personas que se postularon, y hay que tratarlas con cuidado antes de eliminarlas.
      </p>
    </div>
  );
}
