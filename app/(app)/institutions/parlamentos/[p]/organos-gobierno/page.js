'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import { PestanasParlamento, CabeceraParlamento, Avatar, Vacio } from '@/components/ParlamentoAutonomico';
import { PARLAMENTOS_UI, base, useComposicion, normalizar, pesoCargo } from '@/lib/ccaa/composicionUI';

/**
 * Órganos de gobierno de un parlamento autonómico: Mesa, Junta de
 * Portavoces y Diputación Permanente. Copia de OrganosGobiernoTab del
 * Congreso: un bloque plegable por órgano, la Mesa abierta de entrada y
 * filtros por grupo y cargo.
 */

const FAMILIAS = { 1: 'Presidencia', 2: 'Vicepresidencia', 3: 'Secretaría', 4: 'Portavocía', 5: 'Portavocía adjunta', 6: 'Vocalía', 7: 'Suplencia' };
const familia = (n) => FAMILIAS[pesoCargo(n)] || 'Otros';

function Miembro({ m, p, grupo, ultimo }) {
  const preside = m.cargo_norm === 'presidencia';
  return (
    <Link
      href={`${base(p)}/diputados/${m.d.slug}`}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: ultimo ? 'none' : '.5px solid #f0f0eb', textDecoration: 'none', color: 'inherit' }}
    >
      <Avatar nombre={m.d.nombre} url={m.d.foto_url} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.d.nombre}</div>
        <div style={{ fontSize: 11, color: '#999' }}>{grupo?.sigla || '—'}</div>
      </div>
      {preside ? (
        <span style={{ fontSize: 10.5, fontWeight: 600, background: '#e8f4f0', color: '#1d6f5c', padding: '2px 9px', borderRadius: 10, whiteSpace: 'nowrap' }}>
          {m.cargo}
        </span>
      ) : (
        <span style={{ fontSize: 10.5, color: '#888', whiteSpace: 'nowrap' }}>{m.cargo}</span>
      )}
    </Link>
  );
}

export default function OrganosGobiernoAutonomicosPage() {
  const { p } = useParams();
  const cfg = PARLAMENTOS_UI[p];
  const { datos, error } = useComposicion(p);
  const [abiertos, setAbiertos] = useState(null);
  const [search, setSearch] = useState('');
  const [grupoFilter, setGrupoFilter] = useState(new Set());
  const [cargoFilter, setCargoFilter] = useState(new Set());

  const organos = useMemo(() => {
    if (!datos) return null;
    const ORDEN = [/^mesa/i, /junta de portav(oces|eus)/i, /diputaci[oó]n? permanente?/i];
    const pos = (n) => { const i = ORDEN.findIndex((re) => re.test(n)); return i < 0 ? 9 : i; };
    const lista = datos.comisiones
      .filter((c) => c.tipo === 'organo')
      .map((o) => ({
        ...o,
        miembros: (datos.porComision[o.id] || []).map((m) => ({ ...m, d: datos.diputadoPorId[m.diputado_id] })).filter((m) => m.d),
      }))
      .sort((a, b) => pos(a.nombre) - pos(b.nombre) || a.miembros.length - b.miembros.length);
    // En la Diputación Permanente la Asamblea da dos personas por cada
    // cargo de la Mesa: el titular, que es quien está en la Mesa, y su
    // suplente, con el mismo nombre de cargo (de ahí «Vicepresidenta
    // Primera» para un diputado). Al suplente se le dice suplente.
    const mesa = lista.find((o) => /^mesa/i.test(o.nombre));
    const enMesa = new Set((mesa?.miembros || []).map((m) => m.diputado_id));
    const dp = lista.find((o) => /diputaci[oó]n? permanente?/i.test(o.nombre));
    // Solo en Madrid: en Cataluña la Diputació Permanent tiene Mesa propia.
    if (p === 'madrid' && dp && enMesa.size) {
      dp.miembros = dp.miembros
        .map((m) =>
          ['presidencia', 'vicepresidencia', 'secretaria'].includes(m.cargo_norm) && !enMesa.has(m.diputado_id)
            ? { ...m, cargo: `Suplente · ${m.cargo.replace(/(Presidente|Presidenta)/, 'Presidencia').replace(/Vicepresident[ea]/, 'Vicepresidencia').replace(/Secretari[oa]/, 'Secretaría').replace(/Primer[oa]/, 'primera').replace(/Segund[oa]/, 'segunda').replace(/Tercer[oa]/, 'tercera')}`, cargo_norm: 'suplente' }
            : m
        )
        .sort((a, b) => pesoCargo(a.cargo_norm) - pesoCargo(b.cargo_norm));
    }
    return lista;
  }, [datos, p]);

  // La más pequeña —la Mesa— abierta de entrada.
  useEffect(() => {
    if (organos && abiertos === null) setAbiertos(new Set(organos[0] ? [organos[0].id] : []));
  }, [organos, abiertos]);

  function alternar(id) {
    setAbiertos((prev) => {
      const n = new Set(prev || []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const grupoOptions = useMemo(() => {
    const cuenta = new Map();
    for (const o of organos || []) for (const m of o.miembros) if (m.d.grupo_id) cuenta.set(m.d.grupo_id, (cuenta.get(m.d.grupo_id) || 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => ({ value: g, label: `${datos.grupoPorId[g]?.sigla || g} (${n})` }));
  }, [organos, datos]);

  const cargoOptions = useMemo(() => {
    const cuenta = new Map();
    for (const o of organos || []) for (const m of o.miembros) cuenta.set(familia(m.cargo_norm), (cuenta.get(familia(m.cargo_norm)) || 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => ({ value: f, label: `${f} (${n})` }));
  }, [organos]);

  const filtrando = grupoFilter.size > 0 || cargoFilter.size > 0 || !!search;
  const visibles = useMemo(() => {
    const q = normalizar(search);
    const out = {};
    for (const o of organos || []) {
      out[o.id] = o.miembros.filter((m) => {
        if (grupoFilter.size > 0 && !grupoFilter.has(m.d.grupo_id)) return false;
        if (cargoFilter.size > 0 && !cargoFilter.has(familia(m.cargo_norm))) return false;
        if (q && !normalizar(m.d.nombre).includes(q)) return false;
        return true;
      });
    }
    return out;
  }, [organos, grupoFilter, cargoFilter, search]);
  const total = Object.values(visibles).reduce((s, l) => s + l.length, 0);

  function limpiar() {
    setSearch('');
    setGrupoFilter(new Set());
    setCargoFilter(new Set());
  }

  if (!cfg) return <div className="sec"><Vacio texto="No tenemos este parlamento." /></div>;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <CabeceraParlamento p={p} datos={datos} />
      <PestanasParlamento p={p} />

      {error ? (
        <Vacio icono="ti-alert-circle" texto="No se ha podido cargar la composición. Inténtalo de nuevo en un momento." />
      ) : organos === null ? (
        <div className="spinner"></div>
      ) : organos.length === 0 ? (
        <Vacio icono="ti-building-bank" texto="Todavía no hay órganos de gobierno cargados." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 20, padding: '7px 14px', flex: '1 1 180px' }}>
              <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre..."
                aria-label="Buscar miembro de un órgano de gobierno"
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
              />
            </div>
            <MultiSelectFilter label="Grupo" values={grupoOptions} selected={grupoFilter} onApply={setGrupoFilter} />
            <MultiSelectFilter label="Cargo" values={cargoOptions} selected={cargoFilter} onApply={setCargoFilter} />
          </div>

          {(grupoFilter.size > 0 || cargoFilter.size > 0) && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              {[...grupoFilter].map((v) => (
                <span key={`g${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
                  {datos.grupoPorId[v]?.sigla || v}
                </span>
              ))}
              {[...cargoFilter].map((v) => (
                <span key={`c${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
                  {v}
                </span>
              ))}
              <span onClick={limpiar} style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}>
                Limpiar filtros
              </span>
            </div>
          )}

          <p style={{ fontSize: 11.5, color: '#888', margin: '0 0 12px' }}>
            {filtrando ? `${total} cargos con estos filtros` : `${organos.length} órganos · ${total} cargos · ${cfg.legislatura} Legislatura`}
          </p>

          {filtrando && total === 0 && (
            <Vacio icono="ti-user-off" texto="Nadie coincide con estos filtros.">
              <div style={{ marginTop: 10 }}>
                <button className="btn-o" onClick={limpiar}>
                  Limpiar filtros
                </button>
              </div>
            </Vacio>
          )}

          {organos.map((o) => {
            const lista = visibles[o.id] || [];
            const abierto = filtrando ? lista.length > 0 : abiertos?.has(o.id);
            if (filtrando && lista.length === 0) return null;
            return (
              <div key={o.id} className="card" style={{ padding: '16px 18px', marginBottom: 10 }}>
                <div onClick={() => alternar(o.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 12 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.3px' }}>
                    {o.nombre} · {filtrando ? lista.length : o.miembros.length}
                  </div>
                  <i className={`ti ${abierto ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ color: '#999', fontSize: 16, flexShrink: 0 }}></i>
                </div>
                {abierto && (
                  <div style={{ marginTop: 12 }}>
                    {lista.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: '#aaa', padding: '8px 0' }}>Sin composición cargada.</div>
                    ) : (
                      lista.map((m, i) => <Miembro key={m.id} m={m} p={p} grupo={datos.grupoPorId[m.d.grupo_id]} ultimo={i === lista.length - 1} />)
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
