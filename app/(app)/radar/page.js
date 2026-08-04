'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import OrganizationFollowButton from '@/components/OrganizationFollowButton';

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

const TYPE_LABELS = {
  empresa: 'Empresa',
  empresa_publica: 'Empresa pública',
  consultora_public_affairs: 'Consultora de Public Affairs',
  asociacion_profesional: 'Asociación profesional',
  sindicato: 'Sindicato',
  tercer_sector_ong: 'Organización del tercer sector / ONG',
  institucion_publica: 'Institución pública',
  partido_politico: 'Partido político',
  think_tank_fundacion: 'Think tank / Fundación',
  universidad_centro_educativo: 'Universidad / Institución académica',
  medios_comunicacion: 'Medios y comunicación',
  otro: 'Otro',
};

const MODALITY_LABELS = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };

const CHECKLIST_LABELS = {
  sectores: { done: 'Sectores configurados', pending: 'Sectores pendientes' },
  intereses: { done: 'Intereses configurados', pending: 'Intereses pendientes' },
  cv: { done: 'CV añadido', pending: 'CV pendiente' },
  experiencia: { done: 'Experiencia añadida', pending: 'Experiencia pendiente' },
  foto: { done: 'Foto añadida', pending: 'Foto pendiente' },
};

function formatFecha(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export default function RadarResumenHoy() {
  const [data, setData] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    fetch('/api/radar/summary')
      .then((r) => r.json())
      .then(setData);

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: authData }) => {
      if (authData.user) setUserId(authData.user.id);
    });
  }, []);

  if (!data) {
    return <div style={{ padding: '24px 28px', fontSize: 13, color: '#888' }}>Cargando tu resumen…</div>;
  }

  const { perfil, vacantes_recomendadas, organizaciones_recomendadas, novedades } = data;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '26px 32px 60px' }}>
      {/* Cabecera */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#15140f' }}>Hola{perfil.nombre ? `, ${perfil.nombre}` : ''}</div>
        <div style={{ fontSize: 13.5, color: '#8a897f', marginTop: 4 }}>
          Aquí tienes una selección de oportunidades, organizaciones y novedades adaptadas a tu perfil.
        </div>
      </div>

      {/* Bloque principal: completar perfil */}
      {perfil.completo ? (
        <div
          style={{
            background: '#eaf3ee',
            border: '1px solid #cfe6d9',
            borderRadius: 16,
            padding: '22px 26px',
            marginBottom: 26,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: '#15140f', marginBottom: 4 }}>
              <i className="ti ti-circle-check-filled" style={{ color: '#1d6f5c', marginRight: 6 }}></i>
              Tu perfil está completo
            </div>
            <div style={{ fontSize: 12.5, color: '#57564f' }}>
              Tu perfil ya está visible para las organizaciones y listo para recibir mejores recomendaciones.
            </div>
          </div>
          <Link
            href="/profile"
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#1d6f5c',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Ver mi perfil
          </Link>
        </div>
      ) : (
        <div
          style={{
            background: 'linear-gradient(160deg, #faf9ff 0%, #f2effc 100%)',
            border: '1px solid #e2dcf8',
            borderRadius: 16,
            padding: '22px 26px',
            marginBottom: 26,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: '#15140f', marginBottom: 4 }}>Completa tu perfil profesional</div>
              <div style={{ fontSize: 12.5, color: '#57564f', marginBottom: 14 }}>
                Cuanto más completo esté tu perfil, mejores serán las recomendaciones y más fácil será que las organizaciones te
                encuentren.
              </div>

              <div style={{ height: 6, background: '#e2dcf8', borderRadius: 20, overflow: 'hidden', marginBottom: 8, maxWidth: 320 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${perfil.completion_pct}%`,
                    background: '#6d5aef',
                    borderRadius: 20,
                    transition: 'width .4s ease',
                  }}
                ></div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6d5aef', marginBottom: 14 }}>
                Perfil completado al {perfil.completion_pct}%
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
                {Object.entries(perfil.checklist).map(([key, done]) => (
                  <div key={key} style={{ fontSize: 12, color: '#57564f', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: done ? '#6d5aef' : '#e0dfd8',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {done && <i className="ti ti-check" style={{ fontSize: 10, color: '#fff' }}></i>}
                    </span>
                    {CHECKLIST_LABELS[key][done ? 'done' : 'pending']}
                  </div>
                ))}
              </div>
            </div>

            <Link
              href="/profile"
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
                flexShrink: 0,
              }}
            >
              Ir a mi perfil
            </Link>
          </div>
        </div>
      )}

      {/* Oportunidades para ti */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#15140f' }}>Oportunidades para ti</div>
          <Link href="/jobs" style={{ fontSize: 12.5, fontWeight: 600, color: '#1d6f5c', textDecoration: 'none' }}>
            Ver todas →
          </Link>
        </div>
        <div style={{ fontSize: 12.5, color: '#8a897f', marginBottom: 12 }}>
          Seleccionadas según tus intereses, experiencia y ubicación.
        </div>
        {vacantes_recomendadas.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {vacantes_recomendadas.map((v) => (
              <Link key={v.id} href={`/jobs/${v.id}`} className="job-card-hover" style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ background: '#fff', border: '1px solid #eceae2', borderRadius: 14, padding: '16px 18px', height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        background: '#f0efe9',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {v.organization_logo ? (
                        <img src={v.organization_logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <i className="ti ti-building" style={{ color: '#a3a297' }}></i>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#15140f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#8a897f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.organization_name}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 12 }}>
                    {v.location && (
                      <span style={{ fontSize: 11, color: '#57564f', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <i className="ti ti-map-pin" style={{ fontSize: 12 }}></i> {v.location}
                      </span>
                    )}
                    {v.modality && (
                      <span style={{ fontSize: 11, color: '#57564f', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <i className="ti ti-briefcase" style={{ fontSize: 12 }}></i> {MODALITY_LABELS[v.modality] || v.modality}
                      </span>
                    )}
                    {v.organization_type && (
                      <span style={{ fontSize: 11, color: '#57564f' }}>{TYPE_LABELS[v.organization_type] || v.organization_type}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, color: '#a3a297' }}>{formatFecha(v.published_at) || ''}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#1d6f5c' }}>Ver vacante →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: '#a3a297' }}>Todavía no hay vacantes activas que mostrar.</div>
        )}
      </div>

      {/* Organizaciones que pueden interesarte */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#15140f' }}>Organizaciones que pueden interesarte</div>
          <Link href="/organizations" style={{ fontSize: 12.5, fontWeight: 600, color: '#1d6f5c', textDecoration: 'none' }}>
            Explorar directorio →
          </Link>
        </div>
        <div style={{ fontSize: 12.5, color: '#8a897f', marginBottom: 12 }}>
          Descubre organizaciones relacionadas con tus sectores e intereses.
        </div>
        {organizaciones_recomendadas.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {organizaciones_recomendadas.map((o) => (
              <div key={o.id} className="job-card-hover" style={{ background: '#fff', border: '1px solid #eceae2', borderRadius: 14, padding: '16px 18px' }}>
                <Link href={`/organizations/${o.slug}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
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
                    <div style={{ fontSize: 11.5, color: '#8a897f' }}>
                      {SECTOR_LABELS[o.sector] || 'Sector no especificado'}
                      {o.org_type ? ` · ${TYPE_LABELS[o.org_type] || o.org_type}` : ''}
                    </div>
                  </div>
                </Link>
                <OrganizationFollowButton organizationId={o.id} organizationName={o.name} userId={userId} initialFollowing={false} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: '#a3a297' }}>Todavía no hay organizaciones que recomendarte.</div>
        )}
      </div>

      {/* Novedades del ecosistema — se oculta por completo si no hay ninguna */}
      {novedades.length > 0 && (
        <div style={{ background: '#15140f', borderRadius: 16, padding: '22px 26px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#a89dfc', letterSpacing: '.04em', marginBottom: 14 }}>
            QUÉ ESTÁ PASANDO AHORA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {novedades.map((n, i) => (
              <div key={i} style={{ fontSize: 13.5, color: '#fff', display: 'flex', gap: 9, alignItems: 'baseline' }}>
                <span style={{ color: '#a89dfc', flexShrink: 0 }}>●</span>
                <span>{n.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
