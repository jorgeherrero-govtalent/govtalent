'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import FollowButton from '@/components/FollowButton';
import BackLink from '@/components/BackLink';

/**
 * Ficha de un organismo de la Administración General del Estado.
 *
 * Los datos vienen de DIR3, que da la estructura pero no los contactos:
 * no hay web, teléfono ni dirección. Lo que sí hay es la jerarquía —de
 * quién depende y qué cuelga de él— y el titular cuando el BOE lo ha
 * publicado.
 *
 * Esa escasez se dice, no se disimula: una ficha con secciones vacías
 * hace pensar que algo falla.
 */

const MORADO = '#6d5aef';

const ETIQUETA_CATEGORIA = {
  ministerio: 'Ministerio',
  secretaria_estado: 'Secretaría de Estado',
  secretaria_general: 'Secretaría General',
  subsecretaria: 'Subsecretaría',
  direccion_general: 'Dirección General',
  subdireccion_general: 'Subdirección General',
  gabinete: 'Gabinete',
  organismo_autonomo: 'Organismo autónomo',
  agencia_estatal: 'Agencia estatal',
  entidad_derecho_publico: 'Entidad de derecho público',
  entidad_gestora: 'Entidad gestora',
  consorcio: 'Consorcio',
  fundacion: 'Fundación pública',
  autoridad_portuaria: 'Autoridad portuaria',
  sociedad_mercantil: 'Sociedad mercantil estatal',
  unidad: 'Unidad',
};

const RE_REGULADOR = /^(comisi[oó]n nacional|agencia espa[ñn]ola de protecci[oó]n de datos|autoridad|consejo de seguridad nuclear|banco de espa[ñn]a|comisi[oó]n del mercado)/i;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function limpiar(nombre) {
  return (nombre || '').replace(/,?\s*O\.\s?A\.\s*$/i, '').trim();
}

// "Del Canto Soriano, Lydia" → "Lydia Del Canto Soriano"
function nombreDirecto(n) {
  const [ap, no] = (n || '').split(',').map((x) => x.trim());
  return no ? `${no} ${ap}` : n;
}

function Etiqueta({ children }) {
  return (
    <div style={{ fontSize: 10.5, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 9 }}>
      {children}
    </div>
  );
}

export default function OrganismoPage() {
  const supabase = createClient();
  const params = useParams();
  const code = params?.code;

  const [unidad, setUnidad] = useState(null);
  const [superior, setSuperior] = useState(null);
  const [hijas, setHijas] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [boe, setBoe] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!code) return;

    const { data: u } = await supabase
      .from('age_units')
      .select('dir3_code, nombre, categoria, nivel, superior_code, raiz_code, raiz_nombre, fecha_alta')
      .eq('dir3_code', code)
      .maybeSingle();

    if (!u) {
      setCargando(false);
      return;
    }
    setUnidad(u);

    const [{ data: sup }, { data: hijos }, { data: p }, { data: docs }] = await Promise.all([
      u.superior_code
        ? supabase
            .from('age_units')
            .select('dir3_code, nombre, categoria')
            .eq('dir3_code', u.superior_code)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('age_units')
        .select('dir3_code, nombre, categoria')
        .eq('superior_code', code)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('government_officials')
        .select('full_name, slug, role')
        .eq('dir3_code', code)
        .eq('active', true),
      // Lo último que ha publicado en el BOE. Es lo que convierte la
      // ficha en algo que se consulta y no solo en un dato de estructura.
      supabase
        .from('boe_documents')
        .select('id, slug, titulo, fecha_publicacion, rango, departamento')
        .eq('dir3_code', code)
        .order('fecha_publicacion', { ascending: false })
        .limit(4),
    ]);

    setSuperior(sup || null);
    setHijas(hijos || []);
    setPersonas(p || []);
    setBoe(docs || []);
    setCargando(false);
  }, [supabase, code]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <div className="spinner"></div>;

  if (!unidad) {
    return (
      <div className="sec">
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-building-off"></i>
            No encontramos este organismo.
          </div>
        </div>
      </div>
    );
  }

  const esRegulador = RE_REGULADOR.test(unidad.nombre || '');

  return (
    <div className="sec" style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 8 }}>
        <BackLink fallbackHref="/institutions/organismos" fallbackLabel="Organismos y reguladores" />
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{limpiar(unidad.nombre)}</h1>
              {esRegulador && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: '.3px',
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: '#f0eefe',
                    color: MORADO,
                  }}
                >
                  REGULADOR
                </span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: '#888', marginTop: 4 }}>
              {[ETIQUETA_CATEGORIA[unidad.categoria] || unidad.categoria, unidad.raiz_nombre]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>

          <div style={{ flexShrink: 0 }}>
            <FollowButton kind="unidad-age" refId={unidad.dir3_code} label={limpiar(unidad.nombre)} />
          </div>
        </div>

        {superior && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '.5px solid #f0f0eb', display: 'flex', gap: 30, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10.5, color: '#a8a49c', marginBottom: 3 }}>Depende de</div>
              <Link
                href={`/institutions/organismos/${superior.dir3_code}`}
                style={{ fontSize: 12.5, color: MORADO, textDecoration: 'none' }}
              >
                {limpiar(superior.nombre)}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Quién lo dirige. Sale de government_officials, que el BOE
          mantiene: la mayoría de organismos aún no tienen titular
          cargado, y eso se dice en vez de dejar el bloque vacío. */}
      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <Etiqueta>QUIÉN LO DIRIGE</Etiqueta>
        {personas.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.6 }}>
            Todavía no tenemos el titular de este organismo. Se completará con los nombramientos que publique
            el BOE.
          </div>
        ) : (
          personas.map((p, i) => (
            <Link
              key={p.slug || p.full_name}
              href={`/institutions/ministries/persona/${p.slug}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: i === 0 ? '0 0 9px' : '9px 0',
                borderBottom: i === personas.length - 1 ? 'none' : '.5px solid #f0f0eb',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: '#f5f4f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 11,
                  color: '#888',
                  fontWeight: 600,
                }}
              >
                {nombreDirecto(p.full_name)
                  .split(' ')
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nombreDirecto(p.full_name)}</div>
                <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 1 }}>{p.role}</div>
              </div>
              <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14 }}></i>
            </Link>
          ))
        )}
      </div>

      {/* Lo que publica. Solo si hay algo: un bloque vacío en la ficha de
          un organismo que no legisla haría pensar que falta un dato. */}
      {boe.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 12 }}>
          <Etiqueta>PUBLICADO EN EL BOE</Etiqueta>
          {boe.slice(0, 3).map((d, i) => (
            <Link
              key={d.id}
              href={`/boe/${d.slug || d.id}`}
              style={{
                display: 'block',
                padding: i === 0 ? '0 0 10px' : '10px 0',
                borderBottom: i === Math.min(boe.length, 3) - 1 ? 'none' : '.5px solid #f0f0eb',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{d.titulo}</div>
              <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 3 }}>
                {[d.rango, fechaCorta(d.fecha_publicacion)].filter(Boolean).join(' · ')}
              </div>
            </Link>
          ))}

          {/* Se piden cuatro y se enseñan tres: así se sabe si hay más
              sin una consulta de recuento aparte.

              El enlace usa el departamento tal y como lo escribe el BOE y
              no el nombre de DIR3: son casi iguales pero no idénticos
              —"Comision" sin tilde en DIR3— y el listado filtra por el
              texto del BOE. */}
          {boe.length > 3 && boe[0]?.departamento && (
            <Link
              href={`/boe?organismo=${encodeURIComponent(boe[0].departamento)}`}
              style={{
                display: 'inline-block',
                marginTop: 11,
                fontSize: 11.5,
                color: MORADO,
                textDecoration: 'none',
              }}
            >
              Ver todo lo publicado →
            </Link>
          )}
        </div>
      )}

      {hijas.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <Etiqueta>UNIDADES DEPENDIENTES · {hijas.length}</Etiqueta>
          {hijas.map((h, i) => (
            <Link
              key={h.dir3_code}
              href={`/institutions/organismos/${h.dir3_code}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: i === 0 ? '0 0 8px' : '8px 0',
                borderBottom: i === hijas.length - 1 ? 'none' : '.5px solid #f0f0eb',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5 }}>{limpiar(h.nombre)}</div>
                <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 1 }}>
                  {ETIQUETA_CATEGORIA[h.categoria] || h.categoria}
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 13 }}></i>
            </Link>
          ))}
        </div>
      )}

      <p style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 14, lineHeight: 1.6 }}>
        Fuente: Directorio Común de Unidades Orgánicas y Oficinas (DIR3). Los titulares se actualizan con los
        nombramientos publicados en el BOE.
      </p>
    </div>
  );
}
