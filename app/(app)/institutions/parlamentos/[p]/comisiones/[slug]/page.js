'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import { Avatar, Vacio } from '@/components/ParlamentoAutonomico';
import { PARLAMENTOS_UI, base, useComposicion, colorGrupo, TIPOS_COMISION, pesoCargo } from '@/lib/ccaa/composicionUI';

/**
 * Ficha de una comisión autonómica. Copia de la del Congreso: cabecera
 * con tipo y reparto por grupos, y la composición en tres bloques —Mesa,
 * Portavoces (uno por grupo) y resto de miembros—, cada uno con enlace a
 * la ficha del diputado.
 */

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 12 };

function Miembro({ m, p, grupo, size = 34 }) {
  return (
    <Link
      href={`${base(p)}/diputados/${m.d.slug}`}
      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '.5px solid #f0f0eb', textDecoration: 'none', color: 'inherit' }}
    >
      <Avatar nombre={m.d.nombre} url={m.d.foto_url} size={size} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.d.nombre}</div>
        <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>{m.cargo}</div>
      </div>
      {grupo && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: colorGrupo(grupo) }}></span>
          <span style={{ fontSize: 10.5, color: '#888' }}>{grupo.sigla}</span>
        </span>
      )}
      <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
    </Link>
  );
}

export default function ComisionAutonomicaPage() {
  const { p, slug } = useParams();
  const cfg = PARLAMENTOS_UI[p];
  const { datos, error } = useComposicion(p);
  const [verTodos, setVerTodos] = useState(false);

  const comision = useMemo(() => datos?.comisiones.find((c) => c.slug === slug) || null, [datos, slug]);
  const miembros = useMemo(
    () =>
      comision
        ? (datos.porComision[comision.id] || []).map((m) => ({ ...m, d: datos.diputadoPorId[m.diputado_id] })).filter((m) => m.d)
        : [],
    [comision, datos]
  );

  const mesa = miembros.filter((m) => pesoCargo(m.cargo_norm) <= 3);
  const portavoces = miembros.filter((m) => m.cargo_norm === 'portavoz');
  const resto = miembros.filter((m) => pesoCargo(m.cargo_norm) > 4);
  const porGrupo = useMemo(() => {
    const mapa = new Map();
    for (const m of miembros) if (m.d.grupo_id) mapa.set(m.d.grupo_id, (mapa.get(m.d.grupo_id) || 0) + 1);
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [miembros]);

  if (!cfg) return <div className="sec"><Vacio texto="No tenemos este parlamento." /></div>;
  if (error) return <div className="sec" style={{ maxWidth: 820 }}><Vacio icono="ti-alert-circle" texto="No se ha podido cargar la comisión." /></div>;
  if (!datos) return <div className="sec" style={{ maxWidth: 820 }}><div className="spinner"></div></div>;
  if (!comision) {
    return (
      <div className="sec" style={{ maxWidth: 820 }}>
        <Vacio icono="ti-users-off" texto="No se ha encontrado esta comisión." />
        <BackLink fallbackHref={`${base(p)}/comisiones`} fallbackLabel="Volver a Comisiones" />
      </div>
    );
  }

  const esOrgano = comision.tipo === 'organo';
  const seccion = esOrgano ? ['organos-gobierno', 'Órganos de gobierno'] : ['comisiones', 'Comisiones'];
  const grupoDe = (m) => datos.grupoPorId[m.d.grupo_id];

  return (
    <div className="sec" style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref={`${base(p)}/${seccion[0]}`} fallbackLabel={seccion[1]} />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/comunidades" style={{ color: '#999', textDecoration: 'none' }}>
            Comunidades autónomas
          </Link>
          {' › '}
          <Link href={`${base(p)}/${seccion[0]}`} style={{ color: '#999', textDecoration: 'none' }}>
            {cfg.nombre}
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{comision.nombre}</span>
        </span>
      </div>

      <div style={{ ...CARD, marginBottom: 12 }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{comision.nombre}</h1>
        <div style={{ fontSize: 11.5, color: '#666', marginTop: 5 }}>
          {[esOrgano ? 'Órgano de gobierno' : `Comisión ${(TIPOS_COMISION[comision.tipo] || '').toLowerCase()}`.trim(), `${miembros.length} miembros`, `${cfg.legislatura} Legislatura`]
            .filter(Boolean)
            .join(', ')}
        </div>

        {porGrupo.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 13, borderTop: '.5px solid #f0f0eb' }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 9 }}>
              {porGrupo.map(([g, n]) => (
                <div key={g} style={{ width: `${(n / miembros.length) * 100}%`, background: colorGrupo(datos.grupoPorId[g]) }} title={`${datos.grupoPorId[g]?.sigla}: ${n}`}></div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {porGrupo.map(([g, n]) => (
                <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#666' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: colorGrupo(datos.grupoPorId[g]) }}></span>
                  {datos.grupoPorId[g]?.sigla} {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {miembros.length === 0 && <Vacio icono="ti-users-off" texto="Aún no tenemos la composición de esta comisión." />}

      {mesa.length > 0 && (
        <div style={{ ...CARD, marginBottom: 12 }}>
          <div style={LABEL}>Mesa</div>
          {mesa.map((m) => (
            <Miembro key={m.id} m={m} p={p} grupo={grupoDe(m)} />
          ))}
        </div>
      )}

      {portavoces.length > 0 && (
        <div style={{ ...CARD, marginBottom: 12 }}>
          <div style={LABEL}>Portavoces, uno por grupo</div>
          {portavoces.map((m) => (
            <Miembro key={m.id} m={m} p={p} grupo={grupoDe(m)} />
          ))}
        </div>
      )}

      {resto.length > 0 && (
        <div style={CARD}>
          <div style={LABEL}>{mesa.length || portavoces.length ? 'Resto de miembros' : 'Miembros'}, {resto.length}</div>
          {(verTodos ? resto : resto.slice(0, 8)).map((m) => (
            <Miembro key={m.id} m={m} p={p} grupo={grupoDe(m)} size={28} />
          ))}
          {resto.length > 8 && (
            <button
              type="button"
              onClick={() => setVerTodos((v) => !v)}
              style={{ fontSize: 11.5, color: '#1d6f5c', background: 'none', border: 'none', padding: '12px 0 0', cursor: 'pointer' }}
            >
              {verTodos ? 'Ver menos' : `Ver los ${resto.length}`}
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Composición leída de las fichas de los diputados {cfg.deNombre}.
      </div>
    </div>
  );
}
