'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getEffectiveTier, planLabel, trialDaysRemaining, aiMatchesRemainingInTrial, trialAiMatchLimit } from '@/lib/plan';

function UnlockSection({ title, features }) {
  return (
    <div className="card" style={{ padding: 22, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>{title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {features.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3a3a36' }}>
                <i className="ti ti-check" style={{ color: '#1d6f5c', fontSize: 14 }}></i>
                {f}
              </div>
            ))}
          </div>
        </div>
        <Link href="/precios" target="_blank" className="btn-o" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Actualizar
        </Link>
      </div>
    </div>
  );
}

export default function OrganizationPlanPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    setOrg(membership?.organizations || null);
    setLoading(false);
  }

  if (loading) return <div className="spinner"></div>;
  if (!org) return null;

  const tier = getEffectiveTier(org);
  const isTrial = tier === 'trial';

  return (
    <div className="sec" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Plan</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Consulta tu plan actual y qué incluye.</p>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 700, letterSpacing: '.03em', marginBottom: 6 }}>
              PLAN ACTUAL
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#1d9d63', flexShrink: 0 }}></span>
              <span style={{ fontSize: 19, fontWeight: 700, color: '#1a1a18' }}>{planLabel(org)}</span>
            </div>
          </div>
          <Link href="/precios" target="_blank" className="btn-p" style={{ textDecoration: 'none' }}>
            Actualizar plan
          </Link>
        </div>

        {isTrial && (
          <div style={{ fontSize: 12.5, color: '#666', marginTop: 12 }}>
            Matching de candidatos con IA: {aiMatchesRemainingInTrial(org)} de {trialAiMatchLimit()} usos restantes
            en tu prueba.
          </div>
        )}

        {org.is_founding_member && (
          <div style={{ fontSize: 12, color: '#999', marginTop: 10 }}>
            <i className="ti ti-star" style={{ color: '#6d5aef', marginRight: 4 }}></i>
            Eres Founding Member — tu precio de 199€/año queda fijado de por vida.
          </div>
        )}
      </div>

      {tier === 'free' && (
        <>
          <UnlockSection title="Desbloquea con Plus" features={['Ofertas ilimitadas', 'Descripción de oferta con IA']} />
          <UnlockSection
            title="Desbloquea con Pro"
            features={['Matching de candidatos con IA', 'Directorio inteligente de organizaciones', 'Varios usuarios de equipo']}
          />
        </>
      )}

      {tier === 'plus' && (
        <UnlockSection
          title="Desbloquea con Pro"
          features={['Matching de candidatos con IA', 'Directorio inteligente de organizaciones', 'Varios usuarios de equipo']}
        />
      )}

      {isTrial && (
        <UnlockSection title="Desbloquea con Pro" features={['Directorio inteligente de organizaciones']} />
      )}

      {tier === 'pro' && (
        <div className="card" style={{ padding: 22, textAlign: 'center' }}>
          <i className="ti ti-circle-check" style={{ fontSize: 22, color: '#1d6f5c', marginBottom: 8 }}></i>
          <div style={{ fontSize: 13, color: '#666' }}>Tienes acceso a todas las funciones de GovTalent.</div>
        </div>
      )}
    </div>
  );
}
