import LegalPageShell from '@/components/LegalPageShell';

export const metadata = { title: 'Política de privacidad · GovTalent' };

export default function PrivacidadPage() {
  return (
    <LegalPageShell title="Política de privacidad">
      <p style={{ fontSize: 12, background: '#f8f7f2', border: '.5px solid #e0dfd8', borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <b>Plantilla pendiente de completar con los datos reales del responsable.</b> Los campos entre corchetes
        deben sustituirse antes de la apertura de registro público de la plataforma, y este documento debe ser
        revisado por un profesional antes de su publicación definitiva.
      </p>

      <p>Siguiendo los principios de licitud, lealtad y transparencia, ponemos a su disposición la presente
      Política de Privacidad.</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0', fontSize: 13 }}>
        <tbody>
          <tr><td style={tdLabel}>Responsable</td><td style={tdVal}>[RAZÓN SOCIAL / NOMBRE Y APELLIDOS]</td></tr>
          <tr><td style={tdLabel}>NIF/CIF</td><td style={tdVal}>[NIF O CIF]</td></tr>
          <tr><td style={tdLabel}>Domicilio</td><td style={tdVal}>[DOMICILIO FISCAL COMPLETO]</td></tr>
          <tr><td style={tdLabel}>Correo electrónico</td><td style={tdVal}>[EMAIL DE CONTACTO]</td></tr>
          <tr><td style={tdLabel}>Teléfono</td><td style={tdVal}>[TELÉFONO DE CONTACTO]</td></tr>
        </tbody>
      </table>

      <p>De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 de Protección de Datos y
      Garantía de Derechos Digitales (LOPDGDD), se informa de la política de privacidad que GovTalent aplicará en
      el tratamiento de los datos personales que los usuarios de la Web (en adelante, el/los "<b>Usuario/s</b>")
      faciliten voluntariamente, generen al navegar por la Web, o que GovTalent obtenga de fuentes públicas o de
      terceros proveedores de datos empresariales.</p>

      <h3>1. Datos recogidos, según el tipo de Usuario</h3>

      <p><b>a) Visitante sin cuenta.</b> Por la mera navegación por la Web (directorio de organizaciones, ofertas
      de empleo públicas) no se recogen datos que permitan identificar nominativamente al visitante, más allá de
      información técnica (tipo de navegador, dirección IP) para el correcto funcionamiento y seguridad de la Web.</p>

      <p><b>b) Candidato con cuenta registrada.</b> Nombre, apellidos, correo electrónico, teléfono, ubicación,
      experiencia profesional, formación, idiomas, currículum (CV) y cualquier otro dato incluido voluntariamente
      en el perfil, incluyendo el contenido generado a partir del CV mediante herramientas de inteligencia
      artificial.</p>

      <p><b>c) Organización con cuenta registrada (verificada).</b> Datos de la persona de contacto que gestiona
      la cuenta (nombre, correo electrónico, cargo), así como información de la propia Organización (nombre,
      sector, tamaño, ubicación, descripción, logotipo).</p>

      <p><b>d) Organización no verificada (incorporada por GovTalent a partir de fuentes públicas o de terceros).</b>
      Nombre de la Organización, sector, ubicación, tamaño aproximado, sitio web, perfil de LinkedIn y, cuando esté
      disponible, un correo electrónico de contacto genérico o profesional obtenido de fuentes públicas o de
      proveedores de datos empresariales (en adelante, "<b>Datos de Organización No Verificada</b>"). GovTalent no
      recaba estos datos directamente del interesado — ver apartado 2 de este documento.</p>

      <p><b>e) Clientes de pago.</b> Cuando GovTalent ofrezca funcionalidades de pago, se recabarán además los
      datos de facturación necesarios. Los datos bancarios se gestionan directamente por la pasarela de pago
      utilizada (ver apartado 4), sin que GovTalent los almacene.</p>

      <p><b>f) Solicitudes de contacto.</b> Nombre, correo electrónico y cualquier dato incluido voluntariamente
      al escribir a través de los canales de contacto de la Web.</p>

      <h3>2. Tratamiento de datos de Organizaciones No Verificadas (art. 14 RGPD)</h3>

      <p>Cuando los datos personales de la persona de contacto de una Organización no se han obtenido directamente
      del interesado, sino de fuentes públicas o de terceros proveedores de datos empresariales, GovTalent cumple
      las obligaciones de información reforzada del artículo 14 del RGPD:</p>

      <ul>
        <li><b>Origen de los datos:</b> [DESCRIBIR FUENTE(S) CONCRETA(S) — p. ej. "exportación de datos públicos
        de perfiles empresariales de LinkedIn a través de [PROVEEDOR]"].</li>
        <li><b>Finalidad:</b> incorporar a la Organización al directorio de GovTalent como perfil informativo, y
        permitir que dicha Organización pueda "reclamar" y verificar su propio perfil registrándose en la Web.</li>
        <li><b>Base jurídica:</b> interés legítimo de GovTalent (art. 6.1.f RGPD) en construir un directorio
        sectorial útil para los profesionales del sector de los asuntos públicos y facilitar el contacto comercial
        entre GovTalent y la Organización.</li>
        <li><b>Plazo de información:</b> GovTalent informa a la persona de contacto, cuando dispone de su correo
        electrónico, en el primer contacto que le dirige (invitación a reclamar el perfil) y, en todo caso, dentro
        del plazo máximo de un (1) mes desde la incorporación del dato.</li>
        <li><b>Derecho de oposición y supresión inmediata:</b> la Organización, a través de su persona de contacto,
        puede solicitar en cualquier momento la eliminación de su perfil del directorio, sin necesidad de
        justificación, escribiendo a [EMAIL DE CONTACTO].</li>
      </ul>

      <p>Estos perfiles se muestran en la Web con la indicación "No verificada" hasta que la propia Organización
      se registre y confirme sus datos.</p>

      <h3>3. Finalidades del tratamiento y base jurídica</h3>

      <p><b>Candidatos:</b> gestión de la cuenta y el perfil (ejecución del contrato, art. 6.1.b); generación de
      contenido asistido por IA a partir del CV, como autocompletado de perfil y cartas de presentación
      (ejecución del contrato y consentimiento del Usuario al activar la función, art. 6.1.a y 6.1.b); gestión de
      candidaturas a ofertas de empleo y comunicación de los datos del Candidato a la Organización correspondiente
      (ejecución del contrato, art. 6.1.b); envío de alertas de empleo (consentimiento, art. 6.1.a).</p>

      <p><b>Organizaciones:</b> gestión de la cuenta, publicación de ofertas y gestión del tablero de candidaturas,
      incluyendo funcionalidades de IA (resumen y clasificación de candidaturas, mensajes de rechazo) (ejecución
      del contrato, art. 6.1.b).</p>

      <p><b>Todos los Usuarios:</b> mejora y seguridad de la Web (interés legítimo, art. 6.1.f); cumplimiento de
      obligaciones legales aplicables (art. 6.1.c); en su caso, facturación y gestión de pagos (ejecución del
      contrato y obligaciones legales, art. 6.1.b y 6.1.c).</p>

      <h3>4. Encargados del tratamiento y comunicaciones de datos</h3>

      <p>Para la prestación del servicio, GovTalent recurre a los siguientes proveedores, que actúan como
      encargados del tratamiento bajo instrucciones de GovTalent:</p>

      <ul>
        <li><b>Supabase</b> (base de datos y autenticación), con alojamiento de los datos en la Unión Europea.</li>
        <li><b>Vercel Inc.</b> (alojamiento de la aplicación web).</li>
        <li><b>Anthropic</b> (procesamiento de las funcionalidades de inteligencia artificial descritas en el
        apartado 1; recibe los datos estrictamente necesarios para generar el contenido solicitado por el
        Usuario, como el contenido de un CV o los datos de una candidatura).</li>
        <li><b>[PROVEEDOR DE EMAILING]</b> (envío de comunicaciones transaccionales: confirmaciones, alertas y
        notificaciones).</li>
        <li><b>Google LLC</b> (inicio de sesión mediante Google, cuando el Usuario elige esta opción).</li>
        <li><b>[PASARELA DE PAGO — p. ej. Stripe]</b> (cuando esté activo el cobro de servicios de pago;
        procesamiento de los datos de facturación y pago).</li>
      </ul>

      <p>Cuando alguno de estos proveedores esté ubicado fuera del Espacio Económico Europeo (como es el caso de
      Anthropic, Vercel o Google, compañías con sede en Estados Unidos), GovTalent se asegura de que dicha
      transferencia internacional cuenta con las garantías exigidas por el RGPD (cláusulas contractuales tipo
      aprobadas por la Comisión Europea y/o adhesión al Data Privacy Framework UE-EEUU, según corresponda a cada
      proveedor).</p>

      <p>Asimismo, los datos de un Candidato que aplica a una oferta se comunican a la Organización
      correspondiente, con la finalidad de que esta pueda gestionar el proceso de selección.</p>

      <h3>5. Plazo de conservación</h3>

      <p>Los datos se conservarán mientras la cuenta del Usuario permanezca activa y, tras su baja, durante el
      plazo necesario para atender posibles responsabilidades legales derivadas del tratamiento. Los Datos de
      Organización No Verificada se conservarán hasta que la Organización reclame su perfil o solicite su
      eliminación conforme al apartado 2.</p>

      <h3>6. Derechos de los Usuarios</h3>

      <p>El Usuario puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y
      portabilidad (arts. 15 a 22 RGPD) dirigiéndose a [EMAIL DE CONTACTO]. Si considera que el tratamiento de sus
      datos vulnera la normativa aplicable, puede presentar una reclamación ante la Agencia Española de Protección
      de Datos (www.aepd.es).</p>
    </LegalPageShell>
  );
}

const tdLabel = { padding: '6px 10px', fontWeight: 700, border: '.5px solid #e0dfd8', background: '#faf9f5', width: '30%' };
const tdVal = { padding: '6px 10px', border: '.5px solid #e0dfd8' };
