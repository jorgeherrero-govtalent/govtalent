'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';

/**
 * Ficha de una comisión del Parlamento Europeo.
 *
 * Las comisiones aparecían en los procedimientos como sigla suelta
 * —"AGRI, ENVI"— igual que las direcciones generales. Aquí se convierten
 * en el actor que son.
 *
 * SE SEPARA LO QUE DECIDE DE AQUELLO EN LO QUE OPINA. No es un matiz: la
 * comisión competente redacta el informe y negocia el trílogo, la que
 * opina solo aconseja. Para saber a quién dirigirse, la diferencia lo es
 * todo.
 */

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const LABEL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 14 };

// Color por grupo político, el mismo que usa el resto del módulo europeo
const GRUPOS = {
  PPE: '#378ADD',
  'S&D': '#D4537E',
  Renew: '#F5C244',
  Verts: '#5FA85F',
  'Verts/ALE': '#5FA85F',
  ECR: '#3B7DB3',
  PfE: '#2B4C7E',
  ESN: '#4A5568',
  'The Left': '#B33A3A',
  GUE: '#B33A3A',
  NI: '#9A9A9A',
};

function colorGrupo(g) {
  return GRUPOS[g] || '#9A9A9A';
}

function iniciales(n) {
  const p = (n || '').trim().split(/\s+/);
  return `${p[0]?.[0] || ''}${p[p.length - 1]?.[0] || ''}`.toUpperCase();
}

// "MARAN, Pierfrancesco" o "Pierfrancesco MARAN" -> legible
function nombreLegible(n) {
  if (!n) return n;
  if (n.includes(',')) {
    const [ap, nom] = n.split(',').map((s) => s.trim());
    return nom ? `${nom} ${ap}` : n;
  }
  return n;
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

export default function EuCommitteeDetailPage() {
  const supabase = createClient();
  const { code } = useParams();

  const [comision, setComision] = useState(undefined);
  const [mesa, setMesa] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [lidera, setLidera] = useState([]);
  const [opina, setOpina] = useState([]);
  const [verMiembros, setVerMiembros] = useState(false);
  const [soloEspanoles, setSoloEspanoles] = useState(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('eu_committee_profile')
        .select('*')
        .eq('code', String(code).toUpperCase())
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setComision(null);
        return;
      }
      setComision(data);

      const [{ data: ch }, { data: mb }, { data: proc }] = await Promise.all([
        supabase.from('eu_committee_chairs').select('*').eq('body_code', data.code).order('rank_order'),
        supabase.from('eu_committee_members').select('*').eq('body_code', data.code),
        supabase
          .from('eu_committee_procedures')
          .select('*')
          .eq('body_code', data.code)
          .order('es_competente', { ascending: false })
          .order('is_closed')
          .order('last_activity_at', { ascending: false, nullsFirst: false })
          .limit(60),
      ]);

      if (cancelled) return;
      setMesa(ch || []);
      setMiembros(mb || []);
      setLidera((proc || []).filter((p) => p.es_competente));
      setOpina((proc || []).filter((p) => !p.es_competente));
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const espanoles = useMemo(() => miembros.filter((m) => m.country_code === 'ES').length, [miembros]);

  const miembrosFiltrados = useMemo(() => {
    let l = miembros;
    if (soloEspanoles) l = l.filter((m) => m.country_code === 'ES');
    return l;
  }, [miembros, soloEspanoles]);

  if (comision === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 860 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (comision === null) {
    return (
      <div className="sec" style={{ maxWidth: 860 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-users-off"></i>
            No se ha encontrado esta comisión.
          </div>
        </div>
        <BackLink fallbackHref="/institutions/eu-parliament" fallbackLabel="Volver al Parlamento Europeo" />
      </div>
    );
  }

  const presidencia = mesa.filter((m) => m.role === 'CHAIR');
  const vices = mesa.filter((m) => m.role === 'CHAIR_VICE');

  return (
    <div className="sec" style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/institutions/eu-parliament" fallbackLabel="Parlamento Europeo" />
        <span style={{ fontSize: 11.5, color: '#e0dfd8' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#a8a49c' }}>
          <Link href="/institutions" style={{ color: '#a8a49c', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/eu-parliament" style={{ color: '#a8a49c', textDecoration: 'none' }}>
            Parlamento Europeo
          </Link>
          {' › '}
          <span style={{ color: '#8b8780' }}>{comision.code}</span>
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
                fontSize: comision.code?.length > 4 ? 10 : 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {comision.code}
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-.2px', lineHeight: 1.3 }}>
                {comision.short_name_es || comision.name}
              </h1>
              <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 5 }}>
                {['Parlamento Europeo', comision.titulares ? `${comision.titulares} titulares` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <FollowButton kind="comision-eu" refId={comision.code} label={comision.short_name_es || comision.name} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 26, paddingTop: 15, marginTop: 15, borderTop: '.5px solid #f2f0ec', flexWrap: 'wrap' }}>
          {comision.n_lidera_vivos > 0 && (
            <div>
              <div style={{ fontSize: 19, fontWeight: 600, color: '#6d5aef' }}>{comision.n_lidera_vivos}</div>
              <div style={{ fontSize: 10.5, color: '#a8a49c' }}>en tramitación</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 19, fontWeight: 600 }}>{comision.n_lidera || 0}</div>
            <div style={{ fontSize: 10.5, color: '#a8a49c' }}>lidera</div>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 600 }}>{comision.n_opina || 0}</div>
            <div style={{ fontSize: 10.5, color: '#a8a49c' }}>opina</div>
          </div>
          {espanoles > 0 && (
            <div>
              <div style={{ fontSize: 19, fontWeight: 600 }}>{espanoles}</div>
              <div style={{ fontSize: 10.5, color: '#a8a49c' }}>españoles</div>
            </div>
          )}
        </div>
      </div>

      {mesa.length > 0 && (
        <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...LABEL, marginBottom: 0 }}>LA MESA</div>
            {miembros.length > 0 && (
              <button
                type="button"
                onClick={() => setVerMiembros((v) => !v)}
                style={{ fontSize: 12, color: '#8b8780', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {verMiembros ? 'Ocultar miembros' : `Ver los ${miembros.length} miembros`}
              </button>
            )}
          </div>

          {[...presidencia, ...vices.slice(0, verMiembros ? vices.length : 3)].map((m, i) => (
            <Link
              key={`${m.mep_id}-${m.role}`}
              href={m.slug ? `/institutions/eu-parliament/${m.slug}` : '#'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '9px 0',
                borderTop: i === 0 ? 'none' : '.5px solid #f2f0ec',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <Avatar nombre={m.full_name} url={m.photo_url} size={m.role === 'CHAIR' ? 36 : 32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: m.role === 'CHAIR' ? 13 : 12.5, fontWeight: m.role === 'CHAIR' ? 600 : 400 }}>
                  {nombreLegible(m.full_name)}
                </div>
                <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 2 }}>
                  {[m.role_label || (m.role === 'CHAIR' ? 'Presidencia' : 'Vicepresidencia'), m.country_code]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {m.political_group_code && (
                <>
                  <span
                    style={{ width: 9, height: 9, borderRadius: 2, background: colorGrupo(m.political_group_code), flexShrink: 0 }}
                  ></span>
                  <span style={{ fontSize: 11, color: '#8b8780', flexShrink: 0 }}>{m.political_group_code}</span>
                </>
              )}
            </Link>
          ))}

          {verMiembros && miembros.length > 0 && (
            <div style={{ paddingTop: 16, marginTop: 12, borderTop: '.5px solid #f2f0ec' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
                <div style={{ ...LABEL, marginBottom: 0 }}>MIEMBROS</div>
                {/* El filtro de españoles es lo que busca un profesional
                    de aquí: con quién puede hablar en su idioma y en su
                    contexto político. */}
                {espanoles > 0 && (
                  <button
                    type="button"
                    onClick={() => setSoloEspanoles((v) => !v)}
                    style={{
                      fontSize: 12,
                      padding: '5px 11px',
                      borderRadius: 7,
                      border: 'none',
                      cursor: 'pointer',
                      background: soloEspanoles ? '#f0eefe' : '#f5f4f1',
                      color: soloEspanoles ? '#6d5aef' : '#57534e',
                    }}
                  >
                    Solo españoles ({espanoles})
                  </button>
                )}
              </div>

              {miembrosFiltrados.map((m) => (
                <Link
                  key={m.mep_id}
                  href={m.slug ? `/institutions/eu-parliament/${m.slug}` : '#'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '8px 0',
                    borderTop: '.5px solid #f2f0ec',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <Avatar nombre={m.full_name} url={m.photo_url} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>{nombreLegible(m.full_name)}</div>
                    <div style={{ fontSize: 10, color: '#a8a49c' }}>
                      {[m.membership_type === 'SUBSTITUTE' ? 'Suplente' : 'Titular', m.country_code]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  {m.political_group_code && (
                    <>
                      <span
                        style={{ width: 8, height: 8, borderRadius: 2, background: colorGrupo(m.political_group_code), flexShrink: 0 }}
                      ></span>
                      <span style={{ fontSize: 10.5, color: '#8b8780', flexShrink: 0 }}>{m.political_group_code}</span>
                    </>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {lidera.length > 0 && (
        <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...LABEL, marginBottom: 0 }}>QUÉ DECIDE</div>
            <Link href={`/procedures?comision=${comision.code}`} style={{ fontSize: 12, color: '#8b8780', textDecoration: 'none' }}>
              Ver los {comision.n_lidera}
            </Link>
          </div>
          <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 14 }}>
            Procedimientos donde es comisión competente.
            {comision.n_lidera_vivos > 0 && ` ${comision.n_lidera_vivos} siguen abiertos.`}
          </div>

          {lidera.slice(0, 5).map((p) => (
            <Link
              key={p.process_id}
              href={`/procedures/${p.slug}`}
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
              <div style={{ width: 68, flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    color: p.is_closed ? '#a8a49c' : '#6d5aef',
                    background: p.is_closed ? '#f5f4f1' : '#f0eefe',
                    padding: '3px 7px',
                    borderRadius: 10,
                    textAlign: 'center',
                  }}
                >
                  {p.current_stage_label || (p.is_closed ? 'Cerrado' : '—')}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.45, letterSpacing: '-.1px' }}>{p.title}</div>
                <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 4 }}>
                  {[p.label, p.ponente ? nombreLegible(p.ponente) : 'sin ponente asignado', p.ponente_grupo]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {opina.length > 0 && (
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...LABEL, marginBottom: 0 }}>EN QUÉ OPINA</div>
            <span style={{ fontSize: 12, color: '#8b8780' }}>{comision.n_opina} en total</span>
          </div>
          {/* La distinción importa: la comisión competente redacta el
              informe y negocia; la que opina solo aconseja. */}
          <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 14 }}>
            Procedimientos que lidera otra comisión.
          </div>

          {opina.slice(0, 4).map((p) => (
            <Link
              key={p.process_id}
              href={`/procedures/${p.slug}`}
              style={{
                display: 'flex',
                gap: 15,
                padding: '11px 0',
                borderTop: '.5px solid #f2f0ec',
                alignItems: 'flex-start',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{p.title}</div>
                <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 3 }}>{p.label}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 11, color: '#a8a49c', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos abiertos del Parlamento Europeo.
      </div>
    </div>
  );
}
