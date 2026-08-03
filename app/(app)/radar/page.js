'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const SECTOR_LABELS = {
  energia_clima: 'Energía y clima',
  telecomunicaciones: 'Telecomunicaciones',
  tecnologia_digital: 'Tecnología y digital',
  audiovisual_medios: 'Audiovisual y medios de comunicación',
  transporte_movilidad: 'Transporte y movilidad',
  farmaceutico_salud: 'Farmacéutico y salud',
  financiero_banca_seguros: 'Financiero, banca y seguros',
  turismo_hosteleria: 'Turismo y hostelería',
  multisectorial: 'Multisectorial',
};

export default function RadarResumenHoy() {
  const [data, setData] = useState(null);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    fetch('/api/radar/summary')
      .then((r) => r.json())
      .then(setData);

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: authData }) => {
      if (!authData.user) return;
      const { data: profile } = await supabase.from('users').select('first_name').eq('id', authData.user.id).single();
      if (profile?.first_name) setUserName(profile.first_name);
    });
  }, []);

  if (!data) {
    return <div style={{ padding: '24px 28px', fontSize: 13, color: '#888' }}>Cargando tu resumen…</div>;
  }

  const { perfil, vacantes_recomendadas, organizaciones_recomendadas, novedades } = data;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 32px 60px' }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#15140f' }}>Hola{userName ? `, ${userName}` : ''}</div>
          <div style={{ fontSize: 13.5, color: '#8a897f', marginTop: 4 }}>
            Tu espacio para descubrir oportunidades, organizaciones y novedades del ecosistema de asuntos públicos.
          </div>
        </div>
        <Link
          href="/account"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #e0dfd8',
            background: '#fff',
            color: '#3a3a36',
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <i className="ti ti-adjustments"></i> Personalizar
        </Link>
      </div>

      {/* Bloque de activación */}
      <div
        style={{
          background: 'linear-gradient(160deg, #faf9ff 0%, #f2effc 100%)',
          border: '1px solid #e2dcf8',
          borderRadius: 16,
          padding: '22px 26px',
          marginBottom: 32,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: '#15140f', marginBottom: 4 }}>
            Haz que GovTalent trabaje para ti
          </div>
          <div style={{ fontSize: 12.5, color: '#57564f', marginBottom: 10 }}>
            Selecciona tus sectores, intereses y organizaciones para recibir recomendaciones personalizadas.
          </div>
          <div style={{ fontSize: 12, color: '#6d5aef', fontWeight: 600 }}>
            Perfil {perfil.completion_pct}% · {perfil.sectores_count} sector{perfil.sectores_count === 1 ? '' : 'es'} ·{' '}
            {perfil.organizaciones_seguidas_count} organización{perfil.organizaciones_seguidas_count === 1 ? '' : 'es'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <Link
            href="/account"
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#6d5aef',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Completar mi perfil
          </Link>
          <Link
            href="/organizations"
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid #d9d2f9',
              background: '#fff',
              color: '#6d5aef',
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Explorar organizaciones
          </Link>
        </div>
      </div>

      {/* Oportunidades para ti */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#15140f' }}>Oportunidades recomendadas</div>
          <Link href="/jobs" style={{ fontSize: 12.5, fontWeight: 600, color: '#1d6f5c', textDecoration: 'none' }}>
            Ver todas →
          </Link>
        </div>
        <div style={{ fontSize: 12.5, color: '#8a897f', marginBottom: 14 }}>
          Vacantes que encajan con tu experiencia e intereses.
        </div>
        {vacantes_recomendadas.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {vacantes_recomendadas.slice(0, 3).map((v) => (
              <Link
                key={v.id}
                href={`/jobs/${v.id}`}
                style={{
                  background: '#fff',
                  border: '1px solid #eceae2',
                  borderRadius: 14,
                  padding: '16px 18px',
                  textDecoration: 'none',
                  display: 'block',
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#15140f', marginBottom: 4 }}>{v.title}</div>
                <div style={{ fontSize: 12, color: '#57564f' }}>{v.organization_name}</div>
                {v.location && <div style={{ fontSize: 11.5, color: '#a3a297', marginTop: 6 }}>{v.location}</div>}
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: '#a3a297' }}>Todavía no hay vacantes activas que mostrar.</div>
        )}
      </div>

      {/* Organizaciones recomendadas */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#15140f' }}>Empieza a construir tu radar</div>
          <Link href="/organizations" style={{ fontSize: 12.5, fontWeight: 600, color: '#1d6f5c', textDecoration: 'none' }}>
            Explorar →
          </Link>
        </div>
        <div style={{ fontSize: 12.5, color: '#8a897f', marginBottom: 14 }}>
          Sigue organizaciones para recibir novedades, vacantes y movimientos relevantes.
        </div>
        {organizaciones_recomendadas.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {organizaciones_recomendadas.map((o) => (
              <Link
                key={o.id}
                href={`/organizations/${o.slug}`}
                style={{
                  background: '#fff',
                  border: '1px solid #eceae2',
                  borderRadius: 14,
                  padding: '16px 18px',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: '#f0efe9',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {o.logo_url ? (
                    <img src={o.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className="ti ti-building" style={{ color: '#a3a297' }}></i>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#15140f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8a897f' }}>{SECTOR_LABELS[o.sector] || 'Sector no especificado'}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: '#a3a297' }}>Todavía no hay organizaciones que recomendarte.</div>
        )}
      </div>

      {/* Novedades del ecosistema */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#15140f', marginBottom: 4 }}>Novedades del ecosistema</div>
        <div style={{ fontSize: 12.5, color: '#8a897f', marginBottom: 14 }}>
          Una selección de cambios, oportunidades y publicaciones relevantes.
        </div>
        {novedades.length > 0 ? (
          <div style={{ background: '#fff', border: '1px solid #eceae2', borderRadius: 14, padding: '6px 20px' }}>
            {novedades.map((n, i) => (
              <div
                key={i}
                style={{
                  padding: '13px 0',
                  borderBottom: i < novedades.length - 1 ? '1px solid #f0efe9' : 'none',
                  fontSize: 13,
                  color: '#3a3a36',
                }}
              >
                {n.title}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: '#a3a297' }}>Todavía no hay novedades registradas.</div>
        )}
      </div>
    </div>
  );
}
