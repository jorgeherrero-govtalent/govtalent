'use client';

import Link from 'next/link';

/**
 * La pestaña que se ve sin plan: la forma real, el contenido inventado.
 *
 * POR QUÉ ATREZO Y NO EL DATO REAL DIFUMINADO. Un blur de CSS no oculta
 * nada: el texto sigue en el DOM y se lee desde el inspector. Debajo de
 * estos paneles habría nombres y correos de funcionarios y de
 * eurodiputados, así que la página que use este componente no debe
 * haberlos pedido siquiera. Lo borroso es decorado.
 *
 * Se conserva la forma de la pestaña —avatar, cargo, columna de correo a
 * la derecha— porque eso es justo lo que se está vendiendo: que existe y
 * qué aspecto tiene.
 *
 * DOS FORMAS. `persona` para listas de gente, con avatar redondo y
 * correo a la derecha; `organo` para comisiones y organismos, con placa
 * cuadrada de sigla y sin correo, porque una comisión no tiene una
 * dirección personal y ponerla sería prometer algo que luego no está.
 */

const MORADO = '#6d5aef';

function FilaPersona({ fila, dominio }) {
  return (
    <>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#f0eefe',
          color: MORADO,
          fontSize: 10.5,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {fila.iniciales}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5 }}>{fila.nombre}</span>
        <span style={{ display: 'block', fontSize: 10.5, color: '#a8a49c' }}>{fila.cargo}</span>
      </span>
      {dominio && (
        <span style={{ fontSize: 11, color: '#a8a49c', flexShrink: 0 }}>nombre.apellido@{dominio}</span>
      )}
    </>
  );
}

function FilaOrgano({ fila }) {
  return (
    <>
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: '#f0eefe',
          color: '#3C3489',
          fontSize: 9.5,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {fila.iniciales}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{fila.nombre}</span>
        <span style={{ display: 'block', fontSize: 10.5, color: '#a8a49c', marginTop: 1 }}>{fila.cargo}</span>
      </span>
    </>
  );
}

export default function PanelBloqueado({ titulo, descripcion, filas, dominio, forma = 'persona' }) {
  return (
    <div style={{ position: 'relative', minHeight: 190 }}>
      <div
        style={{ filter: 'blur(4px)', opacity: 0.55, pointerEvents: 'none', userSelect: 'none' }}
        aria-hidden="true"
      >
        {filas.map((f, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderBottom: i < filas.length - 1 ? '.5px solid #f0f0eb' : 'none',
            }}
          >
            {forma === 'organo' ? <FilaOrgano fila={f} /> : <FilaPersona fila={f} dominio={dominio} />}
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 12,
            boxShadow: '0 6px 22px rgba(0,0,0,.08)',
            padding: '16px 20px',
            textAlign: 'center',
            maxWidth: 380,
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 5 }}>{titulo}</div>
          <p style={{ fontSize: 12, color: '#666', lineHeight: 1.55, margin: '0 0 13px' }}>{descripcion}</p>
          <Link
            href="/precios"
            target="_blank"
            className="btn-ai"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ti ti-bolt"></i> Ver con Pro
          </Link>
        </div>
      </div>
    </div>
  );
}

// Atrezo. Cargos genéricos, nunca personas ni órganos reales: si alguien
// quita el desenfoque tiene que encontrar esto y no un dato de verdad.

export const FILAS_COMISION_EU = [
  { iniciales: 'DG', nombre: 'Nombre del director general', cargo: 'Director-General' },
  { iniciales: 'DA', nombre: 'Nombre del director adjunto', cargo: 'Deputy Director-General' },
  { iniciales: 'JU', nombre: 'Nombre del jefe de unidad', cargo: 'Head of Unit' },
  { iniciales: 'AS', nombre: 'Nombre del asistente', cargo: 'Assistant to the Director-General' },
];

export const FILAS_EURODIPUTADOS = [
  { iniciales: 'PO', nombre: 'Nombre del ponente', cargo: 'Ponente · Comisión competente' },
  { iniciales: 'PA', nombre: 'Nombre del ponente alternativo', cargo: 'Ponente alternativo' },
  { iniciales: 'ED', nombre: 'Nombre del eurodiputado', cargo: 'Miembro titular · España' },
  { iniciales: 'ES', nombre: 'Nombre del eurodiputado', cargo: 'Miembro suplente · España' },
];

export const FILAS_COMISIONES_PE = [
  { iniciales: '····', nombre: 'Comisión competente para el fondo', cargo: 'Decide el texto' },
  { iniciales: '····', nombre: 'Comisión para opinión', cargo: 'Emite opinión' },
  { iniciales: '····', nombre: 'Comisión asociada', cargo: 'Revisión técnica' },
];
