'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Los resultados completos del buscador de la barra.
 *
 * El desplegable enseña ocho para reconocer algo deprisa. Aquí caben
 * cien y se pueden filtrar por tipo, que es lo que se necesita cuando
 * lo que se busca no salió arriba.
 *
 * AQUÍ SÍ SE AGRUPA, al revés que en el desplegable. Allí las cabeceras
 * ocupaban la mitad del panel; en una página entera son justo lo que
 * permite saltar a la parte que interesa.
 */

const MORADO = '#6d5aef';

const ETIQUETA_TIPO = {
  diputado: 'Diputado',
  'miembro-gobierno': 'Gobierno',
  'alto-cargo': 'Alto cargo',
  eurodiputado: 'Eurodiputado',
  comisario: 'Comisario',
  'persona-comision-ue': 'Comisión Europea',
  organismo: 'Organismo',
  'direccion-general-ue': 'Dirección general',
  comision: 'Comisión',
  'comision-ue': 'Comisión del PE',
  'grupo-parlamentario': 'Grupo parlamentario',
  organizacion: 'Organización',
  oferta: 'Oferta',
};

const ICONO_TIPO = {
  diputado: 'ti-user',
  'miembro-gobierno': 'ti-user',
  'alto-cargo': 'ti-user',
  eurodiputado: 'ti-user',
  comisario: 'ti-user',
  'persona-comision-ue': 'ti-user',
  organismo: 'ti-building-bank',
  'direccion-general-ue': 'ti-building-bank',
  comision: 'ti-users-group',
  'comision-ue': 'ti-users-group',
  'grupo-parlamentario': 'ti-users-group',
  organizacion: 'ti-building-store',
  oferta: 'ti-briefcase',
};

const ES_PERSONA = new Set([
  'diputado',
  'miembro-gobierno',
  'alto-cargo',
  'eurodiputado',
  'comisario',
  'persona-comision-ue',
]);

function iniciales(nombre) {
  const ws = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (ws.length === 0) return '?';
  return (ws[0][0] + (ws[1]?.[0] || '')).toUpperCase();
}

function Avatar({ fila, tam = 36 }) {
  const persona = ES_PERSONA.has(fila.kind);
  const base = {
    width: tam,
    height: tam,
    borderRadius: persona ? '50%' : 8,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: '#f0eefe',
    color: MORADO,
  };

  if (fila.imagen) {
    return (
      <span style={base}>
        <img src={fila.imagen} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
    );
  }
  if (persona) {
    return <span style={{ ...base, fontSize: 12, fontWeight: 600 }}>{iniciales(fila.titulo)}</span>;
  }
  return (
    <span style={base}>
      <i className={`ti ${ICONO_TIPO[fila.kind] || 'ti-file-text'}`} style={{ fontSize: 17 }} aria-hidden="true"></i>
    </span>
  );
}

function Resultados() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();
  const termino = sp?.get('q') || '';

  const [q, setQ] = useState(termino);
  const [filas, setFilas] = useState(null);
  const [grupo, setGrupo] = useState('');

  useEffect(() => {
    setQ(termino);
  }, [termino]);

  const cargar = useCallback(async () => {
    if (!termino || termino.trim().length < 2) {
      setFilas([]);
      return;
    }
    setFilas(null);
    const { data, error } = await supabase.rpc('buscar_global', { q: termino.trim(), limite: 100 });
    setFilas(error ? [] : data || []);
  }, [supabase, termino]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Los grupos que han devuelto algo, con su recuento. No se ofrece un
  // filtro para un grupo vacío: solo serviría para vaciar la pantalla.
  const grupos = useMemo(() => {
    const c = new Map();
    for (const f of filas || []) c.set(f.grupo, (c.get(f.grupo) || 0) + 1);
    return [...c.entries()];
  }, [filas]);

  const visibles = useMemo(
    () => (filas || []).filter((f) => !grupo || f.grupo === grupo),
    [filas, grupo]
  );

  // Se conserva el orden que trae el servidor y solo se parte por grupo.
  const secciones = useMemo(() => {
    const out = [];
    const idx = new Map();
    for (const f of visibles) {
      if (!idx.has(f.grupo)) {
        idx.set(f.grupo, out.length);
        out.push({ nombre: f.grupo, filas: [] });
      }
      out[idx.get(f.grupo)].filas.push(f);
    }
    return out;
  }, [visibles]);

  function buscar(e) {
    e?.preventDefault();
    if (q.trim().length >= 2) router.push(`/buscar?q=${encodeURIComponent(q.trim())}`);
  }

  const chip = (activo) => ({
    padding: '6px 12px',
    borderRadius: 7,
    fontSize: 12.5,
    cursor: 'pointer',
    border: 'none',
    fontFamily: 'inherit',
    background: activo ? '#f0eefe' : 'transparent',
    color: activo ? MORADO : '#8b8780',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <form
        onSubmit={buscar}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderRadius: 22,
          padding: '10px 16px',
          marginBottom: 16,
        }}
      >
        <i className="ti ti-search" style={{ color: '#a8a49c', fontSize: 15 }} aria-hidden="true"></i>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en todo GovTalent"
          aria-label="Buscar"
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%' }}
        />
      </form>

      {filas === null ? (
        <div className="spinner"></div>
      ) : filas.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-search-off"></i>
            {termino.trim().length < 2
              ? 'Escribe al menos dos letras.'
              : `Nada para «${termino}».`}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 2, marginBottom: 16, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setGrupo('')} style={chip(!grupo)}>
              Todo ({filas.length})
            </button>
            {grupos.map(([nombre, n]) => (
              <button key={nombre} type="button" onClick={() => setGrupo(nombre)} style={chip(grupo === nombre)}>
                {nombre} ({n})
              </button>
            ))}
          </div>

          {secciones.map((s) => (
            <div key={s.nombre} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10.5, color: '#a8a49c', letterSpacing: '.3px', marginBottom: 7 }}>
                {s.nombre.toUpperCase()}
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {s.filas.map((f, i) => (
                  <Link
                    key={`${f.kind}-${f.ref_id}`}
                    href={f.ruta}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '11px 15px',
                      textDecoration: 'none',
                      color: 'inherit',
                      borderTop: i === 0 ? 'none' : '.5px solid #f0f0eb',
                    }}
                  >
                    <Avatar fila={f} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{f.titulo}</div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: '#8b8780',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {[ETIQUETA_TIPO[f.kind] || f.grupo, f.contexto].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#c9c7bd', flexShrink: 0 }}></i>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {/* El tope de cien es del RPC. Se dice en vez de dejar creer
              que eso es todo lo que hay. */}
          {filas.length >= 100 && (
            <p style={{ fontSize: 11.5, color: '#a8a49c', textAlign: 'center', margin: 0 }}>
              Se muestran los cien primeros. Afina la búsqueda para ver menos y mejores.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function BuscarPage() {
  return (
    <Suspense fallback={<div className="spinner"></div>}>
      <Resultados />
    </Suspense>
  );
}
