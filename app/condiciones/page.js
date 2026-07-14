import LegalPageShell from '@/components/LegalPageShell';

export const metadata = { title: 'Condiciones generales del servicio · GovTalent' };

export default function CondicionesPage() {
  return (
    <LegalPageShell title="Condiciones generales del servicio">
      <p style={{ fontSize: 12, background: '#f8f7f2', border: '.5px solid #e0dfd8', borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <b>Plantilla pendiente de completar con los datos reales del titular y de revisión legal.</b> Los precios
        y planes de pago descritos se activarán cuando GovTalent lance sus funcionalidades premium.
      </p>

      <p><b>Titular:</b> [RAZÓN SOCIAL / NOMBRE Y APELLIDOS] · <b>NIF/CIF:</b> [NIF O CIF] ·{' '}
      <b>Contacto:</b> [EMAIL DE CONTACTO]. En adelante, "<b>GovTalent</b>".</p>

      <h3>1. Objeto</h3>
      <p>GovTalent es una plataforma que conecta a profesionales del sector de los asuntos públicos, la política y
      el gobierno (en adelante, los "<b>Candidatos</b>") con empresas, consultoras, instituciones y demás
      organizaciones del sector (en adelante, las "<b>Organizaciones</b>"), a través de perfiles profesionales, un
      directorio de Organizaciones, publicación de ofertas de empleo y herramientas de gestión de candidaturas
      (en adelante, los "<b>Servicios</b>"). Las presentes Condiciones Generales del Servicio (en adelante, las
      "<b>Condiciones</b>") regulan el acceso y uso de dichos Servicios por parte de Candidatos y Organizaciones
      (conjuntamente, los "<b>Clientes</b>").</p>

      <p>El registro y uso de los Servicios implica la aceptación expresa de las presentes Condiciones, junto con
      el <a href="/legal">Aviso Legal</a> y la <a href="/privacidad">Política de Privacidad</a>.</p>

      <h3>2. Servicios para Candidatos</h3>
      <ul>
        <li>Creación y gestión de un perfil profesional, con posibilidad de autocompletado asistido por IA a
        partir de un CV.</li>
        <li>Consulta del directorio de Organizaciones y de las ofertas de empleo publicadas.</li>
        <li>Aplicación a ofertas de empleo, incluyendo la generación asistida por IA de cartas de presentación.</li>
        <li>Recepción de alertas de empleo, cuando el Candidato las active.</li>
        <li>[FUNCIONALIDADES PREMIUM FUTURAS — a detallar cuando se definan planes de pago para Candidatos].</li>
      </ul>
      <p>El uso básico de la plataforma por parte de los Candidatos es gratuito. Las funcionalidades premium, en
      caso de activarse, tendrán el precio indicado por GovTalent en el momento de su contratación.</p>

      <h3>3. Servicios para Organizaciones</h3>
      <ul>
        <li>Creación y gestión de un perfil de Organización, con posibilidad de generación asistida por IA de la
        descripción a partir del sitio web de la Organización.</li>
        <li>Publicación de ofertas de empleo, incluyendo generación asistida por IA de la descripción del puesto.</li>
        <li>Gestión de candidaturas mediante un tablero (kanban), con funcionalidades de IA de resumen,
        clasificación y generación de mensajes de rechazo a candidatos.</li>
        <li>[FUNCIONALIDADES PREMIUM FUTURAS — filtros avanzados, exportación de datos del directorio, etc., a
        detallar cuando se definan los planes de pago].</li>
      </ul>
      <p>El acceso básico a la plataforma para Organizaciones es gratuito. Las funcionalidades premium tendrán el
      precio indicado por GovTalent en el momento de su contratación, conforme al plan elegido.</p>

      <h3>4. Cuenta de usuario</h3>
      <p>El Cliente se compromete a proporcionar datos reales, actuales y veraces, a custodiar sus credenciales de
      acceso con diligencia y a no cederlas a terceros. El Cliente puede darse de baja y eliminar su cuenta en
      cualquier momento desde el área de administración de su cuenta o solicitándolo a [EMAIL DE CONTACTO].</p>

      <p>GovTalent se reserva la facultad de suspender o cancelar una cuenta, en cualquier momento y sin necesidad
      de preaviso, en caso de uso inadecuado de los Servicios o incumplimiento de las presentes Condiciones.</p>

      <h3>5. Precio y medios de pago</h3>
      <p>Cuando GovTalent active funcionalidades de pago, los precios se indicarán en euros (€) e incluirán los
      impuestos aplicables. GovTalent utilizará [PASARELA DE PAGO — p. ej. Stripe] como procesador de pagos; todas
      las transacciones se realizan bajo un marco de cifrado, sin que GovTalent almacene los datos bancarios del
      Cliente.</p>

      <h3>6. Derecho de desistimiento</h3>
      <p>Los Candidatos que contraten funcionalidades de pago en su condición de consumidores tienen derecho a
      desistir del contrato en el plazo de catorce (14) días naturales desde la contratación, sin necesidad de
      justificación, siempre que no hayan hecho uso efectivo del servicio contratado durante dicho plazo. Si el
      Candidato ha dado su consentimiento expreso para que la prestación del servicio comience antes de que
      finalice el plazo de desistimiento y ha hecho uso del mismo, perderá su derecho de desistimiento en los
      términos del artículo 103 de la Ley General para la Defensa de los Consumidores y Usuarios. Para ejercer
      este derecho, el Candidato debe escribir a [EMAIL DE CONTACTO] indicando su solicitud de desistimiento.</p>

      <p>Las Organizaciones que contraten Servicios de pago lo hacen en el marco de su actividad empresarial o
      profesional, por lo que, de conformidad con la normativa de consumidores y usuarios, no les resulta de
      aplicación el derecho de desistimiento previsto para consumidores.</p>

      <h3>7. Obligaciones de los Clientes</h3>
      <ul>
        <li>Proporcionar información veraz y mantenerla actualizada.</li>
        <li>No utilizar los Servicios para fines contrarios a la ley, la moral o el orden público, ni para el
        envío de spam o comunicaciones no solicitadas.</li>
        <li>No introducir software malicioso ni intentar vulnerar la seguridad de la plataforma.</li>
        <li>Respetar los derechos de propiedad intelectual e industrial de GovTalent y de terceros.</li>
      </ul>

      <h3>8. Responsabilidad</h3>
      <p>GovTalent no responde de las decisiones de contratación adoptadas por las Organizaciones ni de la
      veracidad de la información publicada por los propios Clientes. El contenido generado mediante
      inteligencia artificial (descripciones, resúmenes, mensajes) se ofrece como asistencia y debe ser revisado
      por el Cliente antes de su uso; GovTalent no garantiza su exactitud.</p>

      <h3>9. Terminación</h3>
      <p>GovTalent podrá suspender o cancelar el acceso a los Servicios en caso de incumplimiento de las presentes
      Condiciones. El Cliente puede darse de baja de los Servicios de pago siguiendo el procedimiento indicado en
      su cuenta o escribiendo a [EMAIL DE CONTACTO].</p>

      <h3>10. Normativa y jurisdicción</h3>
      <p>Las presentes Condiciones se rigen por la ley española. Salvo disposición distinta de la normativa de
      consumidores y usuarios, cualquier conflicto se someterá a los juzgados y tribunales de [CIUDAD] (España).
      Conforme al art. 14.1 del Reglamento (UE) 524/2013, se informa de la existencia de una plataforma de
      resolución de litigios en línea de la Comisión Europea: https://ec.europa.eu/consumers/odr/</p>
    </LegalPageShell>
  );
}
