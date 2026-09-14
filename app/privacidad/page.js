import LegalPageShell from '@/components/LegalPageShell';

export const metadata = {
  title: 'Política de privacidad · GovTalent',
  description: 'Cómo trata GovTalent los datos personales recogidos a través de la plataforma.',
};

export default function PrivacidadPage() {
  return (
    <LegalPageShell title="Política de privacidad">
      <h3>Información del responsable</h3>
      <p>Siguiendo los principios de licitud, lealtad, transparencia, limitación de la finalidad y minimización de
      datos, GovTalent pone a disposición de los Usuarios la presente Política de Privacidad.</p>
      <p>Esta política explica cómo se tratan los datos personales recopilados a través de https://govtalent.app,
      sus páginas, áreas privadas, funcionalidades y servicios asociados (en adelante, la "<b>Plataforma</b>").</p>

      <table style={tableStyle}>
        <tbody>
          <tr><td style={tdLabel}>Responsable del tratamiento</td><td style={tdVal}>Jorge Rafael Herrero Vidal, actuando bajo el nombre comercial GovTalent</td></tr>
          <tr><td style={tdLabel}>NIF</td><td style={tdVal}>20455625T</td></tr>
          <tr><td style={tdLabel}>Domicilio profesional</td><td style={tdVal}>Calle de Hermosilla, 48, 28001 Madrid</td></tr>
          <tr><td style={tdLabel}>Correo electrónico</td><td style={tdVal}><a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a></td></tr>
          <tr><td style={tdLabel}>Sitio web</td><td style={tdVal}>https://govtalent.app</td></tr>
        </tbody>
      </table>

      <p>En adelante, el responsable será denominado exclusivamente "<b>GovTalent</b>".</p>
      <p>El tratamiento de datos personales se realizará conforme al Reglamento (UE) 2016/679, General de
      Protección de Datos (RGPD), la Ley Orgánica 3/2018, de Protección de Datos Personales y garantía de los
      derechos digitales (LOPDGDD), y las demás normas aplicables.</p>

      <h3>1. Ámbito de aplicación</h3>
      <p>Esta Política de Privacidad se aplica a los datos personales que:</p>
      <ul>
        <li>Los Usuarios faciliten al registrarse o utilizar la Plataforma.</li>
        <li>Se generen como consecuencia de la navegación o utilización de sus funcionalidades.</li>
        <li>Sean comunicados por empresas, organizaciones u otros Usuarios.</li>
        <li>Se obtengan de fuentes públicas, organismos oficiales o proveedores externos.</li>
        <li>Se generen o estructuren mediante funcionalidades automatizadas o de inteligencia artificial.</li>
      </ul>
      <p>A efectos de esta política, se consideran Usuarios tanto los profesionales y candidatos como los
      representantes, empleados y colaboradores de las organizaciones que utilizan la Plataforma.</p>

      <h3>2. Datos personales tratados</h3>

      <h4 style={sub}>2.1. Visitantes sin cuenta</h4>
      <p>Durante la navegación por las páginas públicas pueden tratarse:</p>
      <ul>
        <li>Dirección IP.</li>
        <li>Tipo de dispositivo, navegador y sistema operativo.</li>
        <li>Fecha y hora de acceso.</li>
        <li>Dirección de procedencia.</li>
        <li>Registros técnicos, de seguridad y funcionamiento.</li>
        <li>Preferencias relacionadas con cookies y privacidad.</li>
      </ul>
      <p>Estos datos se utilizan para permitir el funcionamiento técnico de la Plataforma, mantener su seguridad y
      prevenir usos fraudulentos.</p>
      <p>GovTalent no utiliza actualmente Google Analytics ni herramientas publicitarias de seguimiento del
      comportamiento de los visitantes.</p>
      <p>Las páginas públicas pueden ser rastreadas e indexadas por buscadores. GovTalent puede utilizar Google
      Search Console para conocer, de manera agregada, el funcionamiento de estas páginas en los resultados de
      búsqueda.</p>

      <h4 style={sub}>2.2. Profesionales y candidatos registrados</h4>
      <p>GovTalent puede tratar:</p>
      <ul>
        <li>Nombre y apellidos.</li>
        <li>Correo electrónico y teléfono.</li>
        <li>Fotografía de perfil.</li>
        <li>Ubicación y datos de contacto.</li>
        <li>Experiencia profesional.</li>
        <li>Formación académica.</li>
        <li>Idiomas, competencias e intereses profesionales.</li>
        <li>Preferencias laborales.</li>
        <li>Currículum y documentos adjuntos.</li>
        <li>Enlaces profesionales facilitados por el Usuario.</li>
        <li>Ofertas consultadas, guardadas o solicitadas.</li>
        <li>Historial de candidaturas.</li>
        <li>Comunicaciones relacionadas con procesos de selección.</li>
        <li>Contenido incorporado voluntariamente al perfil.</li>
        <li>Datos extraídos o estructurados a partir del currículum.</li>
        <li>Resultados o resúmenes generados mediante herramientas automatizadas.</li>
        <li>Información sobre el plan contratado, facturación y suscripción.</li>
        <li>Datos de uso de la cuenta y de las funcionalidades.</li>
      </ul>
      <p>El Usuario deberá evitar incluir datos especialmente sensibles que no resulten necesarios para su
      finalidad profesional, como información relativa a la salud, origen racial o étnico, opiniones políticas,
      creencias religiosas, afiliación sindical, orientación sexual o datos biométricos.</p>

      <h4 style={sub}>2.3. Usuarios vinculados a organizaciones</h4>
      <p>Cuando una persona crea, administra o utiliza una cuenta en nombre de una Organización, GovTalent puede
      tratar:</p>
      <ul>
        <li>Nombre y apellidos.</li>
        <li>Correo electrónico y teléfono profesionales.</li>
        <li>Cargo, departamento y organización.</li>
        <li>Permisos y rol dentro de la cuenta.</li>
        <li>Registro de accesos y actividad.</li>
        <li>Comunicaciones realizadas a través de la Plataforma.</li>
        <li>Datos de facturación y suscripción.</li>
        <li>Acciones realizadas en procesos de selección y proyectos.</li>
      </ul>
      <p>También puede tratarse información relativa a la Organización, como su denominación, sector, tamaño,
      ubicación, descripción, sitio web, logotipo y perfiles públicos.</p>
      <p>Esta información no tendrá la consideración de dato personal salvo cuando identifique o haga identificable
      a una persona física.</p>

      <h4 style={sub}>2.4. Candidaturas gestionadas por Organizaciones</h4>
      <p>Cuando una Organización utiliza las herramientas de selección de GovTalent, pueden tratarse:</p>
      <ul>
        <li>Datos identificativos y de contacto.</li>
        <li>Currículum y perfil profesional.</li>
        <li>Experiencia, formación, competencias e idiomas.</li>
        <li>Oferta a la que se presenta el candidato.</li>
        <li>Estado e historial de la candidatura.</li>
        <li>Notas y valoraciones de la Organización.</li>
        <li>Comunicaciones relacionadas con el proceso.</li>
        <li>Resúmenes o clasificaciones generados mediante herramientas automatizadas.</li>
        <li>Documentación aportada durante el proceso.</li>
      </ul>
      <p>Cuando GovTalent trate estos datos siguiendo las instrucciones de una Organización, esta tendrá la
      condición de responsable del tratamiento y GovTalent actuará como encargado del tratamiento.</p>
      <p>Una vez que una Organización recibe una candidatura, será responsable de informar al candidato sobre el
      tratamiento que realice para gestionar el proceso de selección.</p>

      <h4 style={sub}>2.5. Información de proyectos y equipos</h4>
      <p>Las Organizaciones que utilicen las herramientas de gestión de proyectos pueden incorporar:</p>
      <ul>
        <li>Datos de los integrantes del equipo.</li>
        <li>Personas de contacto, interlocutores y colaboradores.</li>
        <li>Tareas, reuniones, notas e hitos.</li>
        <li>Documentos y archivos.</li>
        <li>Comunicaciones internas.</li>
        <li>Información profesional, institucional o regulatoria.</li>
        <li>Menciones y asignaciones realizadas dentro de la Plataforma.</li>
      </ul>
      <p>La Organización deberá asegurarse de que dispone de una base jurídica válida para incorporar esta
      información y de que no introduce datos personales innecesarios o desproporcionados.</p>
      <p>Cuando esta información se trate por cuenta de la Organización, GovTalent actuará como encargado del
      tratamiento.</p>

      <h4 style={sub}>2.6. Clientes de pago</h4>
      <p>Para contratar una suscripción pueden tratarse:</p>
      <ul>
        <li>Nombre y apellidos o denominación social.</li>
        <li>NIF o CIF.</li>
        <li>Dirección de facturación.</li>
        <li>Correo electrónico.</li>
        <li>Plan contratado.</li>
        <li>Importe, moneda y estado del pago.</li>
        <li>Historial de facturas y suscripciones.</li>
      </ul>
      <p>Los datos completos de las tarjetas y otros medios de pago son tratados directamente por Stripe. GovTalent
      no almacena los números completos de las tarjetas ni sus códigos de seguridad.</p>

      <h4 style={sub}>2.7. Solicitudes de contacto y soporte</h4>
      <p>Cuando una persona contacta con GovTalent pueden tratarse:</p>
      <ul>
        <li>Nombre y apellidos.</li>
        <li>Correo electrónico.</li>
        <li>Organización y cargo, cuando proceda.</li>
        <li>Motivo de la consulta.</li>
        <li>Contenido de la comunicación.</li>
        <li>Documentos o información aportados voluntariamente.</li>
        <li>Historial de comunicaciones.</li>
      </ul>

      <h4 style={sub}>2.8. Comunicaciones y alertas</h4>
      <p>Cuando exista una base jurídica válida, GovTalent puede tratar:</p>
      <ul>
        <li>Nombre.</li>
        <li>Correo electrónico.</li>
        <li>Organización y cargo.</li>
        <li>Preferencias e intereses.</li>
        <li>Alertas configuradas.</li>
        <li>Historial de comunicaciones.</li>
        <li>Información básica sobre la entrega e interacción con los correos enviados.</li>
      </ul>
      <p>El Usuario podrá darse de baja de las comunicaciones comerciales mediante el enlace incluido en cada
      correo o escribiendo a <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>.</p>

      <h3>3. Directorios de organizaciones, instituciones y cargos públicos</h3>
      <p>GovTalent puede incorporar información procedente de:</p>
      <ul>
        <li>Diarios y boletines oficiales.</li>
        <li>Portales de transparencia.</li>
        <li>Páginas web de organismos e instituciones.</li>
        <li>Registros y bases de datos públicas.</li>
        <li>Páginas corporativas.</li>
        <li>Perfiles profesionales públicos.</li>
        <li>Proveedores externos de información empresarial o institucional.</li>
      </ul>
      <p>La información puede incluir:</p>
      <ul>
        <li>Nombre y apellidos.</li>
        <li>Cargo o responsabilidad pública.</li>
        <li>Organismo, institución u Organización.</li>
        <li>Trayectoria o biografía profesional pública.</li>
        <li>Ámbito territorial o sectorial.</li>
        <li>Datos de contacto profesionales o institucionales publicados oficialmente.</li>
        <li>Enlaces a fuentes y perfiles públicos.</li>
        <li>Información sobre la vigencia del cargo y fecha de actualización.</li>
      </ul>
      <p>GovTalent no pretende incorporar información perteneciente a la esfera privada de las personas ni datos de
      contacto personales que no hayan sido publicados con finalidad profesional o institucional.</p>

      <h3>4. Información obtenida indirectamente</h3>
      <p>Cuando los datos personales no se hayan obtenido directamente del interesado, GovTalent aplicará las
      obligaciones de información previstas en el artículo 14 del RGPD.</p>

      <h4 style={sub}>4.1. Origen</h4>
      <p>Los datos pueden proceder de fuentes públicas, organismos oficiales, páginas institucionales, páginas
      corporativas, perfiles profesionales públicos y proveedores externos de información empresarial o
      institucional.</p>
      <p>Siempre que sea posible, GovTalent identificará la fuente de la información.</p>

      <h4 style={sub}>4.2. Finalidades</h4>
      <p>Los datos se utilizarán para:</p>
      <ul>
        <li>Crear y mantener directorios profesionales, empresariales e institucionales.</li>
        <li>Facilitar la consulta de información sectorial.</li>
        <li>Identificar organizaciones, instituciones y responsables públicos.</li>
        <li>Permitir que las Organizaciones reclamen y verifiquen su perfil.</li>
        <li>Mantener la información actualizada.</li>
        <li>Facilitar contactos exclusivamente profesionales o institucionales.</li>
        <li>Corregir o eliminar información desactualizada.</li>
      </ul>

      <h4 style={sub}>4.3. Base jurídica</h4>
      <p>El tratamiento se basa en el interés legítimo de GovTalent y de sus Usuarios en disponer de directorios
      sectoriales, empresariales e institucionales útiles y actualizados, conforme al artículo 6.1.f) del RGPD.</p>
      <p>Este interés se aplicará después de valorar la necesidad y proporcionalidad del tratamiento, la naturaleza
      pública o profesional de la información, las expectativas razonables de los interesados y las medidas
      adoptadas para proteger sus derechos.</p>

      <h4 style={sub}>4.4. Información al interesado</h4>
      <p>Cuando GovTalent disponga de un medio de contacto adecuado, facilitará la información exigida por el
      artículo 14 del RGPD dentro de los plazos legalmente establecidos.</p>
      <p>Cuando la comunicación individual resulte imposible o exija un esfuerzo desproporcionado, y concurran los
      requisitos legales correspondientes, GovTalent publicará esta Política de Privacidad y adoptará medidas
      adecuadas para proteger los derechos e intereses de los afectados.</p>

      <h4 style={sub}>4.5. Actualización, oposición y supresión</h4>
      <p>Cualquier persona u Organización puede solicitar la actualización, rectificación, oposición o supresión de
      sus datos escribiendo a <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>.</p>
      <p>La solicitud deberá identificar suficientemente el perfil o la información afectada.</p>
      <p>Los perfiles de Organizaciones incorporados por GovTalent se mostrarán como "No verificados" hasta que la
      propia Organización reclame el perfil y confirme sus datos.</p>

      <h3>5. Finalidades y bases jurídicas</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Finalidad</th>
              <th style={th}>Base jurídica</th>
            </tr>
          </thead>
          <tbody>
            {bases.map(([f, b]) => (
              <tr key={f}>
                <td style={tdVal}>{f}</td>
                <td style={tdVal}>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Cuando el tratamiento se base en el consentimiento, el Usuario podrá retirarlo en cualquier momento. Su
      retirada no afectará a la licitud del tratamiento efectuado anteriormente.</p>

      <h3>6. Perfiles públicos</h3>
      <p>Determinadas funcionalidades permiten al Usuario publicar o hacer visible parte de su perfil.</p>
      <p>Antes de activar su publicación, GovTalent informará al Usuario sobre el nivel de visibilidad aplicable.
      El Usuario podrá modificar sus preferencias o retirar la visibilidad desde la configuración de su cuenta.</p>
      <p>La información marcada como pública podrá ser:</p>
      <ul>
        <li>Consultada por otros Usuarios.</li>
        <li>Consultada por Organizaciones.</li>
        <li>Accesible desde páginas públicas.</li>
        <li>Indexada por buscadores cuando forme parte de una página pública.</li>
      </ul>
      <p>La eliminación de una página de GovTalent no implica su desaparición inmediata de los resultados o copias
      temporales conservadas por buscadores externos.</p>

      <h3>7. Inteligencia artificial y decisiones automatizadas</h3>
      <p>GovTalent puede utilizar servicios de inteligencia artificial para:</p>
      <ul>
        <li>Extraer y estructurar información de un currículum.</li>
        <li>Autocompletar perfiles.</li>
        <li>Generar o mejorar descripciones de ofertas.</li>
        <li>Resumir candidaturas.</li>
        <li>Comparar información profesional con los requisitos de una oferta.</li>
        <li>Clasificar o priorizar candidaturas.</li>
        <li>Generar borradores de mensajes.</li>
      </ul>
      <p>Los resultados pueden contener errores, imprecisiones o sesgos y deberán revisarse antes de utilizarse.</p>
      <p>GovTalent no adopta decisiones de contratación ni rechaza candidaturas de manera exclusivamente
      automatizada.</p>
      <p>Las herramientas de clasificación o priorización tienen carácter auxiliar. La Organización es responsable
      de revisar los resultados, aplicar sus propios criterios y adoptar la decisión final mediante intervención
      humana.</p>
      <p>Cuando proceda, el candidato podrá expresar su punto de vista, impugnar una valoración o solicitar una
      revisión humana escribiendo a <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a> o
      dirigiéndose a la Organización responsable del proceso.</p>
      <p>Los datos enviados a proveedores de inteligencia artificial se limitarán a los necesarios para ejecutar la
      funcionalidad solicitada. Cuando sea técnicamente posible, estos servicios se configurarán para impedir que
      los datos se utilicen para entrenar modelos generales ajenos a la prestación contratada.</p>

      <h3>8. Destinatarios</h3>
      <p>Los datos podrán ponerse a disposición de:</p>
      <ul>
        <li>Organizaciones receptoras de candidaturas.</li>
        <li>Administradores y miembros autorizados de las cuentas de Organización.</li>
        <li>Administraciones, juzgados, tribunales y autoridades cuando exista obligación legal.</li>
        <li>Proveedores tecnológicos que actúen bajo las instrucciones de GovTalent.</li>
      </ul>
      <p>GovTalent utiliza los siguientes proveedores:</p>
      <ul>
        <li><b>Supabase:</b> base de datos, almacenamiento y autenticación.</li>
        <li><b>Vercel:</b> alojamiento y funcionamiento de la aplicación.</li>
        <li><b>Resend:</b> envío de correos transaccionales, alertas y notificaciones.</li>
        <li><b>Google:</b> Gmail, inicio de sesión cuando esté disponible, indexación y Google Search Console.</li>
        <li><b>Stripe:</b> pagos y suscripciones.</li>
        <li><b>Anthropic:</b> funcionalidades de inteligencia artificial cuando se utilicen sus modelos.</li>
      </ul>
      <p>GovTalent formalizará con los proveedores que actúen como encargados del tratamiento los contratos y
      garantías exigidos por la normativa.</p>

      <h3>9. Transferencias internacionales</h3>
      <p>Algunos proveedores pueden tratar datos desde países situados fuera del Espacio Económico Europeo,
      especialmente Estados Unidos.</p>
      <p>Cuando se produzcan transferencias internacionales, GovTalent comprobará que se basen en un mecanismo
      admitido por el RGPD, como:</p>
      <ul>
        <li>Una decisión de adecuación de la Comisión Europea.</li>
        <li>La adhesión válida al Marco de Privacidad de Datos UE-EE. UU.</li>
        <li>Cláusulas contractuales tipo.</li>
        <li>Medidas adicionales cuando resulten necesarias.</li>
        <li>Otro mecanismo legalmente reconocido.</li>
      </ul>
      <p>El Usuario puede solicitar información sobre estas garantías escribiendo a{' '}
      <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>.</p>

      <h3>10. Conservación</h3>
      <p>Los datos se conservarán conforme a los siguientes criterios:</p>
      <ul>
        <li><b>Cuenta y perfil:</b> mientras la cuenta permanezca activa.</li>
        <li><b>Prestación del servicio:</b> mientras sean necesarios para ejecutar la relación contractual.</li>
        <li><b>Candidaturas:</b> durante el proceso de selección y el plazo establecido por la Organización
        responsable.</li>
        <li><b>Proyectos y espacios de Organización:</b> mientras la cuenta permanezca activa o hasta que la
        Organización solicite su eliminación.</li>
        <li><b>Consultas y soporte:</b> durante el tiempo necesario para resolverlas y atender
        responsabilidades.</li>
        <li><b>Comunicaciones comerciales:</b> hasta que el Usuario retire su consentimiento o se oponga.</li>
        <li><b>Facturación:</b> durante los plazos exigidos por la normativa fiscal, contable y mercantil.</li>
        <li><b>Registros técnicos:</b> durante el tiempo necesario para garantizar la seguridad e investigar
        incidencias.</li>
        <li><b>Directorios:</b> mientras la información mantenga su relevancia profesional o institucional y no
        proceda su rectificación o supresión.</li>
        <li><b>Datos bloqueados:</b> durante los plazos de prescripción de posibles responsabilidades.</li>
      </ul>
      <p>Cuando los datos dejen de ser necesarios, se eliminarán, bloquearán o anonimizarán.</p>
      <p>Las copias de seguridad podrán conservarlos durante un periodo adicional limitado hasta su eliminación o
      sobrescritura conforme a los ciclos técnicos establecidos.</p>

      <h3>11. Derechos</h3>
      <p>Las personas interesadas pueden ejercer los derechos de:</p>
      <ul>
        <li>Acceso.</li>
        <li>Rectificación.</li>
        <li>Supresión.</li>
        <li>Oposición.</li>
        <li>Limitación del tratamiento.</li>
        <li>Portabilidad.</li>
        <li>Retirada del consentimiento.</li>
        <li>Revisión de decisiones automatizadas cuando resulte aplicable.</li>
      </ul>
      <p>Para ejercerlos, deberán escribir a{' '}
      <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>, indicando el derecho que desean
      ejercer y la información necesaria para localizar los datos.</p>
      <p>GovTalent podrá solicitar información adicional para verificar la identidad cuando existan dudas
      razonables.</p>
      <p>Si la solicitud se refiere a un tratamiento realizado por una Organización a través de GovTalent, podrá
      trasladarse a la Organización responsable.</p>
      <p>La persona interesada también puede presentar una reclamación ante la Agencia Española de Protección de
      Datos.</p>

      <h3>12. Seguridad</h3>
      <p>GovTalent adopta medidas técnicas y organizativas razonables para proteger los datos frente a:</p>
      <ul>
        <li>Accesos no autorizados.</li>
        <li>Alteración, pérdida o destrucción.</li>
        <li>Divulgación indebida.</li>
        <li>Usos fraudulentos.</li>
        <li>Incidentes de seguridad.</li>
      </ul>
      <p>El Usuario deberá mantener sus credenciales confidenciales y comunicar cualquier uso no autorizado de su
      cuenta.</p>

      <h3>13. Datos de terceros</h3>
      <p>Cuando un Usuario facilite datos de otra persona, deberá asegurarse de que dispone de una base jurídica
      válida para hacerlo.</p>
      <p>El Usuario no deberá incorporar información personal de terceros que resulte innecesaria, excesiva o ajena
      a las finalidades profesionales de la Plataforma.</p>
      <p>Las Organizaciones serán responsables de informar a sus empleados, colaboradores, candidatos y contactos
      cuando incorporen sus datos a espacios gestionados por ellas.</p>

      <h3>14. Menores de edad</h3>
      <p>La Plataforma está dirigida a personas mayores de 18 años.</p>
      <p>Los menores no deben registrarse ni facilitar datos personales. Si GovTalent detecta que una cuenta
      pertenece a un menor, podrá bloquearla y eliminar sus datos.</p>

      <h3>15. Exactitud de los datos</h3>
      <p>El Usuario garantiza que los datos proporcionados son exactos, completos y actualizados.</p>
      <p>GovTalent podrá actualizar los datos procedentes de fuentes públicas cuando detecte cambios en cargos,
      organizaciones, instituciones u otra información profesional.</p>

      <h3>16. Cookies</h3>
      <p>La Plataforma utiliza cookies y tecnologías necesarias para su funcionamiento, autenticación, seguridad y
      mantenimiento de las sesiones.</p>
      <p>GovTalent no utiliza actualmente Google Analytics ni píxeles publicitarios.</p>
      <p>La información detallada se encuentra en la <a href="/cookies">Política de Cookies</a>.</p>

      <h3>17. Modificaciones</h3>
      <p>GovTalent podrá actualizar esta Política de Privacidad para adaptarla a cambios normativos, tecnológicos o
      relacionados con las funcionalidades de la Plataforma.</p>
      <p>Cuando las modificaciones sean sustanciales, se informará mediante la Plataforma, por correo electrónico o
      a través de otro medio adecuado.</p>

      <p style={updated}>Última actualización: septiembre de 2026.</p>
    </LegalPageShell>
  );
}

const bases = [
  ['Crear y gestionar cuentas y perfiles', 'Ejecución del contrato o medidas precontractuales'],
  ['Prestar las funcionalidades de la Plataforma', 'Ejecución del contrato'],
  ['Gestionar suscripciones, cobros y facturación', 'Ejecución del contrato y obligaciones legales'],
  ['Gestionar candidaturas iniciadas por el Usuario', 'Ejecución del contrato y solicitud del candidato'],
  ['Comunicar candidaturas a las Organizaciones', 'Ejecución del contrato y solicitud del candidato'],
  ['Publicar un perfil profesional cuando el Usuario lo active', 'Consentimiento o acción voluntaria del Usuario'],
  ['Gestionar ofertas y procesos de selección', 'Ejecución del contrato con la Organización'],
  ['Gestionar proyectos, documentos y equipos', 'Ejecución del contrato con la Organización'],
  ['Autocompletar perfiles y generar contenidos mediante IA', 'Ejecución de la funcionalidad solicitada'],
  ['Generar resúmenes o herramientas de apoyo a la selección', 'Ejecución del contrato e interés legítimo, con intervención humana'],
  ['Enviar alertas configuradas por el Usuario', 'Ejecución del servicio solicitado'],
  ['Enviar comunicaciones comerciales', 'Consentimiento o interés legítimo cuando resulte legalmente aplicable'],
  ['Atender consultas y solicitudes', 'Consentimiento, ejecución contractual o interés legítimo'],
  ['Proteger la Plataforma y prevenir el fraude', 'Interés legítimo'],
  ['Mantener directorios profesionales e institucionales', 'Interés legítimo'],
  ['Cumplir obligaciones legales', 'Cumplimiento de obligaciones legales'],
  ['Formular, ejercer o defender reclamaciones', 'Interés legítimo'],
];

const aLink = { color: '#1d6f5c' };
const sub = { fontSize: 14, fontWeight: 700, margin: '18px 0 6px' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', margin: '16px 0', fontSize: 13 };
const th = { padding: '6px 10px', fontWeight: 700, border: '.5px solid #e0dfd8', background: '#faf9f5', textAlign: 'left' };
const tdLabel = { padding: '6px 10px', fontWeight: 700, border: '.5px solid #e0dfd8', background: '#faf9f5', width: '30%' };
const tdVal = { padding: '6px 10px', border: '.5px solid #e0dfd8' };
const updated = { marginTop: 24, fontSize: 12, color: '#999' };
