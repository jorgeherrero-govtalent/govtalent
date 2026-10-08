'use client';

import { useEffect, useState } from 'react';
import BackLink from '@/components/BackLink';
import { BotonSoloProyecto } from '@/components/FollowButton';
import UpgradeModal from '@/components/UpgradeModal';
import BuscarCorreo, { useCorreosEncontrados } from '@/components/BuscarCorreo';
import Paginacion, { usePaginacion } from '@/components/Paginacion';
import { seccionPorSlug } from '@/lib/directorio';

/**
 * Ficha de una organización del directorio (un medio, un partido, una
 * patronal, una institución autonómica…). Misma estructura que la ficha
 * de un organismo: cabecera con sus datos, quién es quién y, si tiene
 * delegaciones o emisoras, sus unidades.
 *
 * Maqueta A con los ajustes del 05-10-2026: sin morado, sin fuentes, solo
 * con el botón de proyecto (sin Seguir: no hay avisos que dar de ellas) y,
 * en las personas sin correo, «Buscar correo» (1 crédito, solo si lo
 * encuentra; components/BuscarCorreo).
 *
 * Correos y teléfonos solo llegan si el plan incluye la Base de datos: lo
 * decide /api/directorio en el servidor.
 */

const BORDE = '#e0dfd8';
const LINEA = '.5px solid #f0f0eb';

function urlWeb(w) {
  if (!w) return null;
  const limpia = String(w).trim();
  return /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
}

function separar(v) {
  return String(v || '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
}

function iniciales(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

function Etiqueta({ children }) {
  return <div style={{ fontSize: 10.5, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 9 }}>{children}</div>;
}

const ENLACE = { color: '#3d3a35', textDecoration: 'none', borderBottom: `1px solid ${BORDE}` };

function Correos({ valor }) {
  const lista = separar(valor);
  return lista.map((c, i) => (
    <span key={c}>
      {i > 0 ? ', ' : ''}
      <a href={`mailto:${c}`} style={ENLACE}>
        {c}
      </a>
    </span>
  ));
}

function Dato({ titulo, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: '#a8a49c', marginBottom: 3 }}>{titulo}</div>
      <div style={{ fontSize: 12.5, color: '#3d3a35', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

function Persona({ p, contacto, ultima, encontrados, apuntar }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: ultima ? 'none' : LINEA, flexWrap: 'wrap' }}>
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
        {iniciales(p.nombre)}
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.nombre}</div>
        {p.cargo ? <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 1 }}>{p.cargo}</div> : null}
      </div>
      {contacto ? (
        <div style={{ textAlign: 'right', fontSize: 12, lineHeight: 1.55, marginLeft: 'auto', minWidth: 0 }}>
          {p.email ? (
            <div style={{ overflowWrap: 'anywhere' }}>
              <Correos valor={p.email} />
            </div>
          ) : (
            <BuscarCorreo persona={p} encontrado={encontrados[p.id]}
                      probable={probables[p.id]} onResultado={(r) => apuntar(p.id, r)} />
          )}
          {p.telefono ? <div style={{ color: '#888' }}>{separar(p.telefono).join(', ')}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function AvisoContacto({ onUpsell }) {
  return (
    <button
      type="button"
      onClick={onUpsell}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        margin: '0 0 6px',
        padding: '9px 12px',
        border: `.5px solid ${BORDE}`,
        borderRadius: 9,
        background: '#fcfbf8',
        fontFamily: 'inherit',
        fontSize: 12,
        color: '#57534e',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 14, color: '#8b8780' }}></i>
      <span>
        Correos y teléfonos de cada persona, con el Directorio. <span style={{ fontWeight: 600, textDecoration: 'underline' }}>Ver planes</span>
      </span>
    </button>
  );
}

// Delegaciones, emisoras o instituciones dentro de la organización. Una
// cadena de radio puede tener casi doscientas: van paginadas.
function Unidades({ unidades, contacto, encontrados, apuntar }) {
  const pag = usePaginacion(unidades.length);
  const slice = unidades.slice(pag.desde, pag.hasta);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '20px 20px 4px' }}>
        <Etiqueta>
          DELEGACIONES Y UNIDADES · {unidades.length}
        </Etiqueta>
      </div>
      {slice.map((u, i) => (
        <div key={`${pag.desde + i}`} style={{ padding: '12px 20px', borderTop: i === 0 ? 'none' : LINEA }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{u.nombre || 'Sede'}</div>
              {u.ciudad ? <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 1 }}>{u.ciudad}</div> : null}
            </div>
            {contacto && (u.email || u.telefono) ? (
              <div style={{ fontSize: 12, textAlign: 'right', lineHeight: 1.55, minWidth: 0, overflowWrap: 'anywhere' }}>
                {u.email ? (
                  <div>
                    <Correos valor={u.email} />
                  </div>
                ) : null}
                {u.telefono ? <div style={{ color: '#888' }}>{separar(u.telefono).join(', ')}</div> : null}
              </div>
            ) : null}
          </div>
          {u.personas.length > 0 ? (
            <div style={{ marginTop: 4 }}>
              {u.personas.map((p, j) => (
                <Persona key={j} p={p} contacto={contacto} ultima={j === u.personas.length - 1} encontrados={encontrados} apuntar={apuntar} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
      {unidades.length > 20 ? <Paginacion pag={pag} dentro /> : null}
    </div>
  );
}

export default function DirectorioFicha({ slug, id, volverA, volverEtiqueta }) {
  const seccion = seccionPorSlug(slug);
  const [ficha, setFicha] = useState(null);
  const [contacto, setContacto] = useState(false);
  const [estado, setEstado] = useState('cargando');
  const [upsell, setUpsell] = useState(false);
  const sinCorreo = contacto && ficha ? ficha.unidades.flatMap((u) => u.personas).filter((p) => !p.email && p.id).map((p) => p.id) : [];
  const { encontrados, probables, apuntar } = useCorreosEncontrados(sinCorreo, contacto);

  useEffect(() => {
    let vivo = true;
    setEstado('cargando');
    fetch(`/api/directorio?vista=ficha&s=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!vivo) return;
        setFicha(d.ficha);
        setContacto(!!d.contacto);
        setEstado('listo');
      })
      .catch(() => {
        if (vivo) setEstado('error');
      });
    return () => {
      vivo = false;
    };
  }, [slug, id]);

  if (!seccion) return null;

  const volver = (
    <div style={{ marginBottom: 6 }}>
      <BackLink fallbackHref={volverA} fallbackLabel={volverEtiqueta} />
    </div>
  );

  if (estado === 'cargando') {
    return (
      <div className="sec">
        {volver}
        <div className="spinner"></div>
      </div>
    );
  }
  if (estado === 'error' || !ficha) {
    return (
      <div className="sec">
        {volver}
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-search-off" aria-hidden="true"></i>
            No hemos encontrado esta ficha.
          </div>
        </div>
      </div>
    );
  }

  // La primera unidad es la sede: sus personas son el «quién es quién».
  // El resto, si las hay, son delegaciones, emisoras o unidades.
  const [sede, ...resto] = ficha.unidades;
  const equipo = sede?.personas || [];
  const web = urlWeb(ficha.web);
  const etiquetaSup = [seccion.titulo, ficha.tipo].filter(Boolean).join(' · ').toUpperCase();
  const meta = [ficha.ccaa, ficha.ciudad, ficha.grupo && ficha.grupo !== ficha.ccaa ? ficha.grupo : null]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(' · ');

  return (
    <div className="sec">
      {volver}

      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <div style={{ fontSize: 10.5, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 6 }}>{etiquetaSup}</div>
            <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{ficha.organizacion}</h1>
            {meta ? <div style={{ fontSize: 12.5, color: '#888', marginTop: 4 }}>{meta}</div> : null}
          </div>
          <div style={{ flexShrink: 0 }}>
            <BotonSoloProyecto kind="entidad" refId={String(ficha.id)} label={ficha.organizacion} />
          </div>
        </div>

        {web || ficha.direccion || ficha.email || ficha.telefono ? (
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: LINEA,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
              gap: '12px 30px',
            }}
          >
            {web ? (
              <Dato titulo="Web">
                <a href={web} target="_blank" rel="noreferrer" style={ENLACE}>
                  {String(ficha.web).replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                </a>
              </Dato>
            ) : null}
            {ficha.email ? (
              <Dato titulo="Correo general">
                <Correos valor={ficha.email} />
              </Dato>
            ) : null}
            {ficha.telefono ? <Dato titulo="Teléfono">{separar(ficha.telefono).join(', ')}</Dato> : null}
            {ficha.direccion ? <Dato titulo="Dirección">{ficha.direccion}</Dato> : null}
          </div>
        ) : null}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <Etiqueta>QUIÉN ES QUIÉN{equipo.length ? ` · ${equipo.length}` : ''}</Etiqueta>
        {!contacto && (equipo.length > 0 || resto.length > 0) ? <AvisoContacto onUpsell={() => setUpsell(true)} /> : null}
        {equipo.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.6 }}>No tenemos todavía las personas de esta sede.</div>
        ) : (
          equipo.map((p, i) => (
            <Persona key={i} p={p} contacto={contacto} ultima={i === equipo.length - 1} encontrados={encontrados} apuntar={apuntar} />
          ))
        )}
      </div>

      {resto.length > 0 ? <Unidades unidades={resto} contacto={contacto} encontrados={encontrados} apuntar={apuntar} /> : null}

      {upsell ? (
        <UpgradeModal
          title="Los contactos van con el Directorio"
          message="Correo y teléfono de cada persona de medios, partidos, sindicatos, patronales, ONG, organismos internacionales y comunidades autónomas, además de la Base de datos de cargos de la administración."
          href="/precios"
          onClose={() => setUpsell(false)}
        />
      ) : null}
    </div>
  );
}
