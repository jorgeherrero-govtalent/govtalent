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

/**
 * `onUpsell` cambia el destino del botón, no el aspecto.
 *
 * Sin él, el botón es un enlace a /precios y se abandona la página. Con
 * él, abre un modal encima y el usuario se queda donde estaba. Lo
 * segundo va mejor cuando lo bloqueado es una parte de la página y el
 * resto sigue siendo útil: la mesa de una comisión, por ejemplo, donde
 * debajo hay procedimientos que sí se ven.
 */
export default function PanelBloqueado({
  titulo,
  descripcion,
  filas,
  dominio,
  forma = 'persona',
  onUpsell,
}) {
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
          {onUpsell ? (
            <button
              type="button"
              onClick={onUpsell}
              className="btn-ai"
              style={{
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <i className="ti ti-bolt"></i> Ver con Pro
            </button>
          ) : (
            <Link
              href="/precios"
              target="_blank"
              className="btn-ai"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <i className="ti ti-bolt"></i> Ver con Pro
            </Link>
          )}
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

// El Congreso no enseña correos en esta pestaña, así que este atrezo se
// usa sin `dominio` y la columna de la derecha no aparece.
// Los diputados con los que se comparte ponencia. No lleva `dominio`:
// en el Congreso no hay correos y prometerlos sería mentir.
export const FILAS_COLEGAS = [
  { iniciales: 'D1', nombre: 'Nombre del diputado', cargo: 'Coincide en 4 ponencias' },
  { iniciales: 'D2', nombre: 'Nombre del diputado', cargo: 'Coincide en 3 ponencias' },
  { iniciales: 'D3', nombre: 'Nombre del diputado', cargo: 'Coincide en 2 ponencias' },
];

// El contacto de la unidad en un ministerio. Correo, teléfono y web son
// de la unidad, no de la persona: el atrezo lo refleja.
export const FILAS_CONTACTO_UNIDAD = [
  { iniciales: '@', nombre: 'buzon.unidad@ministerio.gob.es', cargo: 'Correo de la unidad' },
  { iniciales: 'T', nombre: '+34 91 000 00 00', cargo: 'Teléfono' },
  { iniciales: 'W', nombre: 'www.ministerio.gob.es/unidad', cargo: 'Web' },
];

export const FILAS_CONGRESO = [
  { iniciales: 'CO', nombre: 'Comisión competente', cargo: 'Quién decide el texto' },
  { iniciales: 'PV', nombre: 'Nombre del portavoz', cargo: 'Portavoz en la comisión' },
  { iniciales: 'PO', nombre: 'Nombre del ponente', cargo: 'Ponente designado' },
  { iniciales: 'GP', nombre: 'Grupo parlamentario autor', cargo: 'Quién la presenta' },
];

// La mesa de una comisión del PE: presidencia y vicepresidencias. Sin
// `dominio`, porque esa tarjeta no enseña correos, solo grupo y país.
// El gabinete de un comisario: sí enseña correos, así que va con
// `dominio="ec.europa.eu"`.
export const FILAS_GABINETE = [
  { iniciales: 'JG', nombre: 'Nombre del jefe de gabinete', cargo: 'Head of Cabinet' },
  { iniciales: 'JA', nombre: 'Nombre del jefe adjunto', cargo: 'Deputy Head of Cabinet' },
  { iniciales: 'M1', nombre: 'Nombre del miembro del gabinete', cargo: 'Member of Cabinet' },
  { iniciales: 'M2', nombre: 'Nombre del miembro del gabinete', cargo: 'Member of Cabinet' },
];

// La cúpula de una dirección general.
export const FILAS_DIRECCION_DG = [
  { iniciales: 'DG', nombre: 'Nombre del director general', cargo: 'Director-General' },
  { iniciales: 'DA', nombre: 'Nombre del director adjunto', cargo: 'Deputy Director-General' },
  { iniciales: 'AP', nombre: 'Nombre del asesor principal', cargo: 'Principal Adviser' },
  { iniciales: 'DI', nombre: 'Nombre del director', cargo: 'Director · Dirección' },
];

export const FILAS_MESA_PE = [
  { iniciales: 'PR', nombre: 'Nombre de quien preside', cargo: 'Presidencia' },
  { iniciales: 'V1', nombre: 'Nombre de la vicepresidencia', cargo: 'Vicepresidencia' },
  { iniciales: 'V2', nombre: 'Nombre de la vicepresidencia', cargo: 'Vicepresidencia' },
  { iniciales: 'V3', nombre: 'Nombre de la vicepresidencia', cargo: 'Vicepresidencia' },
];

export const FILAS_COMISIONES_PE = [
  { iniciales: '····', nombre: 'Comisión competente para el fondo', cargo: 'Decide el texto' },
  { iniciales: '····', nombre: 'Comisión para opinión', cargo: 'Emite opinión' },
  { iniciales: '····', nombre: 'Comisión asociada', cargo: 'Revisión técnica' },
];
