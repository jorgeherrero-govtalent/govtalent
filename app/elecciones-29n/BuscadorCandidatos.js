'use client';

// Buscador de candidatos al Congreso al final de /elecciones-29n.
// Misma interfaz que los directorios de GovTalent: buscador, filtros en la
// cabecera de cada columna (estilo Airtable, FilterableHeader), tabla y la
// paginación de la plataforma. Incluye el movimiento respecto a 2023.
// Todas las filas van en el HTML (las que no tocan en la página, ocultas),
// para que buscadores y asistentes de IA lean todos los nombres.

import { useMemo, useState } from 'react';
import FilterableHeader from '@/components/FilterableHeader';
import Paginacion, { usePaginacion } from '@/components/Paginacion';
import { TIPOS_2023 } from '@/lib/elecciones29nProvincias';

// Miles con punto también en cuatro cifras (1.808), como en el resto de GovTalent.
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ORDEN_2023 = Object.fromEntries(TIPOS_2023.map(([k], i) => [k, i]));

// filas: [nombre, provincia, slug, siglas, grupo, puesto, repite (1/0), cargo, tipo2023, texto2023]
const N = 0, Z = 1, SLUG = 2, SIG = 3, GRUPO = 4, O = 5, REP = 6, CARGO = 7, T23 = 8, X23 = 9;

const VALOR_ORDEN = {
  nombre: (f) => sinTildes(f[N]),
  partido: (f) => sinTildes(f[SIG]),
  provincia: (f) => sinTildes(f[Z]),
  puesto: (f) => f[O],
  a2023: (f) => ORDEN_2023[f[T23]],
  estado: (f) => f[REP],
};

export default function BuscadorCandidatos({ filas, provincias, partidos }) {
  const [q, setQ] = useState('');
  const [fProv, setFProv] = useState(new Set());
  const [fPartido, setFPartido] = useState(new Set());
  const [f2023, setF2023] = useState(new Set());
  const [fEstado, setFEstado] = useState(new Set());
  const [orden, setOrden] = useState({ key: null, dir: 'asc' });
  const [abierto, setAbierto] = useState(null);

  const indice = useMemo(() => filas.map((f) => sinTildes(`${f[N]} ${f[Z]} ${f[SIG]} ${f[CARGO] || ''}`)), [filas]);

  const visibles = useMemo(() => {
    const t = sinTildes(q.trim());
    const ids = filas
      .map((f, i) => i)
      .filter((i) => {
        const f = filas[i];
        if (fProv.size && !fProv.has(f[Z])) return false;
        if (fPartido.size && !fPartido.has(f[GRUPO])) return false;
        if (f2023.size && !f2023.has(f[T23])) return false;
        if (fEstado.size && !fEstado.has(f[REP] ? 'repite' : 'nuevo')) return false;
        if (t && !t.split(/\s+/).every((p) => indice[i].includes(p))) return false;
        return true;
      });
    if (orden.key) {
      const v = VALOR_ORDEN[orden.key];
      const s = orden.dir === 'desc' ? -1 : 1;
      ids.sort((a, b) => {
        const x = v(filas[a]);
        const y = v(filas[b]);
        return (x < y ? -1 : x > y ? 1 : 0) * s || a - b;
      });
    }
    return ids;
  }, [filas, indice, q, fProv, fPartido, f2023, fEstado, orden]);

  const pag = usePaginacion(visibles.length, [q, fProv, fPartido, f2023, fEstado, orden]);
  const posicion = useMemo(() => {
    const m = new Map();
    visibles.slice(pag.desde, pag.hasta).forEach((i, k) => m.set(i, k));
    return m;
  }, [visibles, pag.desde, pag.hasta]);

  const cabecera = (label, key, values, selected, onApply) => (
    <FilterableHeader
      label={label}
      columnKey={key}
      values={values}
      selected={selected}
      onApply={onApply}
      sortConfig={orden}
      onSort={(k, dir) => setOrden({ key: k, dir })}
      isOpen={abierto === key}
      onToggle={() => setAbierto(abierto === key ? null : key)}
      onClose={() => setAbierto(null)}
    />
  );

  const hayFiltros = fProv.size || fPartido.size || f2023.size || fEstado.size || q || orden.key;
  const limpiar = () => {
    setQ('');
    setFProv(new Set());
    setFPartido(new Set());
    setF2023(new Set());
    setFEstado(new Set());
    setOrden({ key: null, dir: 'asc' });
  };

  // Las filas de la página se pintan en el orden de la lista filtrada.
  const filasOrdenadas = useMemo(() => {
    const enPagina = [...posicion.keys()];
    const resto = filas.map((f, i) => i).filter((i) => !posicion.has(i));
    return [...enPagina, ...resto];
  }, [filas, posicion]);

  return (
    <section className="blk" id="candidatos">
      <div className="bc-cab">
        <div>
          <div className="ante">Candidatos al Congreso</div>
          <h2>Busca en las listas</h2>
          <p className="lead">
            Los {miles(filas.length)} candidatos de los partidos con representación hoy, en las 52 provincias, y su puesto en 2023.
          </p>
        </div>
        <a className="btn-ai-o bc-ir" href="/login?view=signup">
          Consulta el directorio y las fichas completas en GovTalent
          <i className="ti ti-arrow-right" aria-hidden="true"></i>
        </a>
      </div>

      <div className="bc-filtros">
        <label className="bc-busca">
          <i className="ti ti-search" aria-hidden="true"></i>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca un candidato, un cargo o una provincia"
            aria-label="Buscar candidatos"
          />
        </label>
        {hayFiltros ? (
          <button type="button" className="bc-limpiar" onClick={limpiar}>
            Quitar filtros
          </button>
        ) : null}
      </div>
      <div className="bc-cuenta" aria-live="polite">
        {miles(visibles.length)} {visibles.length === 1 ? 'candidato' : 'candidatos'}
      </div>

      <div className="bc-caja">
        <table className="bc-tabla">
          <thead>
            <tr>
              <th>{cabecera('Candidato', 'nombre', [], new Set(), () => {})}</th>
              <th className="bc-c-par">
                {cabecera(
                  'Partido',
                  'partido',
                  partidos.map((p) => ({ value: p, label: p })),
                  fPartido,
                  setFPartido
                )}
              </th>
              <th className="bc-c-pro">
                {cabecera(
                  'Provincia',
                  'provincia',
                  provincias.map((z) => ({ value: z, label: z })),
                  fProv,
                  setFProv
                )}
              </th>
              <th>{cabecera('Puesto', 'puesto', [], new Set(), () => {})}</th>
              <th className="bc-c-23">
                {cabecera(
                  'Respecto a 2023',
                  'a2023',
                  TIPOS_2023.map(([value, label]) => ({ value, label })),
                  f2023,
                  setF2023
                )}
              </th>
              <th>
                {cabecera(
                  'Estado',
                  'estado',
                  [
                    { value: 'repite', label: 'Repite (diputado hoy)' },
                    { value: 'nuevo', label: 'Nuevo (no es diputado hoy)' },
                  ],
                  fEstado,
                  setFEstado
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {filasOrdenadas.map((i) => {
              const f = filas[i];
              return (
                <tr key={i} hidden={!posicion.has(i)}>
                  <td>
                    {f[N]}
                    {f[CARGO] && <small>{f[CARGO]}</small>}
                    <small className="bc-movil">
                      {f[SIG]}, {f[Z]}. {f[X23]}
                    </small>
                  </td>
                  <td className="bc-c-par">{f[SIG]}</td>
                  <td className="bc-c-pro">
                    <a href={`/elecciones-29n/${f[SLUG]}`}>{f[Z]}</a>
                  </td>
                  <td className="bc-pto">Nº {f[O]}</td>
                  <td className={`bc-c-23 bc-m bc-m-${f[T23]}`}>{f[X23]}</td>
                  <td>
                    <span className={`bc-etq ${f[REP] ? 'si' : 'nu'}`}>{f[REP] ? 'Repite' : 'Nuevo'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="bc-vacio">No hay candidatos con estos filtros.</p>}
        <Paginacion pag={pag} dentro />
      </div>
    </section>
  );
}
