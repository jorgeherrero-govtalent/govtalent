'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import { PestanasParlamento, CabeceraParlamento, Avatar, Vacio } from '@/components/ParlamentoAutonomico';
import { PARLAMENTOS_UI, base, useComposicion, colorGrupo, normalizar, TIPOS_COMISION, esComision } from '@/lib/ccaa/composicionUI';

/**
 * Comisiones de un parlamento autonómico. Copia de ComisionesTab del
 * Congreso: tarjeta con el tipo, el nombre, el reparto por grupos, quién
 * preside y los portavoces. Mesa, Junta de Portavoces y Diputación
 * Permanente van en Órganos de gobierno.
 */
export default function ComisionesAutonomicasPage() {
  const { p } = useParams();
  const cfg = PARLAMENTOS_UI[p];
  const { datos, error } = useComposicion(p);
  const [search, setSearch] = useState('');
  const [grupoFilter, setGrupoFilter] = useState(new Set());
  const [tipoFilter, setTipoFilter] = useState(new Set());

  const items = useMemo(() => {
    if (!datos) return null;
    return datos.comisiones
      .filter(esComision)
      .map((c) => {
        const miembros = (datos.porComision[c.id] || []).map((m) => ({ ...m, d: datos.diputadoPorId[m.diputado_id] }));
        const reparto = new Map();
        for (const m of miembros) if (m.d?.grupo_id) reparto.set(m.d.grupo_id, (reparto.get(m.d.grupo_id) || 0) + 1);
        const presidente = miembros.find((m) => m.cargo_norm === 'presidencia');
        const portavoces = miembros.filter((m) => m.cargo_norm === 'portavoz');
        return {
          ...c,
          tipo_label: TIPOS_COMISION[c.tipo] || null,
          n_members: miembros.length,
          reparto: [...reparto.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => ({ grupo: datos.grupoPorId[g], n })),
          grupos: [...reparto.keys()],
          presidente: presidente?.d || null,
          portavoces: portavoces.map((m) => m.d).filter(Boolean),
        };
      })
      .sort((a, b) => b.n_members - a.n_members || a.nombre.localeCompare(b.nombre));
  }, [datos]);

  const grupos = useMemo(() => {
    const cuenta = new Map();
    for (const c of items || []) for (const g of c.grupos) cuenta.set(g, (cuenta.get(g) || 0) + 1);
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([g, n]) => ({ value: g, label: `${datos.grupoPorId[g]?.sigla || g} (${n})` }));
  }, [items, datos]);

  const tipos = useMemo(() => {
    const cuenta = new Map();
    for (const c of items || []) if (c.tipo_label) cuenta.set(c.tipo_label, (cuenta.get(c.tipo_label) || 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ value: t, label: `${t} (${n})` }));
  }, [items]);

  const filtered = useMemo(() => {
    let l = items || [];
    if (search) {
      const q = normalizar(search);
      l = l.filter((c) => normalizar(c.nombre).includes(q) || normalizar(c.presidente?.nombre).includes(q));
    }
    if (grupoFilter.size > 0) l = l.filter((c) => c.grupos.some((g) => grupoFilter.has(g)));
    if (tipoFilter.size > 0) l = l.filter((c) => tipoFilter.has(c.tipo_label));
    return l;
  }, [items, search, grupoFilter, tipoFilter]);

  if (!cfg) return <div className="sec"><Vacio texto="No tenemos este parlamento." /></div>;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <CabeceraParlamento p={p} datos={datos} />
      <PestanasParlamento p={p} />

      <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 22,
            padding: '8px 15px',
            flex: '1 1 220px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar comisión o quien la preside..."
            aria-label="Buscar comisión"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter label="Grupo" values={grupos} selected={grupoFilter} onApply={setGrupoFilter} />
        <MultiSelectFilter label="Tipo" values={tipos} selected={tipoFilter} onApply={setTipoFilter} />
        {(grupoFilter.size > 0 || tipoFilter.size > 0 || search) && (
          <span
            onClick={() => {
              setGrupoFilter(new Set());
              setTipoFilter(new Set());
              setSearch('');
            }}
            style={{ fontSize: 11.5, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Limpiar
          </span>
        )}
      </div>

      {error ? (
        <Vacio icono="ti-alert-circle" texto="No se ha podido cargar la composición. Inténtalo de nuevo en un momento." />
      ) : items === null ? (
        <div className="spinner"></div>
      ) : items.length === 0 ? (
        <Vacio icono="ti-users-off" texto={`Aún no hemos cargado las comisiones ${cfg.deNombre}.`} />
      ) : filtered.length === 0 ? (
        <Vacio icono="ti-users-off" texto="No hay comisiones con estos filtros." />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12 }}>
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`${base(p)}/comisiones/${c.slug}`}
                style={{ background: '#fff', borderRadius: 12, padding: 17, textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <div style={{ marginBottom: 13 }}>
                  {c.tipo_label && (
                    <div
                      style={{
                        display: 'inline-block',
                        fontSize: 10.5,
                        borderRadius: 20,
                        padding: '2px 9px',
                        marginBottom: 8,
                        background: c.tipo === 'permanente' ? '#f0eefe' : '#f0f0eb',
                        color: c.tipo === 'permanente' ? '#3c3489' : '#7a736b',
                      }}
                    >
                      {c.tipo_label}
                    </div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{c.nombre}</div>
                  {c.reparto.length > 0 && (
                    <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 11 }}>
                      {c.reparto.map((g) => (
                        <span
                          key={g.grupo?.id}
                          title={`${g.grupo?.sigla} (${g.n})`}
                          style={{ background: colorGrupo(g.grupo), width: `${(g.n / c.n_members) * 100}%` }}
                        ></span>
                      ))}
                    </div>
                  )}
                </div>

                {c.presidente && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderTop: '.5px solid #f0f0eb' }}>
                    <Avatar nombre={c.presidente.nombre} url={c.presidente.foto_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{c.presidente.nombre}</div>
                      <div style={{ fontSize: 10, color: '#999' }}>Preside</div>
                    </div>
                    <span
                      style={{ width: 9, height: 9, borderRadius: 2, background: colorGrupo(datos.grupoPorId[c.presidente.grupo_id]), flexShrink: 0 }}
                      title={datos.grupoPorId[c.presidente.grupo_id]?.sigla}
                    ></span>
                  </div>
                )}

                {c.portavoces.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.3px', margin: '10px 0 8px' }}>
                      Portavoces ({c.portavoces.length})
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {c.portavoces.slice(0, 5).map((d, i) => (
                        <span key={d.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                          <Avatar nombre={d.nombre} url={d.foto_url} size={28} borde />
                        </span>
                      ))}
                      {c.portavoces.length > 5 && (
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: '#f0efe9',
                            border: '2px solid #fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            color: '#8d8b83',
                            marginLeft: -8,
                            flexShrink: 0,
                          }}
                        >
                          +{c.portavoces.length - 5}
                        </span>
                      )}
                      <span style={{ fontSize: 11.5, color: '#1d6f5c', marginLeft: 11 }}>Ver comisión →</span>
                    </div>
                  </>
                )}
              </Link>
            ))}
          </div>

          <div style={{ fontSize: 11.5, color: '#888', marginTop: 16 }}>
            {filtered.length === items.length ? `${items.length} comisiones` : `${filtered.length} de ${items.length} comisiones`}
          </div>
        </>
      )}
    </div>
  );
}
