'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const UPCOMING = [
  'Registro de reuniones institucionales.',
  'Trazabilidad de proyectos regulatorios.',
  'Huella de actividad e influencia.',
  'Evidencias de buenas prácticas.',
  'Indicadores públicos de transparencia e integridad.',
];

export default function InfluenceLogPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();

    if (!membership) return setLoading(false);
    setOrg(membership.organizations);
    setLoading(false);
  }

  async function togglePledge() {
    const next = !org.transparency_pledge;
    setSaving(true);
    const { error } = await supabase
      .from('organizations')
      .update({
        transparency_pledge: next,
        transparency_pledge_at: next ? new Date().toISOString() : null,
      })
      .eq('id', org.id);
    setSaving(false);

    if (error) {
      toast('No se pudo actualizar');
      return;
    }
    setOrg((prev) => ({ ...prev, transparency_pledge: next }));
    toast(next ? 'Compromiso activado — ya se muestra en tu página pública ✓' : 'Compromiso retirado de tu página pública');
  }

  if (loading) return <div className="spinner"></div>;

  if (!org) {
    return (
      <div className="sec">
        <div className="empty-state">
          <i className="ti ti-building-off"></i>
          Todavía no administras ninguna organización.
        </div>
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Registro y Transparencia</h2>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: '#6d5aef',
            background: '#eeecfd',
            padding: '2px 8px',
            borderRadius: 20,
            letterSpacing: '.02em',
          }}
        >
          BETA
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#888', maxWidth: 540, marginBottom: 20, lineHeight: 1.55 }}>
        GovTalent está construyendo las herramientas que permitirán a las organizaciones registrar y demostrar sus
        buenas prácticas en la relación con las administraciones públicas, anticipándose a la futura regulación
        sobre grupos de interés.
      </p>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1d6f5c', marginBottom: 12 }}>Compromiso público</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18', marginBottom: 4 }}>
              Quiero que mi organización muestre públicamente su compromiso con la integridad y la transparencia
              como grupo de interés.
            </div>
            <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.5 }}>
              GovTalent promueve una cultura de transparencia e integridad en el ejercicio de los asuntos públicos.
              Al activar esta opción, tu organización mostrará en su página pública un distintivo de compromiso, sin
              necesidad de registrar todavía reuniones ni actividad.
            </div>
          </div>
          <button
            onClick={togglePledge}
            disabled={saving}
            aria-label={org.transparency_pledge ? 'Desactivar compromiso' : 'Activar compromiso'}
            style={{
              width: 42,
              height: 24,
              borderRadius: 20,
              border: 'none',
              background: org.transparency_pledge ? '#6d5aef' : '#e0dfd8',
              position: 'relative',
              cursor: saving ? 'default' : 'pointer',
              flexShrink: 0,
              padding: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: org.transparency_pledge ? 21 : 3,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left .15s ease',
              }}
            ></span>
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a18', marginBottom: 8 }}>¿Por qué activarlo?</div>
        <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 10px' }}>
            Las organizaciones que apuestan por la transparencia generan mayor confianza entre profesionales,
            administraciones públicas y sociedad.
          </p>
          <p style={{ margin: 0 }}>
            Mostrar este compromiso en tu perfil público contribuye a reforzar tu reputación y tu marca empleadora,
            además de posicionarte entre las organizaciones que lideran la evolución del sector.
          </p>
        </div>
      </div>

      <div
        style={{
          background: '#faf9f5', border: '.5px solid #e0dfd8', borderRadius: 12, padding: showUpcoming ? '16px 18px' : '4px 6px',
        }}
      >
        <button
          onClick={() => setShowUpcoming((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: showUpcoming ? '0 0 10px' : '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-clock" style={{ fontSize: 15, color: '#999' }}></i>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a18' }}>Próximamente</span>
          </div>
          <i
            className="ti ti-chevron-down"
            style={{ fontSize: 15, color: '#999', transition: 'transform .15s ease', transform: showUpcoming ? 'rotate(180deg)' : 'none' }}
          ></i>
        </button>
        {showUpcoming && (
          <>
            <div style={{ fontSize: 12.5, color: '#888', marginBottom: 10 }}>
              Estamos desarrollando nuevas funcionalidades para ayudar a las organizaciones a demostrar su actividad
              de forma transparente:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#666', lineHeight: 1.8 }}>
              {UPCOMING.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
