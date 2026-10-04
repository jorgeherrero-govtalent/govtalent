'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { FASE1 } from '@/lib/parlamentosAutonomicos';
import {
  VERDE, MORADO, GRIS, CCAA, PROXIMAMENTE, FASES, NOMBRE_FASE, ETIQUETA_TIPO,
  fechaCorta, tituloLegible, plazoCorto, anioPresupuestos,
} from '@/lib/ccaa/vista';

/**
 * Parlamentos autonómicos — portada.
 *
 * Diseño elegido el 04-10-2026 (opción C con la tabla de la A):
 *   1. Franja de presupuestos del año que se tramita, por comunidad.
 *   2. «Esta semana»: los últimos movimientos.
 *   3. Filtros por parlamento y dos vistas: Tabla (por defecto) y Por fase.
 *
 * Los datos salen de las vistas ccaa_resumen y ccaa_movimientos (sql/65),
 * que llena el sync de parlamentos autonómicos tres veces al día.
 */

const CARD = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const CHIP = (on) => ({
  font: 'inherit',
  fontSize: 12.5,
  padding: '7px 12px',
  borderRadius: 999,
  border: `1px solid ${on ? '#1a1a18' : '#e0dfd8'}`,
  background: on ? '#1a1a18' : '#fff',
  color: on ? '#fff' : '#1a1a18',
  cursor: 'pointer',
});

function Etiqueta({ tipo }) {
  if (tipo !== 'presupuestos' && tipo !== 'acompanamiento') return null;
  return <span style={{ color: MORADO }}>{ETIQUETA_TIPO[tipo]}</span>;
}

function Fase({ e }) {
  const plazo = plazoCorto(e);
  if (e.fase === 'enmiendas' && plazo) {
    return (
      <span style={{ fontSize: 12, padding: '4px 9px', borderRadius: 6, background: '#f3f0fe', color: '#4b3bc4', whiteSpace: 'nowrap' }}>
        Enmiendas · {plazo}
      </span>
    );
  }
  return (
    <span style={{ fontSize: 12, padding: '4px 9px', borderRadius: 6, background: '#f4f3ee', color: '#3a3a36', whiteSpace: 'nowrap' }}>
      {e.fase === 'cerrada' ? 'Cerrada' : NOMBRE_FASE[e.fase] || 'En tramitación'}
    </span>
  );
}

function Subtitulo({ e }) {
  const partes = [e.num_expediente && !/^[IVX]+-[0-9A-F]{12}$/.test(e.num_expediente) ? e.num_expediente : null, e.autor].filter(Boolean);
  return (
    <div style={{ fontSize: 12, color: GRIS, marginTop: 3 }}>
      {partes.join(' · ')}
      {(e.tipo_norm === 'presupuestos' || e.tipo_norm === 'acompanamiento') && (
        <>
          {partes.length ? ' · ' : ''}
          <Etiqueta tipo={e.tipo_norm} />
        </>
      )}
    </div>
  );
}

export default function ParlamentosAutonomicosPage() {
  const supabase = createClient();
  const [expedientes, setExpedientes] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [parlamento, setParlamento] = useState('todos');
  const [vista, setVista] = useState('tabla');
  const [conCerradas, setConCerradas] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    const hace7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    Promise.all([
      supabase.from('ccaa_resumen').select('*').order('ultimo_fecha', { ascending: false, nullsFirst: false }).limit(1000),
      supabase
        .from('ccaa_movimientos')
        .select('id, parlamento, titulo, slug, tipo, fecha, descripcion')
        .eq('is_closed', false)
        .gte('fecha', hace7)
        .neq('tipo', 'otro')
        .order('fecha', { ascending: false })
        .limit(9),
    ]).then(([{ data: exps }, { data: movs }]) => {
      setExpedientes(exps || []);
      setMovimientos(movs || []);
    });
  }, []);

  const abiertas = useMemo(() => (expedientes || []).filter((e) => !e.is_closed), [expedientes]);
  const cuenta = useMemo(() => {
    const c = {};
    for (const e of abiertas) c[e.parlamento] = (c[e.parlamento] || 0) + 1;
    return c;
  }, [abiertas]);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (expedientes || []).filter(
      (e) =>
        (conCerradas || !e.is_closed) &&
        (parlamento === 'todos' || e.parlamento === parlamento) &&
        (!q || `${e.titulo} ${e.titulo_es || ''} ${e.num_expediente}`.toLowerCase().includes(q)),
    );
  }, [expedientes, parlamento, conCerradas, busca]);

  // Presupuestos del año en tramitación: registrados o no, por comunidad.
  const anio = anioPresupuestos();
  const presupuestos = useMemo(() => {
    const m = {};
    for (const e of expedientes || []) {
      if (e.tipo_norm === 'presupuestos' && String(e.titulo).includes(String(anio))) m[e.parlamento] = e;
    }
    return m;
  }, [expedientes, anio]);

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Parlamentos autonómicos</h1>
          <p style={{ fontSize: 13, color: GRIS, margin: '4px 0 0' }}>
            Leyes en tramitación en {FASE1.length} parlamentos · actualizado 3 veces al día
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e0dfd8', borderRadius: 9, padding: '8px 12px', minWidth: 260 }}>
          <i className="ti ti-search" aria-hidden="true" style={{ color: GRIS }}></i>
          <input
            type="search"
            value={busca}
            onChange={(ev) => setBusca(ev.target.value)}
            placeholder="Buscar por título o número"
            aria-label="Buscar por título o número"
            style={{ border: 'none', outline: 'none', font: 'inherit', fontSize: 13, background: 'transparent', width: '100%' }}
          />
        </label>
      </div>

      {/* Presupuestos del año: lo primero que se mira en otoño. */}
      <div style={{ background: '#15140f', color: '#f0efe9', borderRadius: 16, padding: '18px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, color: '#b9b6ad', letterSpacing: '.3px', marginBottom: 12 }}>PRESUPUESTOS {anio}</div>
        <div className="ccaa-presu" style={{ display: 'grid', gridTemplateColumns: `repeat(${FASE1.length}, minmax(0, 1fr))`, gap: 8, fontSize: 12.5 }}>
          {FASE1.map((p) => {
            const e = presupuestos[p];
            const contenido = (
              <>
                <div style={{ fontWeight: 600 }}>{CCAA[p]}</div>
                <div style={{ color: e ? '#d5ece5' : '#b9b6ad', marginTop: 3 }}>
                  {e ? `Registrados ${fechaCorta(e.fecha_presentacion) || ''}` : 'Sin registrar'}
                </div>
              </>
            );
            return e ? (
              <Link key={p} href={`/parlamentos-autonomicos/${e.slug}`} style={{ background: VERDE, borderRadius: 10, padding: 10, color: '#fff', textDecoration: 'none' }}>
                {contenido}
              </Link>
            ) : (
              <div key={p} style={{ background: '#26241d', borderRadius: 10, padding: 10 }}>
                {contenido}
              </div>
            );
          })}
        </div>
      </div>

      {movimientos.length > 0 && (
        <div style={{ ...CARD, padding: '18px 22px', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Esta semana</h2>
          <div className="ccaa-semana" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 20 }}>
            {movimientos.map((m) => (
              <Link key={m.id} href={`/parlamentos-autonomicos/${m.slug}`} style={{ padding: '12px 0', borderTop: '1px solid #efeee8', textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div style={{ fontSize: 12, color: GRIS }}>
                  {CCAA[m.parlamento]} · {fechaCorta(m.fecha)}
                </div>
                <div style={{ fontSize: 13, marginTop: 2, fontWeight: 600 }}>{tituloLegible(m.titulo)}</div>
                {m.descripcion && <div style={{ fontSize: 12.5, color: '#3a3a36', marginTop: 2 }}>{m.descripcion.slice(0, 120)}</div>}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setParlamento('todos')} style={CHIP(parlamento === 'todos')}>
            Todos · {abiertas.length}
          </button>
          {FASE1.map((p) => (
            <button key={p} type="button" onClick={() => setParlamento(p)} style={CHIP(parlamento === p)}>
              {CCAA[p]}
              {cuenta[p] ? ` · ${cuenta[p]}` : ''}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 12.5, color: GRIS, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={conCerradas} onChange={(ev) => setConCerradas(ev.target.checked)} />
            Incluir cerradas
          </label>
          <div role="group" aria-label="Vista" style={{ display: 'flex', background: '#e6e4dc', borderRadius: 9, padding: 3, fontSize: 12.5 }}>
            {[
              ['tabla', 'Tabla'],
              ['fases', 'Por fase'],
            ].map(([id, txt]) => (
              <button
                key={id}
                type="button"
                aria-pressed={vista === id}
                onClick={() => setVista(id)}
                style={{
                  font: 'inherit',
                  padding: '6px 12px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  background: vista === id ? '#fff' : 'transparent',
                  boxShadow: vista === id ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
                  color: '#1a1a18',
                }}
              >
                {txt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {expedientes === null ? (
        <div style={{ ...CARD, padding: 24, fontSize: 13, color: GRIS }}>Cargando…</div>
      ) : visibles.length === 0 ? (
        <div style={{ ...CARD, padding: 24, fontSize: 13, color: GRIS }}>No hay leyes que coincidan.</div>
      ) : vista === 'tabla' ? (
        <div style={{ ...CARD, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: GRIS, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Parlamento</th>
                <th style={{ padding: '14px 12px', fontWeight: 600 }}>Iniciativa</th>
                <th style={{ padding: '14px 12px', fontWeight: 600 }}>Fase</th>
                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Último trámite</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid #efeee8' }}>
                  <td style={{ padding: '14px 20px', color: GRIS, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{CCAA[e.parlamento]}</td>
                  <td style={{ padding: '14px 12px', verticalAlign: 'top' }}>
                    <Link href={`/parlamentos-autonomicos/${e.slug}`} style={{ color: '#1a1a18', textDecoration: 'none', fontWeight: 600 }}>
                      {tituloLegible(e.titulo_es || e.titulo)}
                    </Link>
                    <Subtitulo e={e} />
                  </td>
                  <td style={{ padding: '14px 12px', verticalAlign: 'top' }}>
                    <Fase e={e} />
                  </td>
                  <td style={{ padding: '14px 20px', color: '#3a3a36', verticalAlign: 'top' }}>
                    {e.ultimo_descripcion ? e.ultimo_descripcion.slice(0, 110) : '—'}
                    {e.ultimo_fecha && <span style={{ color: GRIS }}> · {fechaCorta(e.ultimo_fecha)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <div className="ccaa-fases" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            {FASES.map((f) => {
              const lista = visibles.filter((e) => e.fase === f.id);
              return (
                <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: GRIS }}>
                    {f.nombre} · <b style={{ color: '#1a1a18' }}>{lista.length}</b>
                  </div>
                  {lista.slice(0, 12).map((e) => {
                    const plazo = f.id === 'enmiendas' ? plazoCorto(e) : null;
                    return (
                      <Link
                        key={e.id}
                        href={`/parlamentos-autonomicos/${e.slug}`}
                        style={{ background: plazo ? '#f3f0fe' : '#f7f6f2', borderRadius: 10, padding: 10, fontSize: 12.5, color: '#1a1a18', textDecoration: 'none' }}
                      >
                        <div style={{ color: plazo ? '#4b3bc4' : GRIS, fontSize: 11.5 }}>
                          {CCAA[e.parlamento]}
                          {plazo ? ` · ${plazo}` : ''}
                        </div>
                        {tituloLegible(e.titulo_es || e.titulo)}
                      </Link>
                    );
                  })}
                  {lista.length > 12 && <div style={{ fontSize: 12, color: GRIS }}>y {lista.length - 12} más</div>}
                </div>
              );
            })}
          </div>
          {visibles.some((e) => !e.fase) && (
            <p style={{ fontSize: 12, color: GRIS, margin: '14px 0 0' }}>
              {visibles.filter((e) => !e.fase).length} sin trámites conocidos todavía: aparecen en la vista de tabla.
            </p>
          )}
        </div>
      )}

      <p style={{ fontSize: 12, color: GRIS, margin: '14px 0 0' }}>Próximamente: {PROXIMAMENTE}.</p>

      <style>{`
        @media (max-width: 900px) {
          .ccaa-presu { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .ccaa-semana { grid-template-columns: minmax(0, 1fr) !important; }
          .ccaa-fases { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </div>
  );
}
