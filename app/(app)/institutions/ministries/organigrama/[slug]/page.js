'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const VERDE = '#1d6f5c';
const MORADO = '#6d5aef';

// Las leyendas de cada ministerio usan vocabulario distinto para lo mismo:
// Sanidad escribe "organismo_publico" donde el MTDFP escribe
// "organismo_autonomo". Se unifican aquí y no en la carga para no perder
// el valor original que venía en la fuente.
const BANDA = {
  ministerio: 'gobierno',
  secretaria_estado: 'secretaria_estado',
  subsecretaria: 'subsecretaria',
  secretaria_general: 'secretaria_general',
  direccion_general: 'direccion_general',
  subdireccion_general: 'subdireccion_general',
  division: 'division',
  gabinete: 'gabinete',
  organismo_autonomo: 'organismo',
  organismo_publico: 'organismo',
  agencia_estatal: 'organismo',
  entidad_derecho_publico: 'organismo',
  entidad_gestora: 'organismo',
  sociedad_mercantil: 'organismo',
  otro_organismo: 'organismo',
  fondo: 'organismo',
  unidad: 'unidad',
};

const ETIQUETA_BANDA = {
  gobierno: 'Titular del departamento',
  secretaria_estado: 'Secretarías de Estado',
  subsecretaria: 'Subsecretaría',
  secretaria_general: 'Secretarías Generales',
  direccion_general: 'Direcciones Generales',
  subdireccion_general: 'Subdirecciones Generales',
  division: 'Divisiones',
  gabinete: 'Gabinetes',
  organismo: 'Organismos y entidades',
  unidad: 'Otras unidades',
};

const ORDEN_BANDA = [
  'gobierno',
  'secretaria_estado',
  'subsecretaria',
  'secretaria_general',
  'direccion_general',
  'subdireccion_general',
  'gabinete',
  'division',
  'organismo',
  'unidad',
];

function banda(categoria) {
  return BANDA[categoria] || 'unidad';
}

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Construye el árbol a partir de superior_id. Se hace en cliente y no con
// una vista recursiva para que la página siga funcionando aunque
// ficha_ministerio no esté creada.
function construirArbol(unidades) {
  const porId = new Map(unidades.map((u) => [u.id, { ...u, hijos: [] }]));
  const raices = [];
  for (const u of porId.values()) {
    if (u.superior_id && porId.has(u.superior_id)) {
      porId.get(u.superior_id).hijos.push(u);
    } else {
      raices.push(u);
    }
  }
  const ordenar = (n) => {
    n.hijos.sort((a, b) => {
      const d = ORDEN_BANDA.indexOf(banda(a.categoria)) - ORDEN_BANDA.indexOf(banda(b.categoria));
      return d !== 0 ? d : a.nombre.localeCompare(b.nombre, 'es');
    });
    n.hijos.forEach(ordenar);
  };
  raices.forEach(ordenar);
  return raices;
}

function contarDescendientes(nodo) {
  return nodo.hijos.reduce((n, h) => n + 1 + contarDescendientes(h), 0);
}

/* ------------------------------------------------------------------ */
/* Vista de contención: el ministerio como contenedor, las secretarías  */
/* dentro, y sus órganos directivos como pastillas. Es la portada.      */
/* ------------------------------------------------------------------ */

function Pastilla({ nodo }) {
  const funcional = nodo.dependencia === 'funcional';
  return (
    <span
      style={{
        fontSize: 12,
        padding: '6px 11px',
        borderRadius: 8,
        background: funcional ? '#fff' : '#e8f4f0',
        color: funcional ? '#666' : '#04342C',
        border: funcional ? '.5px dashed #cfcdc5' : '.5px solid transparent',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
      }}
      title={nodo.titular ? `${nodo.nombre} · ${nodo.titular}` : nodo.nombre}
    >
      {nodo.nombre}
    </span>
  );
}

function BloqueContencion({ nodo }) {
  // Solo se muestran como pastilla los órganos directivos; las
  // subdirecciones se resumen en un contador para que el bloque no crezca
  // con el número de hijos.
  const directivos = nodo.hijos.filter((h) =>
    ['direccion_general', 'secretaria_general', 'subsecretaria', 'organismo'].includes(banda(h.categoria))
  );
  const resto = contarDescendientes(nodo) - directivos.length;

  return (
    <div
      style={{
        background: '#fff',
        border: '.5px solid #e0dfd8',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{nodo.nombre}</div>
      {nodo.titular ? (
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{nodo.titular}</div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {directivos.map((d) => (
          <Pastilla key={d.id} nodo={d} />
        ))}
        {resto > 0 ? (
          <span
            style={{
              fontSize: 12,
              padding: '6px 11px',
              borderRadius: 8,
              background: '#f6f5f1',
              color: '#888',
              whiteSpace: 'nowrap',
            }}
          >
            + {resto} unidades más
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Árbol sangrado: el detalle completo, con guías finas y sin cajas.    */
/* ------------------------------------------------------------------ */

function Rama({ nodo, profundidad, abiertos, alternar, filtro }) {
  const tieneHijos = nodo.hijos.length > 0;
  const abierto = abiertos.has(nodo.id) || filtro.length > 0;
  const funcional = nodo.dependencia === 'funcional';

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={tieneHijos ? () => alternar(nodo.id) : undefined}
        style={{
          padding: '8px 0 8px 14px',
          position: 'relative',
          cursor: tieneHijos ? 'pointer' : 'default',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: -16,
            top: 18,
            width: 14,
            height: 0,
            borderTop: funcional ? '.5px dashed #cfcdc5' : '.5px solid #e0dfd8',
          }}
          aria-hidden="true"
        />

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontSize: profundidad <= 1 ? 14 : 13,
              fontWeight: profundidad <= 1 ? 600 : 400,
              color: nodo.confianza === 'alta' ? '#2C2C2A' : '#6b6a65',
            }}
          >
            {nodo.nombre}
          </span>

          {tieneHijos ? (
            <span style={{ fontSize: 11, color: '#aaa' }}>· {nodo.hijos.length}</span>
          ) : null}

          {funcional ? (
            <span style={{ fontSize: 11, color: '#aaa' }}>· funcional</span>
          ) : null}

          {nodo.confianza !== 'alta' ? (
            <span
              style={{ fontSize: 11, color: MORADO }}
              title="Lectura del organigrama pendiente de revisión"
            >
              · sin revisar
            </span>
          ) : null}
        </div>

        {nodo.titular || nodo.telefono ? (
          <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
            {nodo.titular}
            {nodo.titular && nodo.telefono ? ' · ' : ''}
            {nodo.telefono}
          </div>
        ) : null}
      </div>

      {tieneHijos && abierto ? (
        <div style={{ paddingLeft: 16, borderLeft: '.5px solid #e0dfd8', marginLeft: 4 }}>
          {nodo.hijos.map((h) => (
            <Rama
              key={h.id}
              nodo={h}
              profundidad={profundidad + 1}
              abiertos={abiertos}
              alternar={alternar}
              filtro={filtro}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function OrganigramaMinisterioPage() {
  const supabase = createClient();
  const params = useParams();
  const slug = params?.slug;

  const [fuente, setFuente] = useState(null);
  const [unidades, setUnidades] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [abiertos, setAbiertos] = useState(new Set());

  useEffect(() => {
    if (!slug) return;
    let cancelado = false;

    (async () => {
      const { data: f, error: eF } = await supabase
        .from('organigrama_fuentes')
        .select('id, ministerio, slug, fecha_documento, formato, norma_referencia, norma_url, n_unidades')
        .eq('slug', slug)
        .maybeSingle();

      if (cancelado) return;
      if (eF) {
        setError(eF.message);
        setUnidades([]);
        return;
      }
      if (!f) {
        setFuente(false);
        setUnidades([]);
        return;
      }
      setFuente(f);

      const { data: u, error: eU } = await supabase
        .from('organigrama_unidades')
        .select('id, nombre, categoria, nivel, superior_id, titular, telefono, dependencia, confianza')
        .eq('fuente_id', f.id);

      if (cancelado) return;
      if (eU) setError(eU.message);
      setUnidades(u || []);
    })();

    return () => {
      cancelado = true;
    };
  }, [slug]);

  const arbol = useMemo(() => construirArbol(unidades || []), [unidades]);
  const raiz = arbol[0] || null;

  // Al filtrar se aplana: buscar dentro de un árbol plegado no sirve de
  // nada si el resultado queda escondido tres niveles más abajo.
  const coincidencias = useMemo(() => {
    const q = filtro
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (!q) return null;
    return (unidades || []).filter((u) =>
      `${u.nombre} ${u.titular || ''}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(q)
    );
  }, [unidades, filtro]);

  const porBanda = useMemo(() => {
    const m = new Map();
    for (const u of unidades || []) {
      const b = banda(u.categoria);
      m.set(b, (m.get(b) || 0) + 1);
    }
    return m;
  }, [unidades]);

  function alternar(id) {
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function expandirTodo() {
    setAbiertos(new Set((unidades || []).map((u) => u.id)));
  }

  if (unidades === null) {
    return (
      <div className="sec" style={{ maxWidth: 1080 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (fuente === false) {
    return (
      <div className="sec" style={{ maxWidth: 1080 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-sitemap-off"></i>
            Todavía no hay organigrama cargado para este ministerio.
          </div>
        </div>
        <Link href="/institutions/ministries" style={{ fontSize: 13, color: VERDE }}>
          Volver al directorio
        </Link>
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <Link
          href="/institutions/ministries"
          style={{ fontSize: 12, color: '#888', textDecoration: 'none' }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 14, verticalAlign: '-2px' }}></i> Ministerios
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 3px' }}>{fuente.ministerio}</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {unidades.length} unidades
          {porBanda.get('subdireccion_general')
            ? ` · ${porBanda.get('subdireccion_general')} subdirecciones`
            : ''}
          {fuente.fecha_documento ? ` · organigrama de ${fechaCorta(fuente.fecha_documento)}` : ''}
        </p>
        {fuente.norma_referencia ? (
          <p style={{ fontSize: 12, color: '#aaa', margin: '3px 0 0' }}>{fuente.norma_referencia}</p>
        ) : null}
      </div>

      {error ? (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#888' }}>No se pudo cargar: {error}</span>
        </div>
      ) : null}

      {/* Contención: la portada. Un bloque por órgano superior. */}
      {raiz ? (
        <div style={{ background: '#f6f5f1', borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{raiz.nombre}</div>
          {raiz.titular ? (
            <div style={{ fontSize: 12, color: '#888', marginTop: 3, marginBottom: 14 }}>{raiz.titular}</div>
          ) : (
            <div style={{ marginBottom: 14 }} />
          )}

          {raiz.hijos
            .filter((h) => ['secretaria_estado', 'subsecretaria', 'secretaria_general'].includes(banda(h.categoria)))
            .map((h) => (
              <BloqueContencion key={h.id} nodo={h} />
            ))}
        </div>
      ) : null}

      {/* Detalle: el árbol sangrado. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar unidad o titular..."
          style={{
            flex: 1,
            minWidth: 200,
            fontSize: 13,
            fontFamily: 'inherit',
            padding: '8px 12px',
            borderRadius: 8,
            border: '.5px solid #e0dfd8',
            background: '#fff',
          }}
        />
        <button
          onClick={abiertos.size ? () => setAbiertos(new Set()) : expandirTodo}
          style={{
            fontSize: 12,
            fontFamily: 'inherit',
            padding: '8px 13px',
            borderRadius: 8,
            cursor: 'pointer',
            border: `.5px solid ${VERDE}`,
            background: '#fff',
            color: VERDE,
            whiteSpace: 'nowrap',
          }}
        >
          {abiertos.size ? 'Plegar todo' : 'Desplegar todo'}
        </button>
      </div>

      {coincidencias ? (
        coincidencias.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <i className="ti ti-search-off"></i>
              Ninguna unidad coincide.
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '4px 14px' }}>
            {coincidencias.map((u) => (
              <div key={u.id} style={{ padding: '9px 0', borderBottom: '.5px solid #f0efe9' }}>
                <div style={{ fontSize: 13 }}>{u.nombre}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {ETIQUETA_BANDA[banda(u.categoria)]}
                  {u.titular ? ` · ${u.titular}` : ''}
                  {u.telefono ? ` · ${u.telefono}` : ''}
                </div>
              </div>
            ))}
          </div>
        )
      ) : raiz ? (
        <div className="card" style={{ padding: '8px 16px' }}>
          <div style={{ paddingLeft: 16, borderLeft: '.5px solid #e0dfd8', marginLeft: 6 }}>
            {raiz.hijos.map((h) => (
              <Rama
                key={h.id}
                nodo={h}
                profundidad={1}
                abiertos={abiertos}
                alternar={alternar}
                filtro={filtro}
              />
            ))}
          </div>
        </div>
      ) : null}

      <p style={{ fontSize: 11, color: '#aaa', margin: '12px 0 0' }}>
        Estructura tomada del organigrama oficial publicado por el propio ministerio.
        Las unidades marcadas como sin revisar proceden de una lectura del diagrama
        pendiente de contrastar.
      </p>
    </div>
  );
}
