'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';

/**
 * Ficha de un comisario europeo.
 *
 * Los datos ya estaban cargados —27 comisarios con foto y cartera, más
 * su gabinete— y no se veían en ninguna parte.
 *
 * El gabinete es lo diferencial: es el interlocutor de primer nivel en
 * Bruselas y nadie lo muestra junto al comisario.
 *
 * OJO CON LO QUE PROMETE: el sync del Whoiswho no trajo los gabinetes
 * completos. Se muestra "quién está en su gabinete", no "el gabinete
 * completo", porque muchos tienen solo al jefe cargado.
 */

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const LABEL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 14 };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const RANGOS = {
  presidenta: 'Presidenta de la Comisión Europea',
  presidente: 'Presidente de la Comisión Europea',
  vicepresidenta_ejecutiva: 'Vicepresidenta ejecutiva',
  vicepresidente_ejecutivo: 'Vicepresidente ejecutivo',
  comisario: 'Comisario',
  comisaria: 'Comisaria',
};

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

function Avatar({ nombre, url, size = 32, radio = '50%' }) {
  const [falla, setFalla] = useState(false);
  const base = { width: size, height: size, borderRadius: radio, flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };
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
        fontSize: Math.round(size * 0.3),
        fontWeight: 600,
      }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </div>
  );
}

export default function ComisarioDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [c, setC] = useState(undefined);
  const [gabinete, setGabinete] = useState([]);
  const [direcciones, setDirecciones] = useState([]);
  const [expedientes, setExpedientes] = useState([]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('ec_commissioner_profile')
        .select('*')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setC(null);
        return;
      }
      setC(data);

      const [{ data: gab }, { data: dgs }] = await Promise.all([
        supabase
          .from('ec_commissioner_cabinet')
          .select('*')
          .eq('commissioner_slug', data.slug)
          .order('orden_cargo')
          .order('full_name'),
        supabase.from('ec_dg_profile').select('*').eq('comisario_slug', data.slug),
      ]);

      if (cancelled) return;
      setGabinete(gab || []);
      setDirecciones(dgs || []);

      // Los expedientes de sus direcciones, con los abiertos primero
      const codigos = (dgs || []).map((d) => d.code);
      if (codigos.length > 0) {
        const { data: ex } = await supabase
          .from('eu_initiatives_directory')
          .select('id, slug, title, act_type, feedback_end, dias_restantes, is_open, dg_code')
          .in('dg_code', codigos)
          .order('is_open', { ascending: false })
          .order('feedback_end', { ascending: false, nullsFirst: false })
          .limit(6);
        if (!cancelled) setExpedientes(ex || []);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (c === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 860 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (c === null) {
    return (
      <div className="sec" style={{ maxWidth: 860 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No se ha encontrado a esta persona.
          </div>
        </div>
        <BackLink fallbackHref="/institutions/eu-commission" fallbackLabel="Volver a la Comisión Europea" />
      </div>
    );
  }

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
          <span style={{ color: '#8b8780' }}>{c.full_name}</span>
        </span>
      </div>

      <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 15, alignItems: 'flex-start', minWidth: 200, flex: 1 }}>
            <Avatar nombre={c.full_name} url={c.photo_url} size={64} radio={12} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-.2px', lineHeight: 1.3 }}>
                {c.full_name}
              </h1>
              <div style={{ fontSize: 12.5, color: '#3f3d39', marginTop: 6, lineHeight: 1.45 }}>{c.portfolio_es}</div>
              <div style={{ fontSize: 11.5, color: '#a8a49c', marginTop: 5 }}>
                {[RANGOS[c.rank] || c.rank, c.country_name].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <FollowButton kind="comisario" refId={c.slug} label={c.full_name} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 26, paddingTop: 15, marginTop: 15, borderTop: '.5px solid #f2f0ec', flexWrap: 'wrap' }}>
          {c.n_abiertos > 0 && (
            <div>
              <div style={{ fontSize: 19, fontWeight: 600, color: '#6d5aef' }}>{c.n_abiertos}</div>
              <div style={{ fontSize: 10.5, color: '#a8a49c' }}>con plazo abierto</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 19, fontWeight: 600 }}>{(c.n_expedientes || 0).toLocaleString('es-ES')}</div>
            <div style={{ fontSize: 10.5, color: '#a8a49c' }}>expedientes bajo su cartera</div>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 600 }}>{c.n_direcciones || 0}</div>
            <div style={{ fontSize: 10.5, color: '#a8a49c' }}>
              {c.n_direcciones === 1 ? 'dirección general' : 'direcciones generales'}
            </div>
          </div>
        </div>
      </div>

      {/* El gabinete es lo diferencial: el interlocutor de primer nivel
          que nadie muestra junto al comisario. */}
      {gabinete.length > 0 && (
        <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
          <div style={{ ...LABEL, marginBottom: 6 }}>SU GABINETE</div>
          <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 14 }}>
            Quien lleva su agenda y prepara sus decisiones.
          </div>
          {gabinete.map((p) => (
            <div
              key={p.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '.5px solid #f2f0ec' }}
            >
              <Avatar nombre={p.full_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.full_name}</div>
                <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 2 }}>{p.role}</div>
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

      {direcciones.length > 0 && (
        <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
          <div style={{ ...LABEL, marginBottom: 14 }}>QUÉ DIRIGE</div>
          {direcciones.map((d) => (
            <Link
              key={d.code}
              href={`/institutions/eu-commission/${d.code}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 0',
                borderTop: '.5px solid #f2f0ec',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 9,
                  background: '#f0eefe',
                  color: '#3C3489',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: d.code?.length > 4 ? 9 : 11,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {d.code}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{d.name_es || d.name_en}</div>
                <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 3 }}>
                  {[
                    d.director ? `Dirige ${d.director}` : null,
                    d.n_personas ? `${d.n_personas} personas` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ color: '#d6d2ca', fontSize: 15, flexShrink: 0 }}></i>
            </Link>
          ))}
        </div>
      )}

      {expedientes.length > 0 && (
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...LABEL, marginBottom: 0 }}>QUÉ SE TRAMITA BAJO SU CARTERA</div>
          </div>
          <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 14 }}>
            {c.n_abiertos > 0
              ? `${c.n_abiertos} con plazo abierto ahora mismo.`
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
                      <div style={{ fontSize: 19, fontWeight: 600, color: '#6d5aef', lineHeight: 1 }}>{dias}</div>
                      <div style={{ fontSize: 10, color: '#b8b4ac' }}>{dias === 1 ? 'día' : 'días'}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: '#b8b4ac', paddingTop: 4 }}>{fechaCorta(e.feedback_end)}</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.45, letterSpacing: '-.1px' }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 4 }}>
                    {[e.dg_code, e.act_type].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 11, color: '#a8a49c', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos del directorio oficial de la Comisión Europea.
        {c.profile_url && (
          <a href={c.profile_url} target="_blank" rel="noreferrer" style={{ color: '#8b8780' }}>
            Ver su perfil oficial
          </a>
        )}
      </div>
    </div>
  );
}
