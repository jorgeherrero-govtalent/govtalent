import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PublicHeader from '@/components/PublicHeader';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

// Plazas de lanzamiento, según el documento de pricing. Cuando se agoten,
// el banner desaparece solo.
const PLAZAS_PRO = 20;
const PLAZAS_TEAMS = 10;

// Sin offset: el contador antiguo sumaba 3 fijos al recuento real, así que
// con tres organizaciones marcadas la página decía seis. Ahora sale del
// dato y sube solo.

export const metadata = {
  title: 'Precios · GovTalent',
  description:
    'Planes para profesionales y organizaciones de asuntos públicos: seguimiento regulatorio, directorio institucional, proyectos y registro de actividad.',
  openGraph: {
    title: 'Precios · GovTalent',
    description:
      'Planes para profesionales y organizaciones de asuntos públicos: seguimiento regulatorio, directorio institucional, proyectos y registro de actividad.',
    url: `${SITE_URL}/precios`,
    siteName: 'GovTalent',
    locale: 'es_ES',
    type: 'website',
  },
};

async function getData() {
  const supabase = createClient();
  const [{ count: orgs }, { count: pros }] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }).eq('is_founding_member', true),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('plan', 'pro'),
  ]);
  return {
    orgsFundadoras: orgs || 0,
    prosFundadores: pros || 0,
  };
}

function Check({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#3a3a36', marginBottom: 9 }}>
      <i className="ti ti-check" style={{ color: '#1d6f5c', fontSize: 15, marginTop: 1, flexShrink: 0 }}></i>
      <span>{children}</span>
    </div>
  );
}

function Etiqueta({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '.4px',
        color: '#a8a49c',
        marginBottom: 9,
      }}
    >
      {children}
    </div>
  );
}

function Plan({ nombre, precio, periodo, resumen, etiqueta, destacado, distintivo, children, cta, href }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: 22,
        position: 'relative',
        border: destacado ? '1.5px solid #1d6f5c' : '.5px solid #e6e4dd',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {distintivo && (
        <span
          style={{
            position: 'absolute',
            top: 22,
            right: 22,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '.3px',
            padding: '3px 9px',
            borderRadius: 11,
            background: '#e8f4f0',
            color: '#1d6f5c',
          }}
        >
          {distintivo}
        </span>
      )}
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1a1a18' }}>{nombre}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '8px 0 4px' }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: '#1a1a18' }}>{precio}</span>
        <span style={{ fontSize: 13, color: '#8b8780' }}>{periodo}</span>
      </div>
      <p style={{ fontSize: 12.5, color: '#77746e', margin: '0 0 16px', lineHeight: 1.5 }}>{resumen}</p>
      <Etiqueta>{etiqueta}</Etiqueta>
      <div style={{ flex: 1 }}>{children}</div>
      <Link
        href={href}
        style={{
          display: 'block',
          marginTop: 18,
          fontSize: 13,
          fontWeight: 600,
          padding: '10px',
          borderRadius: 10,
          textAlign: 'center',
          textDecoration: 'none',
          background: destacado ? '#6d5aef' : 'transparent',
          color: destacado ? '#fff' : '#3d3a35',
          border: destacado ? 'none' : '.5px solid #e0dfd8',
        }}
      >
        {cta}
      </Link>
    </div>
  );
}

/**
 * El banner de lanzamiento.
 *
 * El descuento es del primer año y así se dice: la versión anterior
 * prometía "precio para siempre", que no es lo acordado.
 *
 * Y el contador sale del dato, sin sumar nada: no es lo mismo enseñar
 * cuántos hay que aparentar que hay más.
 */
function BannerFundadores({ titulo, detalle, ocupadas, plazas, icono, asunto }) {
  const libres = Math.max(0, plazas - ocupadas);
  if (libres === 0) return null;
  const pct = Math.min(100, Math.round((ocupadas / plazas) * 100));

  return (
    <div
      style={{
        background: 'linear-gradient(100deg, #6d5aef 0%, #2f2266 100%)',
        borderRadius: 14,
        padding: '18px 22px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 18,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{titulo}</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.75)', marginTop: 3, lineHeight: 1.5 }}>{detalle}</div>
        {ocupadas > 0 && (
          <div
            style={{
              fontSize: 11.5,
              color: 'rgba(255,255,255,.75)',
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <i className={`ti ti-${icono}`} style={{ fontSize: 13 }}></i>
            {ocupadas} {ocupadas === 1 ? 'ya se ha unido' : 'ya se han unido'} — quedan {libres} de {plazas} plazas
          </div>
        )}
        <div
          style={{
            height: 4,
            background: 'rgba(255,255,255,.25)',
            borderRadius: 3,
            marginTop: 8,
            width: 230,
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: '#fff' }}></div>
        </div>
      </div>
      <a
        href={`mailto:hola@govtalent.app?subject=${encodeURIComponent(asunto)}`}
        style={{
          textDecoration: 'none',
          background: '#fff',
          color: '#3d2f8f',
          fontWeight: 700,
          fontSize: 13.5,
          padding: '11px 22px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
        }}
      >
        Reservar mi plaza
      </a>
    </div>
  );
}

export default async function PricingPage({ searchParams }) {
  const { orgsFundadoras, prosFundadores } = await getData();

  // La pestaña va en la URL y no en estado: así la página sigue siendo un
  // componente de servidor, se puede enlazar directamente a la de
  // organizaciones y cada una es indexable por separado.
  const paraOrgs = searchParams?.para === 'organizaciones';

  const pestana = (activa) => ({
    fontSize: 13,
    padding: '8px 18px',
    borderRadius: 9,
    textDecoration: 'none',
    fontWeight: activa ? 700 : 400,
    background: activa ? '#f0eefe' : 'transparent',
    color: activa ? '#6d5aef' : '#8b8780',
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f4f3ee' }}>
      <PublicHeader maxWidth={960} />

      <div className="pricing-wrap" style={{ flex: 1, maxWidth: 960, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 className="pricing-h1" style={{ fontWeight: 700, color: '#1a1a18', marginBottom: 10 }}>
            Precios
          </h1>
          <p style={{ fontSize: 14.5, color: '#666', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            Todo lo que necesitas para crecer en el sector de los asuntos públicos.
            <br />
            En un único lugar.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 24 }}>
          <Link href="/precios" style={pestana(!paraOrgs)}>
            Para profesionales
          </Link>
          <Link href="/precios?para=organizaciones" style={pestana(paraOrgs)}>
            Para organizaciones
          </Link>
        </div>

        {paraOrgs ? (
          <>
            <BannerFundadores
              titulo="Founding Member — 215 €/año el primer año"
              detalle="Teams al 50 %, onboarding personalizado y participación en la evolución del producto. Después se renueva a 429 €/año."
              ocupadas={orgsFundadoras}
              plazas={PLAZAS_TEAMS}
              icono="building"
              asunto="Quiero ser Founding Member en GovTalent — organización"
            />

            <div className="pricing-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              <Plan
                nombre="Free"
                precio="0 €"
                periodo="/ siempre"
                resumen="Atrae talento especializado sin compromiso."
                etiqueta="1 usuario"
                cta="Empezar gratis"
                href="/signup"
              >
                <Check>Ficha de organización verificada y página propia</Check>
                <Check>1 oferta activa</Check>
                <Check>Hasta 15 candidaturas por oferta</Check>
                <Check>ATS de candidatos integrado</Check>
              </Plan>

              <Plan
                nombre="Recruiter"
                precio="149 €"
                periodo="/ año"
                resumen="Atrae y gestiona el mejor talento especializado del sector."
                etiqueta="1 usuario · todo lo de Free, y además"
                cta="Elegir Recruiter"
                href="/signup"
              >
                <Check>Ofertas y candidaturas ilimitadas</Check>
                <Check>Descripción de ofertas con IA</Check>
                <Check>Matching y scoring de candidatos</Check>
                <Check>Resumen de candidatos con IA</Check>
              </Plan>

              <Plan
                nombre="Teams"
                precio="429 €"
                periodo="/ año"
                resumen="Todo lo que necesita tu equipo para crecer en el sector."
                etiqueta="Hasta 4 usuarios · todo Recruiter, y además"
                destacado
                distintivo="MÁS COMPLETO"
                cta="Elegir Teams"
                href="/signup"
              >
                <Check>Licencia de GovTalent Pro para todo el equipo</Check>
                <Check>Proyectos compartidos y colaborativos</Check>
                <Check>Seguimiento normativo y alertas regulatorias</Check>
                <Check>Agenda y notas compartidas</Check>
                <Check>Registro de actividad y automatización de actas</Check>
                <Check>Dashboard de organización</Check>
                <Check>Roles diferenciados</Check>
              </Plan>
            </div>
          </>
        ) : (
          <>
            <BannerFundadores
              titulo="Founding Member — 33 €/año el primer año"
              detalle="Sé de los primeros profesionales en usar GovTalent Pro. Después se renueva a 67 €/año."
              ocupadas={prosFundadores}
              plazas={PLAZAS_PRO}
              icono="user"
              asunto="Quiero ser Founding Member en GovTalent — Pro"
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, maxWidth: 700, margin: '0 auto' }}>
              <Plan
                nombre="Free"
                precio="0 €"
                periodo="/ siempre"
                resumen="Descubre la plataforma sin compromiso."
                etiqueta="Incluye"
                cta="Empezar gratis"
                href="/signup"
              >
                <Check>Ofertas de empleo y candidaturas</Check>
                <Check>Perfil profesional y recomendaciones</Check>
                <Check>Directorio institucional en España y Bruselas</Check>
                <Check>Consulta de proyectos normativos en España y la UE</Check>
              </Plan>

              <Plan
                nombre="Pro"
                precio="67 €"
                periodo="/ año"
                resumen="Monitoriza regulación y actores, y gestiona tus proyectos en un único espacio."
                etiqueta="Todo lo de Free, y además"
                destacado
                distintivo="RECOMENDADO"
                cta="Empezar con Pro"
                href="/signup"
              >
                <Check>Búsqueda avanzada e información ampliada</Check>
                <Check>Seguimiento normativo y regulatorio</Check>
                <Check>Alertas e histórico completo</Check>
                <Check>Creación y gestión de proyectos</Check>
                <Check>Visualización de stakeholders</Check>
                <Check>Organización de agenda con fechas y tareas</Check>
                {/* El acta se compone sola a partir del registro: nadie la
                    redacta. Lo manual es la captura, no el documento. */}
                <Check>Registro de actividad y automatización de actas</Check>
              </Plan>
            </div>
          </>
        )}

        <p style={{ fontSize: 12, color: '#a8a49c', textAlign: 'center', marginTop: 26, lineHeight: 1.6 }}>
          ¿Eres una universidad o una entidad formativa?{' '}
          <a href="mailto:hola@govtalent.app?subject=Informaci%C3%B3n%20sobre%20GovTalent%20Campus" style={{ color: '#6d5aef' }}>
            Consulta GovTalent Campus
          </a>
          .
        </p>
      </div>
    </div>
  );
}
