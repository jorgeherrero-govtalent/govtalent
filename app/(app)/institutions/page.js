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

function SectionTitle({ flag, icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
      {flag || (icon && <i className={`ti ti-${icon}`} style={{ color: '#aaa', fontSize: 15, width: 20, textAlign: 'center' }}></i>)}
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

/**
 * Los módulos pendientes en una línea, no como tarjetas: si ocupan lo
 * mismo que las funcionalidades reales, parece que media plataforma no
 * existe. Conviene magnificar lo que ya funciona.
 */
function Proximamente({ items }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10.5, color: '#aaa' }}>Próximamente</span>
      {items.map((t, i) => (
        <span key={t} style={{ fontSize: 11, color: '#999' }}>
          {i > 0 && <span style={{ color: '#ddd', marginRight: 8 }}>·</span>}
          {t}
        </span>
      ))}
    </div>
  );
}

const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };

export default function InstitutionsHomePage() {
  const supabase = createClient();
  const router = useRouter();
  const [counts, setCounts] = useState(null);
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
      { data: gobierno },
      { count: euCommitteesCount },
      { count: commissionersCount },
      { count: ecPeopleCount },
      { count: governanceCount },
      { count: organismosCount },
      { count: agenciasCount },
      { count: entidadesCount },
      { count: dgCount },
    ] = await Promise.all([
      supabase.from('deputies').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('parliamentary_groups').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('eu_meps').select('id', { count: 'exact', head: true }).eq('active', true),
      // Mesa, Junta de Portavoces y Diputación Permanente tienen pestaña
      // propia y no se cuentan como comisiones: si no, el titular dice 44
      // donde la lista enseña 41.
      supabase.from('es_committees').select('id', { count: 'exact', head: true }).neq('kind', 'gobierno'),
      // No hay tabla de ministerios: el ministerio es un campo de texto en
      // government_members y government_officials, así que los distintos
      // se cuentan en la vista gobierno_resumen. Y los cargos son la suma
      // de ministros y altos cargos.
      supabase.from('gobierno_resumen').select('ministerios, cargos').limit(1).maybeSingle(),
      // Las comisiones vigentes son las que no tienen fecha de fin:
      // 'active' está a true también en las de legislaturas pasadas, y
      // por eso salían 276 en vez de las ~24 actuales.
      supabase
        .from('eu_bodies')
        .select('id', { count: 'exact', head: true })
        .eq('body_type', 'committee')
        .is('term_end', null),
      supabase.from('ec_commissioners').select('id', { count: 'exact', head: true }),
      supabase.from('ec_people').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('es_committees').select('id', { count: 'exact', head: true }).eq('kind', 'gobierno'),
      // Los organismos van en tarjeta propia: la CNMC y la AEPD no son
      // parte de un ministerio sino autoridades independientes, y para
      // asuntos públicos esa distinción importa —a un regulador se le
      // trata distinto que a una dirección general.
      supabase.from('age_units').select('dir3_code', { count: 'exact', head: true })
        .eq('activo', true).eq('categoria', 'organismo_autonomo'),
      supabase.from('age_units').select('dir3_code', { count: 'exact', head: true })
        .eq('activo', true).eq('categoria', 'agencia_estatal'),
      supabase.from('age_units').select('dir3_code', { count: 'exact', head: true })
        .eq('activo', true).eq('categoria', 'entidad_derecho_publico'),
      supabase.from('age_units').select('dir3_code', { count: 'exact', head: true })
        .eq('activo', true).eq('categoria', 'direccion_general'),
    ]);
    setCounts({
      deputies: deputiesCount || 0,
      groups: groupsCount || 0,
      meps: mepsCount || 0,
      committees: committeesCount || 0,
      ministries: gobierno?.ministerios || 0,
      govPeople: gobierno?.cargos || 0,
      euCommittees: euCommitteesCount || 0,
      commissioners: commissionersCount || 0,
      ecPeople: ecPeopleCount || 0,
      governance: governanceCount || 0,
      organismos: organismosCount || 0,
      agencias: agenciasCount || 0,
      entidades: entidadesCount || 0,
      direcciones: dgCount || 0,
    });
  }

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) router.push(`/institutions/deputies?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="sec">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Directorio institucional</h1>
        {/* La legislatura sale de aquí: la XV solo aplica al Congreso, no a
            los ministerios ni al Parlamento Europeo, que va por su 10ª.
            Su sitio es la tarjeta del Congreso, donde ya está.
            Tampoco se promete el contacto: el email de los diputados llega
            en la fase 2 del sync y hoy no está cargado. */}
        <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 0' }}>
          Localiza a quien decide sobre tu sector, antes de que decida.
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
        <SectionTitle flag={<FlagEU />}>Unión Europea</SectionTitle>
        <div style={GRID}>
          <ModuleCard
            href="/institutions/eu-parliament"
            icon="building-arch"
            title="Parlamento Europeo"
            description="Eurodiputados, comisiones, grupos políticos y órganos de gobierno."
            cta="Explorar Parlamento Europeo"
            cifras={[
              { n: counts?.meps ?? null, label: 'eurodiputados' },
              { n: counts?.euCommittees ?? null, label: 'comisiones' },
            ]}
          />
          <ModuleCard
            href="/institutions/eu-commission"
            icon="briefcase"
            title="Comisión Europea"
            description="Comisarios, gabinetes, direcciones generales y jefes de unidad."
            cta="Explorar Comisión Europea"
            cifras={[
              { n: counts?.commissioners ?? null, label: 'comisarios' },
              { n: counts?.ecPeople ?? null, label: 'decisores' },
            ]}
          />
        </div>
        <Proximamente items={['Consejo Europeo']} />
      </div>

      <div>
        <SectionTitle flag={<FlagES />}>España</SectionTitle>
        {/* Dos columnas fijas y no auto-fit: con tres tarjetas y el
            mínimo de 220px, en pantallas anchas se ponían las tres en
            fila y quedaban demasiado estrechas para cuatro cifras. Así
            la tercera cae debajo y ocupa su mitad. */}
        <div style={{ ...GRID, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <ModuleCard
            href="/institutions/ministries"
            icon="building-community"
            title="Ministerios"
            description="Ministros, secretarios de Estado, direcciones generales y gabinetes."
            cta="Explorar ministerios"
            cifras={[
              { n: counts?.ministries ?? null, label: 'ministerios' },
              { n: counts?.govPeople ?? null, label: 'cargos' },
              { n: counts?.direcciones ?? null, label: 'direcciones' },
            ]}
          />
          {/* Una sola tarjeta para el Congreso, con sus cuatro vistas
              dentro. Diputados y Grupos tenían tarjeta propia y eso
              enseñaba una jerarquía falsa: parecían módulos hermanos
              cuando son dos de las cuatro pestañas de la misma sección,
              junto a Comisiones y Órganos de gobierno. */}
          <ModuleCard
            href="/institutions/deputies"
            icon="building-bank"
            title="Congreso de los Diputados"
            description="Diputados, comisiones, grupos parlamentarios y órganos de gobierno."
            cta="Explorar Congreso"
            cifras={[
              { n: counts?.deputies ?? null, label: 'diputados' },
              { n: counts?.committees ?? null, label: 'comisiones' },
              { n: counts?.groups ?? null, label: 'grupos' },
              { n: counts?.governance ?? null, label: 'órganos' },
            ]}
          />
          {/* Los organismos, en tarjeta propia dentro de la misma
              retícula: no son parte de un ministerio sino entes con
              personalidad jurídica propia, y varios —CNMC, AEPD— son
              autoridades independientes. Meterlos dentro de
              "Ministerios" habría sido cómodo y falso.

              Va dentro del GRID y no en un div aparte: fuera de la
              retícula quedaba con el fondo de tarjeta pero sin su
              maquetación, y se descuadraba. */}
          <ModuleCard
            href="/institutions/organismos"
            icon="scale"
            title="Organismos y reguladores"
            description="CNMC, AEPD, agencias estatales y organismos autónomos que regulan tu sector."
            cta="Explorar organismos"
            cifras={[
              { n: counts?.organismos ?? null, label: 'organismos' },
              { n: counts?.agencias ?? null, label: 'agencias' },
              { n: counts?.entidades ?? null, label: 'entidades' },
            ]}
          />
        </div>

        <Proximamente items={['Senado']} />
      </div>

      {/* Tercera sección, sin bandera. Las dos de arriba agrupan por
          jurisdicción —instituciones del Estado, instituciones de la UE—
          y ahí es donde entrará el Senado. Una
          patronal o una consultora no son una institución más: no
          deciden, tratan de influir en quien decide. Meterlas bajo la
          bandera diría lo contrario. El contraste de tener cabecera sin
          bandera ya comunica que es otra categoría.

          Sin cifras hasta tener claro de qué tabla salen: un contador
          inventado en portada es peor que ninguno. ModuleCard omite la
          banda entera si no se le pasa la prop. */}
      <div style={{ marginTop: 24 }}>
        <SectionTitle icon="users">El sector</SectionTitle>
        <div style={GRID}>
          <ModuleCard
            href="/organizations"
            icon="building-store"
            title="Organizaciones"
            description="Patronales, consultoras y empresas que trabajan con la Administración."
            cta="Explorar organizaciones"
          />
        </div>
      </div>
    </div>
  );
}
