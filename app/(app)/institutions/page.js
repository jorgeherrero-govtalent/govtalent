'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// Banderas en CSS plano: nítidas a cualquier tamaño y sin depender de
// emoji ni de imágenes externas.
function FlagES() {
  return (
    <span
      role="img"
      aria-label="Bandera de España"
      style={{
        display: 'inline-block',
        width: 20,
        height: 14,
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ display: 'block', height: 3.5, background: '#AA151B' }} />
      <span style={{ display: 'block', height: 6, background: '#F1BF00' }} />
      <span style={{ display: 'block', height: 3.5, background: '#AA151B' }} />
    </span>
  );
}

function FlagEU() {
  return (
    <span
      role="img"
      aria-label="Bandera de la Unión Europea"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 14,
        borderRadius: 3,
        background: '#003399',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #FFCC00' }} />
    </span>
  );
}

function SectionTitle({ flag, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
      {flag}
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '.3px',
        }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: '.5px', background: '#e0dfd8' }}></div>
    </div>
  );
}

// Las cifras van dentro de cada tarjeta, no en una banda superior: así
// se sabe a qué módulo pertenece cada número y los módulos no quedan
// empujados por debajo del pliegue. Mismo patrón que en Regulatorio.
function ModuleCard({ href, icon, title, description, cta, cifras }) {
  return (
    <Link href={href} className="card" style={{ padding: 18, textDecoration: 'none', color: 'inherit' }}>
      <i className={`ti ti-${icon}`} style={{ color: '#6d5aef', fontSize: 19 }}></i>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: '#888', marginTop: 3, marginBottom: 10 }}>{description}</div>
      {cifras?.length > 0 && (
        <div style={{ display: 'flex', gap: 18, paddingTop: 11, marginBottom: 11, borderTop: '.5px solid #f0f0eb' }}>
          {cifras.map((c) => (
            <div key={c.label}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {c.n === null || c.n === undefined ? '—' : c.n.toLocaleString('es-ES')}
              </div>
              <div style={{ fontSize: 10, color: '#999' }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}
      <span style={{ fontSize: 12, color: '#6d5aef', fontWeight: 600 }}>{cta} →</span>
    </Link>
  );
}

// Los módulos pendientes van en gris, no en morado: si todo llevara el
// color de marca, lo disponible y lo que aún no existe pesarían igual.
function SoonCard({ icon, title, description }) {
  return (
    <div style={{ background: '#f4f4f0', borderRadius: 12, padding: 18, opacity: 0.75 }}>
      <i className={`ti ti-${icon}`} style={{ color: '#999', fontSize: 19 }}></i>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: '#777' }}>{title}</div>
      <div style={{ fontSize: 11.5, color: '#999', marginTop: 3, marginBottom: 10 }}>{description}</div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#999',
          background: '#e5e4de',
          padding: '3px 9px',
          borderRadius: 10,
        }}
      >
        Próximamente
      </span>
    </div>
  );
}

const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };

export default function InstitutionsHomePage() {
  const supabase = createClient();
  const router = useRouter();
  const [counts, setCounts] = useState(null);
  const [legislature, setLegislature] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    // Solo recuentos, con head: true, así que no se traen filas.
    const [
      { count: deputiesCount },
      { count: groupsCount },
      { count: mepsCount },
      { count: committeesCount },
      { count: commissionersCount },
      { count: ecPeopleCount },
      { data: leg },
    ] = await Promise.all([
      supabase.from('deputies').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('parliamentary_groups').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('eu_meps').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('es_committees').select('id', { count: 'exact', head: true }),
      supabase.from('ec_commissioners').select('id', { count: 'exact', head: true }),
      supabase.from('ec_people').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('legislatures').select('name').eq('active', true).limit(1).maybeSingle(),
    ]);
    setCounts({
      deputies: deputiesCount || 0,
      groups: groupsCount || 0,
      meps: mepsCount || 0,
      committees: committeesCount || 0,
      commissioners: commissionersCount || 0,
      ecPeople: ecPeopleCount || 0,
    });
    setLegislature(leg);
  }

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) router.push(`/institutions/deputies?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="sec">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Directorio institucional</h1>
        <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 0' }}>
          Quién decide en España y en la Unión Europea, con su cargo y su contacto.
          {/* La legislatura se cargaba para la banda de cifras; al quitarla
              se queda aquí, que es donde de verdad sitúa al usuario. */}
          {legislature?.name && ` · ${legislature.name}`}
        </p>
      </div>

      <form
        onSubmit={handleSearch}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderRadius: 20,
          padding: '9px 16px',
          marginBottom: 20,
          maxWidth: 420,
        }}
      >
        <i className="ti ti-search" style={{ color: '#999', fontSize: 15 }}></i>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar diputado o grupo..."
          aria-label="Buscar en el directorio institucional"
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12.5, background: 'transparent' }}
        />
      </form>

      {/* La banda de cifras se retiró: ocupaba media pantalla para decir
          lo que cada tarjeta ya cuenta, y empujaba los módulos —que es a
          donde el usuario va— por debajo del pliegue. */}

      <div style={{ marginBottom: 24 }}>
        <SectionTitle flag={<FlagES />}>España</SectionTitle>
        <div style={GRID}>
          <ModuleCard
            href="/institutions/ministries"
            icon="building-bank"
            title="Ministerios"
            description="Estructura del Gobierno y titulares de cada ministerio."
            cta="Ver ministerios"
          />
          <ModuleCard
            href="/institutions/deputies"
            icon="users-group"
            title="Diputados"
            description="Consulta los diputados del Congreso, sus cargos y comisiones."
            cta="Ver diputados"
            cifras={[
              { n: counts?.deputies ?? null, label: 'diputados' },
              { n: counts?.committees ?? null, label: 'comisiones' },
            ]}
          />
          <ModuleCard
            href="/institutions/groups"
            icon="flag"
            title="Grupos parlamentarios"
            description="Explora los grupos, sus portavoces y composición actual."
            cta="Ver grupos"
            cifras={[{ n: counts?.groups ?? null, label: 'grupos' }]}
          />
          <SoonCard
            icon="scale"
            title="Organismos y entidades"
            description="Autoridades independientes, organismos públicos y otros entes."
          />
        </div>
      </div>

      <div>
        <SectionTitle flag={<FlagEU />}>Unión Europea</SectionTitle>
        <div style={GRID}>
          <ModuleCard
            href="/institutions/eu-parliament"
            icon="building-arch"
            title="Parlamento Europeo"
            description="Eurodiputados, sus grupos políticos y sus comisiones."
            cta="Ver Parlamento Europeo"
            cifras={[{ n: counts?.meps ?? null, label: 'eurodiputados' }]}
          />
          <ModuleCard
            href="/institutions/eu-commission"
            icon="briefcase"
            title="Comisión Europea"
            description="Comisarios, gabinetes y jefes de unidad, con su contacto."
            cta="Ver Comisión Europea"
            cifras={[
              { n: counts?.commissioners ?? null, label: 'comisarios' },
              { n: counts?.ecPeople ?? null, label: 'decisores' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
