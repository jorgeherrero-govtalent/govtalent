// Índice de candidatos por provincia al final de /elecciones-29n.
// Una fila por provincia con los números 1 de cada lista; al abrirla, las
// listas completas de los partidos con representación. Va con <details>:
// sin JavaScript y con todos los nombres en el HTML, para que buscadores y
// asistentes de IA los lean aunque la fila esté cerrada.

import { provincias, slugProvincia, listasProvincia } from '@/lib/elecciones29nProvincias';

function Etiqueta({ nuevo }) {
  return <span className={`etq-m ${nuevo ? 'nu' : 'si'}`}>{nuevo ? 'Nuevo' : 'Repite'}</span>;
}

export default function IndiceProvincias({ datos, cand }) {
  return (
    <section className="blk" id="indice">
      <div className="ante">Candidatos por provincia</div>
      <h2>Las listas de cada provincia</h2>
      <p className="lead">
        Todos los candidatos al Congreso de los partidos con representación, por su número en la lista. Abre una provincia para ver las listas completas.
      </p>
      <div className="ip">
        {provincias(datos).map((z) => {
          const listas = listasProvincia(datos, cand, z);
          const escanos = listas[0]?.filas.length || 0;
          return (
            <details key={z} className="ip-fila">
              <summary>
                <span className="ip-z">
                  {z}
                  <small>{escanos === 1 ? '1 escaño' : `${escanos} escaños`}</small>
                </span>
                <span className="ip-cabs">
                  {listas.map((l) => (
                    <span key={l.siglas} className="ip-cab">
                      <i style={{ background: l.color }} />
                      {l.filas[0]?.n}
                    </span>
                  ))}
                </span>
                <span className="ip-ver" aria-hidden="true">
                  Ver listas
                </span>
              </summary>
              <div className="ip-listas">
                {listas.map((l) => (
                  <div key={l.siglas}>
                    <h3>
                      <i style={{ background: l.color }} />
                      {l.siglas}
                    </h3>
                    <ol>
                      {l.filas.map((f) => (
                        <li key={f.o}>
                          {f.n}
                          <Etiqueta nuevo={f.nuevo} />
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
                <p className="ip-ir">
                  <a href={`/elecciones-29n/${slugProvincia(z)}`}>Ver la página de {z}, con el cargo de cada candidato →</a>
                </p>
              </div>
            </details>
          );
        })}
      </div>
      <div className="ip-ley">
        <span>
          <span className="etq-m si">Repite</span> diputado en el Congreso hoy
        </span>
        <span>
          <span className="etq-m nu">Nuevo</span> no es diputado hoy
        </span>
      </div>
    </section>
  );
}
