'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';
import PanelBloqueado, { FILAS_DIRECCION_DG } from '@/components/PanelBloqueado';
import UpgradeModal from '@/components/UpgradeModal';
import { cifraPlazo } from '@/lib/plazos';

/**
 * Ficha de una dirección general de la Comisión Europea.
 *
 * En la ficha de un expediente, "DG ENV" era texto suelto. Aquí se
 * convierte en el actor que es: quién responde políticamente, quién la
 * dirige con sus correos, y qué expedientes tramita.
 *
 * Misma estructura que la ficha de comisión del Congreso: quién decide
 * arriba, quién trabaja en medio, y qué se mueve abajo.
 */

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const LABEL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 14 };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function iniciales(n) {
  const p = (n || '').trim().split(/\s+/);
  return `${p[0]?.[0] || ''}${p[p.length - 1]?.[0] || ''}`.toUpperCase();
}

function Avatar({ nombre, url, size = 32 }) {
  const [falla, setFalla] = useState(false);
  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };
  if (url && !falla) {
    return <img src={url} alt="" width={size} height={size} style={base} onError={() => setFalla(true)} />;
  }
  return (
    <div
      style={{
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8d8b83',
        fontSize: Math.round(size * 0.32),
        fontWeight: 600,
      }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </div>
  );
}

export default function DgDetailPage() {
  const supabase = createClient();
  const { code } = useParams();

  const [dg, setDg] = useState(undefined);
  const [esPro, setEsPro] = useState(null);
  const [upsell, setUpsell] = useState(false);
  const [personas, setPersonas] = useState([]);
  // Cuántas hay aunque no se pidan sus nombres.
  const [nPersonas, setNPersonas] = useState(0);
  const [expedientes, setExpedientes] = useState([]);
  const [verTodas, setVerTodas] = useState(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('ec_dg_profile')
        .select('*')
        .eq('code', String(code).toUpperCase())
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setDg(null);
        return;
      }
      setDg(data);

      // El plan decide qué se pide, así que se resuelve antes que el
      // resto de consultas.
      const { data: auth } = await supabase.auth.getUser();
      let pro = false;
      if (auth?.user?.id) {
        const { data: perfil } = await supabase.from('users').select('plan').eq('id', auth.user.id).single();
        pro = perfil?.plan === 'pro';
      }
      if (cancelled) return;
      setEsPro(pro);

      const [personasRes, { data: ex }] = await Promise.all([
        // Sin plan, el recuento y no las filas: son nombres y correos de
        // funcionarios, y difuminarlos con CSS los dejaría legibles
        // desde el inspector.
        pro
          ? supabase
              .from('ec_dg_people')
              .select('*')
              .eq('body_code', data.code)
              .order('orden_cargo')
              .order('full_name')
          : supabase
              .from('ec_dg_people')
              .select('body_code', { count: 'exact', head: true })
              .eq('body_code', data.code),
        // Los que tienen plazo abierto primero: con 332 expedientes en
        // ENV, mostrarlos por fecha escondería lo accionable.
        supabase
          .from('eu_initiatives_directory')
          .select('id, slug, title, act_type, feedback_end, dias_restantes, is_open')
          .eq('dg_code', data.code)
          .order('is_open', { ascending: false })
          .order('feedback_end', { ascending: false, nullsFirst: false })
          .limit(8),
      ]);

      if (cancelled) return;
      if (pro) {
        setPersonas(personasRes.data || []);
      } else {
        setPersonas([]);
        setNPersonas(personasRes.count || 0);
      }
      setExpedientes(ex || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  // Solo la cúpula: director general, adjuntos y asesores principales.
  // Con orden_cargo <= 4 entraban también los directores, que en una DG
  // grande son seis o siete y obligaban a desplazar mucho.
  const direccion = useMemo(() => personas.filter((p) => p.orden_cargo <= 3), [personas]);
  const resto = useMemo(() => personas.filter((p) => p.orden_cargo > 3), [personas]);

  if (dg === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 860 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (dg === null) {
    return (
      <div className="sec" style={{ maxWidth: 860 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-building-off"></i>
            No se ha encontrado esta dirección general.
          </div>
        </div>
        <BackLink fallbackHref="/institutions/eu-commission" fallbackLabel="Volver a la Comisión Europea" />
      </div>
    );
  }

  // La cúpula siempre, más hasta cuatro directores: son interlocutores
  // útiles, pero los ocho de una DG grande obligaban a desplazar mucho.
  const mostradas = verTodas
    ? personas
    : [...direccion, ...personas.filter((p) => p.orden_cargo === 4).slice(0, 4)];

  return (
    <div className="sec" style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/institutions/eu-commission" fallbackLabel="Comisión Europea" />
        <span style={{ fontSize: 11.5, color: '#e0dfd8' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#a8a49c' }}>
          <Link href="/institutions" style={{ color: '#a8a49c', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/eu-commission" style={{ color: '#a8a49c', textDecoration: 'none' }}>
            Comisión Europea
          </Link>
          {' › '}
          <span style={{ color: '#8b8780' }}>{dg.name_es || dg.code}</span>
        </span>
      </div>

      <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 200, flex: 1 }}>
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: 11,
                background: '#f0eefe',
                color: '#3C3489',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {dg.code}
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-.2px', lineHeight: 1.3 }}>
                {dg.name_es || dg.name_en}
              </h1>
              <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 5 }}>
                {['Dirección General', 'Comisión Europea', dg.n_personas ? `${dg.n_personas} personas` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <FollowButton kind="direccion" refId={dg.code} label={dg.name_es || dg.name_en} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 26, paddingTop: 15, marginTop: 15, borderTop: '.5px solid #f2f0ec', flexWrap: 'wrap' }}>
          {dg.n_abiertos > 0 && (
            <div>
              <div style={{ fontSize: 19, fontWeight: 600, color: '#6d5aef' }}>{dg.n_abiertos}</div>
              <div style={{ fontSize: 10.5, color: '#a8a49c' }}>con plazo abierto</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 19, fontWeight: 600 }}>{(dg.n_expedientes || 0).toLocaleString('es-ES')}</div>
            <div style={{ fontSize: 10.5, color: '#a8a49c' }}>expedientes</div>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 600 }}>{dg.n_con_email || 0}</div>
            <div style={{ fontSize: 10.5, color: '#a8a49c' }}>con contacto</div>
          </div>
        </div>
      </div>

      {/* El comisario va aparte del equipo: son dos niveles distintos
          —político y administrativo— y mezclarlos confundiría. */}
      {dg.comisario && (
        <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
          <div style={LABEL}>QUIÉN RESPONDE POLÍTICAMENTE</div>
          <Link
            href={`/institutions/eu-commission/comisarios/${dg.comisario_slug}`}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', textDecoration: 'none', color: 'inherit' }}
          >
            <Avatar nombre={dg.comisario} url={dg.comisario_foto} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{dg.comisario}</div>
              {dg.cartera && (
                <div style={{ fontSize: 11, color: '#8b8780', marginTop: 2, lineHeight: 1.4 }}>{dg.cartera}</div>
              )}
            </div>
            {dg.comisario_pais && (
              <span style={{ fontSize: 11, color: '#a8a49c', flexShrink: 0 }}>{dg.comisario_pais}</span>
            )}
            <i className="ti ti-chevron-right" style={{ color: '#d6d2ca', fontSize: 14, flexShrink: 0 }}></i>
          </Link>
        </div>
      )}

      {/* Sin plan la tarjeta se mantiene con su título y su forma, y
          las filas son atrezo difuminado. */}
      {esPro === false && nPersonas > 0 && (
        <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
          <div style={{ ...LABEL, marginBottom: 14 }}>QUIÉN LA DIRIGE</div>
          <PanelBloqueado
            titulo="Quién dirige esta dirección general"
            descripcion="El director general, sus adjuntos y los directores de área. Con cargo, unidad y correo a un solo clic."
            filas={FILAS_DIRECCION_DG}
            dominio="ec.europa.eu"
            onUpsell={() => setUpsell(true)}
          />
        </div>
      )}

      {esPro && personas.length > 0 && (
        <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...LABEL, marginBottom: 0 }}>QUIÉN LA DIRIGE</div>
            {resto.length > 0 && (
              <button
                type="button"
                onClick={() => setVerTodas((v) => !v)}
                style={{ fontSize: 12, color: '#8b8780', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {verTodas ? 'Ver solo la dirección' : `Ver las ${personas.length} personas`}
              </button>
            )}
          </div>

          {mostradas.map((p) => (
            <div
              key={p.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '.5px solid #f2f0ec' }}
            >
              <Avatar nombre={p.full_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.full_name}</div>
                <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 2 }}>
                  {[p.role, p.directorate || p.unit].filter(Boolean).join(' · ')}
                </div>
              </div>
              {p.email && !p.email_dubious && (
                <a
                  href={`mailto:${p.email}`}
                  style={{ fontSize: 11, color: '#8b8780', flexShrink: 0, textDecoration: 'none' }}
                >
                  {p.email}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {expedientes.length > 0 && (
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...LABEL, marginBottom: 0 }}>QUÉ TRAMITA</div>
            <Link href={`/initiatives?dg=${dg.code}`} style={{ fontSize: 12, color: '#8b8780', textDecoration: 'none' }}>
              Ver los {(dg.n_expedientes || 0).toLocaleString('es-ES')}
            </Link>
          </div>
          <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 14 }}>
            {dg.n_abiertos > 0
              ? `${dg.n_abiertos} con plazo abierto ahora mismo.`
              : 'Ninguno tiene plazo abierto ahora mismo.'}
          </div>

          {expedientes.map((e) => {
            const dias = diasHasta(e.feedback_end);
            const abierto = e.is_open && dias !== null && dias >= 0;
            return (
              <Link
                key={e.id}
                href={`/initiatives/${e.slug}`}
                style={{
                  display: 'flex',
                  gap: 15,
                  padding: '12px 0',
                  borderTop: '.5px solid #f2f0ec',
                  alignItems: 'flex-start',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>
                  {abierto ? (
                    <>
                      {(() => {
                    const pl = cifraPlazo(dias);
                    return (
                      <>
                        <div style={{ fontSize: pl.tam, fontWeight: 600, color: '#6d5aef', lineHeight: 1.15 }}>
                          {pl.cifra}
                        </div>
                        {pl.unidad && (
                          <div style={{ fontSize: 10, color: '#b8b4ac' }}>{pl.unidad}</div>
                        )}
                      </>
                    );
                  })()}
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: '#b8b4ac', paddingTop: 4 }}>{fechaCorta(e.feedback_end)}</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.45, letterSpacing: '-.1px' }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 4 }}>
                    {[e.act_type, !abierto ? 'cerrado' : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 11, color: '#a8a49c', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos del directorio oficial de la Comisión Europea.
      </div>

      {upsell && (
        <UpgradeModal
          title="Quién dirige esta dirección general"
          message="El director general, sus adjuntos y los directores de área, con su cargo, su unidad y su correo. Disponible en el plan Pro."
          onClose={() => setUpsell(false)}
        />
      )}
    </div>
  );
}
