'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';

/**
 * Organismos y reguladores de la Administración General del Estado.
 *
 * Los datos vienen de age_units, cargada desde DIR3 —el Directorio
 * Común de Unidades Orgánicas, que publica el Ministerio de Hacienda y
 * se actualiza cada mes.
 *
 * Aquí solo entran los entes con personalidad jurídica propia:
 * organismos autónomos, agencias estatales y entidades de derecho
 * público. Las direcciones generales y demás estructura ministerial
 * están en la sección de Ministerios, porque no son lo mismo: la CNMC
 * no es una unidad de un ministerio sino una autoridad independiente, y
 * para asuntos públicos esa distinción cambia cómo se trata.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

const CATEGORIAS = [
  { v: 'organismo_autonomo', label: 'Organismos autónomos' },
  { v: 'agencia_estatal', label: 'Agencias estatales' },
  { v: 'entidad_derecho_publico', label: 'Entidades de derecho público' },
  { v: 'entidad_gestora', label: 'Entidades gestoras' },
  { v: 'consorcio', label: 'Consorcios' },
  { v: 'fundacion', label: 'Fundaciones públicas' },
];

const ETIQUETA_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.v, c.label]));

// Sin el punto final ni el ", O.A." que DIR3 arrastra en algunos
// nombres: "Instituto Nacional de Administración Pública, O.A." se lee
// mejor sin la coletilla.
function limpiar(nombre) {
  return (nombre || '').replace(/,?\s*O\.\s?A\.\s*$/i, '').trim();
}

export default function OrganismosPage() {
  const supabase = createClient();

  const [unidades, setUnidades] = useState([]);
  const [titulares, setTitulares] = useState({});
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [cats, setCats] = useState(new Set());
  const [mins, setMins] = useState(new Set());

  const cargar = useCallback(async () => {
    const [{ data: u }, { data: p }] = await Promise.all([
      supabase
        .from('age_units')
        .select('dir3_code, nombre, categoria, raiz_nombre, cif')
        .eq('activo', true)
        .in('categoria', CATEGORIAS.map((c) => c.v))
        .order('nombre'),
      // El titular, cuando lo hay: no todos los organismos lo tienen
      // cargado todavía.
      supabase
        .from('government_officials')
        .select('dir3_code, full_name, role, slug')
        .eq('active', true)
        .not('dir3_code', 'is', null),
    ]);

    setUnidades(u || []);
    const porUnidad = {};
    for (const x of p || []) {
      if (!porUnidad[x.dir3_code]) porUnidad[x.dir3_code] = x;
    }
    setTitulares(porUnidad);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const ministerios = useMemo(() => {
    const set = new Map();
    for (const u of unidades) {
      if (u.raiz_nombre) set.set(u.raiz_nombre, (set.get(u.raiz_nombre) || 0) + 1);
    }
    return [...set.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([nombre, n]) => ({ value: nombre, label: `${nombre} (${n})` }));
  }, [unidades]);

  const categorias = useMemo(() => {
    const n = {};
    for (const u of unidades) n[u.categoria] = (n[u.categoria] || 0) + 1;
    return CATEGORIAS.filter((c) => n[c.v]).map((c) => ({ value: c.v, label: `${c.label} (${n[c.v]})` }));
  }, [unidades]);

  const filtradas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return unidades.filter((u) => {
      if (cats.size > 0 && !cats.has(u.categoria)) return false;
      if (mins.size > 0 && !mins.has(u.raiz_nombre)) return false;
      if (!texto) return true;
      return (
        (u.nombre || '').toLowerCase().includes(texto) ||
        (u.raiz_nombre || '').toLowerCase().includes(texto)
      );
    });
  }, [unidades, q, cats, mins]);

  return (
    <div className="sec">
      <div style={{ marginBottom: 6 }}>
        <Link
          href="/institutions"
          style={{ fontSize: 11.5, color: '#999', textDecoration: 'none' }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 12, verticalAlign: -1, marginRight: 4 }}></i>
          Directorio institucional
        </Link>
      </div>

      <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Organismos y reguladores</h1>
      <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 16px', lineHeight: 1.55 }}>
        Organismos autónomos, agencias estatales y entidades de derecho público de la Administración
        General del Estado.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            minWidth: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: `.5px solid ${BORDE}`,
            borderRadius: 20,
            padding: '9px 16px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 15 }}></i>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar organismo…"
            aria-label="Buscar organismo"
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12.5, background: 'transparent' }}
          />
        </div>
        <MultiSelectFilter
          label="Tipo"
          values={categorias}
          selected={cats}
          onApply={(s) => setCats(new Set(s))}
        />
        <MultiSelectFilter
          label="Ministerio"
          values={ministerios}
          selected={mins}
          onApply={(s) => setMins(new Set(s))}
        />
      </div>

      {(cats.size > 0 || mins.size > 0) && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          {[...cats].map((c) => (
            <span
              key={c}
              onClick={() => setCats((prev) => new Set([...prev].filter((x) => x !== c)))}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 12,
                background: '#f0eefe',
                color: MORADO,
                cursor: 'pointer',
              }}
            >
              {ETIQUETA_CATEGORIA[c] || c} ×
            </span>
          ))}
          {[...mins].map((m) => (
            <span
              key={m}
              onClick={() => setMins((prev) => new Set([...prev].filter((x) => x !== m)))}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 12,
                background: '#f5f4f1',
                color: '#666',
                cursor: 'pointer',
              }}
            >
              {m} ×
            </span>
          ))}
        </div>
      )}

      {cargando ? (
        <div className="spinner"></div>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
            {filtradas.length} {filtradas.length === 1 ? 'organismo' : 'organismos'}
          </div>

          {filtradas.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <i className="ti ti-search-off"></i>
                Nada con esos criterios.
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {filtradas.map((u, i) => {
                const t = titulares[u.dir3_code];
                return (
                  <div
                    key={u.dir3_code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: i === filtradas.length - 1 ? 'none' : '.5px solid #f0f0eb',
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: '#f5f4f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <i className="ti ti-scale" style={{ fontSize: 14, color: '#888' }}></i>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{limpiar(u.nombre)}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#a8a49c',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {[ETIQUETA_CATEGORIA[u.categoria], u.raiz_nombre].filter(Boolean).join(' · ')}
                      </div>
                    </div>

                    {/* El titular solo cuando se conoce. La mayoría de los
                        organismos aún no lo tienen: el BOE los irá
                        rellenando conforme haya nombramientos. */}
                    {t && (
                      <div style={{ flexShrink: 0, textAlign: 'right', maxWidth: 220 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: '#3d3a35',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.full_name}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#a8a49c' }}>{t.role}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 14, lineHeight: 1.6 }}>
            Fuente: Directorio Común de Unidades Orgánicas y Oficinas (DIR3), del Ministerio de Hacienda.
            Los titulares se actualizan con los nombramientos publicados en el BOE.
          </p>
        </>
      )}
    </div>
  );
}
