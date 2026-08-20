'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Quién se ha pronunciado sobre un expediente.
 *
 * Es lo que faltaba al compararlo con Fren: sabíamos quién lo tramita
 * —la DG, el comisario— pero no quién intenta influir en él.
 *
 * LA MARCA «EN EL REGISTRO» ES LA CLAVE. Distingue a quien está inscrito
 * como grupo de interés de quien opina a título particular: son dos
 * cosas distintas y mezclarlas escondería la señal.
 */

const GRUPOS = [
  { id: 'empresas', label: 'Empresas', color: '#6d5aef' },
  { id: 'patronales', label: 'Patronales', color: '#8b7ff2' },
  { id: 'ong', label: 'ONG y sindicatos', color: '#b3a9f7' },
  { id: 'particulares', label: 'Particulares', color: '#d6d2ca' },
  { id: 'otros', label: 'Otros', color: '#c4c0b8' },
];

function normalizar(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function iniciales(n) {
  const p = (n || '').replace(/[^\wÁÉÍÓÚÑáéíóúñ ]/g, '').trim().split(/\s+/);
  if (p.length === 1) return (p[0] || '').slice(0, 3).toUpperCase();
  return `${p[0]?.[0] || ''}${p[1]?.[0] || ''}`.toUpperCase();
}

export default function Aportaciones({ initiativeId, diasRestantes }) {
  const supabase = createClient();

  const [items, setItems] = useState(null);
  const [reparto, setReparto] = useState([]);
  const [filtro, setFiltro] = useState(null);
  const [soloRegistro, setSoloRegistro] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const [verTodas, setVerTodas] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!initiativeId) return;
    let cancelled = false;

    (async () => {
      const [{ data: f }, { data: r }] = await Promise.all([
        supabase
          .from('eu_feedback_detalle')
          .select('*')
          .eq('initiative_id', initiativeId)
          // Las del registro primero: son las que aportan señal
          .order('en_registro', { ascending: false })
          .order('fecha', { ascending: false })
          .limit(300),
        supabase.from('eu_feedback_reparto').select('*').eq('initiative_id', initiativeId),
      ]);
      if (cancelled) return;
      setItems(f || []);
      setReparto(r || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [initiativeId]);

  const total = useMemo(() => reparto.reduce((s, r) => s + r.n, 0), [reparto]);
  const registradas = useMemo(() => reparto.reduce((s, r) => s + r.n_registradas, 0), [reparto]);
  const organizaciones = useMemo(
    () => new Set((items || []).filter((i) => i.organizacion).map((i) => i.organizacion)).size,
    [items]
  );

  const barras = useMemo(
    () =>
      GRUPOS.map((g) => {
        const r = reparto.find((x) => x.grupo === g.id);
        return { ...g, n: r?.n || 0, registradas: r?.n_registradas || 0 };
      }).filter((g) => g.n > 0),
    [reparto]
  );

  const filtradas = useMemo(() => {
    let l = items || [];
    if (soloRegistro) l = l.filter((i) => i.en_registro);
    if (filtro) l = l.filter((i) => i.grupo === filtro);
    // Buscar por nombre: con 250 organizaciones, encontrar una concreta
    // recorriendo la lista no es viable.
    if (busca.trim().length >= 2) {
      const q = normalizar(busca);
      l = l.filter((i) => normalizar(i.organizacion || '').includes(q) || normalizar(i.pais || '').includes(q));
    }
    return l;
  }, [items, filtro, soloRegistro, busca]);

  if (items === null) return null;
  if (total === 0) return null;

  // Con casi ninguna organización registrada, una lista de particulares
  // no dice nada: mejor el hecho en una frase.
  if (registradas < 3) {
    return (
      <div style={{ padding: '4px 0' }}>
        <div style={{ fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 6 }}>
          QUIÉN SE HA PRONUNCIADO
        </div>
        <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6 }}>
          {total.toLocaleString('es-ES')} aportaciones, casi todas de particulares.{' '}
          {registradas === 0
            ? 'Ninguna organización registrada se ha pronunciado hasta ahora.'
            : `${registradas} ${registradas === 1 ? 'organización registrada se ha pronunciado' : 'organizaciones registradas se han pronunciado'} hasta ahora.`}
        </div>
      </div>
    );
  }

  const visibles = verTodas ? filtradas : filtradas.slice(0, 6);

  const chip = (activo) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10.5,
    color: activo ? '#3C3489' : '#8b8780',
    background: activo ? '#f0eefe' : 'transparent',
    border: 'none',
    borderRadius: 12,
    padding: '4px 9px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ padding: '4px 0' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 5, flexWrap: 'wrap' }}
      >
        <div style={{ fontSize: 11, color: '#a8a49c', letterSpacing: '.4px' }}>QUIÉN SE HA PRONUNCIADO</div>
      </div>
      <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 16 }}>
        {organizaciones.toLocaleString('es-ES')} organizaciones han aportado a esta consulta
        {diasRestantes > 0 && `. Quedan ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`}.
      </div>

      {/* La barra dice de un vistazo si el asunto lo mueven las empresas,
          las patronales o la sociedad civil. */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
        {barras.map((g, i) => (
          <span
            key={g.id}
            title={`${g.label}: ${g.n}`}
            style={{
              flex: g.n,
              height: 6,
              background: g.color,
              borderRadius: i === 0 ? '3px 0 0 3px' : i === barras.length - 1 ? '0 3px 3px 0' : 0,
              opacity: filtro && filtro !== g.id ? 0.35 : 1,
              transition: 'opacity .15s ease',
            }}
          ></span>
        ))}
      </div>

      {verTodas && filtradas.length > 6 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => {
              setVerTodas(false);
              setAbierta(null);
            }}
            style={{ fontSize: 12, color: '#6d5aef', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Ver menos
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {barras.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setFiltro(filtro === g.id ? null : g.id)}
            style={chip(filtro === g.id)}
          >
            <span style={{ width: 7, height: 7, borderRadius: 2, background: g.color, flexShrink: 0 }}></span>
            {g.label} {g.n}
          </button>
        ))}
        <span style={{ width: 1, height: 14, background: '#f2f0ec', margin: '0 5px' }}></span>
        {/* El filtro más útil: quita a los particulares y deja a quien
            está inscrito como grupo de interés. */}
        <button type="button" onClick={() => setSoloRegistro((v) => !v)} style={chip(soloRegistro)}>
          Solo del registro {registradas}
        </button>
      </div>

      {/* Con 250 organizaciones, buscar una concreta es lo primero que
          se necesita. */}
      {(items || []).length > 12 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#faf9f7',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 14,
          }}
        >
          <i className="ti ti-search" style={{ color: '#a8a49c', fontSize: 13 }}></i>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar una organización…"
            aria-label="Buscar organización"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%', fontFamily: 'inherit' }}
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpiar"
              style={{ background: 'none', border: 'none', color: '#b8b4ac', cursor: 'pointer', padding: 0, fontSize: 14 }}
            >
              ×
            </button>
          )}
        </div>
      )}

      {filtradas.length === 0 ? (
        <div style={{ fontSize: 12, color: '#a8a49c', padding: '10px 0', borderTop: '.5px solid #f2f0ec' }}>
          {busca ? `No hay ninguna organización que coincida con «${busca}».` : 'Nadie de este tipo se ha pronunciado.'}
        </div>
      ) : (
        visibles.map((f) => {
          const abiertaEsta = abierta === f.id;
          const desplegable = !f.solo_adjunto && (f.texto || '').length > 60;
          return (
            <div key={f.id} style={{ borderTop: '.5px solid #f2f0ec', padding: '12px 0' }}>
              <div
                onClick={() => desplegable && setAbierta(abiertaEsta ? null : f.id)}
                style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: desplegable ? 'pointer' : 'default' }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: f.en_registro ? '#f0eefe' : '#f5f4f1',
                    color: f.en_registro ? '#3C3489' : '#8b8780',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9.5,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {iniciales(f.organizacion || f.tipo_es)}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                    {f.organizacion || <span style={{ color: '#8b8780', fontWeight: 400 }}>Sin identificar</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 2 }}>
                    {[f.tipo_es, f.pais, fechaCorta(f.fecha)].filter(Boolean).join(' · ')}
                  </div>
                  {f.solo_adjunto && (
                    <div
                      style={{ fontSize: 11, color: '#8b8780', marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <i className="ti ti-file-text" style={{ fontSize: 12 }}></i>
                      Sin texto · adjuntó un documento
                    </div>
                  )}
                </div>

                {f.en_registro && (
                  <span
                    style={{
                      fontSize: 10,
                      color: '#1d6f5c',
                      background: '#e8f4f0',
                      padding: '3px 8px',
                      borderRadius: 11,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    En el registro
                  </span>
                )}

                {desplegable && (
                  <i
                    className={`ti ti-chevron-${abiertaEsta ? 'up' : 'down'}`}
                    style={{ color: abiertaEsta ? '#8b8780' : '#c4c0b8', fontSize: 15, flexShrink: 0, marginTop: 8 }}
                  ></i>
                )}
              </div>

              {/* El texto entero y no un extracto: la media son 1.658
                  caracteres, así que cortarlo dejaría fuera el argumento. */}
              {abiertaEsta && (
                <div style={{ margin: '13px 0 0 44px', paddingLeft: 13, borderLeft: '2px solid #f0eefe' }}>
                  <div style={{ fontSize: 12.5, color: '#3f3d39', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                    {f.texto}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {f.n_adjuntos > 0 && (
                      <span style={{ fontSize: 11.5, color: '#8b8780', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-file-text" style={{ fontSize: 13 }}></i>
                        {f.n_adjuntos} {f.n_adjuntos === 1 ? 'documento adjunto' : 'documentos adjuntos'}
                      </span>
                    )}
                    {f.url_registro && (
                      <a
                        href={f.url_registro}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11.5, color: '#6d5aef', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <i className="ti ti-external-link" style={{ fontSize: 13 }}></i> Ver en el registro
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {filtradas.length > 6 && (
        <button
          type="button"
          onClick={() => {
            setVerTodas((v) => !v);
            setAbierta(null);
          }}
          style={{ fontSize: 12, color: '#6d5aef', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 0 0' }}
        >
          {verTodas ? 'Ver menos' : `Ver las ${filtradas.length}`}
        </button>
      )}
    </div>
  );
}
