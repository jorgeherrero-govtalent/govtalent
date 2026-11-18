'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DirectorioDemo from '@/components/DirectorioDemo';
import UpgradeModal from '@/components/UpgradeModal';
import { PRUEBA_BUSQUEDAS } from '@/lib/pruebaAIFinder';

/**
 * AI Finder para quien no tiene el Directorio (18-11-2026).
 *
 * Antes veía solo la tabla de demostración. Ahora puede hacer
 * PRUEBA_BUSQUEDAS búsquedas reales con su propia frase: salen las
 * primeras personas con nombre, cargo, unidad e institución, el total y
 * cuántas tienen correo. El correo no se enseña (ni llega al navegador):
 * va con un candado. Guardar, exportar y el candado abren la ventana de
 * planes. Al agotar las búsquedas, vuelve la tabla de demostración.
 *
 * Todo lo decide /api/contactos/prueba; aquí solo se pinta.
 */

const MORADO = '#6d5aef';
const TINTA = '#1a1a18';
const GRIS = '#6f6c64';
const LINEA = '#e6e3dc';

const miles = (n) => Number(n || 0).toLocaleString('es-ES');

export default function PruebaAIFinder({ qInicial = '', cuantos = '' }) {
  const [texto, setTexto] = useState(qInicial);
  const [quedan, setQuedan] = useState(null); // null: aún no se sabe
  const [estado, setEstado] = useState('reposo'); // reposo | buscando | resultado | error
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [upsell, setUpsell] = useState(false);
  const turno = useRef(0);
  const arrancada = useRef(false);

  const buscar = useCallback(
    async (frase) => {
      const q = String(frase || '').trim();
      if (q.length < 3) return;
      const n = ++turno.current;
      setEstado('buscando');
      setError('');
      try {
        const res = await fetch('/api/contactos/prueba', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q }),
        });
        const j = await res.json().catch(() => ({}));
        if (n !== turno.current) return;
        if (res.status === 402) {
          setQuedan(0);
          setR(null);
          setEstado('reposo');
          return;
        }
        if (!res.ok) throw new Error(j.error || 'No se pudo hacer la búsqueda');
        setR(j);
        setQuedan(j.quedan);
        setEstado('resultado');
        // La frase queda en la dirección: recargar repite la búsqueda sin gastar otra.
        try {
          window.history.replaceState(null, '', `${window.location.pathname}?q=${encodeURIComponent(q)}`);
        } catch {}
      } catch (e) {
        if (n !== turno.current) return;
        setError(e.message || 'No se pudo hacer la búsqueda');
        setEstado('error');
      }
    },
    [],
  );

  useEffect(() => {
    if (arrancada.current) return;
    arrancada.current = true;
    if (qInicial.trim().length >= 3) {
      buscar(qInicial);
      return;
    }
    fetch('/api/contactos/prueba', { cache: 'no-store' })
      .then((x) => (x.ok ? x.json() : null))
      .then((j) => setQuedan(j ? j.quedan : PRUEBA_BUSQUEDAS))
      .catch(() => setQuedan(PRUEBA_BUSQUEDAS));
  }, [qInicial, buscar]);

  const agotadas = quedan === 0;
  const buscando = estado === 'buscando';
  const resto = r ? Math.max(0, r.total - r.filas.length) : 0;

  return (
    <div style={{ padding: '24px 28px 40px', maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .pf-caja { border: 1px solid ${LINEA}; border-radius: 14px; background: #fff; padding: 14px 14px 10px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 6px 24px rgba(109,90,239,.07); }
        .pf-caja textarea { border: 0; outline: 0; resize: none; font: inherit; font-size: 15px; color: ${TINTA}; width: 100%; background: transparent; line-height: 1.5; }
        .pf-enviar { width: 36px; height: 36px; border-radius: 50%; border: 0; background: ${TINTA}; color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .pf-enviar:disabled { background: #e3e1da; color: #a5a299; cursor: default; }
        .pf-tabla { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 760px; }
        .pf-tabla th { text-align: left; padding: 11px 16px; border-bottom: 1px solid ${LINEA}; background: #faf9f6; font-size: 12.5px; font-weight: 600; color: ${GRIS}; white-space: nowrap; }
        .pf-tabla td { padding: 11px 16px; border-bottom: 1px solid #efede7; vertical-align: middle; }
        .pf-candado { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d9d7cf; background: #fff; border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 12.5px; color: ${TINTA}; cursor: pointer; white-space: nowrap; }
        .pf-candado:hover { background: #f7f6f2; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>AI Finder</h1>
        {quedan !== null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, background: '#f1effe', color: TINTA, borderRadius: 8, padding: '5px 10px' }}>
            <i className="ti ti-sparkles" style={{ color: MORADO }} aria-hidden="true"></i>
            {agotadas
              ? `Has usado tus ${PRUEBA_BUSQUEDAS} búsquedas de prueba`
              : quedan === 1
                ? 'Te queda 1 búsqueda de prueba'
                : `Te quedan ${quedan} búsquedas de prueba`}
          </span>
        )}
      </div>

      {!agotadas && (
        <form
          className="pf-caja"
          onSubmit={(e) => {
            e.preventDefault();
            buscar(texto);
          }}
        >
          <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <i className="ti ti-sparkles" style={{ color: MORADO, fontSize: 18, marginTop: 2 }} aria-hidden="true"></i>
            <textarea
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  buscar(texto);
                }
              }}
              placeholder="Describe a quién buscas"
              aria-label="Describe a quién buscas"
              maxLength={500}
              disabled={buscando}
            />
          </span>
          <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="pf-enviar" disabled={buscando || texto.trim().length < 3} aria-label="Buscar">
              <i className="ti ti-arrow-up" aria-hidden="true"></i>
            </button>
          </span>
        </form>
      )}

      {buscando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '26px 4px', color: GRIS, fontSize: 14 }}>
          <div className="spinner" style={{ margin: 0 }}></div>
          Buscando en el directorio
        </div>
      )}

      {estado === 'error' && (
        <div style={{ border: `1px solid ${LINEA}`, borderRadius: 12, padding: '14px 16px', fontSize: 13.5, color: TINTA, background: '#fff' }}>
          {error} No has gastado ninguna búsqueda.
        </div>
      )}

      {estado === 'resultado' && r && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 15 }}>{r.total === 1 ? '1 persona' : `${miles(r.total)} personas`}</b>
            {r.conCorreo !== null && r.total > 0 && (
              <span style={{ fontSize: 13, color: GRIS }}>{miles(r.conCorreo)} con correo</span>
            )}
            {r.total > 0 && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-o" onClick={() => setUpsell(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-list-details" aria-hidden="true"></i> Guardar como lista
                </button>
                <button type="button" className="btn-o" onClick={() => setUpsell(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-download" aria-hidden="true"></i> Exportar
                </button>
              </span>
            )}
          </div>

          {r.total === 0 ? (
            <div style={{ border: `1px solid ${LINEA}`, borderRadius: 12, padding: '22px 18px', fontSize: 14, color: GRIS, background: '#fff' }}>
              No hay nadie que encaje con esa descripción. Prueba a decirlo de otra forma: no has gastado ninguna búsqueda.
            </div>
          ) : (
            <div style={{ border: `1px solid ${LINEA}`, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="pf-tabla">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Cargo</th>
                      <th>Unidad</th>
                      <th>Institución</th>
                      <th>Correo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.filas.map((f) => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 600 }}>{f.nombre || 'Sin nombre'}</td>
                        <td>{f.cargo || ''}</td>
                        <td style={{ color: GRIS }}>{f.unidad || ''}</td>
                        <td style={{ color: GRIS }}>{f.institucion || ''}</td>
                        <td>
                          {f.tiene_correo ? (
                            <button type="button" className="pf-candado" onClick={() => setUpsell(true)}>
                              <i className="ti ti-lock" aria-hidden="true"></i> Ver correo
                            </button>
                          ) : (
                            <span style={{ fontSize: 12.5, color: '#8b8780' }}>Sin correo publicado</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '16px 18px', background: '#faf9f6' }}>
                <span style={{ fontSize: 14, color: TINTA }}>
                  {resto > 0 ? (
                    <>
                      <b>{resto === 1 ? 'Y 1 persona más' : `Y ${miles(resto)} personas más`}</b> en esta búsqueda, con su correo y su teléfono.
                    </>
                  ) : (
                    'Con el Directorio ves su correo y su teléfono, guardas listas y exportas.'
                  )}
                </span>
                <a href="/precios" target="_blank" rel="noreferrer" className="btn-p" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
                  Ver planes
                </a>
              </div>
            </div>
          )}
        </>
      )}

      {estado === 'reposo' && (
        <>
          {agotadas && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${LINEA}`, borderRadius: 12, padding: '14px 16px', background: '#fff' }}>
              <span style={{ fontSize: 14, color: TINTA }}>Para seguir buscando, ver los correos y guardar listas, contrata el Directorio.</span>
              <a href="/precios" target="_blank" rel="noreferrer" className="btn-p" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
                Ver planes
              </a>
            </div>
          )}
          <div onClick={() => setUpsell(true)} style={{ cursor: 'pointer' }}>
            <DirectorioDemo />
          </div>
        </>
      )}

      {upsell && (
        <UpgradeModal
          title="El directorio institucional se contrata aparte"
          message={`${cuantos ? cuantos.replace(/^m/, 'M') : 'Miles de'} personas de las instituciones de España y la UE, el cuerpo diplomático, los medios y las organizaciones, con su correo, su teléfono y la fuente de cada dato. Filtra, guarda listas que te avisan de los cambios y exporta a Excel. Incluye 25 créditos de contacto al mes para buscar los correos que falten.`}
          href="/precios"
          onClose={() => setUpsell(false)}
        />
      )}
    </div>
  );
}
