'use client';

// Buscador de candidatos al Congreso al final de /elecciones-29n.
// Misma interfaz que los listados de GovTalent: buscador, filtros de
// provincia, partido y Repite/Nuevo, tabla y la paginación de la plataforma.
// Todas las filas van en el HTML (las que no tocan en la página, ocultas),
// para que buscadores y asistentes de IA lean los 1.792 nombres.

import { useMemo, useState } from 'react';
import Paginacion, { usePaginacion } from '@/components/Paginacion';

// Miles con punto también en cuatro cifras (1.792), como en el resto de GovTalent.
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// filas: [nombre, provincia, slug, siglas, grupo, puesto, repite (1/0), cargo]
export default function BuscadorCandidatos({ filas, provincias, partidos }) {
  const [q, setQ] = useState('');
  const [prov, setProv] = useState('');
  const [partido, setPartido] = useState('');
  const [estado, setEstado] = useState('todos');

  const indice = useMemo(() => filas.map((f) => sinTildes(`${f[0]} ${f[1]} ${f[3]} ${f[7] || ''}`)), [filas]);

  const visibles = useMemo(() => {
    const t = sinTildes(q.trim());
    return filas
      .map((f, i) => i)
      .filter((i) => {
        const f = filas[i];
        if (prov && f[1] !== prov) return false;
        if (partido && f[4] !== partido) return false;
        if (estado === 'repiten' && !f[6]) return false;
        if (estado === 'nuevos' && f[6]) return false;
        if (t && !t.split(/\s+/).every((p) => indice[i].includes(p))) return false;
        return true;
      });
  }, [filas, indice, q, prov, partido, estado]);

  const pag = usePaginacion(visibles.length, [q, prov, partido, estado]);
  const enPagina = useMemo(() => new Set(visibles.slice(pag.desde, pag.hasta)), [visibles, pag.desde, pag.hasta]);

  const resumen = `${miles(visibles.length)} ${visibles.length === 1 ? 'candidato' : 'candidatos'}${prov ? ` en ${prov}` : ''}`;

  return (
    <section className="blk" id="candidatos">
      <div className="bc-cab">
        <div>
          <div className="ante">Candidatos al Congreso</div>
          <h2>Busca en las listas</h2>
          <p className="lead">
            Los {miles(filas.length)} candidatos de los partidos con representación hoy, en las 52 provincias.
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
        <select className={`bc-sel${prov ? ' on' : ''}`} value={prov} onChange={(e) => setProv(e.target.value)} aria-label="Provincia">
          <option value="">Provincia</option>
          {provincias.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <select className={`bc-sel${partido ? ' on' : ''}`} value={partido} onChange={(e) => setPartido(e.target.value)} aria-label="Partido">
          <option value="">Partido</option>
          {partidos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="bc-seg" role="group" aria-label="Estado">
          {[
            ['todos', 'Todos'],
            ['repiten', 'Repiten'],
            ['nuevos', 'Nuevos'],
          ].map(([k, l]) => (
            <button key={k} type="button" className={estado === k ? 'on' : ''} aria-pressed={estado === k} onClick={() => setEstado(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="bc-cuenta" aria-live="polite">
        {resumen}
      </div>

      <div className="bc-caja">
        <table className="bc-tabla">
          <thead>
            <tr>
              <th>Candidato</th>
              <th className="bc-c-par">Partido</th>
              <th className="bc-c-pro">Provincia</th>
              <th>Puesto</th>
              <th aria-label="Estado"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} hidden={!enPagina.has(i)}>
                <td>
                  {f[0]}
                  {f[7] && <small>{f[7]}</small>}
                  <small className="bc-movil">
                    {f[3]}, {f[1]}
                  </small>
                </td>
                <td className="bc-c-par">{f[3]}</td>
                <td className="bc-c-pro">
                  <a href={`/elecciones-29n/${f[2]}`}>{f[1]}</a>
                </td>
                <td className="bc-pto">Nº {f[5]}</td>
                <td>
                  <span className={`bc-etq ${f[6] ? 'si' : 'nu'}`}>{f[6] ? 'Repite' : 'Nuevo'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="bc-vacio">No hay candidatos con estos filtros.</p>}
        <Paginacion pag={pag} dentro />
      </div>
    </section>
  );
}
