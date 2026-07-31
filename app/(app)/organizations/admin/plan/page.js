'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getEffectiveTier, planLabel, trialDaysRemaining, aiMatchesRemainingInTrial, trialAiMatchLimit } from '@/lib/plan';

const TIER_NAMES = { free: 'Free', plus: 'Plus', pro: 'Pro', trial: 'Prueba gratuita' };

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

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 700, letterSpacing: '.03em', marginBottom: 4 }}>
              PLAN ACTUAL
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a18' }}>{planLabel(org)}</div>
          </div>
          <Link href="/precios" target="_blank" className="btn-p" style={{ textDecoration: 'none' }}>
            Ver planes
          </Link>
        </div>

        {isTrial && (
          <div
            style={{
              marginTop: 18,
              padding: '14px 16px',
              background: '#faf9ff',
              border: '1px solid #d8d3fb',
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3d2f8f', marginBottom: 6 }}>
              <i className="ti ti-bolt" style={{ marginRight: 4 }}></i>
              Te quedan {trialDaysRemaining(org)} {trialDaysRemaining(org) === 1 ? 'día' : 'días'} de prueba
            </div>
            <div style={{ fontSize: 12.5, color: '#555' }}>
              Matching de candidatos con IA: {aiMatchesRemainingInTrial(org)} de {trialAiMatchLimit()} usos restantes
            </div>
          </div>
        )}

        {!isTrial && tier === 'free' && (
          <div
            style={{
              marginTop: 18,
              padding: '14px 16px',
              background: '#fdf6e8',
              border: '1px solid #eddfb8',
              borderRadius: 10,
              fontSize: 12.5,
              color: '#7a5c00',
            }}
          >
            Con el plan Free puedes tener 1 oferta activa a la vez. El resto de funciones (IA, directorio
            inteligente, varios usuarios) requieren un plan de pago.
          </div>
        )}

        {org.is_founding_member && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#999' }}>
            <i className="ti ti-star" style={{ color: '#6d5aef', marginRight: 4 }}></i>
            Eres Founding Member — tu precio de 199€/año queda fijado de por vida.
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>Qué incluye cada plan</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          {[
            ['free', 'Free', '1 oferta activa, ficha con badge de verificación, registro de transparencia'],
            ['plus', 'Plus', 'Todo lo de Free + ofertas ilimitadas + descripción de oferta con IA'],
            ['pro', 'Pro', 'Todo lo de Plus + matching con IA + directorio inteligente + varios usuarios'],
          ].map(([key, name, desc]) => (
            <div
              key={key}
              style={{
                display: 'flex',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                background: tier === key ? '#f0f8f5' : 'transparent',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: tier === key ? '#1d6f5c' : '#1a1a18', width: 50, flexShrink: 0 }}>
                {name}
              </div>
              <div style={{ color: '#666' }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
