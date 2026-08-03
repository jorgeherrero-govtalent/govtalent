'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function StatCard({ value, label, onClick }) {
  return (
    <div
      onClick={onClick}
      className="stat-card-hover"
      style={{
        background: '#fff',
        border: '1px solid #eceae2',
        borderRadius: 14,
        padding: '16px 18px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .15s',
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color: '#15140f', letterSpacing: '-.02em' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#8a897f', marginTop: 5 }}>{label}</div>
    </div>
  );
}

function ActionCard({ iconBg, iconColor, icon, label, title, detail, cta, href }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eceae2', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className={`ti ${icon}`} style={{ fontSize: 16, color: iconColor }}></i>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#a3a297', letterSpacing: '.03em' }}>{label}</div>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#15140f', marginBottom: 4 }}>{title}</div>
      {detail && <div style={{ fontSize: 12.5, color: '#57564f', marginBottom: 12 }}>{detail}</div>}
      <Link
        href={href}
        style={{
          display: 'block',
          textAlign: 'center',
          width: '100%',
          padding: 8,
          borderRadius: 8,
          border: '1px solid #e0dfd8',
          background: '#fff',
          color: '#3a3a36',
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        {cta}
      </Link>
    </div>
  );
}

export default function RadarResumenHoy() {
  const [data, setData] = useState(null);
  const [showDesglose, setShowDesglose] = useState(false);

  useEffect(() => {
    fetch('/api/radar/summary')
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <div style={{ padding: '24px 28px', fontSize: 13, color: '#888' }}>
        Cargando tu resumen…
      </div>
    );
  }

  const { stats, que_esta_pasando, perfil_destacado, para_tu_perfil, radar_organizacion, organizacion_seguida, tendencia, organizacion_mas_activa } = data;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: '#15140f' }}>Resumen de hoy</div>
        <div style={{ fontSize: 12.5, color: '#8a897f', marginTop: 3 }}>
          Movimientos, oportunidades y novedades del ecosistema de asuntos públicos.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
        <StatCard value={stats.movimientos_mes} label="Movimientos este mes · ver desglose" onClick={() => setShowDesglose((v) => !v)} />
        <StatCard value={stats.vacantes_para_ti} label="Vacantes nuevas para ti" />
        <StatCard value={stats.organizaciones_seguidas} label="Organizaciones en tu radar" />
        <StatCard value={stats.perfiles_actualizados_semana} label="Perfiles actualizados (7 días)" />
      </div>

      {showDesglose && (
        <div style={{ background: '#faf9f5', border: '1px solid #eceae2', borderRadius: 14, padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {[
              ['Perfiles actualizados', stats.desglose.perfiles_actualizados],
              ['Nuevas vacantes', stats.desglose.nuevas_vacantes],
              ['Nuevas organizaciones', stats.desglose.nuevas_organizaciones],
              ['Cambios de cargo', stats.desglose.cambios_cargo],
              ['Organizaciones verificadas', stats.desglose.organizaciones_verificadas],
              ['Actividad de transparencia', stats.desglose.actividad_transparencia],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#3a3a36' }}>
                <span>{label}</span>
                <b>{val}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {que_esta_pasando.length > 0 && (
        <div style={{ background: '#15140f', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#a89dfc', letterSpacing: '.04em', marginBottom: 12 }}>
            QUÉ ESTÁ PASANDO AHORA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {que_esta_pasando.map((titulo, i) => (
              <div key={i} style={{ fontSize: 13.5, color: '#fff', display: 'flex', gap: 9 }}>
                <span style={{ color: i % 2 === 0 ? '#8fd6b4' : '#a89dfc' }}>●</span> {titulo}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {perfil_destacado && (
          <ActionCard
            iconBg="#f0edfe"
            iconColor="#6d5aef"
            icon="ti-user-star"
            label="Nuevo nombramiento"
            title={perfil_destacado.title}
            href={perfil_destacado.organization_id ? `/organizations/${perfil_destacado.organization_id}` : '/organizations'}
            cta="Ver organización"
          />
        )}

        {para_tu_perfil && (
          <ActionCard
            iconBg="#eaf3ee"
            iconColor="#1d6f5c"
            icon="ti-target-arrow"
            label="Para tu perfil"
            title={`${para_tu_perfil.count} vacante${para_tu_perfil.count === 1 ? '' : 's'}${para_tu_perfil.sector_label ? ` en ${para_tu_perfil.sector_label}` : ''}`}
            detail="Coinciden con tus áreas de interés"
            href="/jobs"
            cta="Ver vacantes"
          />
        )}

        {radar_organizacion && (
          <ActionCard
            iconBg="#f0efe9"
            iconColor="#77766f"
            icon="ti-radar-2"
            label="Radar"
            title={`Detectamos actividad reciente en ${radar_organizacion.organization_name}`}
            detail="Puede significar nuevas ofertas, cambios en perfiles o actualización de plantilla"
            href="/organizations"
            cta="Explorar actividad"
          />
        )}

        {organizacion_seguida && (
          <ActionCard
            iconBg="#eaf3ee"
            iconColor="#1d6f5c"
            icon="ti-eye"
            label="Organización seguida"
            title={organizacion_seguida.title}
            href="/organizations"
            cta="Ver detalle"
          />
        )}

        {tendencia && (
          <ActionCard
            iconBg="#f0edfe"
            iconColor="#6d5aef"
            icon="ti-trending-up"
            label="Tendencia"
            title={`${tendencia.sector_label}, el sector más activo`}
            detail={`Concentra el ${tendencia.porcentaje}% de los movimientos de este mes`}
            href="/organizations"
            cta="Ver sector"
          />
        )}

        {organizacion_mas_activa && (
          <ActionCard
            iconBg="#eaf3ee"
            iconColor="#1d6f5c"
            icon="ti-building"
            label="Organización más activa"
            title={organizacion_mas_activa.organization_name}
            detail={`+${organizacion_mas_activa.seguidores} seguidores · ${organizacion_mas_activa.vacantes} vacantes`}
            href="/organizations"
            cta="Ver organización"
          />
        )}
      </div>

      {!perfil_destacado && !para_tu_perfil && !radar_organizacion && !organizacion_seguida && !tendencia && !organizacion_mas_activa && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#8a897f', fontSize: 13 }}>
          Todavía no hay suficiente actividad para mostrar aquí. Vuelve pronto.
        </div>
      )}
    </div>
  );
}
