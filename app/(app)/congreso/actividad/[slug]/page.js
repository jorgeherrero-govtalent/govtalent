'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';
import { groupColor, grupoCorto, colorSigla, nombreSigla } from '@/lib/grupos';

/**
 * Ficha de una proposición no de ley o comparecencia.
 *
 * Sin pestañas, a diferencia de las leyes: la fuente solo da título,
 * fechas, autor y situación. Lo que aporta valor es el cruce con las
 * personas —quién la presenta y quién decide sobre ella— y el enlace al
 * expediente oficial para el texto íntegro.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function nombreLegible(oficial) {
  const [ap, nom] = (oficial || '').split(',').map((s) => s.trim());
  return nom ? `${nom} ${ap}` : oficial;
}

function iniciales(n) {
  const [ap, nom] = (n || '').split(',').map((s) => s.trim());
  return `${(nom || '')[0] || ''}${(ap || '')[0] || ''}`.toUpperCase();
}

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 13,
};

function Avatar({ nombre, url, size = 30 }) {
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
        fontSize: Math.round(size * 0.33),
        fontWeight: 700,
      }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </div>
  );
}

export default function ActividadDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [item, setItem] = useState(undefined);
  const [comision, setComision] = useState(null);
  const [userId, setUserId] = useState(null);
  const [verPortavoces, setVerPortavoces] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('es_activity_directory')
        .select('*')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setItem(null);
        return;
      }
      setItem(data);

      const [{ data: co }, { data: auth }] = await Promise.all([
        supabase
          .from('es_activity_committee')
          .select('*')
          .eq('num_expediente', data.num_expediente)
          .limit(1)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;
      setComision(co || null);

      const uid = auth?.user?.id || null;
      setUserId(uid);
      // FollowButton comprueba por su cuenta si se sigue.
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (item === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 820 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (item === null) {
    return (
      <div className="sec" style={{ maxWidth: 820 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-file-off"></i>
            No se ha encontrado este expediente.
          </div>
        </div>
        <BackLink fallbackHref="/congreso" fallbackLabel="Volver a Actividad parlamentaria" />
      </div>
    );
  }

  // El expediente oficial: "161/001204" -> num=161001204 en el buscador
  const urlOficial = `https://www.congreso.es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_iniciativas_mode=mostrarDetalle&_iniciativas_legislatura=XV&_iniciativas_id=${item.num_expediente}`;

  const portavoces = comision?.portavoces || [];

  return (
    <div className="sec" style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/congreso" fallbackLabel="Actividad parlamentaria" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
            Regulatorio
          </Link>
          {' › '}
          <Link href="/congreso" style={{ color: '#999', textDecoration: 'none' }}>
            Actividad parlamentaria
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{item.num_expediente}</span>
        </span>
      </div>

      <div style={{ ...CARD, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{item.titulo}</h1>
            <div style={{ fontSize: 11.5, color: '#666', marginTop: 6 }}>
              {item.kind_label} · Congreso de los Diputados
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <FollowButton kind="actividad" refId={item.num_expediente} label={item.titulo} />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 14,
            paddingTop: 14,
            borderTop: '.5px solid #f0f0eb',
            alignItems: 'start',
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Estado</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: item.is_closed ? '#666' : '#3C3489' }}>
              {item.is_closed ? 'Concluida' : 'En trámite'}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Dónde está</div>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{item.situacion || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Expediente</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{item.num_expediente}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Presentada</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{fechaCorta(item.fecha_presentacion) || '—'}</div>
          </div>
        </div>

        {item.is_closed && item.resultado && (
          <div style={{ marginTop: 14, paddingTop: 13, borderTop: '.5px solid #f0f0eb', fontSize: 11.5, color: '#666' }}>
            {item.resultado}
          </div>
        )}
      </div>

      {(item.autores || []).length > 0 && (
        <div style={{ ...CARD, marginBottom: 12 }}>
          <div style={LABEL}>Quién la presenta</div>
          {item.autores.map((a, i) => {
            const cuerpo = (
              <>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: '#f4f4f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ width: 11, height: 11, borderRadius: 2, background: groupColor(a.nombre) }}></span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.nombre}</div>
                </div>
                {a.slug && <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>}
              </>
            );
            const estilo = {
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '9px 0',
              borderBottom: i === item.autores.length - 1 ? 'none' : '.5px solid #f0f0eb',
              textDecoration: 'none',
              color: 'inherit',
            };
            return a.slug ? (
              <Link key={a.nombre} href={`/institutions/groups/${a.slug}`} style={estilo}>
                {cuerpo}
              </Link>
            ) : (
              <div key={a.nombre} style={estilo}>
                {cuerpo}
              </div>
            );
          })}
        </div>
      )}

      {/* La comisión solo aparece si la situación es una comisión: las que
          están en Pleno o en Gobierno no tienen ninguna, y eso es
          correcto — ahí decide la cámara entera. */}
      {comision && (
        <div style={{ ...CARD, marginBottom: 12 }}>
          <div style={LABEL}>Quién decide</div>

          <Link
            href={`/institutions/comisiones/${comision.committee_slug}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '9px 0',
              borderBottom: '.5px solid #f0f0eb',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: '#EEEDFE',
                color: '#3C3489',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-users" style={{ fontSize: 16 }} aria-hidden="true"></i>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{comision.committee_name}</div>
              <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                {comision.n_members} miembros · {portavoces.length} portavoces
              </div>
            </div>
            <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
          </Link>

          {comision.presidente && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: verPortavoces ? '.5px solid #f0f0eb' : 'none' }}>
              <Avatar nombre={comision.presidente} url={comision.presidente_foto} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{nombreLegible(comision.presidente)}</div>
                <div style={{ fontSize: 10, color: '#999' }}>Preside</div>
              </div>
              {comision.presidente_grupo && (
                <span
                  style={{ width: 9, height: 9, borderRadius: 2, background: colorSigla(comision.presidente_grupo), flexShrink: 0 }}
                  title={nombreSigla(comision.presidente_grupo)}
                ></span>
              )}
            </div>
          )}

          {verPortavoces &&
            portavoces.map((p, i) => {
              const cuerpo = (
                <>
                  <Avatar nombre={p.nombre} url={p.foto} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5 }}>{nombreLegible(p.nombre)}</div>
                    {p.senador && <div style={{ fontSize: 10, color: '#999' }}>Senado</div>}
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: colorSigla(p.grupo) }}></span>
                    <span style={{ fontSize: 10.5, color: '#888' }}>{nombreSigla(p.grupo)}</span>
                  </span>
                  {p.slug && <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 13, flexShrink: 0 }}></i>}
                </>
              );
              const estilo = {
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: '.5px solid #f0f0eb',
                textDecoration: 'none',
                color: 'inherit',
              };
              return p.slug ? (
                <Link key={`pv-${i}`} href={`/institutions/deputies/${p.slug}`} style={estilo}>
                  {cuerpo}
                </Link>
              ) : (
                <div key={`pv-${i}`} style={estilo}>
                  {cuerpo}
                </div>
              );
            })}

          {portavoces.length > 0 && (
            <button
              type="button"
              onClick={() => setVerPortavoces((v) => !v)}
              style={{ fontSize: 11.5, color: '#6d5aef', background: 'none', border: 'none', padding: '11px 0 0', cursor: 'pointer' }}
            >
              {verPortavoces ? 'Ocultar portavoces' : `Ver los ${portavoces.length} portavoces →`}
            </button>
          )}
        </div>
      )}

      {/* El texto íntegro, las enmiendas y los debates viven en
          congreso.es: la fuente de datos no los publica. */}
      <a
        href={urlOficial}
        target="_blank"
        rel="noreferrer"
        style={{ ...CARD, padding: 16, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}
      >
        <i className="ti ti-external-link" style={{ fontSize: 16, color: '#6d5aef', flexShrink: 0 }}></i>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>Ver el expediente en congreso.es</div>
          <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>Texto íntegro, enmiendas y debates</div>
        </div>
      </a>

      <div style={{ marginTop: 18, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos abiertos del Congreso de los Diputados.
      </div>
    </div>
  );
}
