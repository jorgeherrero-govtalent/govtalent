'use client';

import { useEffect, useState } from 'react';
import BuscarCorreoModal from '@/components/BuscarCorreoModal';
import { dominio, limpiarEmail } from '@/components/ContactosUI';

/**
 * «Buscar correo» en las fichas (Organizaciones, diputados, asesores,
 * cargos de la AGE, direcciones generales de la Comisión, Base de datos).
 *
 * Solo para quien tiene el Directorio y solo en personas sin correo. Si el
 * correo ya se encontró antes (caché compartida), se enseña en su lugar,
 * con la fuente.
 *
 *   const { encontrados, apuntar } = useCorreosEncontrados(ids, activo);
 *   <BuscarCorreo persona={{ id, nombre, cargo }} encontrado={encontrados[id]} onResultado={(r) => apuntar(id, r)} />
 */

export function useCorreosEncontrados(ids, activo = true) {
  const [encontrados, setEncontrados] = useState({});
  // Correos probables por el patrón del organismo (sql/86).
  const [probables, setProbables] = useState({});
  const clave = activo ? (ids || []).filter(Boolean).join('|') : '';

  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    fetch('/api/contactos/enriquecidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: clave.split('|') }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo && j?.resultados) setEncontrados((prev) => ({ ...prev, ...j.resultados }));
        if (vivo && j?.probables) setProbables((prev) => ({ ...prev, ...j.probables }));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [clave]);

  function apuntar(id, r) {
    if (r?.estado === 'encontrado' && r.email) setEncontrados((prev) => ({ ...prev, [id]: r }));
  }

  return { encontrados, probables, apuntar };
}

/** El correo encontrado, con su fuente. */
export function CorreoEncontrado({ r, alinear = 'right' }) {
  const email = limpiarEmail(r?.email);
  if (!email) return null;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: alinear === 'right' ? 'flex-end' : 'flex-start', gap: 1, minWidth: 0 }}>
      <a href={`mailto:${email}`} style={{ fontSize: 12, color: '#3d3a35', textDecoration: 'none', borderBottom: '1px solid #e0dfd8', overflowWrap: 'anywhere' }}>
        {email}
      </a>
      {r.fuente_url ? (
        <span style={{ fontSize: 10.5, color: '#a8a49c' }}>
          Según{' '}
          <a href={r.fuente_url} target="_blank" rel="noopener noreferrer" style={{ color: '#5443d6', textDecoration: 'none' }}>
            {dominio(r.fuente_url)} ↗
          </a>
        </span>
      ) : null}
    </span>
  );
}

/** Un correo probable: deducido del patrón del organismo, sin verificar. */
export function CorreoProbable({ p, alinear = 'right' }) {
  if (!p?.email) return null;
  const pct = Math.round((p.fiabilidad || 0) * 100);
  return (
    <span
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: alinear === 'right' ? 'flex-end' : 'flex-start', gap: 1, minWidth: 0 }}
      title={
        p.verificado
          ? `Deducido del patrón de ${p.dominio} y comprobado en su servidor de correo: la dirección existe.`
          : `Deducido del patrón de ${p.dominio} (${p.descripcion}): acierta en el ${pct} % de los ${p.muestras} correos que conocemos de ese dominio. Sin verificar.`
      }
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <a href={`mailto:${p.email}`} style={{ fontSize: 12, color: '#3d3a35', textDecoration: 'none', borderBottom: p.verificado ? '1px solid #cfc9f8' : '1px dashed #cfc9f8', overflowWrap: 'anywhere' }}>
          {p.email}
        </a>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#3d2fb3', background: '#efedfd', borderRadius: 999, padding: '1px 7px' }}>{p.verificado ? 'Verificado' : 'Probable'}</span>
      </span>
      <span style={{ fontSize: 10.5, color: '#a8a49c' }}>
        {p.verificado ? `Patrón de ${p.dominio} · comprobado en su servidor` : `Patrón de ${p.dominio} · acierta en el ${pct} %`}
      </span>
    </span>
  );
}

/** El botón (o el correo, si ya se encontró). */
export default function BuscarCorreo({ persona, encontrado, probable, onResultado, alinear = 'right' }) {
  const [abierto, setAbierto] = useState(false);
  // El resultado se pasa a la ficha al cerrar el modal: si se pasara al
  // llegar, el botón se cambiaría por el correo y el modal se cerraría solo.
  const [pendiente, setPendiente] = useState(null);
  if (!persona?.id) return null;
  if (encontrado) return <CorreoEncontrado r={encontrado} alinear={alinear} />;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: alinear === 'right' ? 'flex-end' : 'flex-start', gap: 6 }}>
      {probable ? <CorreoProbable p={probable} alinear={alinear} /> : null}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Buscar correo"
        aria-label={`Buscar el correo de ${persona.nombre}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          border: '.5px solid #cfc9f8',
          background: '#fff',
          borderRadius: 7,
          padding: '4px 9px',
          fontFamily: 'inherit',
          fontSize: 11.5,
          color: '#5443d6',
          cursor: 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <i className="ti ti-search" style={{ fontSize: 13 }} aria-hidden="true"></i>
        Buscar correo
      </button>
      {abierto ? (
        <BuscarCorreoModal
          persona={persona}
          onClose={() => {
            setAbierto(false);
            if (pendiente && onResultado) onResultado(pendiente);
          }}
          onResultado={setPendiente}
        />
      ) : null}
    </span>
  );
}
