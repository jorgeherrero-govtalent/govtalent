'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import { colorSigla, nombreSigla } from '@/lib/grupos';

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

const TIPOS = {
  permanente: 'Comisión permanente',
  mixta: 'Comisión mixta con el Senado',
  investigacion: 'Comisión de investigación',
  seguimiento: 'Comisión de seguimiento',
};

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 12,
};

function Avatar({ nombre, url, size = 34 }) {
  const [falla, setFalla] = useState(false);
  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', background: '#e8f4f0' };
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
        color: '#1d6f5c',
        fontSize: Math.round(size * 0.32),
        fontWeight: 700,
      }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </div>
  );
}

/**
 * Cada miembro lleva a su ficha de diputado.
 *
 * Los senadores y los letrados no están en el directorio, así que se
 * muestran igual pero sin enlace y con una nota que lo explica: sin ella
 * parecerían un enlace roto.
 */
function Miembro({ p, size = 34 }) {
  const contenido = (
    <>
      <Avatar nombre={p.nombre} url={p.photo_url} size={size} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nombreLegible(p.deputy_name || p.nombre)}</div>
        <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
          {[
            p.cargo_norm,
            p.constituency,
            p.es_senador ? 'Senado' : null,
            p.es_letrado ? 'Letrado de las Cortes' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      {p.grupo && !p.es_letrado && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: colorSigla(p.grupo) }}></span>
          <span style={{ fontSize: 10.5, color: '#888' }}>{nombreSigla(p.grupo)}</span>
        </span>
      )}
      {p.deputy_slug && <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>}
    </>
  );

  const estilo = {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '9px 0',
    borderBottom: '.5px solid #f0f0eb',
    textDecoration: 'none',
    color: 'inherit',
  };

  return p.deputy_slug ? (
    <Link href={`/institutions/deputies/${p.deputy_slug}`} style={estilo}>
      {contenido}
    </Link>
  ) : (
    <div style={estilo}>{contenido}</div>
  );
}

export default function ComisionDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [comision, setComision] = useState(undefined);
  const [miembros, setMiembros] = useState([]);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('es_committees_directory')
        .select('*')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setComision(null);
        return;
      }
      setComision(data);

      const { data: m } = await supabase
        .from('es_committee_people')
        .select('*')
        .eq('committee_id', data.id)
        .order('orden_cargo')
        .order('nombre');
      if (!cancelled) setMiembros(m || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const mesa = useMemo(() => miembros.filter((p) => p.orden_cargo <= 3), [miembros]);
  const portavoces = useMemo(() => miembros.filter((p) => p.orden_cargo === 4), [miembros]);
  const adjuntos = useMemo(() => miembros.filter((p) => p.orden_cargo === 5), [miembros]);
  const resto = useMemo(() => miembros.filter((p) => p.orden_cargo > 5), [miembros]);

  // Reparto por grupo, para ver de un vistazo el peso de cada partido.
  const porGrupo = useMemo(() => {
    const mapa = new Map();
    for (const p of miembros) {
      if (!p.grupo || p.es_letrado) continue;
      mapa.set(p.grupo, (mapa.get(p.grupo) || 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [miembros]);

  if (comision === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 820 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (comision === null) {
    return (
      <div className="sec" style={{ maxWidth: 820 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-users-off"></i>
            No se ha encontrado esta comisión.
          </div>
        </div>
        <BackLink fallbackHref="/institutions/comisiones" fallbackLabel="Volver a Comisiones" />
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/institutions/comisiones" fallbackLabel="Comisiones" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/comisiones" style={{ color: '#999', textDecoration: 'none' }}>
            Comisiones
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{comision.name}</span>
        </span>
      </div>

      <div style={{ ...CARD, marginBottom: 12 }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{comision.name}</h1>
        <div style={{ fontSize: 11.5, color: '#666', marginTop: 5 }}>
          {[
            TIPOS[comision.kind] || comision.kind,
            `${comision.n_members} miembros`,
            comision.fecha_constitucion ? `constituida el ${fechaCorta(comision.fecha_constitucion)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>

        {porGrupo.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 13, borderTop: '.5px solid #f0f0eb' }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 9 }}>
              {porGrupo.map(([g, n]) => (
                <div
                  key={g}
                  style={{ width: `${(n / miembros.length) * 100}%`, background: colorSigla(g) }}
                  title={`${nombreSigla(g)}: ${n}`}
                ></div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {porGrupo.slice(0, 6).map(([g, n]) => (
                <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#666' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: colorSigla(g) }}></span>
                  {nombreSigla(g)} {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {mesa.length > 0 && (
        <div style={{ ...CARD, marginBottom: 12 }}>
          <div style={LABEL}>Mesa</div>
          {mesa.map((p, i) => (
            <Miembro key={`m-${i}`} p={p} />
          ))}
        </div>
      )}

      {portavoces.length > 0 && (
        <div style={{ ...CARD, marginBottom: 12 }}>
          <div style={LABEL}>Portavoces · uno por grupo</div>
          {portavoces.map((p, i) => (
            <Miembro key={`p-${i}`} p={p} />
          ))}
        </div>
      )}

      {(adjuntos.length > 0 || resto.length > 0) && (
        <div style={CARD}>
          <div style={LABEL}>Resto de miembros · {adjuntos.length + resto.length}</div>
          {(verTodos ? [...adjuntos, ...resto] : [...adjuntos, ...resto].slice(0, 8)).map((p, i) => (
            <Miembro key={`r-${i}`} p={p} size={28} />
          ))}
          {adjuntos.length + resto.length > 8 && (
            <button
              type="button"
              onClick={() => setVerTodos((v) => !v)}
              style={{
                fontSize: 11.5,
                color: '#1d6f5c',
                background: 'none',
                border: 'none',
                padding: '12px 0 0',
                cursor: 'pointer',
              }}
            >
              {verTodos ? 'Ver menos' : `Ver los ${adjuntos.length + resto.length}`}
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos abiertos del Congreso de los Diputados.
        {comision.n_senadores > 0 && ' Los miembros del Senado aún no tienen ficha en el directorio.'}
      </div>
    </div>
  );
}
