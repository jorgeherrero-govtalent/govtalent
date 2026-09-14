import LegalPageShell from '@/components/LegalPageShell';

export const metadata = {
  title: 'Aviso legal · GovTalent',
  description: 'Aviso legal de GovTalent: titularidad, condiciones de acceso y uso de la plataforma.',
};

export default function AvisoLegalPage() {
  return (
    <LegalPageShell title="Aviso legal">
      <h3>Información del titular</h3>
      <p>El sitio web https://govtalent.app es titularidad de Jorge Rafael Herrero Vidal, con NIF 20455625T,
      quien desarrolla su actividad profesional bajo el nombre comercial GovTalent.</p>

      <table style={tableStyle}>
        <tbody>
          <tr><td style={tdLabel}>Titular</td><td style={tdVal}>Jorge Rafael Herrero Vidal</td></tr>
          <tr><td style={tdLabel}>NIF</td><td style={tdVal}>20455625T</td></tr>
          <tr><td style={tdLabel}>Domicilio profesional</td><td style={tdVal}>Calle de Santa Hortensia, 46C, 28002 Madrid</td></tr>
          <tr><td style={tdLabel}>Correo electrónico</td><td style={tdVal}><a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a></td></tr>
          <tr><td style={tdLabel}>Sitio web</td><td style={tdVal}>https://govtalent.app</td></tr>
        </tbody>
      </table>

      <p>En adelante, el titular será denominado exclusivamente "<b>GovTalent</b>".</p>

      <h3>1. Objeto y aceptación</h3>
      <p>GovTalent pone a disposición de los usuarios el sitio web https://govtalent.app, así como sus diferentes
      páginas, servicios y funcionalidades (en adelante, la "<b>Plataforma</b>").</p>
      <p>El presente Aviso Legal regula el acceso, la navegación y la utilización de la Plataforma. El acceso o uso
      de esta atribuye la condición de usuario (en adelante, el "<b>Usuario</b>") e implica la aceptación de las
      disposiciones contenidas en este Aviso Legal.</p>
      <p>Si el Usuario no está de acuerdo con ellas, deberá abstenerse de acceder o utilizar la Plataforma.</p>
      <p>La contratación de servicios o suscripciones a través de la Plataforma se regirá también por las
      correspondientes <a href="/condiciones">Condiciones Generales de Contratación</a>. En caso de contradicción,
      estas últimas prevalecerán respecto de las cuestiones relacionadas específicamente con la contratación.</p>

      <h3>2. Finalidad y utilización de la Plataforma</h3>
      <p>GovTalent es una plataforma web SaaS por suscripción dirigida a profesionales y organizaciones de los
      sectores de los asuntos públicos y las relaciones institucionales.</p>
      <p>La Plataforma ofrece herramientas para el seguimiento de la actividad normativa y regulatoria en España y
      la Unión Europea, la consulta de información institucional, la gestión de proyectos y el acceso a
      oportunidades de empleo.</p>
      <p>La Plataforma permite, entre otras funcionalidades:</p>
      <ul>
        <li>Monitorizar y consultar la actividad normativa y regulatoria en España y la Unión Europea.</li>
        <li>Conectar a profesionales y candidatos con empresas, consultoras, asociaciones, instituciones y otras
        organizaciones.</li>
        <li>Crear y gestionar perfiles profesionales y de organizaciones.</li>
        <li>Consultar directorios profesionales, empresariales e institucionales.</li>
        <li>Publicar y consultar ofertas de empleo.</li>
        <li>Gestionar proyectos profesionales.</li>
        <li>Crear actas de reunión celebradas entre grupos de interés y cargos públicos.</li>
        <li>Gestionar candidaturas y procesos de selección.</li>
        <li>Utilizar herramientas profesionales asistidas por inteligencia artificial.</li>
      </ul>
      <p>GovTalent podrá modificar, actualizar, suspender o retirar contenidos, servicios y funcionalidades de la
      Plataforma cuando resulte necesario. Siempre que sea legalmente exigible o afecte sustancialmente a un
      servicio contratado, se informará a los Usuarios con la antelación correspondiente.</p>
      <p>El Usuario se compromete a:</p>
      <ul>
        <li>Utilizar la Plataforma conforme a la legislación vigente, la buena fe y el orden público.</li>
        <li>No emplearla con fines ilícitos, fraudulentos o lesivos para terceros.</li>
        <li>Facilitar información real, exacta y actualizada.</li>
        <li>No suplantar la identidad de terceros.</li>
        <li>No introducir programas, archivos o elementos que puedan dañar, alterar o perjudicar el funcionamiento
        de la Plataforma.</li>
        <li>No intentar acceder sin autorización a cuentas, sistemas o áreas restringidas.</li>
        <li>No extraer, reutilizar o explotar sistemáticamente los contenidos o bases de datos de la Plataforma sin
        autorización.</li>
        <li>No utilizar mecanismos automatizados de extracción de información, incluidos sistemas de scraping,
        rastreo o descarga masiva, salvo autorización expresa de GovTalent.</li>
      </ul>

      <h3>3. Contenidos e inteligencia artificial</h3>
      <p>Los contenidos disponibles en la Plataforma pueden proceder de:</p>
      <ul>
        <li>GovTalent.</li>
        <li>Los propios Usuarios.</li>
        <li>Fuentes públicas.</li>
        <li>Organismos e instituciones oficiales.</li>
        <li>Proveedores externos de información empresarial o profesional.</li>
      </ul>
      <p>Determinadas funcionalidades utilizan modelos de inteligencia artificial proporcionados por terceros para
      generar o procesar contenidos a partir de la información facilitada por el Usuario.</p>
      <p>Entre estas funcionalidades pueden encontrarse el autocompletado de perfiles a partir de un currículum, la
      generación de ofertas de empleo, los resúmenes de candidaturas y los sistemas de clasificación, comparación o
      apoyo a la selección.</p>
      <p>Los resultados generados mediante inteligencia artificial pueden contener errores, imprecisiones, sesgos o
      información incompleta. No constituyen asesoramiento profesional ni sustituyen la valoración humana.</p>
      <p>El Usuario deberá revisar los resultados antes de utilizarlos, publicarlos o tomar decisiones basadas en
      ellos.</p>
      <p>Las Organizaciones serán responsables de adoptar las decisiones finales relativas a los procesos de
      selección y deberán evitar cualquier utilización discriminatoria o contraria a la legislación aplicable. Las
      herramientas automatizadas ofrecidas por GovTalent tienen carácter auxiliar y no deben emplearse como único
      criterio para adoptar decisiones que produzcan efectos jurídicos o afecten significativamente a una
      persona.</p>
      <p>La información sobre el tratamiento de datos personales y el procedimiento para ejercer los derechos
      correspondientes se encuentra en la <a href="/privacidad">Política de Privacidad</a>.</p>

      <h3>4. Información normativa e institucional</h3>
      <p>La información normativa, regulatoria e institucional disponible en la Plataforma se obtiene de fuentes
      públicas, organismos oficiales y proveedores externos.</p>
      <p>GovTalent adopta medidas razonables para mantener esta información actualizada, pero no garantiza que sea
      completa, exacta o que se encuentre permanentemente actualizada en tiempo real.</p>
      <p>La información ofrecida tiene carácter exclusivamente informativo y no constituye asesoramiento jurídico,
      regulatorio o profesional.</p>
      <p>Antes de adoptar decisiones o cumplir obligaciones legales basándose en esta información, el Usuario
      deberá contrastarla con la publicación o fuente oficial correspondiente.</p>
      <p>Los sistemas de seguimiento, alertas y notificaciones constituyen herramientas de apoyo y no sustituyen la
      consulta de los diarios oficiales ni el seguimiento profesional de los procedimientos normativos.</p>
      <p>GovTalent no será responsable de las consecuencias derivadas de retrasos, errores, omisiones o
      interrupciones en la recepción de alertas o notificaciones, salvo en aquellos supuestos en los que la
      responsabilidad no pueda excluirse o limitarse legalmente.</p>

      <h3>5. Comunicación de contenidos ilícitos o incorrectos</h3>
      <p>Cualquier persona que considere que un contenido publicado en la Plataforma es ilícito, vulnera derechos
      de terceros, contiene información incorrecta o afecta indebidamente a sus derechos puede comunicarlo a{' '}
      <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>.</p>
      <p>La comunicación deberá incluir, en la medida de lo posible:</p>
      <ul>
        <li>La identificación o localización exacta del contenido afectado.</li>
        <li>Una explicación suficientemente motivada de la solicitud.</li>
        <li>La documentación o información que permita acreditar lo manifestado.</li>
        <li>Los datos de contacto necesarios para gestionar la comunicación.</li>
      </ul>
      <p>GovTalent podrá solicitar información adicional cuando resulte necesaria para valorar la solicitud y
      adoptará las medidas oportunas conforme a la legislación aplicable.</p>
      <p>La recepción de una comunicación no implicará necesariamente la retirada automática del contenido.
      GovTalent analizará cada solicitud atendiendo a su contenido, las evidencias disponibles y los derechos e
      intereses legítimos de las personas afectadas.</p>

      <h3>6. Propiedad intelectual e industrial</h3>
      <p>Los contenidos y elementos de la Plataforma, incluidos su diseño, estructura, textos, gráficos,
      interfaces, bases de datos, software, código fuente, código objeto, logotipos y signos distintivos,
      pertenecen a GovTalent o se utilizan con las correspondientes autorizaciones o licencias.</p>
      <p>Queda prohibida su reproducción, distribución, transformación, comunicación pública, extracción,
      reutilización o explotación comercial sin autorización previa, salvo en los supuestos permitidos por la
      legislación aplicable.</p>
      <p>La denominación y los elementos distintivos de GovTalent no podrán utilizarse de forma que puedan generar
      confusión sobre la existencia de una relación, colaboración, patrocinio o autorización.</p>
      <p>Los nombres comerciales, marcas y logotipos de las Organizaciones que aparecen en la Plataforma se
      utilizan exclusivamente para identificarlas y presentar información relacionada con su actividad, perfiles u
      ofertas de empleo. Los derechos sobre dichos elementos corresponden a sus respectivos titulares.</p>
      <p>Si una persona o entidad considera que algún contenido vulnera sus derechos de propiedad intelectual o
      industrial, puede comunicarlo a{' '}
      <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>.</p>

      <h3>7. Enlaces externos</h3>
      <p>La Plataforma puede contener enlaces a páginas web, perfiles profesionales o servicios gestionados por
      terceros.</p>
      <p>GovTalent no controla sus contenidos, disponibilidad, seguridad o políticas y no será responsable de los
      daños derivados del acceso o utilización de dichos servicios externos, salvo cuando tenga conocimiento
      efectivo de que el contenido enlazado es ilícito y no actúe diligentemente para retirar o desactivar el
      enlace.</p>
      <p>Se permite enlazar a la página principal de GovTalent siempre que el enlace:</p>
      <ul>
        <li>No presente información falsa o engañosa.</li>
        <li>No sugiera una relación, colaboración, autorización o patrocinio inexistente.</li>
        <li>No reproduzca la Plataforma dentro de marcos o sistemas que alteren su presentación.</li>
        <li>No proceda de sitios con contenidos ilícitos o contrarios a los derechos de terceros.</li>
      </ul>

      <h3>8. Disponibilidad y responsabilidad</h3>
      <p>GovTalent adopta medidas razonables para mantener la Plataforma disponible, segura y actualizada. No
      obstante, no puede garantizar su disponibilidad ininterrumpida ni la ausencia absoluta de errores,
      incidencias técnicas o elementos dañinos.</p>
      <p>GovTalent no será responsable de:</p>
      <ul>
        <li>Las interrupciones provocadas por tareas de mantenimiento, problemas técnicos o causas ajenas a su
        control.</li>
        <li>La veracidad, exactitud o actualización de la información publicada directamente por los Usuarios.</li>
        <li>Las decisiones profesionales o de contratación adoptadas por los Candidatos o las Organizaciones.</li>
        <li>Los resultados obtenidos mediante herramientas automatizadas o de inteligencia artificial.</li>
        <li>Los retrasos, errores u omisiones que puedan producirse en las alertas y herramientas de
        seguimiento.</li>
        <li>Los contenidos y servicios ofrecidos por terceros mediante enlaces externos.</li>
        <li>El uso indebido de la Plataforma por parte de los Usuarios.</li>
        <li>Los daños derivados del incumplimiento de las obligaciones asumidas por el Usuario.</li>
      </ul>
      <p>Estas limitaciones se aplicarán únicamente dentro de los márgenes permitidos por la legislación vigente y
      no excluirán aquellas responsabilidades que legalmente no puedan limitarse.</p>

      <h3>9. Protección de datos y cookies</h3>
      <p>El tratamiento de datos personales realizado a través de la Plataforma se regula en la{' '}
      <a href="/privacidad">Política de Privacidad</a>.</p>
      <p>La utilización de cookies y tecnologías similares se explica en la{' '}
      <a href="/cookies">Política de Cookies</a> de la Plataforma.</p>

      <h3>10. Modificaciones</h3>
      <p>GovTalent podrá actualizar este Aviso Legal para adaptarlo a cambios normativos, técnicos o relacionados
      con las funcionalidades de la Plataforma.</p>
      <p>La versión publicada en cada momento será aplicable desde su fecha de actualización, sin perjuicio de las
      comunicaciones adicionales que resulten legalmente exigibles.</p>

      <h3>11. Legislación aplicable y jurisdicción</h3>
      <p>Este Aviso Legal se rige por la legislación española.</p>
      <p>Cuando el Usuario tenga la condición de consumidor, cualquier controversia se someterá a los juzgados y
      tribunales que resulten competentes conforme a la normativa de consumidores y usuarios.</p>
      <p>En los demás casos, las partes se someten a los juzgados y tribunales de Madrid, salvo que otra
      jurisdicción resulte legalmente imperativa.</p>

      <p style={updated}>Última actualización: septiembre de 2026.</p>
    </LegalPageShell>
  );
}

const aLink = { color: '#1d6f5c' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', margin: '16px 0', fontSize: 13 };
const tdLabel = { padding: '6px 10px', fontWeight: 700, border: '.5px solid #e0dfd8', background: '#faf9f5', width: '30%' };
const tdVal = { padding: '6px 10px', border: '.5px solid #e0dfd8' };
const updated = { marginTop: 24, fontSize: 12, color: '#999' };
