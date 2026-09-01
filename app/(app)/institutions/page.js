// Sin 'use client': la portada ya no tiene estado ni consulta nada, así
// que se renderiza en el servidor y no manda JavaScript al navegador
// para pintar siete enlaces.

import Link from 'next/link';

// Banderas en CSS plano: nítidas a cualquier tamaño y sin depender de
// emoji ni de imágenes externas.
function FlagES() {
  return (
    <span
      role="img"
      aria-label="Bandera de España"
      style={{
        display: 'inline-block',
        width: 20,
        height: 14,
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ display: 'block', height: 3.5, background: '#AA151B' }} />
      <span style={{ display: 'block', height: 6, background: '#F1BF00' }} />
      <span style={{ display: 'block', height: 3.5, background: '#AA151B' }} />
    </span>
  );
}

function FlagEU() {
  return (
    <span
      role="img"
      aria-label="Bandera de la Unión Europea"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 14,
        borderRadius: 3,
        background: '#003399',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #FFCC00' }} />
    </span>
  );
}

/**
 * El separador de ámbito dentro de la lista.
 *
 * Era una cabecera con una línea horizontal al lado, porque presidía
 * una rejilla suelta. Dentro de una lista continua eso no hace falta:
 * basta una banda de fondo distinto, que es lo que ya separa grupos en
 * el resto de tablas de la aplicación.
 */
function GrupoTitulo({ flag, icon, children }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: '#faf9f6',
        borderBottom: '.5px solid #ece9e2',
      }}
    >
      {flag || (icon && <i className={`ti ti-${icon}`} style={{ color: '#a8a49c', fontSize: 13 }}></i>)}
      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#a8a49c', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Un módulo del directorio, como fila.
 *
 * ERAN TARJETAS EN REJILLA. El problema no era el aspecto sino el
 * reparto: seis módulos en tres grupos de dos, tres y uno dejaban la
 * última tarjeta sola ocupando el ancho entero, y las alturas bailaban
 * según la descripción tuviera dos líneas o tres.
 *
 * En filas eso no puede pasar: todas ocupan lo mismo por definición, se
 * recorren de arriba abajo en vez de en zigzag, y cuando entren el
 * Senado y el Consejo Europeo son dos filas más sin recalcular nada.
 *
 * SIN CIFRAS. Las tarjetas las llevaban, pero en una fila competían con
 * la descripción por el mismo espacio horizontal y obligaban a recortar
 * el texto. Las cifras siguen dentro de cada módulo, que es donde se
 * consultan de verdad.
 */
function ModuleRow({ href, icon, title, description, ultima }) {
  return (
    <Link
      href={href}
      className="gt-inst-fila"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '15px 16px',
        textDecoration: 'none',
        color: 'inherit',
        borderBottom: ultima ? 'none' : '.5px solid #ece9e2',
      }}
    >
      {/* Placa de color para que el ojo tenga dónde engancharse al bajar
          por siete filas seguidas. */}
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: '#f0eefe',
          color: '#6d5aef',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <i className={`ti ti-${icon}`} style={{ fontSize: 17 }}></i>
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: '#888', marginTop: 2 }}>{description}</span>
      </span>

      {/* "Explorar" a secas y no "Explorar Congreso": el nombre del
          módulo ya está escrito dos centímetros a la izquierda, y así
          las siete llamadas quedan alineadas en vez de terminar cada
          una a un ancho distinto. */}
      <span style={{ fontSize: 11.5, color: '#6d5aef', flexShrink: 0, whiteSpace: 'nowrap' }}>Explorar →</span>
    </Link>
  );
}

/**
 * Los módulos pendientes, todos juntos al final y en pequeño.
 *
 * Antes iban uno debajo de cada grupo. Repartidos parecían un pie de
 * sección y costaba distinguir si eran enlaces apagados; juntos al
 * final se leen por lo que son, una nota sobre lo que falta.
 */
function Proximamente({ items }) {
  return (
    <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 12 }}>
      Próximamente · {items.join(' y ')}
    </div>
  );
}

export default function InstitutionsHomePage() {
  // Sin estado ni consultas. La portada llevaba trece recuentos
  // —diputados, eurodiputados, comisiones, organismos…— para pintar las
  // cifras de las tarjetas. Al pasar a filas esas cifras salieron, y
  // mantener trece consultas para no enseñar nada sería pagar por lo
  // que ya no se usa. Cada módulo sigue dando sus números al entrar.

  return (
    <div className="sec">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Directorio institucional</h1>
        {/* La legislatura sale de aquí: la XV solo aplica al Congreso, no a
            los ministerios ni al Parlamento Europeo, que va por su 10ª.
            Su sitio es la tarjeta del Congreso, donde ya está.
            Tampoco se promete el contacto: el email de los diputados llega
            en la fase 2 del sync y hoy no está cargado. */}
        <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 0' }}>
          Localiza a quien decide sobre tu sector, antes de que decida.
        </p>
      </div>

      {/* Una sola lista con separadores de ámbito, en vez de tres
          rejillas independientes. Los separadores agrupan sin partir la
          lista, así que no vuelve a quedar un módulo suelto ocupando el
          ancho entero. */}
      <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, overflow: 'hidden' }}>
        <GrupoTitulo flag={<FlagEU />}>Unión Europea</GrupoTitulo>

        <ModuleRow
          href="/institutions/eu-parliament"
          icon="building-arch"
          title="Parlamento Europeo"
          description="Eurodiputados, comisiones, grupos políticos y órganos de gobierno."
        />
        <ModuleRow
          href="/institutions/eu-commission"
          icon="briefcase"
          title="Comisión Europea"
          description="Comisarios, gabinetes, direcciones generales y jefes de unidad."
        />

        <GrupoTitulo flag={<FlagES />}>España</GrupoTitulo>

        <ModuleRow
          href="/institutions/ministries"
          icon="building-community"
          title="Ministerios"
          description="Ministros, secretarios de Estado, direcciones generales y gabinetes."
        />
        {/* Una sola fila para el Congreso, con sus cuatro vistas dentro.
            Diputados y Grupos tuvieron entrada propia y eso enseñaba una
            jerarquía falsa: parecían módulos hermanos cuando son dos de
            las cuatro pestañas de la misma sección.

            Entra por Comisiones, que es la primera pestaña: apuntando a
            Diputados, la sección abriría por su segunda y la primera
            parecería un sitio al que hay que retroceder. */}
        <ModuleRow
          href="/institutions/comisiones"
          icon="building-bank"
          title="Congreso de los Diputados"
          description="Comisiones, diputados, órganos de gobierno y grupos parlamentarios."
        />
        {/* Los organismos van aparte de Ministerios: no son parte de un
            ministerio sino entes con personalidad jurídica propia, y
            varios —CNMC, AEPD— son autoridades independientes. */}
        <ModuleRow
          href="/institutions/organismos"
          icon="scale"
          title="Organismos y reguladores"
          description="CNMC, AEPD, agencias estatales y organismos autónomos que regulan tu sector."
        />

        {/* Tercer ámbito, sin bandera. Los dos de arriba agrupan por
            jurisdicción; una patronal o una consultora no son una
            institución más: no deciden, tratan de influir en quien
            decide. La cabecera sin bandera ya dice que es otra cosa. */}
        <GrupoTitulo icon="users">El sector</GrupoTitulo>

        <ModuleRow
          href="/organizations"
          icon="building-store"
          title="Organizaciones"
          description="Patronales, consultoras y empresas que trabajan con la Administración."
          ultima
        />
      </div>

      <Proximamente items={['Consejo Europeo', 'Senado']} />
    </div>
  );
}
