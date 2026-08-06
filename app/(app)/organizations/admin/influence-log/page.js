'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function InfluenceLogPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    toast(next ? 'Adhesión activada — ya se muestra en tu página pública ✓' : 'Adhesión retirada de tu página pública');
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
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Transparencia</h2>
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
      <p style={{ fontSize: 13, color: '#888', maxWidth: 520, marginBottom: 20 }}>
        Esta sección está en una versión inicial. Por ahora solo puedes indicar que tu organización se adhiere a la
        transparencia como grupo de interés — más adelante añadiremos más funciones.
      </p>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18', marginBottom: 4 }}>
              Quiero que mi página muestre que me adhiero a la transparencia como grupo de interés
            </div>
            <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.5 }}>
              GovTalent recomienda como plataforma a las organizaciones que abogan por la transparencia. Si lo
              activas, tu página pública mostrará este gesto — sin necesidad de registrar actividad ni ningún otro
              dato por ahora.
            </div>
          </div>
          <button
            onClick={togglePledge}
            disabled={saving}
            aria-label={org.transparency_pledge ? 'Desactivar adhesión' : 'Activar adhesión'}
            style={{
              width: 42,
              height: 24,
              borderRadius: 20,
              border: 'none',
              background: org.transparency_pledge ? '#1d6f5c' : '#e0dfd8',
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

      <div
        style={{
          fontSize: 12, color: '#999', display: 'flex', alignItems: 'flex-start', gap: 8,
          background: '#faf9f5', border: '.5px solid #e0dfd8', borderRadius: 10, padding: '12px 14px',
        }}
      >
        <i className="ti ti-clock" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}></i>
        <div>
          Próximamente: cruzaremos datos de registros públicos de transparencia y añadiremos un ranking de
          transparencia visible en tu página de organización.
        </div>
      </div>
    </div>
  );
}
