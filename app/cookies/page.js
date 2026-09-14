import LegalPageShell from '@/components/LegalPageShell';

export const metadata = {
  title: 'Política de cookies · GovTalent',
  description: 'Cookies y tecnologías similares utilizadas en GovTalent, su finalidad y cómo gestionarlas.',
};

export default function CookiesPage() {
  return (
    <LegalPageShell title="Política de cookies">
      <h3>1. Responsable</h3>
      <p>El sitio web https://govtalent.app utiliza cookies y tecnologías similares bajo la responsabilidad de
      GovTalent.</p>
      <p>La información identificativa y de contacto del responsable se encuentra en el{' '}
      <a href="/legal">Aviso Legal</a> y en la <a href="/privacidad">Política de Privacidad</a>.</p>
      <p>Para cualquier consulta puede escribir a{' '}
      <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>.</p>

      <h3>2. ¿Qué son las cookies?</h3>
      <p>Las cookies son pequeños archivos que se almacenan en el dispositivo del Usuario al visitar determinadas
      páginas web.</p>
      <p>Permiten recordar información sobre la navegación, mantener una sesión iniciada, aplicar preferencias,
      reforzar la seguridad o conocer cómo se utiliza una página web.</p>
      <p>También existen tecnologías con finalidades similares, como el almacenamiento local del navegador,
      píxeles, etiquetas e identificadores. Las referencias a cookies contenidas en esta política incluyen estas
      tecnologías cuando resulte aplicable.</p>

      <h3>3. Cookies utilizadas por GovTalent</h3>
      <p>GovTalent utiliza actualmente cookies y tecnologías técnicas necesarias para el funcionamiento, seguridad
      y prestación de los servicios de la Plataforma.</p>
      <p>Estas tecnologías permiten:</p>
      <ul>
        <li>Mantener iniciada la sesión.</li>
        <li>Autenticar a los Usuarios registrados.</li>
        <li>Recordar determinadas preferencias técnicas.</li>
        <li>Proteger las cuentas.</li>
        <li>Prevenir accesos y operaciones fraudulentas.</li>
        <li>Mantener la estabilidad del servicio.</li>
        <li>Gestionar el proceso de contratación y pago.</li>
        <li>Recordar las preferencias de privacidad.</li>
      </ul>
      <p>Estas cookies no se utilizan para crear perfiles publicitarios ni realizar seguimiento comercial.</p>

      <h3>4. Categorías de cookies</h3>

      <h4 style={sub}>4.1. Cookies técnicas y necesarias</h4>
      <p>Son imprescindibles para que la Plataforma funcione correctamente o para prestar un servicio solicitado
      por el Usuario.</p>
      <p>Pueden utilizarse para:</p>
      <ul>
        <li>Gestionar el registro y acceso.</li>
        <li>Mantener la sesión iniciada.</li>
        <li>Aplicar medidas de seguridad.</li>
        <li>Recordar preferencias de privacidad.</li>
        <li>Gestionar el funcionamiento técnico.</li>
        <li>Procesar pagos y prevenir operaciones fraudulentas.</li>
      </ul>
      <p>Estas cookies no requieren consentimiento previo cuando se utilizan exclusivamente para prestar el
      servicio solicitado o permitir el funcionamiento técnico de la Plataforma.</p>
      <p>Su bloqueo puede impedir el acceso a la cuenta o afectar al funcionamiento de algunas funcionalidades.</p>

      <h4 style={sub}>4.2. Cookies de personalización</h4>
      <p>Permiten recordar preferencias como el idioma, la configuración de la interfaz o ciertas opciones de
      visualización.</p>
      <p>Cuando sean necesarias para prestar una funcionalidad solicitada, podrán utilizarse sin consentimiento
      adicional. Si se emplean para otras finalidades, se solicitará previamente el consentimiento.</p>

      <h4 style={sub}>4.3. Cookies analíticas</h4>
      <p>Permiten conocer cómo interactúan los visitantes con una página web y obtener estadísticas de uso.</p>
      <p>GovTalent no utiliza actualmente Google Analytics ni otras cookies analíticas.</p>
      <p>GovTalent puede utilizar Google Search Console para conocer el rendimiento agregado de las páginas
      públicas en los resultados de búsqueda. Search Console y la indexación de páginas por Google no implican por
      sí mismas la instalación de cookies analíticas por parte de GovTalent.</p>
      <p>Si en el futuro se incorporan herramientas analíticas basadas en cookies o identificadores, permanecerán
      bloqueadas hasta que el Usuario preste su consentimiento.</p>

      <h4 style={sub}>4.4. Cookies publicitarias</h4>
      <p>Permiten analizar hábitos de navegación y mostrar publicidad personalizada.</p>
      <p>GovTalent no utiliza actualmente cookies publicitarias ni píxeles de seguimiento con fines
      comerciales.</p>
      <p>Si se incorporan en el futuro, se actualizará esta política y se solicitará previamente el
      consentimiento.</p>

      <h3>5. Cookies propias y de terceros</h3>
      <p>Las cookies pueden ser:</p>
      <ul>
        <li><b>Propias:</b> gestionadas desde el dominio o la infraestructura de GovTalent.</li>
        <li><b>De terceros:</b> gestionadas por proveedores externos.</li>
      </ul>

      <h4 style={sub}>Supabase</h4>
      <p>GovTalent utiliza Supabase para autenticación, gestión de cuentas, almacenamiento y funcionamiento de la
      base de datos.</p>
      <p>Supabase puede utilizar cookies, almacenamiento local u otros identificadores necesarios para autenticar
      al Usuario y mantener su sesión.</p>
      <p>Más información en la{' '}
      <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" style={aLink}>Política de
      Privacidad de Supabase</a>.</p>

      <h4 style={sub}>Vercel</h4>
      <p>La Plataforma se aloja y distribuye mediante infraestructura de Vercel.</p>
      <p>Vercel puede utilizar mecanismos técnicos relacionados con la seguridad, distribución del tráfico y
      funcionamiento de la aplicación.</p>
      <p>Más información en la{' '}
      <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={aLink}>Política
      de Privacidad de Vercel</a>.</p>

      <h4 style={sub}>Stripe</h4>
      <p>GovTalent utiliza Stripe para gestionar pagos y suscripciones.</p>
      <p>Durante el pago, Stripe puede utilizar cookies o tecnologías necesarias para procesar la operación,
      prevenir el fraude, autenticar el pago y mantener la seguridad.</p>
      <p>Cuando el pago se complete en una página gestionada por Stripe, las cookies instaladas en ella serán
      responsabilidad de Stripe.</p>
      <p>Más información en la{' '}
      <a href="https://stripe.com/es/privacy" target="_blank" rel="noopener noreferrer" style={aLink}>Política de
      Privacidad de Stripe</a>.</p>

      <h4 style={sub}>Google</h4>
      <p>Las páginas públicas pueden ser indexadas por Google y GovTalent puede utilizar Google Search Console para
      conocer su rendimiento agregado.</p>
      <p>GovTalent también puede ofrecer el inicio de sesión mediante Google. Si el Usuario elige esta opción,
      Google podrá utilizar tecnologías necesarias para autenticarlo.</p>
      <p>El uso de Gmail para gestionar comunicaciones no implica la instalación de cookies de Google en la
      Plataforma.</p>
      <p>Más información en la{' '}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={aLink}>Política
      de Privacidad de Google</a>.</p>

      <h3>6. Inventario de cookies y tecnologías</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Cookie o tecnología</th>
              <th style={th}>Proveedor</th>
              <th style={th}>Finalidad</th>
              <th style={th}>Duración orientativa</th>
              <th style={th}>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {inventario.map((fila) => (
              <tr key={fila[0]}>
                {fila.map((celda, i) => <td key={i} style={tdVal}>{celda}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Los nombres y duraciones exactos pueden variar según la configuración técnica y las actualizaciones
      realizadas por los proveedores.</p>

      <h3>7. Base jurídica</h3>
      <p>Las cookies técnicas y estrictamente necesarias se utilizan para prestar los servicios solicitados y
      permitir el funcionamiento seguro de la Plataforma.</p>
      <p>Las cookies analíticas, publicitarias o de personalización no necesarias, si se incorporan en el futuro,
      se utilizarán únicamente con el consentimiento previo del Usuario.</p>
      <p>El consentimiento podrá retirarse en cualquier momento con la misma facilidad con la que fue otorgado.</p>

      <h3>8. Transferencias internacionales</h3>
      <p>Algunos proveedores pueden tratar información desde países situados fuera del Espacio Económico
      Europeo.</p>
      <p>Cuando se produzcan transferencias internacionales, se aplicarán las garantías previstas en la normativa
      de protección de datos, como decisiones de adecuación, adhesión al Marco de Privacidad de Datos UE-EE. UU.,
      cláusulas contractuales tipo u otros mecanismos reconocidos.</p>
      <p>Puede consultarse más información en la <a href="/privacidad">Política de Privacidad</a>.</p>

      <h3>9. Gestión desde el navegador</h3>
      <p>El Usuario puede permitir, bloquear o eliminar las cookies desde la configuración de su navegador.</p>
      <p>La desactivación de cookies técnicas puede impedir el acceso a la cuenta o afectar al funcionamiento de la
      Plataforma.</p>
      <p>Instrucciones de los principales navegadores:</p>
      <ul>
        <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" style={aLink}>Google Chrome</a></li>
        <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer" style={aLink}>Apple Safari</a></li>
        <li><a href="https://support.mozilla.org/es/kb/Borrar%20cookies" target="_blank" rel="noopener noreferrer" style={aLink}>Mozilla Firefox</a></li>
        <li><a href="https://support.microsoft.com/es-es/microsoft-edge/eliminar-las-cookies-en-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer" style={aLink}>Microsoft Edge</a></li>
      </ul>

      <h3>10. Incorporación futura de cookies no necesarias</h3>
      <p>Si GovTalent incorpora cookies analíticas, publicitarias o cualquier tecnología que requiera
      consentimiento:</p>
      <ul>
        <li>Se bloquearán antes de obtenerlo.</li>
        <li>Se mostrará un aviso al acceder a la Plataforma.</li>
        <li>Se ofrecerán opciones para aceptar, rechazar o configurar.</li>
        <li>Aceptar y rechazar tendrán una importancia visual equivalente.</li>
        <li>Las categorías opcionales estarán desactivadas por defecto.</li>
        <li>El Usuario podrá modificar posteriormente su decisión.</li>
        <li>Se actualizarán esta política y el inventario de cookies.</li>
      </ul>
      <p>La ausencia de una acción o la mera continuación de la navegación no se considerarán consentimiento.</p>

      <h3>11. Modificaciones</h3>
      <p>GovTalent podrá actualizar esta Política de Cookies cuando cambien las tecnologías utilizadas, sus
      proveedores o la normativa aplicable.</p>
      <p>Cuando una modificación requiera un nuevo consentimiento, se solicitará antes de activar las
      correspondientes cookies.</p>

      <p style={updated}>Última actualización: septiembre de 2026.</p>
    </LegalPageShell>
  );
}

const inventario = [
  ['Token de autenticación', 'GovTalent / Supabase', 'Identificar al Usuario y mantener su sesión', 'Sesión o según configuración', 'Técnica'],
  ['Cookie de sesión', 'GovTalent', 'Mantener la sesión y el área privada', 'Sesión o según configuración', 'Técnica'],
  ['Preferencia de privacidad', 'GovTalent', 'Recordar la configuración elegida', 'Hasta 24 meses', 'Técnica'],
  ['Cookies de seguridad y pago', 'Stripe', 'Procesar pagos y prevenir el fraude', 'Según Stripe', 'Técnica'],
  ['Almacenamiento local de autenticación', 'GovTalent / Supabase', 'Mantener la autenticación', 'Según configuración', 'Técnica'],
];

const aLink = { color: '#1d6f5c' };
const sub = { fontSize: 14, fontWeight: 700, margin: '18px 0 6px' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', margin: '16px 0', fontSize: 13, minWidth: 560 };
const th = { padding: '6px 10px', fontWeight: 700, border: '.5px solid #e0dfd8', background: '#faf9f5', textAlign: 'left' };
const tdVal = { padding: '6px 10px', border: '.5px solid #e0dfd8' };
const updated = { marginTop: 24, fontSize: 12, color: '#999' };
