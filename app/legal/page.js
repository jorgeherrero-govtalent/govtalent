import LegalPageShell from '@/components/LegalPageShell';

export const metadata = { title: 'Aviso legal · GovTalent' };

export default function LegalPage() {
  return (
    <LegalPageShell title="Aviso legal">
      <p style={{ fontSize: 12, background: '#f8f7f2', border: '.5px solid #e0dfd8', borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <b>Plantilla pendiente de completar con los datos reales del titular.</b> Los campos entre corchetes
        deben sustituirse antes de la apertura de registro público de la plataforma.
      </p>

      <p><b>Titular:</b> [RAZÓN SOCIAL / NOMBRE Y APELLIDOS]<br/>
      <b>Domicilio social:</b> [DOMICILIO FISCAL COMPLETO]<br/>
      <b>NIF/CIF:</b> [NIF O CIF]<br/>
      <b>Inscripción:</b> [Registro Mercantil de [CIUDAD], Tomo [X], Folio [X], Hoja [X] — solo si es Sociedad Limitada; si es autónomo, indicar de alta en el Censo de Empresarios, Profesionales y Retenedores]<br/>
      <b>Contacto:</b> [EMAIL DE CONTACTO] | [TELÉFONO DE CONTACTO]</p>

      <p>En adelante, "<b>GovTalent</b>".</p>

      <h3>1. Objeto</h3>
      <p>GovTalent es titular del sitio web https://govtalent.app (en adelante, la "<b>Web</b>"). Las presentes
      condiciones generales de uso de la Web regulan el uso de, incluyendo el mero acceso a, las páginas web
      integrantes de la Web (en adelante, las "<b>Condiciones Generales</b>").</p>

      <p>La utilización de la Web otorga la condición de usuario (en adelante, el/los "<b>Usuario/s</b>"). El acceso,
      navegación y utilización de la Web implica la aceptación tácita y sin reservas de todas las estipulaciones
      de las presentes Condiciones Generales. Si el Usuario no está de acuerdo con las condiciones expuestas, no
      debe acceder, navegar ni utilizar la Web.</p>

      <p>Los servicios contratados a través de la Web quedan además regulados por las Condiciones Generales del
      Servicio, que en caso de conflicto prevalecerán sobre las presentes Condiciones Generales en lo relativo a
      dicha contratación.</p>

      <h3>2. Uso de la Web</h3>
      <p>La finalidad de la Web es conectar a profesionales del sector de los asuntos públicos, la política y el
      gobierno (en adelante, los "<b>Candidatos</b>") con empresas, consultoras, instituciones y demás entidades
      del sector (en adelante, las "<b>Organizaciones</b>"), a través de perfiles profesionales, un directorio de
      Organizaciones, publicación de ofertas de empleo y herramientas de gestión de candidaturas asistidas por
      inteligencia artificial.</p>

      <p>GovTalent se reserva el derecho de modificar, en cualquier momento y sin aviso previo, la presentación y
      configuración de los contenidos, servicios y funcionalidades ofrecidos desde la Web, así como de
      interrumpir, desactivar o cancelar cualquiera de ellos.</p>

      <p>El Usuario se compromete a utilizar la Web sin infringir la legislación vigente, la buena fe y el orden
      público, y a proporcionar datos reales y veraces, sin suplantar la identidad de terceros.</p>

      <h3>3. Contenidos e inteligencia artificial</h3>
      <p>Los contenidos de la Web proceden tanto de fuentes propias como de los propios Usuarios (Candidatos y
      Organizaciones) y, en el caso del directorio de Organizaciones, de fuentes públicas y de terceros
      proveedores de datos empresariales.</p>

      <p>Determinadas funcionalidades de la Web (autocompletar perfil a partir de un currículum, generación de
      descripciones de oferta, cartas de presentación, resúmenes y clasificación de candidaturas, entre otras)
      utilizan modelos de inteligencia artificial de terceros proveedores para generar contenido de forma
      automatizada a partir de la información facilitada por el Usuario. GovTalent no garantiza la exactitud,
      exhaustividad o idoneidad del contenido generado por IA, que debe revisarse antes de su uso. El Usuario es
      responsable de la decisión final de utilizar, editar o publicar dicho contenido.</p>

      <p>Los perfiles de Organizaciones incluidos en el directorio con la indicación "No verificada" han sido
      incorporados por GovTalent a partir de fuentes públicas o de terceros proveedores de datos, sin que la
      Organización en cuestión se haya registrado todavía en la Web. Más información sobre el tratamiento de
      estos datos en la <a href="/privacidad">Política de Privacidad</a>.</p>

      <h3>4. Derechos de propiedad intelectual e industrial</h3>
      <p>Todos los activos intangibles incluidos o relacionados con la Web (textos, elementos gráficos, diseño,
      marca "GovTalent" y software en sus versiones de código fuente y objeto) son titularidad de GovTalent o de
      terceros y están protegidos por la normativa de propiedad intelectual e industrial. Queda prohibido
      cualquier uso comercial, reproducción, distribución o reutilización de dichos contenidos sin autorización
      expresa, salvo en los casos legalmente permitidos.</p>

      <p>El uso de los nombres y logotipos de las Organizaciones en la Web se realiza de conformidad con las
      prácticas leales en materia industrial y comercial, únicamente para identificarlas dentro del directorio y
      las ofertas de empleo.</p>

      <h3>5. Hiperenlaces y sitios enlazados</h3>
      <p>Cualquier persona física o jurídica que desee establecer un hiperenlace hacia la Web deberá contar con
      autorización previa y por escrito de GovTalent. La Web puede incluir enlaces a sitios de terceros (por
      ejemplo, webs o perfiles de LinkedIn de Organizaciones); GovTalent no controla ni asume responsabilidad
      alguna sobre el contenido de dichos sitios enlazados.</p>

      <h3>6. Responsabilidad</h3>
      <p>GovTalent realiza sus mejores esfuerzos para garantizar la disponibilidad de la Web, sin poder garantizar
      la ausencia de interrupciones o errores. GovTalent no responde por las decisiones de contratación adoptadas
      por las Organizaciones ni por la veracidad de la información publicada por los propios Usuarios.</p>

      <h3>7. Ley aplicable y jurisdicción</h3>
      <p>Las presentes Condiciones Generales se rigen por la ley española. Salvo que la normativa de consumidores
      y usuarios disponga otra cosa, cualquier conflicto se someterá a los juzgados y tribunales de
      [CIUDAD] (España).</p>

      <p style={{ marginTop: 24, fontSize: 12, color: '#999' }}>
        Copyright [AÑO] [RAZÓN SOCIAL]. Todos los derechos reservados.
      </p>
    </LegalPageShell>
  );
}
