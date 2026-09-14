import LegalPageShell from '@/components/LegalPageShell';

export const metadata = {
  title: 'Condiciones generales de contratación y uso · GovTalent',
  description: 'Condiciones que regulan el registro, la contratación y el uso de los servicios de GovTalent.',
};

export default function CondicionesPage() {
  return (
    <LegalPageShell title="Condiciones generales de contratación y uso">
      <h3>Información del prestador</h3>
      <p>El sitio web https://govtalent.app y los servicios ofrecidos a través de él son prestados por Jorge Rafael
      Herrero Vidal, con NIF 20455625T, quien desarrolla su actividad profesional bajo el nombre comercial
      GovTalent.</p>

      <table style={tableStyle}>
        <tbody>
          <tr><td style={tdLabel}>Prestador</td><td style={tdVal}>Jorge Rafael Herrero Vidal</td></tr>
          <tr><td style={tdLabel}>NIF</td><td style={tdVal}>20455625T</td></tr>
          <tr><td style={tdLabel}>Domicilio profesional</td><td style={tdVal}>Calle de Hermosilla, 48, 28001 Madrid</td></tr>
          <tr><td style={tdLabel}>Correo electrónico</td><td style={tdVal}><a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a></td></tr>
        </tbody>
      </table>

      <p>En adelante, el prestador será denominado exclusivamente "<b>GovTalent</b>".</p>

      <h3>1. Objeto</h3>
      <p>Las presentes Condiciones Generales de Contratación y Uso (en adelante, las "<b>Condiciones</b>") regulan
      el registro, acceso, contratación y utilización de los servicios ofrecidos a través de https://govtalent.app
      y sus áreas privadas (en adelante, la "<b>Plataforma</b>").</p>
      <p>GovTalent es una plataforma SaaS dirigida a profesionales y organizaciones de los sectores de los asuntos
      públicos y las relaciones institucionales.</p>
      <p>La Plataforma ofrece, entre otras funcionalidades:</p>
      <ul>
        <li>Seguimiento de la actividad normativa y regulatoria en España y la Unión Europea.</li>
        <li>Consulta de directorios de organizaciones, instituciones y cargos públicos.</li>
        <li>Creación de perfiles profesionales y de organizaciones.</li>
        <li>Consulta y publicación de ofertas de empleo.</li>
        <li>Gestión de candidaturas y procesos de selección.</li>
        <li>Gestión individual o colaborativa de proyectos.</li>
        <li>Planificación de tareas, reuniones, hitos y actividad profesional.</li>
        <li>Creación de actas, resúmenes y otros contenidos.</li>
        <li>Funcionalidades asistidas por inteligencia artificial.</li>
      </ul>
      <p>Estas funcionalidades serán denominadas conjuntamente los "<b>Servicios</b>".</p>

      <h3>2. Aceptación y documentación contractual</h3>
      <p>El registro de una cuenta gratuita implica la aceptación de las disposiciones aplicables al acceso y
      utilización de la Plataforma.</p>
      <p>La contratación de un plan de pago requiere la aceptación expresa de estas Condiciones mediante la
      correspondiente casilla o mecanismo habilitado antes de completar el pago.</p>
      <p>Las Condiciones se complementan con:</p>
      <ul>
        <li>El <a href="/legal">Aviso Legal</a>.</li>
        <li>La <a href="/privacidad">Política de Privacidad</a>.</li>
        <li>La <a href="/cookies">Política de Cookies</a>.</li>
        <li>Las características, precios y límites publicados en la <a href="/precios">página de precios</a>.</li>
        <li>Las condiciones particulares que puedan mostrarse durante la contratación.</li>
      </ul>
      <p>En caso de contradicción, las condiciones particulares aceptadas durante la contratación prevalecerán
      respecto de las cuestiones específicas del plan contratado.</p>
      <p>GovTalent remitirá o pondrá a disposición del Cliente una confirmación de la contratación en un soporte
      que permita conservarla y consultarla posteriormente.</p>

      <h3>3. Requisitos para contratar</h3>
      <p>Para crear una cuenta o contratar los Servicios, el Cliente deberá:</p>
      <ul>
        <li>Ser mayor de 18 años.</li>
        <li>Tener capacidad legal suficiente para contratar.</li>
        <li>Facilitar información exacta, completa y actualizada.</li>
        <li>Aceptar estas Condiciones y las políticas aplicables.</li>
      </ul>
      <p>Cuando una persona contrate en nombre de una Organización, declara que dispone de facultades suficientes
      para representarla y vincularla contractualmente.</p>
      <p>A efectos de estas Condiciones:</p>
      <ul>
        <li>Se denomina "<b>Profesional</b>" al Usuario que crea una cuenta personal.</li>
        <li>Se denomina "<b>Organización</b>" a la empresa, consultora, asociación, institución o entidad que crea
        una cuenta organizativa.</li>
        <li>Se denomina "<b>Cliente</b>" a cualquier Profesional u Organización que contrate o utilice los
        Servicios.</li>
      </ul>
      <p>La denominación "Profesional" utilizada por GovTalent no determina por sí misma la condición jurídica del
      Cliente como consumidor o empresario. Esta condición dependerá de la finalidad con la que contrate el
      Servicio.</p>

      <h3>4. Planes para Profesionales</h3>

      <h4 style={sub}>4.1. Plan Free</h4>
      <p>El plan Free tiene un precio de 0 € y permite acceder, con los límites indicados en la Plataforma, a:</p>
      <ul>
        <li>Ofertas de empleo y presentación de candidaturas.</li>
        <li>Creación y gestión del perfil profesional.</li>
        <li>Recomendaciones profesionales.</li>
        <li>Consulta del directorio institucional en España y Bruselas.</li>
        <li>Consulta de proyectos normativos en España y la Unión Europea.</li>
      </ul>
      <p>GovTalent podrá establecer límites razonables de uso para proteger la estabilidad de la Plataforma y
      evitar usos automatizados, abusivos o contrarios a estas Condiciones.</p>

      <h4 style={sub}>4.2. Plan Pro</h4>
      <p>El plan Pro tiene un precio ordinario de 59 € al año e incluye las funcionalidades del plan Free y,
      adicionalmente:</p>
      <ul>
        <li>Búsqueda avanzada e información ampliada.</li>
        <li>Seguimiento normativo y regulatorio.</li>
        <li>Alertas e histórico completo.</li>
        <li>Creación y gestión de proyectos.</li>
        <li>Diagramas interactivos para visualizar proyectos.</li>
        <li>Planificación de agenda, fechas y tareas.</li>
        <li>Registro de actividad y automatización de actas.</li>
        <li>Las demás funcionalidades identificadas como Pro en la Plataforma.</li>
      </ul>
      <p>La suscripción Pro es personal. No puede compartirse con otras personas ni utilizarse simultáneamente por
      varios Usuarios, salvo autorización expresa de GovTalent.</p>

      <h3>5. Planes para Organizaciones</h3>

      <h4 style={sub}>5.1. Plan Free</h4>
      <p>El plan Free para Organizaciones tiene un precio de 0 € e incluye:</p>
      <ul>
        <li>Una cuenta de Usuario.</li>
        <li>Ficha de Organización verificada y página propia.</li>
        <li>Una oferta de empleo activa.</li>
        <li>Hasta 15 candidaturas por oferta.</li>
        <li>Acceso al sistema de gestión de candidatos o ATS integrado.</li>
        <li>Las demás funcionalidades identificadas como Free en la Plataforma.</li>
      </ul>

      <h4 style={sub}>5.2. Plan Recruiter</h4>
      <p>El plan Recruiter tiene un precio ordinario de 149 € al año e incluye una cuenta de Usuario, las
      funcionalidades del plan Free y, adicionalmente:</p>
      <ul>
        <li>Publicación de ofertas y recepción de candidaturas sin los límites del plan Free, sujeto a una política
        de uso razonable.</li>
        <li>Generación asistida por inteligencia artificial de descripciones de ofertas.</li>
        <li>Herramientas de matching y scoring de candidatos.</li>
        <li>Generación de resúmenes de candidaturas mediante inteligencia artificial.</li>
        <li>Las demás funcionalidades identificadas como Recruiter en la Plataforma.</li>
      </ul>

      <h4 style={sub}>5.3. Plan Teams</h4>
      <p>El plan Teams tiene un precio ordinario de 429 € al año e incluye hasta cuatro Usuarios pertenecientes a
      la misma Organización, las funcionalidades del plan Recruiter y, adicionalmente:</p>
      <ul>
        <li>Licencias GovTalent Pro para los Usuarios autorizados del equipo.</li>
        <li>Proyectos compartidos y colaborativos.</li>
        <li>Seguimiento normativo y alertas regulatorias.</li>
        <li>Agenda y notas compartidas.</li>
        <li>Registro de actividad y automatización de actas.</li>
        <li>Acceso ampliado al directorio de organismos y cargos de la Administración General del Estado y la Unión
        Europea.</li>
        <li>Funcionalidades de consulta y exportación conforme a los límites del plan.</li>
        <li>Dashboard de Organización.</li>
        <li>Roles y permisos diferenciados.</li>
        <li>Onboarding personalizado.</li>
        <li>Las demás funcionalidades identificadas como Teams en la Plataforma.</li>
      </ul>
      <p>Las licencias de Teams solo pueden asignarse a personas que mantengan una relación profesional con la
      Organización contratante.</p>
      <p>La Organización será responsable de gestionar las altas, bajas, roles y permisos de sus Usuarios.</p>

      <h3>6. GovTalent Campus y servicios personalizados</h3>
      <p>GovTalent puede ofrecer planes específicos para universidades, centros educativos, asociaciones y otras
      entidades formativas bajo la denominación GovTalent Campus.</p>
      <p>Las características, número de Usuarios, precio, duración y condiciones de estos servicios se establecerán
      mediante una propuesta o acuerdo particular.</p>
      <p>También podrán contratarse servicios adicionales de onboarding, configuración, importación, soporte o
      desarrollo personalizado. Estos servicios se regirán por las condiciones particulares aceptadas por el
      Cliente.</p>

      <h3>7. Promociones Founding Member</h3>
      <p>GovTalent puede ofrecer promociones limitadas de lanzamiento.</p>
      <p>En el momento de publicación de estas Condiciones se ofrecen:</p>
      <ul>
        <li><b>Founding Member Pro:</b> 30 € durante el primer año. Posteriormente, la suscripción se renovará por
        el precio ordinario vigente, actualmente 59 € al año.</li>
        <li><b>Founding Member Teams:</b> 215 € durante el primer año para las primeras Organizaciones admitidas en
        la promoción. Posteriormente, la suscripción se renovará por el precio ordinario vigente, actualmente
        429 € al año.</li>
      </ul>
      <p>Las promociones:</p>
      <ul>
        <li>Están sujetas a disponibilidad.</li>
        <li>No son acumulables con otros descuentos salvo indicación expresa.</li>
        <li>Se aplican únicamente al primer periodo anual.</li>
        <li>No implican el mantenimiento indefinido del precio promocional.</li>
        <li>Quedan vinculadas a la cuenta que realizó la contratación.</li>
        <li>No pueden venderse, cederse o transferirse.</li>
      </ul>
      <p>La plaza promocional no se considerará confirmada hasta que el pago haya sido completado correctamente y
      GovTalent haya confirmado la contratación.</p>
      <p>Las condiciones concretas y el número de plazas disponibles serán los mostrados durante el proceso de
      contratación.</p>

      <h3>8. Precio e impuestos</h3>
      <p>Los precios aplicables serán los publicados en la Plataforma en el momento de la contratación.</p>
      <p>Salvo que se indique expresamente lo contrario, los precios mostrados incluirán los impuestos indirectos
      legalmente aplicables.</p>
      <p>Antes de completar el pago, el Cliente podrá consultar:</p>
      <ul>
        <li>El plan seleccionado.</li>
        <li>El precio total.</li>
        <li>Los impuestos aplicables.</li>
        <li>La duración de la suscripción.</li>
        <li>Su carácter renovable.</li>
        <li>La periodicidad de los cobros.</li>
        <li>Las condiciones de cancelación.</li>
      </ul>
      <p>GovTalent podrá modificar los precios para futuras contrataciones o renovaciones. Cualquier cambio que
      afecte a una suscripción vigente se comunicará antes de la siguiente renovación.</p>
      <p>El nuevo precio no se aplicará al periodo anual ya pagado.</p>

      <h3>9. Pago y facturación</h3>
      <p>Los pagos se procesan mediante Stripe.</p>
      <p>GovTalent no almacena los números completos de las tarjetas ni sus códigos de seguridad.</p>
      <p>El Cliente autoriza a Stripe y a GovTalent a realizar el cobro correspondiente al periodo contratado y,
      cuando exista renovación automática, a los periodos sucesivos hasta su cancelación.</p>
      <p>El Cliente deberá proporcionar información de facturación exacta y mantener actualizado su medio de
      pago.</p>
      <p>Las facturas se emitirán con los datos facilitados por el Cliente. Su modificación posterior estará sujeta
      a la normativa fiscal aplicable.</p>
      <p>Si el pago no puede completarse, GovTalent podrá:</p>
      <ul>
        <li>Volver a intentar el cobro.</li>
        <li>Solicitar la actualización del medio de pago.</li>
        <li>Limitar temporalmente determinadas funcionalidades.</li>
        <li>Suspender la suscripción.</li>
        <li>Cambiar la cuenta al plan gratuito correspondiente.</li>
      </ul>
      <p>La suspensión por impago no libera al Cliente de las cantidades vencidas que resulten exigibles.</p>

      <h3>10. Duración y renovación</h3>
      <p>Los planes de pago tienen una duración anual, salvo que durante la contratación se indique expresamente
      otra periodicidad.</p>
      <p>Las suscripciones se renovarán automáticamente por periodos de la misma duración utilizando el medio de
      pago registrado.</p>
      <p>Antes de contratar, el Cliente será informado del carácter renovable de la suscripción, su precio y la
      periodicidad de los cobros.</p>
      <p>El Cliente puede desactivar la renovación automática en cualquier momento desde la configuración de su
      cuenta o escribiendo a <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>.</p>
      <p>La cancelación de la renovación:</p>
      <ul>
        <li>Evita el siguiente cobro.</li>
        <li>No produce, por sí sola, el reembolso del periodo ya pagado.</li>
        <li>Permite utilizar el plan hasta que termine el periodo contratado.</li>
        <li>No elimina automáticamente la cuenta ni sus contenidos.</li>
      </ul>
      <p>GovTalent comunicará con antelación razonable cualquier aumento del precio aplicable a la siguiente
      renovación. Si el Cliente no acepta el nuevo precio, podrá cancelar la renovación antes de la fecha del
      siguiente cobro.</p>

      <h3>11. Derecho de desistimiento</h3>
      <p>Esta cláusula se aplica exclusivamente a las personas que contraten legalmente como consumidores.</p>
      <p>El consumidor podrá desistir del contrato dentro de los 14 días naturales siguientes a su celebración, sin
      necesidad de justificar su decisión.</p>
      <p>Para ejercer este derecho deberá comunicarlo inequívocamente a{' '}
      <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>, indicando:</p>
      <ul>
        <li>Nombre y apellidos.</li>
        <li>Correo electrónico asociado a la cuenta.</li>
        <li>Plan contratado.</li>
        <li>Fecha de contratación.</li>
        <li>Decisión de desistir del contrato.</li>
      </ul>
      <p>También podrá utilizar el modelo incluido al final de estas Condiciones.</p>

      <h4 style={sub}>Inicio del servicio durante el plazo de desistimiento</h4>
      <p>Si el consumidor solicita que el Servicio comience durante el plazo de desistimiento, GovTalent podrá
      activar inmediatamente las funcionalidades contratadas.</p>
      <p>Si posteriormente desiste antes de finalizar los 14 días, podrá exigirse el importe proporcional a la
      parte del Servicio efectivamente prestada, cuando legalmente corresponda y se haya obtenido la solicitud
      expresa necesaria.</p>
      <p>El mero acceso puntual al Servicio no supondrá automáticamente la pérdida íntegra del derecho de
      desistimiento.</p>
      <p>Cuando la normativa permita la pérdida del derecho respecto de un contenido o prestación digital concreta,
      esta solo se producirá después de obtener el consentimiento expreso del consumidor, su reconocimiento de que
      pierde dicho derecho y la correspondiente confirmación contractual.</p>
      <p>GovTalent devolverá las cantidades que legalmente correspondan utilizando, por regla general, el mismo
      medio de pago empleado en la contratación.</p>
      <p>Las Organizaciones y las personas que contraten el Servicio dentro de su actividad empresarial o
      profesional no tendrán la condición de consumidores ni podrán ejercer este derecho, salvo que GovTalent les
      reconozca expresamente una garantía comercial adicional.</p>

      <h3>12. Cambios de plan</h3>
      <p>El Cliente puede solicitar el cambio de plan mediante las funcionalidades disponibles en su cuenta.</p>
      <p>En las mejoras a un plan superior, GovTalent podrá cobrar inmediatamente la diferencia proporcional o
      aplicar el cambio en la siguiente renovación, según se indique durante el proceso.</p>
      <p>En las reducciones a un plan inferior, el cambio se aplicará normalmente al finalizar el periodo
      pagado.</p>
      <p>Cuando el Cliente cambie a un plan con límites inferiores, deberá descargar o reorganizar previamente la
      información que exceda dichos límites. GovTalent podrá restringir el acceso a las funcionalidades o
      contenidos que no estén incluidos en el nuevo plan.</p>

      <h3>13. Cuenta y credenciales</h3>
      <p>El Cliente se compromete a:</p>
      <ul>
        <li>Facilitar datos reales, actuales y completos.</li>
        <li>Mantenerlos actualizados.</li>
        <li>Custodiar sus credenciales.</li>
        <li>No compartir cuentas o licencias individuales.</li>
        <li>No permitir accesos no autorizados.</li>
        <li>Comunicar inmediatamente cualquier incidente de seguridad.</li>
      </ul>
      <p>Las acciones realizadas desde una cuenta se presumirán efectuadas por su titular o por un Usuario
      autorizado, salvo prueba en contrario.</p>
      <p>El Cliente puede solicitar la eliminación de su cuenta desde la configuración disponible o escribiendo a{' '}
      <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>.</p>
      <p>La cancelación de una suscripción y la eliminación de una cuenta son operaciones diferentes.</p>

      <h3>14. Obligaciones generales de los Clientes</h3>
      <p>Los Clientes deberán:</p>
      <ul>
        <li>Utilizar los Servicios conforme a la legislación vigente, la buena fe y estas Condiciones.</li>
        <li>Respetar los derechos de GovTalent y de terceros.</li>
        <li>Proporcionar información veraz.</li>
        <li>No suplantar identidades.</li>
        <li>No introducir software malicioso.</li>
        <li>No intentar vulnerar la seguridad.</li>
        <li>No eludir los límites técnicos o comerciales de los planes.</li>
        <li>No utilizar sistemas automatizados para extraer masivamente información.</li>
        <li>No copiar, revender o explotar los directorios fuera de los usos permitidos.</li>
        <li>No enviar spam ni comunicaciones comerciales ilícitas.</li>
        <li>No publicar contenidos ilegales, discriminatorios, engañosos o lesivos.</li>
        <li>No utilizar la Plataforma para vigilar, acosar, discriminar o perjudicar a otras personas.</li>
      </ul>
      <p>GovTalent podrá establecer límites razonables respecto al número de consultas, exportaciones, documentos,
      alertas, procesos o acciones automatizadas para proteger la seguridad y estabilidad del Servicio.</p>

      <h3>15. Obligaciones específicas de las Organizaciones</h3>
      <p>Las Organizaciones serán responsables de:</p>
      <ul>
        <li>Publicar únicamente ofertas reales y lícitas.</li>
        <li>Identificarse correctamente.</li>
        <li>Cumplir la normativa laboral, de igualdad y no discriminación.</li>
        <li>Tratar los datos de candidatos conforme a la normativa de protección de datos.</li>
        <li>Informar a los candidatos sobre sus propios tratamientos.</li>
        <li>Limitar el acceso a las candidaturas a personal autorizado.</li>
        <li>Revisar humanamente los resultados generados mediante IA.</li>
        <li>No adoptar decisiones de contratación exclusivamente automatizadas cuando esté prohibido.</li>
        <li>No utilizar datos de candidatos para finalidades incompatibles.</li>
        <li>Eliminar o bloquear los datos cuando dejen de ser necesarios.</li>
        <li>Mantener actualizados los permisos de los integrantes del equipo.</li>
      </ul>
      <p>GovTalent podrá retirar ofertas o suspender cuentas cuando existan indicios razonables de fraude,
      discriminación, suplantación, captación engañosa o incumplimiento legal.</p>

      <h3>16. Inteligencia artificial</h3>
      <p>Determinadas funcionalidades utilizan sistemas de inteligencia artificial para:</p>
      <ul>
        <li>Estructurar información de currículums.</li>
        <li>Autocompletar perfiles.</li>
        <li>Generar descripciones de ofertas.</li>
        <li>Resumir candidaturas.</li>
        <li>Facilitar herramientas de matching o scoring.</li>
        <li>Generar actas, resúmenes y borradores.</li>
        <li>Preparar mensajes y comunicaciones.</li>
      </ul>
      <p>Estas funcionalidades producen resultados automatizados que pueden contener errores, omisiones,
      imprecisiones o sesgos.</p>
      <p>El Cliente deberá revisar los resultados antes de utilizarlos, publicarlos o incorporarlos a una
      decisión.</p>
      <p>GovTalent no garantiza que un resultado sea exacto, completo o adecuado para una finalidad concreta.</p>
      <p>Las herramientas de matching, scoring o clasificación:</p>
      <ul>
        <li>Tienen carácter auxiliar.</li>
        <li>No constituyen una decisión de contratación.</li>
        <li>No sustituyen el criterio profesional.</li>
        <li>No deben utilizarse como única base para aceptar o rechazar candidatos.</li>
        <li>Deben ser revisadas por una persona autorizada de la Organización.</li>
      </ul>
      <p>El Cliente no podrá introducir datos sensibles, confidenciales o de terceros en una funcionalidad de IA si
      no dispone de autorización o base jurídica para hacerlo.</p>

      <h3>17. Contenidos y datos del Cliente</h3>
      <p>El Cliente conserva los derechos que le correspondan sobre los contenidos que incorpore a la
      Plataforma.</p>
      <p>El Cliente concede a GovTalent una autorización limitada para alojar, reproducir, procesar y mostrar estos
      contenidos únicamente cuando sea necesario para:</p>
      <ul>
        <li>Prestar los Servicios.</li>
        <li>Ejecutar las instrucciones del Cliente.</li>
        <li>Mantener la seguridad.</li>
        <li>Prestar soporte.</li>
        <li>Cumplir obligaciones legales.</li>
      </ul>
      <p>El Cliente garantiza que dispone de los derechos y autorizaciones necesarios sobre los contenidos y datos
      que incorpora.</p>
      <p>GovTalent no adquiere la propiedad de los documentos, proyectos, currículums o contenidos privados del
      Cliente.</p>

      <h3>18. Confidencialidad de proyectos</h3>
      <p>La información incorporada a espacios privados de proyectos no será pública salvo que el Cliente decida
      compartirla o exista una funcionalidad que indique expresamente lo contrario.</p>
      <p>GovTalent podrá acceder de forma limitada a esta información cuando resulte necesario para:</p>
      <ul>
        <li>Resolver una solicitud de soporte.</li>
        <li>Investigar un incidente de seguridad.</li>
        <li>Prevenir fraude o usos ilícitos.</li>
        <li>Cumplir una obligación legal.</li>
        <li>Mantener técnicamente el Servicio.</li>
      </ul>
      <p>Las Organizaciones deberán gestionar correctamente los permisos de sus integrantes. GovTalent no será
      responsable de accesos realizados por personas a quienes la propia Organización haya autorizado.</p>

      <h3>19. Directorios profesionales e institucionales</h3>
      <p>A efectos de estas Condiciones, se entiende por "<b>Directorio</b>" el conjunto organizado de información
      profesional, empresarial e institucional que GovTalent pone a disposición de los Usuarios a través de la
      Plataforma.</p>
      <p>El Directorio puede contener:</p>
      <ul>
        <li>Organizaciones, instituciones y organismos.</li>
        <li>Nombres y apellidos de cargos o responsables.</li>
        <li>Puestos, funciones y áreas de responsabilidad.</li>
        <li>Datos de contacto profesionales o institucionales.</li>
        <li>Información biográfica o profesional pública.</li>
        <li>Enlaces a páginas, perfiles y fuentes públicas.</li>
        <li>Relaciones entre organismos, unidades, cargos y ámbitos competenciales.</li>
      </ul>
      <p>La información puede proceder de organismos oficiales, portales de transparencia, diarios y boletines
      oficiales, páginas institucionales, registros públicos, fuentes abiertas e información aportada por los
      Usuarios.</p>
      <p>La disponibilidad de un dato en el Directorio no implica que pueda utilizarse libremente para cualquier
      finalidad ni que la persona afectada haya autorizado la recepción de comunicaciones comerciales.</p>

      <h3>20. Fuentes del Directorio</h3>
      <p>GovTalent selecciona, verifica, organiza, relaciona y actualiza la información del Directorio para
      facilitar su consulta y utilización profesional.</p>
      <p>Siempre que resulte posible, GovTalent identificará la fuente o fecha de actualización correspondiente.</p>
      <p>La aparición de información procedente de una fuente pública no implica que dicha fuente patrocine,
      participe o mantenga una relación con GovTalent.</p>
      <p>La información pública individualmente considerada conservará el régimen jurídico que le corresponda. Su
      incorporación a la Plataforma no implica que GovTalent adquiera derechos exclusivos sobre los hechos o datos
      públicos de origen.</p>

      <h3>21. Propiedad y protección del Directorio</h3>
      <p>La selección, verificación, normalización, clasificación, estructura, presentación, enriquecimiento y
      organización del Directorio, así como las relaciones creadas entre sus registros, forman parte de los activos
      de GovTalent y están protegidas por la normativa aplicable sobre propiedad intelectual, competencia desleal y
      bases de datos.</p>
      <p>La suscripción únicamente concede un derecho limitado de consulta y utilización conforme al plan
      contratado.</p>
      <p>La contratación no supone la venta, transmisión o cesión del Directorio ni de los derechos asociados a su
      estructura y organización.</p>

      <h3>22. Licencia de utilización del Directorio</h3>
      <p>GovTalent concede al Cliente una licencia limitada, no exclusiva, temporal, revocable, no sublicenciable e
      intransferible para consultar y utilizar el Directorio durante la vigencia de su cuenta o suscripción.</p>
      <p>La licencia se destina exclusivamente a la actividad profesional interna del Cliente y queda limitada al
      número de Usuarios incluido en el plan contratado.</p>
      <p>En el plan Teams podrán acceder hasta cuatro Usuarios autorizados pertenecientes a la misma Organización.
      Las credenciales serán individuales y no podrán compartirse.</p>
      <p>La licencia no autoriza al Cliente a crear un repositorio independiente que sustituya funcionalmente al
      Directorio de GovTalent.</p>

      <h3>23. Usos permitidos del Directorio</h3>
      <p>El Cliente podrá utilizar el Directorio para:</p>
      <ul>
        <li>Consultar información relacionada con su actividad profesional.</li>
        <li>Identificar organismos, unidades, organizaciones y áreas de responsabilidad.</li>
        <li>Preparar estrategias, proyectos y actuaciones profesionales.</li>
        <li>Incorporar referencias concretas a proyectos internos.</li>
        <li>Organizar contactos y relaciones institucionales legítimas.</li>
        <li>Exportar información cuando el plan lo permita y dentro de los límites establecidos.</li>
        <li>Verificar información mediante las fuentes originales.</li>
      </ul>
      <p>Los datos solo podrán utilizarse para finalidades profesionales legítimas, determinadas y compatibles con
      la naturaleza de la información.</p>
      <p>El Cliente deberá comprobar su exactitud, actualidad y procedencia antes de utilizarlos para una actuación
      relevante.</p>

      <h3>24. Uso de cargos y datos de contacto</h3>
      <p>Los datos de cargos y contactos disponibles en el Directorio tienen carácter profesional o institucional y
      deberán utilizarse de forma proporcionada y relacionada con las funciones de su destinatario.</p>
      <p>La disponibilidad de un dato en GovTalent:</p>
      <ul>
        <li>No implica que la persona haya consentido recibir comunicaciones comerciales.</li>
        <li>No autoriza el envío de comunicaciones masivas.</li>
        <li>No exime al Cliente de identificar una base jurídica válida.</li>
        <li>No sustituye el cumplimiento de los deberes de información.</li>
        <li>No garantiza que el dato permanezca actualizado.</li>
      </ul>
      <p>El Cliente será responsable de las comunicaciones y tratamientos que realice después de consultar o
      exportar la información.</p>
      <p>GovTalent no proporciona estos datos para campañas indiscriminadas, publicidad masiva, llamadas
      automáticas o actividades de spam.</p>

      <h3>25. Consulta y exportación</h3>
      <p>Cuando el plan contratado incluya funcionalidades de exportación, estas permitirán descargar conjuntos
      limitados de información para su utilización profesional interna.</p>
      <p>La expresión "Directorio exportable" no implica el derecho a descargar o reproducir la totalidad de la
      base de datos.</p>
      <p>GovTalent podrá establecer límites razonables relativos a:</p>
      <ul>
        <li>Número de registros.</li>
        <li>Campos disponibles.</li>
        <li>Frecuencia de las exportaciones.</li>
        <li>Volumen de consultas.</li>
        <li>Ámbitos territoriales o institucionales.</li>
        <li>Formatos de descarga.</li>
        <li>Número de Usuarios.</li>
      </ul>
      <p>Estos límites podrán variar según el plan contratado y se mostrarán en la Plataforma o durante la
      contratación.</p>
      <p>Los datos exportados no podrán transmitirse a terceros ni utilizarse para crear productos o servicios
      independientes, salvo autorización expresa de GovTalent.</p>

      <h3>26. Usos prohibidos del Directorio</h3>
      <p>El Cliente no podrá:</p>
      <ul>
        <li>Compartir credenciales.</li>
        <li>Facilitar el acceso a personas distintas de los Usuarios autorizados.</li>
        <li>Vender, alquilar, sublicenciar, ceder o redistribuir el Directorio.</li>
        <li>Publicar sus contenidos en otra plataforma.</li>
        <li>Crear una base de datos o servicio competidor.</li>
        <li>Extraer la totalidad o una parte sustancial del Directorio.</li>
        <li>Realizar extracciones repetidas que conjuntamente equivalgan a una parte sustancial.</li>
        <li>Utilizar scraping, bots o mecanismos automatizados no autorizados.</li>
        <li>Eludir los límites de consulta o exportación.</li>
        <li>Utilizar los contactos para spam o campañas masivas.</li>
        <li>Utilizar la información para acosar, discriminar, vigilar o perjudicar.</li>
        <li>Alterar los datos para atribuir información falsa a una persona u Organización.</li>
        <li>Combinar la información con datos sensibles o privados obtenidos ilícitamente.</li>
      </ul>
      <p>La consulta manual o la utilización de una funcionalidad de exportación no elimina estas
      restricciones.</p>

      <h3>27. Actualización del Directorio</h3>
      <p>GovTalent actuará con diligencia razonable para mantener el Directorio actualizado. No obstante, los
      cargos, funciones, organismos y datos de contacto pueden cambiar sin comunicación previa.</p>
      <p>GovTalent no garantiza que toda la información sea permanentemente exacta, completa o vigente.</p>
      <p>El Cliente deberá verificar en la fuente oficial la información necesaria antes de realizar una actuación
      profesional relevante.</p>
      <p>GovTalent podrá corregir, completar, actualizar o retirar registros. Las modificaciones individuales no
      darán derecho a reembolso mientras se mantenga sustancialmente el Servicio contratado.</p>

      <h3>28. Protección de datos en el uso del Directorio</h3>
      <p>Respecto de los tratamientos realizados después de consultar o exportar información, el Cliente actuará
      como responsable independiente y deberá:</p>
      <ul>
        <li>Contar con una base jurídica válida.</li>
        <li>Cumplir el deber de información cuando resulte exigible.</li>
        <li>Respetar los principios de finalidad y minimización.</li>
        <li>Mantener los datos actualizados.</li>
        <li>Aplicar medidas de seguridad adecuadas.</li>
        <li>Atender los derechos de las personas.</li>
        <li>Suprimir los datos cuando dejen de ser necesarios.</li>
        <li>Conservar prueba del cumplimiento de sus obligaciones.</li>
      </ul>
      <p>GovTalent podrá comunicar al Cliente solicitudes de rectificación, oposición o supresión que afecten a
      datos consultados o exportados.</p>
      <p>Cuando resulte necesario para respetar los derechos de una persona, el Cliente deberá actualizar o
      eliminar también las copias conservadas en sus sistemas, salvo que disponga de otra base jurídica válida e
      independiente.</p>

      <h3>29. Control de uso</h3>
      <p>GovTalent podrá utilizar registros técnicos y controles de seguridad para detectar:</p>
      <ul>
        <li>Accesos simultáneos no autorizados.</li>
        <li>Compartición de cuentas.</li>
        <li>Descargas o consultas anómalas.</li>
        <li>Extracciones automatizadas.</li>
        <li>Incumplimientos de los límites contratados.</li>
        <li>Patrones compatibles con la redistribución de datos.</li>
      </ul>
      <p>Cuando existan indicios razonables de incumplimiento, GovTalent podrá solicitar información al Cliente,
      limitar temporalmente las consultas o exportaciones y suspender el acceso al Directorio.</p>
      <p>En caso de infracción grave, podrá cancelar la cuenta sin perjuicio de reclamar los daños ocasionados.</p>

      <h3>30. Información normativa y regulatoria</h3>
      <p>La información normativa y regulatoria se obtiene de fuentes públicas, organismos oficiales y otras
      fuentes legítimas.</p>
      <p>GovTalent realiza esfuerzos razonables para mantenerla actualizada, pero no garantiza:</p>
      <ul>
        <li>Su actualización en tiempo real.</li>
        <li>La ausencia de errores u omisiones.</li>
        <li>La recepción ininterrumpida de alertas.</li>
        <li>La exhaustividad de los resultados.</li>
        <li>La vigencia permanente de la información.</li>
      </ul>
      <p>La información tiene carácter informativo y no constituye asesoramiento jurídico, regulatorio o
      profesional.</p>
      <p>El Cliente deberá contrastar la información relevante con los diarios, registros y fuentes oficiales antes
      de adoptar decisiones o cumplir obligaciones.</p>
      <p>Las alertas de GovTalent no sustituyen la consulta de fuentes oficiales ni el seguimiento profesional de
      los procedimientos normativos.</p>

      <h3>31. Propiedad intelectual de la Plataforma</h3>
      <p>La Plataforma, su software, diseño, estructura, interfaces, marca, bases de datos y contenidos propios
      pertenecen a GovTalent o a sus licenciantes.</p>
      <p>La contratación concede al Cliente un derecho limitado, no exclusivo, revocable e intransferible para
      utilizar los Servicios durante la vigencia de su cuenta o suscripción.</p>
      <p>No está permitido:</p>
      <ul>
        <li>Copiar o reproducir sustancialmente la Plataforma.</li>
        <li>Realizar ingeniería inversa, salvo en los casos legalmente permitidos.</li>
        <li>Revender o sublicenciar el acceso.</li>
        <li>Crear un servicio competidor mediante extracción sistemática.</li>
        <li>Eliminar avisos de propiedad.</li>
        <li>Utilizar la marca GovTalent sin autorización.</li>
      </ul>

      <h3>32. Disponibilidad y modificaciones del Servicio</h3>
      <p>GovTalent procurará mantener la Plataforma disponible y segura, pero no garantiza un funcionamiento
      permanente o libre de incidencias.</p>
      <p>Podrán producirse interrupciones por:</p>
      <ul>
        <li>Mantenimiento.</li>
        <li>Actualizaciones.</li>
        <li>Fallos técnicos.</li>
        <li>Actuaciones de proveedores.</li>
        <li>Ataques o incidentes de seguridad.</li>
        <li>Causas de fuerza mayor.</li>
      </ul>
      <p>GovTalent podrá modificar o mejorar funcionalidades, siempre que no reduzca de forma sustancial e
      injustificada las características esenciales de un plan pagado durante el periodo contratado.</p>
      <p>Si una modificación perjudica sustancialmente al Cliente consumidor, se aplicarán los derechos reconocidos
      por la normativa sobre servicios digitales.</p>

      <h3>33. Servicios de terceros</h3>
      <p>Algunas funcionalidades dependen de proveedores externos, como Supabase, Vercel, Stripe, Resend, Google y
      proveedores de inteligencia artificial.</p>
      <p>GovTalent no responderá de interrupciones imputables exclusivamente a terceros cuando haya actuado con la
      diligencia razonablemente exigible.</p>
      <p>La utilización de servicios externos puede quedar sometida también a las condiciones del proveedor cuando
      el Cliente interactúe directamente con él, como ocurre durante determinados procesos de pago o
      autenticación.</p>

      <h3>34. Responsabilidad</h3>
      <p>GovTalent responde de la prestación de los Servicios en los términos establecidos legalmente y en estas
      Condiciones.</p>
      <p>Dentro de los límites permitidos por la ley, GovTalent no será responsable de:</p>
      <ul>
        <li>Las decisiones adoptadas por Profesionales u Organizaciones.</li>
        <li>La veracidad de la información publicada por los Clientes.</li>
        <li>Los contenidos incorporados por terceros.</li>
        <li>Los resultados generados mediante inteligencia artificial.</li>
        <li>El uso incorrecto de información normativa o institucional.</li>
        <li>La falta de recepción de una alerta.</li>
        <li>La pérdida derivada de credenciales comprometidas por responsabilidad del Cliente.</li>
        <li>El incumplimiento de obligaciones laborales o de protección de datos por una Organización.</li>
        <li>Los daños indirectos o pérdidas de negocio que no fueran razonablemente previsibles.</li>
      </ul>
      <p>Nada de lo dispuesto en estas Condiciones excluye responsabilidades que no puedan limitarse legalmente ni
      los derechos imperativos de los consumidores.</p>

      <h3>35. Responsabilidad por el uso del Directorio</h3>
      <p>El Cliente responderá del uso que realice del Directorio y de los datos consultados o exportados.</p>
      <p>El Cliente responderá frente a GovTalent por las reclamaciones, sanciones, daños o costes derivados
      de:</p>
      <ul>
        <li>Comunicaciones comerciales ilícitas.</li>
        <li>Cesiones no autorizadas.</li>
        <li>Incumplimientos de protección de datos.</li>
        <li>Extracciones o redistribuciones prohibidas.</li>
        <li>Utilización contraria a estas Condiciones.</li>
        <li>Actuaciones realizadas por los Usuarios autorizados de su cuenta.</li>
      </ul>
      <p>Esta responsabilidad no se aplicará cuando el daño sea directamente imputable a una actuación ilícita o
      negligente de GovTalent.</p>

      <h3>36. Suspensión y cancelación por GovTalent</h3>
      <p>GovTalent podrá suspender o cancelar una cuenta cuando:</p>
      <ul>
        <li>Se incumplan estas Condiciones.</li>
        <li>Exista impago.</li>
        <li>Se detecte fraude o suplantación.</li>
        <li>Se comprometa la seguridad.</li>
        <li>Se utilice la Plataforma de forma abusiva.</li>
        <li>Se vulneren derechos de terceros.</li>
        <li>Lo solicite una autoridad competente.</li>
      </ul>
      <p>Siempre que sea razonablemente posible y no exista una urgencia legal o de seguridad, GovTalent informará
      al Cliente y le permitirá corregir el incumplimiento.</p>
      <p>En caso de infracción grave, fraude, riesgo para terceros o requerimiento legal, la suspensión podrá ser
      inmediata.</p>
      <p>Si GovTalent cancela sin causa imputable al Cliente un plan pagado antes de que finalice el periodo
      contratado, devolverá la parte proporcional correspondiente al periodo no disfrutado.</p>

      <h3>37. Efectos de la terminación</h3>
      <p>Al finalizar una suscripción:</p>
      <ul>
        <li>El Cliente podrá pasar al plan gratuito aplicable.</li>
        <li>Perderá el acceso a las funcionalidades premium.</li>
        <li>Determinados datos podrán quedar temporalmente en modo de solo lectura.</li>
        <li>Los contenidos que excedan los límites del plan gratuito podrán dejar de estar disponibles.</li>
        <li>GovTalent podrá establecer un plazo razonable para descargar la información propia del Cliente.</li>
      </ul>
      <p>El Cliente deberá exportar antes de la terminación los documentos o contenidos propios que desee
      conservar.</p>
      <p>La posibilidad de exportar contenidos propios no incluye el derecho a descargar o conservar una copia
      sustancial del Directorio.</p>
      <p>El Cliente deberá eliminar las copias o exportaciones del Directorio que ya no sean necesarias para la
      finalidad legítima para la que fueron obtenidas.</p>
      <p>No será necesario eliminar información que el Cliente:</p>
      <ul>
        <li>Haya obtenido lícitamente de una fuente independiente.</li>
        <li>Deba conservar por obligación legal.</li>
        <li>Necesite para formular, ejercer o defender reclamaciones.</li>
        <li>Mantenga bajo otra base jurídica válida e independiente.</li>
      </ul>
      <p>La eliminación definitiva de datos se realizará conforme a la{' '}
      <a href="/privacidad">Política de Privacidad</a> y a los plazos legales de conservación.</p>

      <h3>38. Atención al Cliente y reclamaciones</h3>
      <p>El Cliente puede solicitar soporte, formular consultas o presentar reclamaciones escribiendo a{' '}
      <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>.</p>
      <p>La reclamación deberá incluir información suficiente para identificar la cuenta, el Servicio afectado y el
      motivo de la solicitud.</p>
      <p>GovTalent procurará responder en el menor plazo posible y, en todo caso, dentro de los plazos legalmente
      aplicables.</p>

      <h3>39. Modificación de las Condiciones</h3>
      <p>GovTalent podrá actualizar estas Condiciones por motivos legales, técnicos, de seguridad o relacionados
      con la evolución de los Servicios.</p>
      <p>Las modificaciones que no afecten sustancialmente a los derechos del Cliente serán aplicables desde su
      publicación.</p>
      <p>Cuando una modificación afecte de manera relevante a un plan contratado, GovTalent la comunicará con
      antelación razonable. Los cambios no se aplicarán retroactivamente.</p>
      <p>Si el Cliente no acepta una modificación sustancial, podrá cancelar la renovación antes de su entrada en
      vigor o ejercer los derechos reconocidos por la normativa aplicable.</p>

      <h3>40. Legislación y jurisdicción</h3>
      <p>Estas Condiciones se rigen por la legislación española.</p>
      <p>Cuando el Cliente tenga la condición de consumidor, cualquier controversia se someterá a los juzgados y
      tribunales determinados por la normativa de consumidores y usuarios.</p>
      <p>En los demás casos, las partes se someten a los juzgados y tribunales de Madrid, salvo que otra
      jurisdicción resulte legalmente imperativa.</p>

      <p style={updated}>Última actualización: septiembre de 2026.</p>

      <h3>Anexo. Modelo de desistimiento</h3>
      <p>Este formulario solo debe cumplimentarse y enviarse si el Cliente tiene la condición legal de consumidor y
      desea desistir del contrato:</p>
      <div style={anexo}>
        <p style={{ margin: '0 0 8px' }}>A la atención de GovTalent<br/>
        Correo electrónico: hola@govtalent.app</p>
        <p style={{ margin: '0 0 8px' }}>Por la presente, comunico que desisto del contrato relativo al siguiente
        Servicio:</p>
        <p style={{ margin: 0 }}>
          Plan contratado:<br/>
          Fecha de contratación:<br/>
          Nombre y apellidos:<br/>
          Correo electrónico asociado a la cuenta:<br/>
          Domicilio:<br/>
          Fecha de la solicitud:<br/>
          Firma del consumidor: únicamente si el formulario se presenta en papel.
        </p>
      </div>
    </LegalPageShell>
  );
}

const aLink = { color: '#1d6f5c' };
const sub = { fontSize: 14, fontWeight: 700, margin: '18px 0 6px' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', margin: '16px 0', fontSize: 13 };
const tdLabel = { padding: '6px 10px', fontWeight: 700, border: '.5px solid #e0dfd8', background: '#faf9f5', width: '30%' };
const tdVal = { padding: '6px 10px', border: '.5px solid #e0dfd8' };
const updated = { marginTop: 24, fontSize: 12, color: '#999' };
const anexo = { background: '#f8f7f2', border: '.5px solid #e0dfd8', borderRadius: 8, padding: 16, fontSize: 13, margin: '12px 0' };
