'use client';

import { useEffect, useState } from 'react';
import BuscarCorreo, { useCorreosEncontrados } from '@/components/BuscarCorreo';
import useDirectorio from '@/lib/useDirectorio';

/**
 * Datos para CorreoCargo en una lista de cargos de la AGE
 * (government_officials con id, slug, nombre y cargo).
 *
 *   const c = useCorreosCargos(lista);
 *   <CorreoCargo {...c.props(o)} onUpsell={…} />
 */
export function useCorreosCargos(lista) {
  const acceso = useDirectorio();
  // Contactos por slug de /api/instituciones/contactos (el plan lo
  // comprueba el servidor: sin él no llega ningún correo).
  const [contactos, setContactos] = useState({});
  useEffect(() => {
    if (acceso !== true) return;
    let vivo = true;
    fetch('/api/instituciones/contactos', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => vivo && j?.contactos && setContactos(j.contactos))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [acceso]);

  const emailDe = (o) => {
    const c = contactos[o?.slug];
    return c && typeof c === 'object' ? c.email || null : null;
  };
  const idDe = (o) => (o?.id ? `es-ejecutivo:${o.id}` : null);
  const sinCorreo = acceso === true ? (lista || []).filter((o) => o?.id && !emailDe(o)).map(idDe) : [];
  const { encontrados, probables, apuntar } = useCorreosEncontrados(sinCorreo, acceso === true);

  return {
    acceso,
    props: (o, nombre, cargo) => {
      const id = idDe(o);
      return {
        acceso,
        email: emailDe(o),
        persona: id ? { id, nombre, cargo } : null,
        encontrado: id ? encontrados[id] : undefined,
        probable: id ? probables[id] : undefined,
        onResultado: (r) => id && apuntar(id, r),
      };
    },
  };
}

/**
 * El correo de una persona en los listados de cargos (equipo de un
 * ministerio, quién dirige un organismo, buscador de cargos, fichas del
 * directorio).
 *
 * - Sin el Directorio (acceso === false): un correo inventado y
 *   difuminado que abre la suscripción. Inventado a propósito: difuminar
 *   el real con CSS no lo oculta. Sale en todas las personas, porque con
 *   el Directorio todas tienen correo (el publicado o «Buscar correo»).
 * - Con el Directorio: el correo, si lo tenemos; si no, «Buscar correo».
 * - Mientras se comprueba el plan (acceso === null), nada: así no le
 *   parpadea el difuminado a quien sí lo tiene.
 *
 * Va fuera de cualquier enlace: el modal de «Buscar correo» se monta en un
 * portal y sus clics subirían por el árbol hasta el enlace de la fila.
 */
export default function CorreoCargo({ acceso, email, persona, encontrado, probable, onResultado, onUpsell, alinear = 'right' }) {
  if (acceso === null || acceso === undefined) return null;

  if (acceso === false) {
    // Mismo aspecto que un correo de la plataforma (icono, color y
    // subrayado); solo el texto va difuminado, y el candado dice que se
    // desbloquea con el Directorio.
    return (
      <button
        type="button"
        onClick={onUpsell}
        aria-label="Ver el correo con el Directorio"
        title="Disponible con el Directorio"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          maxWidth: '100%',
        }}
      >
        <i className="ti ti-mail" style={{ fontSize: 14, color: '#6d5aef', flexShrink: 0 }} aria-hidden="true"></i>
        <span
          style={{
            fontSize: 12,
            color: '#3d3a35',
            borderBottom: '1px solid #e0dfd8',
            filter: 'blur(2.5px)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          nombre.apellido@organismo.es
        </span>
        <i className="ti ti-lock" style={{ fontSize: 13, color: '#8b8780', flexShrink: 0 }} aria-hidden="true"></i>
      </button>
    );
  }

  const limpio = String(email || '')
    .split(';')[0]
    .trim();
  if (limpio) {
    return (
      <a href={`mailto:${limpio}`} style={{ fontSize: 12, color: '#3d3a35', textDecoration: 'none', borderBottom: '1px solid #e0dfd8', overflowWrap: 'anywhere' }}>
        {limpio}
      </a>
    );
  }

  return <BuscarCorreo persona={persona} encontrado={encontrado} probable={probable} onResultado={onResultado} alinear={alinear} />;
}
