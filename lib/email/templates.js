import { horquillaPorUsuarios, CREDITOS_POR_ALARMA, miles } from '@/lib/precios';
import { PARLAMENTOS } from '@/lib/parlamentosAutonomicos';
import { claseDe, CLASE_TEXTO } from '@/lib/ccaa/plazos';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

/**
 * La estructura común de todos los correos (diseño D1, 14-10-2026).
 *
 * Cabecera blanca con antetítulo morado, título grande y la fecha, y el
 * isotipo en gris muy claro cortado a la derecha. Pie oscuro con el logo
 * en blanco y la letra pequeña. Va todo en tablas y las imágenes en PNG:
 * Gmail y Outlook no pintan SVG ni posicionan con CSS.
 *
 * `titulo` y `antetitulo` los pone cada correo. `fecha` es la de hoy en
 * Madrid salvo que el correo pase otra (el del Consejo, la del Consejo).
 */
function fechaHoy() {
  return new Date().toLocaleDateString('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function mayuscula(t) {
  const x = String(t || '').trim();
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : '';
}

function shell(bodyHtml, { preheader = '', footerExtra = '', titulo = '', antetitulo = '', fecha = '' } = {}) {
  const t = String(titulo || '');
  // Los títulos largos (el nombre de una organización, por ejemplo) bajan
  // de tamaño para no ocupar cuatro renglones.
  const tam = t.length > 28 ? 30 : 38;
  const dia = mayuscula(fecha || fechaHoy());
  return `
<!DOCTYPE html>
<html lang="es">
  <body bgcolor="#f0efe9" style="margin:0;padding:0;background-color:#f0efe9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <span style="display:none;font-size:1px;color:#f0efe9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0efe9" style="background-color:#f0efe9;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="top" style="padding:40px 12px 26px 40px;">
                      ${antetitulo ? `<div style="font-size:12px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:#5a47dc;margin:0 0 14px;">${antetitulo}</div>` : ''}
                      ${t ? `<div style="font-size:${tam}px;line-height:1.08;font-weight:700;letter-spacing:-1.1px;color:#1a1a18;margin:0 0 20px;">${t}</div>` : ''}
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td valign="middle" style="padding-right:7px;"><img src="${SITE_URL}/icono-calendario-email.png" width="16" height="16" alt="" style="display:block;border:0;" /></td>
                          <td valign="middle" style="font-size:14px;color:#6b6862;">${dia}</td>
                        </tr>
                      </table>
                    </td>
                    <td width="136" valign="top" align="right" style="padding:52px 40px 0 0;width:96px;">
                      <img src="${SITE_URL}/govtalent-isotipo-gris-email.png" width="96" height="85" alt="" style="display:block;border:0;outline:none;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 40px 40px;color:#3a3a36;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td bgcolor="#1a1a18" style="background-color:#1a1a18;padding:26px 40px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom:18px;border-bottom:1px solid #3a3a36;">
                      <img src="${SITE_URL}/govtalent-logo-blanco-email.png" width="128" height="22" alt="GovTalent" style="display:block;border:0;outline:none;text-decoration:none;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 0 26px;font-size:11.5px;color:#a8a49c;line-height:1.7;text-align:center;">
                      © ${new Date().getFullYear()} GovTalent<br/>
                      <a href="${SITE_URL}/privacidad" style="color:#c9c6be;">Privacidad</a>&nbsp;&nbsp;&nbsp;
                      <a href="${SITE_URL}/condiciones" style="color:#c9c6be;">Condiciones</a>${footerExtra}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// El color depende de a dónde lleva: verde para lo institucional y de
// empleo, morado cuando apunta a Regulatorio o al seguimiento.
function button(text, url, color = '#1d6f5c') {
  // El color va en la celda (bgcolor) y no solo en el enlace: hay clientes
  // que quitan el fondo de los <a> y dejaban el texto blanco sobre blanco.
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr><td bgcolor="${color}" style="background-color:${color};border-radius:8px;"><a href="${url}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:13.5px;font-weight:500;">${text}</a></td></tr></table>`;
}

// Saludo con o sin nombre: sin él, «Hola,» y no «Hola candidato/a,».
function saludo(firstName) {
  const n = String(firstName || '').trim();
  return `<p style="margin:0 0 14px;font-weight:600;color:#1a1a18;">Hola${n ? `, ${n}` : ''}:</p>`;
}

function lista(items) {
  return `<ul style="margin:0 0 22px;padding-left:20px;">${items
    .map((t, i) => `<li style="margin-bottom:${i === items.length - 1 ? 0 : 7}px;">${t}</li>`)
    .join('')}</ul>`;
}

function notaPie(text) {
  return `<p style="margin-top:22px;font-size:12.5px;color:#8b8780;">${text}</p>`;
}

// Línea del calendario electoral para los correos semanales, mientras
// dure el proceso. `hito` sale de situacionElectoral() en
// lib/calendarioElectoral.js: { titulo, cuando, dias }.
function bloqueElectoral(hito) {
  if (!hito) return '';
  const dias =
    hito.dias > 0
      ? `, faltan ${hito.dias} ${hito.dias === 1 ? 'día' : 'días'} para las elecciones`
      : '';
  return `
    <div style="margin:0 0 26px;padding:13px 16px;background-color:#f0eefe;border-radius:10px;font-size:13px;color:#3c3489;line-height:1.55;">
      <div style="font-size:10.5px;letter-spacing:.4px;margin-bottom:3px;">ELECCIONES GENERALES, 29 DE NOVIEMBRE</div>
      ${hito.titulo} ${hito.cuando}${dias}.
      <a href="${SITE_URL}/novedades" style="color:#6d5aef;text-decoration:none;">Añadir a mi calendario</a>
    </div>`;
}

// Vídeo dentro de un correo. Ningún cliente de correo reproduce vídeo, así
// que va la miniatura enlazada y debajo el enlace «Ver el vídeo». La
// miniatura la sirve YouTube (i.ytimg.com): no hace falta subir imagen.
const VIDEO_QUE_ES = {
  id: '3ZxkLcQZW1E',
  url: 'https://www.youtube.com/watch?v=3ZxkLcQZW1E&t=3s',
  titulo: '¿Qué es GovTalent?',
};

const VIDEO_DIRECTORIO = {
  id: 'Z-Am5pWVtjw',
  url: 'https://www.youtube.com/watch?v=Z-Am5pWVtjw',
  titulo: 'La mayor base de datos del sector público',
};

function bloqueVideo({ id, url, titulo }) {
  const miniatura = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;">
      <tr>
        <td>
          <a href="${url}" style="text-decoration:none;">
            <img src="${miniatura}" width="520" alt="Ver el vídeo: ${titulo}" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:10px;" />
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding-top:10px;font-size:13.5px;">
          <a href="${url}" style="color:#6d5aef;text-decoration:none;font-weight:500;">&#9654;&nbsp; Ver el vídeo: ${titulo}</a>
        </td>
      </tr>
    </table>`;
}

export function welcomeCandidateEmail({ firstName }) {
  const subject = 'Tu cuenta de GovTalent está activa';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Tu cuenta ya está lista en GovTalent, la plataforma que reúne todas las herramientas que necesitas para crecer en el sector de los asuntos públicos.</p>
    ${bloqueVideo(VIDEO_QUE_ES)}
    <p style="margin-bottom:8px;">Desde un único espacio puedes:</p>
    ${lista([
      'Crear alarmas que vigilan por ti todos los boletines oficiales, consultas públicas, el Congreso, el Consejo de Ministros, los parlamentos autonómicos y las instituciones europeas.',
      'Seguir legislación, actividad de instituciones y cargos, con aviso de sus cambios y recordatorios de plazo.',
      'Organizar tu trabajo en proyectos y tareas, solo o con tu equipo.',
    ])}
    ${button('Crear mi primera alarma', `${SITE_URL}/`, '#6d5aef')}
  `,
    { preheader: 'Tu primera alarma, en un minuto', antetitulo: 'Bienvenida', titulo: 'Tu cuenta está activa' }
  );
  return { subject, html };
}

export function welcomeOrganizationEmail({ orgName, firstName }) {
  const subject = `${orgName} ya está en GovTalent`;
  const html = shell(
    `
    ${saludo(firstName)}
    <p><b>${orgName}</b> ya está creada en GovTalent. Dos pasos para dejarla lista:</p>
    ${lista([
      'Completa sus datos legales en Configuración: denominación, CIF y domicilio aparecen en las actas de actividad institucional.',
      'Si vais a trabajar varias personas, la suscripción admite de 2 a 50 usuarios, con alarmas, proyectos y tareas compartidos.',
    ])}
    ${button('Ir a Configuración', `${SITE_URL}/account`, '#6d5aef')}
  `,
    { preheader: `Siguiente paso: completar los datos de ${orgName}`, antetitulo: 'Organización', titulo: `${orgName} ya está en GovTalent` }
  );
  return { subject, html };
}

export function applicationConfirmationEmail({ firstName, jobTitle, orgName }) {
  const subject = `Hemos recibido tu solicitud para ${jobTitle}`;
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Tu candidatura para el puesto de <b>${jobTitle}</b> en <b>${orgName}</b> se ha enviado correctamente.</p>
    <p>Puedes hacer seguimiento del estado de tu solicitud en cualquier momento desde tu cuenta.</p>
    ${button('Ver mis solicitudes', `${SITE_URL}/profile/jobs`)}
  `,
    { preheader: `Tu candidatura a ${jobTitle} se ha enviado correctamente`, antetitulo: 'Empleo', titulo: 'Solicitud enviada' }
  );
  return { subject, html };
}

export function newCandidacyEmail({ jobTitle, candidateName, orgName }) {
  const subject = `Nueva candidatura para ${jobTitle}`;
  const html = shell(
    `
    <p><b>${candidateName}</b> ha aplicado al puesto de <b>${jobTitle}</b> en ${orgName}.</p>
    <p>Puedes revisar el perfil completo, generar un resumen con IA y gestionar la candidatura desde el tablero de candidatos.</p>
    ${button('Ver candidatura', `${SITE_URL}/organizations/admin/candidates`)}
  `,
    { preheader: `${candidateName} ha aplicado a ${jobTitle}`, antetitulo: 'Empleo', titulo: 'Nueva candidatura' }
  );
  return { subject, html };
}

// type: 'claim' (reclamar una página que no administra) o 'verification'
// (verificar una organización que ya administra). Antes compartían texto y
// las verificaciones llegaban como reclamaciones.
export function newClaimRequestEmail({ orgName, requesterName, requesterEmail, type = 'claim' }) {
  const esVerificacion = type === 'verification';
  const subject = esVerificacion
    ? 'Nueva solicitud de verificación de empresa'
    : 'Nueva solicitud de reclamación de empresa';
  const html = shell(
    `
    <p><b>${requesterName}</b> (${requesterEmail}) ha solicitado ${
      esVerificacion ? 'verificar' : 'reclamar'
    } la página de <b>${orgName}</b>, adjuntando un documento acreditativo.</p>
    <p>Revisa el documento y aprueba o rechaza la solicitud desde el backoffice.</p>
    ${button('Ver solicitudes', `${SITE_URL}/backoffice/reclamaciones`)}
  `,
    { preheader: `${orgName}, ${requesterName}`, antetitulo: 'Backoffice', titulo: esVerificacion ? 'Solicitud de verificación' : 'Solicitud de reclamación' }
  );
  return { subject, html };
}

export function claimApprovedEmail({ firstName, orgName }) {
  const n = String(firstName || '').trim();
  const subject = `Verificación completada: ${orgName} ya está activa en GovTalent`;
  const html = shell(
    `
    ${saludo(n)}
    <p>Hemos revisado la documentación y verificado correctamente la información de tu cuenta.</p>
    <p><b>${orgName}</b> ya está activa en GovTalent y puedes empezar a disfrutar de todas las ventajas incluidas en tu plan: completar su página, publicar ofertas de empleo, gestionar candidaturas y acceder a las herramientas disponibles para tu equipo.</p>
    ${button('Ir a Configuración', `${SITE_URL}/account`)}
  `,
    { preheader: `${orgName} ya está activa en GovTalent`, antetitulo: 'Organización', titulo: 'Verificación completada' }
  );
  return { subject, html };
}

export function claimRejectedEmail({ firstName, orgName, orgSlug, reason, type = 'claim' }) {
  const esVerificacion = type === 'verification';
  const subject = esVerificacion
    ? `No hemos podido verificar ${orgName}`
    : `No hemos podido aprobar tu solicitud para ${orgName}`;
  const cuerpo = esVerificacion
    ? `<p>Hemos revisado la documentación enviada y no nos permite verificar <b>${orgName}</b>.</p>
    ${reason ? `<p><b>Motivo:</b> ${reason}</p>` : ''}
    <p>Puedes enviar una nueva solicitud con otro documento desde el panel de la organización. Si crees que se trata de un error, responde a este correo.</p>
    ${button('Ir a Configuración', `${SITE_URL}/account`)}`
    : `<p>Hemos revisado la documentación enviada y no nos permite aprobar tu solicitud para administrar la página de <b>${orgName}</b>.</p>
    ${reason ? `<p><b>Motivo:</b> ${reason}</p>` : ''}
    <p>Puedes enviar una nueva solicitud con otro documento desde la página de la organización. Si crees que se trata de un error, responde a este correo.</p>
    ${button('Ver la página de la organización', orgSlug ? `${SITE_URL}/organizations/${orgSlug}` : `${SITE_URL}/organizations`)}`;
  const html = shell(`${saludo(firstName)}${cuerpo}`, {
    preheader: 'Revisa el motivo y envía una nueva solicitud',
    antetitulo: 'Organización',
    titulo: esVerificacion ? 'No hemos podido verificarla' : 'Solicitud no aprobada',
  });
  return { subject, html };
}

export function jobAlertEmail({ firstName, jobTitle, orgName, location, modality, reason, jobUrl, unsubscribeUrl }) {
  const MODALITY_LABELS = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };
  const subject = `Nueva oferta: ${jobTitle} en ${orgName}`;
  const html = shell(
    `
    ${saludo(firstName)}
    <p>${reason}</p>
    <div style="margin:18px 0;padding:16px 18px;background-color:#f4f3ee;border-radius:10px;">
      <div style="font-size:15px;font-weight:700;color:#1a1a18;margin-bottom:4px;">${jobTitle}</div>
      <div style="font-size:13px;color:#666;">${[orgName, location, MODALITY_LABELS[modality] || modality].filter(Boolean).join(', ')}</div>
    </div>
    ${button('Ver la oferta', jobUrl)}
  `,
    {
      preheader: `${jobTitle} en ${orgName}`,
      antetitulo: 'Empleo',
      titulo: 'Nueva oferta para ti',
      footerExtra: unsubscribeUrl
        ? `<br/><a href="${unsubscribeUrl}" style="color:#c9c6be;">Darte de baja de esta alerta</a>`
        : '',
    }
  );
  return { subject, html };
}

const ROLE_LABELS = {
  candidate: 'Profesional',
  org_admin: 'Administrador de organización',
  platform_admin: 'Superadministrador',
};

export function accountDeletionRequestEmail({ userName, userEmail, role }) {
  const quien = String(userName || '').trim() || userEmail;
  const subject = `Solicitud de borrado de cuenta: ${quien}`;
  const html = shell(
    `
    <p><b>${quien}</b> (${userEmail}) ha solicitado el borrado de su cuenta desde "Mi cuenta".</p>
    <p>Rol: ${ROLE_LABELS[role] || role}</p>
    <p>Revísalo y procésalo manualmente desde Supabase — este flujo todavía no borra datos automáticamente.</p>
  `,
    { preheader: `Solicitud de borrado de cuenta: ${quien}`, antetitulo: 'Backoffice', titulo: 'Solicitud de borrado' }
  );
  return { subject, html };
}

// Aviso interno de alta nueva. Va al fundador, no al usuario: los datos
// del usuario se escapan porque vienen tal cual de su formulario.
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Etiquetas de users.organizacion_tipo (las mismas que TIPOS_ORGANIZACION
// en components/OnboardingModal.js; aquí se repiten para no importar un
// componente de cliente en una plantilla de servidor).
const TIPO_ORG = {
  consultora: 'Consultora de asuntos públicos',
  empresa: 'Empresa',
  asociacion_sectorial: 'Asociación sectorial',
  despacho: 'Despacho de abogados',
  institucion_publica: 'Institución pública',
  tercer_sector: 'ONG / tercer sector',
};

export function newSignupAdminEmail({ type, firstName, lastName, email, professionalTitle, provider, orgName, orgTipo, createdAt }) {
  const nombre = `${firstName || ''} ${lastName || ''}`.trim();
  const quien = nombre || email;
  const esOrg = type === 'organization';
  const subject = esOrg ? `Nueva organización: ${orgName || quien}` : `Nuevo registro: ${quien}`;
  const fecha = createdAt
    ? new Date(createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })
    : null;
  const filas = [
    ['Nombre', nombre || '—'],
    ['Email', email],
    esOrg ? ['Organización', orgName || '—'] : ['Cargo', professionalTitle || '—'],
    !esOrg ? ['Organización', [orgName, TIPO_ORG[orgTipo]].filter(Boolean).join(', ') || '—'] : null,
    ['Acceso', provider === 'google' ? 'Google' : 'Email y contraseña'],
    fecha ? ['Alta', fecha] : null,
  ].filter(Boolean);
  const html = shell(
    `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;font-size:14px;">
      ${filas
        .map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#8b8780;">${k}</td><td style="padding:3px 0;">${esc(v)}</td></tr>`)
        .join('')}
    </table>
    ${button(esOrg ? 'Ver organizaciones' : 'Ver usuarios', `${SITE_URL}/backoffice/${esOrg ? 'organizaciones' : 'usuarios'}`)}
  `,
    { preheader: esc(subject), antetitulo: 'Backoffice', titulo: esOrg ? 'Nueva organización' : 'Nuevo registro' }
  );
  return { subject, html };
}

export function accountDeletionAckEmail({ firstName }) {
  const subject = 'Hemos recibido tu solicitud de borrado de cuenta';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Hemos recibido tu solicitud para eliminar tu cuenta de GovTalent y los datos asociados.</p>
    <p>La tramitaremos en un plazo máximo de un mes y te confirmaremos por correo cuando esté completada.</p>
    ${notaPie('Si no has sido tú o quieres anular la solicitud, responde a este correo.')}
  `,
    { preheader: 'La tramitaremos en un plazo máximo de un mes', antetitulo: 'Tu cuenta', titulo: 'Solicitud de borrado recibida' }
  );
  return { subject, html };
}

/**
 * Suscripción de Vigilancia activada. Se envía una vez, al completar el
 * checkout. `usuarios` > 1 añade cómo dar de alta al equipo, que por ahora
 * se hace a mano. `foundingMember` queda por las suscripciones antiguas.
 */
export function proActivatedEmail({ firstName, foundingMember = false, usuarios = 1 }) {
  const h = horquillaPorUsuarios(usuarios);
  const subject = 'Tu suscripción a GovTalent está activa';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Tu suscripción de <b>Vigilancia</b> ya está activa. Desde ahora puedes crear tus alarmas, recibir los avisos al momento y los recordatorios de plazo, y seguir normas, instituciones y personas.</p>
    <p>Tu plan incluye <b>${miles(h.creditos)} créditos al mes</b>${h.usuarios > 1 ? ' para todo el equipo' : ''}. Cada alarma activa usa ${CREDITOS_POR_ALARMA} créditos al mes y el resto queda para el Asistente y las demás funciones de IA.</p>
    ${
      h.usuarios > 1
        ? `<p>Has contratado la horquilla de <b>hasta ${h.usuarios} usuarios</b>. Responde a este correo con las direcciones de las personas de tu equipo y les damos de alta.</p>`
        : ''
    }
    ${
      foundingMember
        ? '<p style="padding:14px 16px;background-color:#f0eefe;border-radius:10px;font-size:13.5px;color:#3C3489;">Tienes el <b>precio fundador</b>. Lo mantienes en cada renovación mientras sigas suscrito sin interrupción.</p>'
        : ''
    }
    ${button('Crear mis alarmas', `${SITE_URL}/alarmas`, '#6d5aef')}
    ${notaPie('Stripe te enviará el recibo por separado. Tus facturas y el método de pago están en Mi cuenta.')}
  `,
    { preheader: 'Ya puedes crear tus alarmas', antetitulo: 'Suscripción', titulo: 'Tu suscripción está activa' }
  );
  return { subject, html };
}

/** Suscripción al Directorio activada. Se envía una vez, tras el checkout. */
export function directorioActivatedEmail({ firstName }) {
  const subject = 'Tu acceso al Directorio de GovTalent está activo';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Tu suscripción al <b>Directorio</b> ya está activa. Desde ahora ves el correo y el teléfono de cargos, unidades, diputados y asesores en sus fichas, y puedes filtrar y exportar la Base de datos.</p>
    ${button('Abrir la Base de datos', `${SITE_URL}/instituciones/directorio`, '#6d5aef')}
    ${notaPie('Stripe te enviará el recibo por separado. Tus facturas y el método de pago están en Mi cuenta.')}
  `,
    { preheader: 'Ya tienes los contactos del Directorio', antetitulo: 'Directorio', titulo: 'Tu acceso está activo' }
  );
  return { subject, html };
}

/**
 * Presentación del Directorio. Sale una vez, 2 días después del registro
 * (el de bienvenida sale al terminar el onboarding), y solo a quien no
 * tiene acceso al Directorio. Lo envía app/api/cron/directorio-promo.
 */
export function directorioPromoEmail({ firstName }) {
  const subject = 'Hemos construido la mayor base de datos del sector público';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Hemos construido la mayor base de datos del sector público: más de 27.000 cargos y asesores con su contacto, en la AGE, el Congreso, la Unión Europea, las comunidades autónomas, los ayuntamientos, las patronales, los organismos independientes y el cuerpo diplomático.</p>
    ${bloqueVideo(VIDEO_DIRECTORIO)}
    <p style="margin-bottom:8px;">Y la hemos pensado para que sea fácil de usar:</p>
    ${lista([
      '<b>Búsquedas inteligentes:</b> escribe lo que necesitas, por ejemplo «directores generales de Sanidad» o «asesores de la Comisión de Hacienda», y te da los resultados con su contacto.',
      '<b>Tus propias listas:</b> guarda los contactos que te interesan, organízalos y expórtalos.',
      '<b>Cualquier contacto:</b> si alguien no está en la base de datos, lo buscamos por ti con un solo clic.',
    ])}
    ${button('Ver el Directorio', `${SITE_URL}/contactos`, '#6d5aef')}
  `,
    { preheader: 'Más de 27.000 cargos y asesores con su contacto', antetitulo: 'Directorio', titulo: 'La mayor base de datos del sector público' }
  );
  return { subject, html };
}

/**
 * Plan de organización activado: planKey 'recruiter' | 'teams'.
 * Recruiter tiene correo propio: es un plan de empleo, sin las
 * herramientas de Pro, y el mensaje tiene que dejarlo claro.
 */
export function orgPlanActivatedEmail({ firstName, orgName, planKey }) {
  if (planKey !== 'teams') return recruiterActivatedEmail({ firstName, orgName });
  const subject = `${orgName} ya tiene el plan Teams`;
  const html = shell(
    `
    ${saludo(firstName)}
    <p><b>${orgName}</b> ya tiene activo el plan <b>Teams</b>: hasta 4 usuarios con todo lo incluido en Recruiter y Pro, proyectos compartidos, exportación de datos y roles de equipo.</p>
    <p>Para añadir a los miembros de tu equipo, responde a este correo con sus direcciones y los damos de alta.</p>
    ${button('Ir a Configuración', `${SITE_URL}/account`)}
    ${notaPie('Stripe te enviará el recibo por separado. Las facturas están en la pestaña Plan del panel.')}
  `,
    { preheader: 'El plan Teams está activo', antetitulo: 'Suscripción', titulo: 'Plan Teams activo' }
  );
  return { subject, html };
}

export function recruiterActivatedEmail({ firstName, orgName }) {
  const subject = `${orgName} ya tiene el plan Recruiter`;
  const html = shell(
    `
    ${saludo(firstName)}
    <p>El plan <b>Recruiter</b> de <b>${orgName}</b> ya está activo. Desde el panel de tu organización podrás:</p>
    ${lista([
      'Publicar todas las ofertas de empleo que necesites, sin el límite de una oferta activa.',
      'Redactar las descripciones de las ofertas con ayuda de la IA.',
      'Ver qué candidatos encajan mejor con cada oferta.',
      'Revisar cada candidatura con un resumen generado por IA y gestionarla desde el ATS integrado.',
    ])}
    ${button('Publicar una oferta', `${SITE_URL}/organizations/admin/jobs`)}
    ${notaPie('Stripe te enviará el recibo por separado. Las facturas están en la pestaña Plan del panel.')}
  `,
    { preheader: 'Publica ofertas sin límite y gestiona candidaturas con IA', antetitulo: 'Suscripción', titulo: 'Plan Recruiter activo' }
  );
  return { subject, html };
}

/**
 * Recordatorio de activación (06-10-2026): llega entre 3 y 7 días después
 * del registro, una sola vez, a quien todavía no ha creado ninguna alarma.
 * Lo envía app/api/cron/profile-reminder.
 */
export function primeraAlarmaEmail({ firstName }) {
  const subject = 'Crea tu primera alarma en GovTalent';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Todavía no has creado ninguna alarma. Es lo que hace que GovTalent trabaje por ti: describe en una frase qué te interesa, por ejemplo «normativa de vivienda en Cataluña» o «movilidad eléctrica», y te avisamos cuando se publique algo que te afecta.</p>
    <p>Te lleva un minuto y puedes afinarla cuando quieras.</p>
    ${button('Crear mi primera alarma', `${SITE_URL}/`, '#6d5aef')}
  `,
    { preheader: 'Describe qué te interesa y te avisamos', antetitulo: 'Alarmas', titulo: 'Crea tu primera alarma' }
  );
  return { subject, html };
}

/**
 * Recordatorio antiguo de completar el perfil. Ya no se envía (Mi perfil
 * está escondido): el cron manda primeraAlarmaEmail. Se conserva para
 * cuando vuelva Empleo.
 */
export function completeProfileEmail({ firstName }) {
  const subject = 'Completa tu perfil profesional en GovTalent';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Tu perfil profesional en GovTalent todavía está incompleto. Completarlo te llevará unos minutos y te permitirá:</p>
    ${lista([
      'Solicitar ofertas de empleo con tu perfil y tu CV ya preparados.',
      'Mejorar tu encaje con las ofertas que publican las organizaciones del sector.',
      'Consultar tu Radiografía Profesional y ver cómo se sitúa tu perfil en el sector de los asuntos públicos.',
    ])}
    <p>Si tienes tu CV a mano, súbelo y la IA completará por ti tu experiencia y tu formación.</p>
    ${button('Completar mi perfil', `${SITE_URL}/profile`)}
  `,
    { preheader: 'Unos minutos para tener tu perfil listo', antetitulo: 'Tu perfil', titulo: 'Completa tu perfil' }
  );
  return { subject, html };
}

/**
 * Resumen semanal de lo que sigue el usuario.
 *
 * Va los lunes: llegas y sabes qué se mueve esa semana. Solo lleva lo que
 * la persona sigue, no un boletín general — si mandas lo mismo a todo el
 * mundo es una circular, no una alerta.
 *
 * Los plazos van primero y con su contador: es lo único accionable, y lo
 * que decide si merece la pena abrir el correo.
 */
/**
 * Recorta un texto por la última palabra que quepa.
 *
 * Los títulos oficiales son larguísimos —una orden ministerial puede
 * ocupar cuatro renglones— y con seis de ellos seguidos el correo se
 * convierte en un scroll sin fin que nadie lee entero. Se corta por
 * espacio y no a mitad de palabra, y solo se añaden puntos suspensivos
 * si de verdad se ha quitado algo.
 */
function acortar(texto, max = 95) {
  const t = String(texto || '').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const ultimoEspacio = corte.lastIndexOf(' ');
  return `${(ultimoEspacio > max * 0.6 ? corte.slice(0, ultimoEspacio) : corte).replace(/[,;:.\s]+$/, '')}…`;
}

export function weeklyDigestEmail({
  firstName,
  novedades = [],
  plazos = [],
  publicado = [],
  estaSemana = [],
  totalSeguidos = 0,
  sinTemas = false,
  unsubscribeUrl,
  hitoElectoral = null,
}) {
  const n = novedades.length;
  const p = plazos.length;
  const b = publicado.length;
  const s = estaSemana.length;

  // El asunto dice lo más urgente: un plazo que vence pesa más que un
  // cambio de fase.
  // Lo que vence esta semana manda sobre todo lo demás: es lo único del
  // correo sobre lo que todavía se puede hacer algo.
  const subject =
    s > 0
      ? `${s} ${s === 1 ? 'asunto cierra' : 'asuntos cierran'} esta semana`
      : p > 0
        ? `${p} ${p === 1 ? 'plazo se acerca' : 'plazos se acercan'} en lo que sigues`
        : b > 0
          ? // Sin temas elegidos el bloque es el BOE general: decir «en tu
            // sector» sería falso.
            sinTemas
            ? `${b} ${b === 1 ? 'norma publicada' : 'normas publicadas'} en el BOE esta semana`
            : `${b} ${b === 1 ? 'norma publicada' : 'normas publicadas'} en tu sector`
          : `${n} ${n === 1 ? 'novedad' : 'novedades'} en lo que sigues`;

  // El subtítulo dice lo que este correo trae de verdad. Antes anunciaba
  // siempre seguimiento, y a quien no sigue nada le decía "los 0 asuntos
  // que sigues" — que además de raro, no era lo que iba dentro.
  const entradilla =
    s > 0
      ? 'Lo que cierra en los próximos siete días, y lo que se ha movido desde el lunes pasado.'
      : p > 0 || n > 0
        ? `Esto se ha movido en los ${totalSeguidos} ${totalSeguidos === 1 ? 'asunto que sigues' : 'asuntos que sigues'}.`
        : sinTemas
          ? 'Lo que se ha publicado esta semana en el BOE.'
          : 'Lo que se ha publicado esta semana en tu sector.';

  /** Lista con contador de días a la izquierda. La usan los dos bloques de plazos. */
  const listaConDias = (items) =>
    items
      .map(
        (x, i) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${i === items.length - 1 ? 26 : 18}px;">
        <tr>
          <td width="44" valign="top" style="padding-right:16px;">
            <div style="font-size:24px;font-weight:500;color:#1d6f5c;line-height:1;letter-spacing:-.5px;">${x.dias}</div>
            <div style="font-size:11px;color:#b8b4ac;margin-top:2px;">${x.dias === 1 ? 'día' : 'días'}</div>
          </td>
          <td valign="top" style="padding-bottom:${i === items.length - 1 ? 26 : 18}px;border-bottom:1px solid #f2f0ec;">
            <a href="${SITE_URL}${x.ruta}" style="font-size:14.5px;color:#1a1a18;text-decoration:none;line-height:1.45;letter-spacing:-.1px;">${acortar(x.title)}</a>
            ${x.fuente ? `<div style="font-size:12px;color:#b8b4ac;margin-top:5px;">${acortar(x.fuente, 60)}</div>` : ''}
          </td>
        </tr>
      </table>`
      )
      .join('');

  // Lo que cierra en los próximos siete días. Va primero porque es lo
  // único sobre lo que todavía se puede actuar.
  const bloqueEstaSemana =
    s === 0
      ? ''
      : `
      <div style="font-size:11px;color:#a8a49c;letter-spacing:.4px;margin-bottom:16px;">CIERRA ESTA SEMANA</div>
      ${listaConDias(estaSemana)}`;

  // Los plazos que quedan más lejos de siete días. Se llama "más
  // adelante" y no "plazos" porque arriba ya hay otro bloque de plazos, y
  // dos rótulos iguales con cifras distintas confunden.
  const bloquePlazos =
    p === 0
      ? ''
      : `
      <div style="font-size:11px;color:#a8a49c;letter-spacing:.4px;margin-bottom:16px;">${s > 0 ? 'MÁS ADELANTE' : 'PLAZOS'}</div>
      ${listaConDias(plazos)}`;

  const bloquePublicado =
    b === 0
      ? ''
      : `
      <div style="font-size:11px;color:#a8a49c;letter-spacing:.4px;margin-bottom:16px;">PUBLICADO EN EL BOE</div>
      ${publicado
        .map(
          (x) => `
      <div style="font-size:14.5px;line-height:1.55;margin-bottom:14px;letter-spacing:-.1px;">
        ${x.sector ? `<span style="font-size:11px;color:#3C3489;background-color:#f0eefe;padding:3px 8px;border-radius:11px;">${x.sector}</span><br/>` : ''}
        <a href="${SITE_URL}${x.ruta || '/boe'}" style="color:#1a1a18;text-decoration:none;">${acortar(x.title)}</a><br/>
        <span style="color:#8b8780;font-size:13px;">${acortar(x.detail || '', 70)}</span>
      </div>`
        )
        .join('')}
      ${
        // A quien no ha elegido temas se le enseña un BOE corto y se le
        // dice cómo dejar de recibir lo que no le toca. Quitarle el
        // bloque entero lo dejaría sin correo, que es peor.
        sinTemas
          ? `<div style="font-size:13px;color:#8b8780;line-height:1.55;margin:4px 0 6px;">
               Esto es el BOE de la semana sin filtrar.
               <a href="${SITE_URL}/alarmas" style="color:#6d5aef;text-decoration:none;">Dinos de qué va lo tuyo</a>
               y te llegará solo lo que te afecte.
             </div>`
          : ''
      }
      <div style="height:16px;"></div>`;

  const bloqueNovedades =
    n === 0
      ? ''
      : `
      <div style="font-size:11px;color:#a8a49c;letter-spacing:.4px;margin-bottom:16px;">NOVEDADES</div>
      ${novedades
        .map(
          (x) => `
      <div style="font-size:14.5px;line-height:1.55;margin-bottom:14px;letter-spacing:-.1px;">
        <a href="${SITE_URL}${x.ruta || '/novedades'}" style="color:#1a1a18;text-decoration:none;">${acortar(x.title)}</a><br/>
        <span style="color:#8b8780;font-size:13px;">${acortar(x.detail || '', 70)}</span>
      </div>`
        )
        .join('')}
      <div style="height:16px;"></div>`;

  const html = shell(
    `
    ${saludo(firstName)}
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:30px;line-height:1.55;">${entradilla}</div>
    ${bloqueElectoral(hitoElectoral)}
    ${bloqueEstaSemana}
    ${bloquePlazos}
    ${bloquePublicado}
    ${bloqueNovedades}
    ${button('Ver mis novedades', `${SITE_URL}/novedades`, '#6d5aef')}
  `,
    {
      antetitulo: 'Seguimiento, resumen semanal',
      titulo: 'Tu semana',
      preheader:
        s > 0
          ? `${s} ${s === 1 ? 'cierra' : 'cierran'} en los próximos siete días`
          : p > 0
            ? `${p} ${p === 1 ? 'plazo se acerca' : 'plazos se acercan'}`
            : b > 0
              ? `${b} ${b === 1 ? 'norma publicada' : 'normas publicadas'}`
              : `${n} ${n === 1 ? 'novedad' : 'novedades'}`,
      footerExtra: unsubscribeUrl
        ? `&nbsp;&nbsp;&nbsp;<a href="${unsubscribeUrl}" style="color:#c9c6be;">Dejar de recibir estos avisos</a>`
        : '',
    }
  );

  return { subject, html };
}


/**
 * Aviso diario de lo que encaja con los criterios del usuario.
 *
 * Distinto del resumen semanal: aquel cuenta lo que se mueve en lo que
 * sigues, este avisa de cosas nuevas que ni siquiera conocías.
 *
 * Solo se manda si hay algo. Un correo diario que dice "hoy nada" es la
 * forma más rápida de que alguien se dé de baja.
 */
export function dailyAlertEmail({ firstName, matches = [], total = 0, unsubscribeUrl }) {
  const n = matches.length;
  const conPlazo = matches.filter((m) => m.plazo).length;

  const subject =
    conPlazo > 0
      ? `${conPlazo} ${conPlazo === 1 ? 'asunto con plazo' : 'asuntos con plazo'} en tu sector`
      : `${total} ${total === 1 ? 'novedad' : 'novedades'} en tu sector`;

  const dias = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  };

  const lista = matches
    .map((m) => {
      const d = dias(m.plazo);
      const contador =
        d !== null && d >= 0
          ? `<td width="44" valign="top" style="padding-right:16px;">
               <div style="font-size:22px;font-weight:500;color:#1d6f5c;line-height:1;letter-spacing:-.5px;">${d}</div>
               <div style="font-size:11px;color:#b8b4ac;margin-top:2px;">${d === 1 ? 'día' : 'días'}</div>
             </td>`
          : '';
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          ${contador}
          <td valign="top">
            <div style="font-size:11px;color:#a8a49c;margin-bottom:4px;">${m.fuente || ''}</div>
            <a href="${SITE_URL}${m.ruta || '/regulatorio'}" style="font-size:14.5px;color:#1a1a18;text-decoration:none;line-height:1.45;letter-spacing:-.1px;">${m.title}</a>
            ${m.motivo ? `<div style="font-size:12px;color:#8b8780;margin-top:5px;">Coincide con «${m.motivo}»</div>` : ''}
          </td>
        </tr>
      </table>`;
    })
    .join('');

  const html = shell(
    `
    ${saludo(firstName)}
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:30px;line-height:1.55;">${
      total === 1 ? 'Ha aparecido algo que encaja con tu sector.' : `Han aparecido ${total} asuntos que encajan con tu sector.`
    }</div>
    ${lista}
    ${
      total > n
        ? `<div style="font-size:12px;color:#a8a49c;margin-bottom:24px;">Y ${total - n} más.</div>`
        : '<div style="height:8px;"></div>'
    }
    ${button('Ver novedades de mi sector', `${SITE_URL}/regulatorio/sector`, '#6d5aef')}
  `,
    {
      antetitulo: 'Tu sector',
      titulo: 'Novedades de tu sector',
      preheader:
        conPlazo > 0
          ? `${conPlazo} con plazo abierto`
          : `${total} ${total === 1 ? 'novedad' : 'novedades'} en tu sector`,
      footerExtra: unsubscribeUrl
        ? `&nbsp;&nbsp;&nbsp;<a href="${unsubscribeUrl}" style="color:#c9c6be;">Ajustar mis avisos</a>`
        : '',
    }
  );

  return { subject, html };
}

// =====================================================================
// ALARMAS — el correo de lo que han encontrado las alarmas
//
// Uno por persona y envío, aunque tenga varias alarmas: cada asunto lleva
// debajo el nombre de la alarma que lo encontró y el motivo, que es lo
// que hace que el correo no parezca una lista de coincidencias.
//
// `tipo` cambia el titular: 'inmediato' (ha aparecido algo ahora),
// 'diario' (lo de ayer) o 'semanal' (lo de la semana, el de Free).
// Morado, porque es la funcionalidad de alarmas.
// =====================================================================
export function alarmasEmail({
  firstName,
  matches = [],
  total = 0,
  tipo = 'diario',
  esFree = false,
  ajustesUrl,
  recordatorios = [],
  hitoElectoral = null,
}) {
  const MORADO = '#6d5aef';
  const n = matches.length;
  const nr = recordatorios.length;
  const conPlazo = matches.filter((m) => m.plazo).length;

  const dias = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  };

  // Recordatorios de plazo: lo que las alarmas ya encontraron y cierra
  // pronto (30, 14, 7, 3, 1 días y el mismo día). Van arriba del todo,
  // porque son lo más urgente del correo.
  const cierraHoy = recordatorios.some((r) => r.dias === 0);
  const primero = [...recordatorios].sort((a, b) => a.dias - b.dias)[0];
  const cuando = tipo === 'semanal' ? 'esta semana' : tipo === 'inmediato' ? 'ahora' : 'desde ayer';

  let subject;
  if (nr > 0 && total === 0) {
    subject =
      nr === 1
        ? primero.dias === 0
          ? `Hoy cierra el plazo: ${primero.title}`.slice(0, 110)
          : (primero.dias === 1 ? `Queda 1 día: ${primero.title}` : `Quedan ${primero.dias} días: ${primero.title}`).slice(0, 110)
        : cierraHoy
          ? `${nr} plazos de tus alarmas cierran pronto, uno hoy`
          : `${nr} plazos de tus alarmas cierran pronto`;
  } else if (nr > 0) {
    subject = `${total} ${total === 1 ? 'novedad' : 'novedades'} y ${nr} ${nr === 1 ? 'plazo que cierra' : 'plazos que cierran'} pronto`;
  } else if (tipo === 'consejo') {
    // Aviso urgente del Consejo de Ministros: el asunto dice qué se ha
    // aprobado, que es lo que decide si se abre el correo.
    subject =
      total === 1 && matches[0]
        ? `Consejo de Ministros: ${matches[0].title}`.slice(0, 110)
        : `El Consejo de Ministros ha aprobado ${total} asuntos que te afectan`;
  } else {
    subject =
      conPlazo > 0
        ? `${conPlazo} ${conPlazo === 1 ? 'asunto con plazo abierto' : 'asuntos con plazo abierto'} en tus alarmas`
        : `${total} ${total === 1 ? 'novedad' : 'novedades'} en tus alarmas ${cuando === 'ahora' ? '' : cuando}`.trim();
  }

  const fila = (m, d, etiquetaDia) => {
    const contador =
      d !== null && d >= 0
        ? `<td width="44" valign="top" style="padding-right:16px;">
             <div style="font-size:22px;font-weight:500;color:${MORADO};line-height:1;letter-spacing:-.5px;">${d === 0 ? 'Hoy' : d}</div>
             <div style="font-size:11px;color:#b8b4ac;margin-top:2px;">${d === 0 ? (etiquetaDia || 'cierra') : d === 1 ? 'día' : 'días'}</div>
           </td>`
        : '';
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
        <tr>
          ${contador}
          <td valign="top">
            <div style="font-size:11px;color:#a8a49c;margin-bottom:4px;">${[m.fuente, m.alarma].filter(Boolean).join(', ')}</div>
            <a href="${SITE_URL}${m.ruta || '/regulatorio'}" style="font-size:14.5px;color:#1a1a18;text-decoration:none;line-height:1.45;letter-spacing:-.1px;">${m.title}</a>
            ${m.motivo ? `<div style="font-size:12.5px;color:#57534e;margin-top:6px;line-height:1.5;">${m.motivo}</div>` : ''}
          </td>
        </tr>
      </table>`;
  };

  const titulo = (t) =>
    `<div style="font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:${MORADO};margin:4px 0 14px;">${t}</div>`;

  const bloquePlazos =
    nr > 0
      ? `${titulo('Plazos que se acercan')}
         ${recordatorios.map((r) => fila(r, typeof r.dias === 'number' ? r.dias : dias(r.plazo))).join('')}
         ${n > 0 ? '<div style="height:1px;background-color:#ecebe6;margin:6px 0 22px;"></div>' : ''}`
      : '';

  const bloqueNovedades =
    n > 0
      ? `${nr > 0 ? titulo('Novedades') : ''}
         ${matches.map((m) => fila(m, dias(m.plazo))).join('')}
         ${total > n ? `<div style="font-size:12px;color:#a8a49c;margin-bottom:24px;">Y ${total - n} más.</div>` : ''}`
      : '';

  let intro;
  if (total === 0 && nr > 0) {
    intro =
      nr === 1
        ? 'Un asunto que encontró tu alarma está a punto de cerrar el plazo.'
        : `${nr} asuntos que encontraron tus alarmas están a punto de cerrar el plazo.`;
  } else if (tipo === 'consejo') {
    intro =
      total === 1
        ? 'El Consejo de Ministros acaba de aprobar un asunto que te afecta. La información procede de la Referencia oficial del Consejo; la norma se aplica cuando se publica en el BOE.'
        : `El Consejo de Ministros acaba de aprobar ${total} asuntos que te afectan. La información procede de la Referencia oficial del Consejo; las normas se aplican cuando se publican en el BOE.`;
  } else if (tipo === 'inmediato') {
    intro = total === 1 ? 'Tu alarma acaba de encontrar algo que te afecta.' : `Tus alarmas acaban de encontrar ${total} asuntos que te afectan.`;
  } else if (tipo === 'semanal') {
    intro =
      total === 1
        ? 'Esto es lo que ha encontrado tu alarma esta semana.'
        : `Esto es lo que han encontrado tus alarmas esta semana: ${total} asuntos.`;
  } else {
    intro =
      total === 1
        ? 'Desde ayer, tus alarmas han encontrado un asunto que te afecta.'
        : `Desde ayer, tus alarmas han encontrado ${total} asuntos que te afectan.`;
  }
  if (total > 0 && nr > 0) intro += ` Y ${nr === 1 ? 'un plazo cierra' : `${nr} plazos cierran`} pronto.`;

  const pro = esFree
    ? `<div style="margin-top:26px;padding:14px 16px;background-color:#f0eefe;border-radius:10px;font-size:12.5px;color:#3c3489;line-height:1.55;">
         Con suscripción te avisamos el mismo día en que se abre un plazo, te recordamos cuándo cierra y puedes tener más alarmas.
         <a href="${SITE_URL}/precios" style="color:${MORADO};">Ver planes</a>
       </div>`
    : '';

  // Cabecera: el antetítulo dice qué envío es y el título, qué trae.
  const antetitulo =
    tipo === 'consejo'
      ? 'Alarmas del Consejo de Ministros'
      : tipo === 'inmediato'
        ? 'Alarmas al momento'
        : tipo === 'semanal'
          ? 'Alarmas, resumen semanal'
          : 'Alarmas, resumen diario';
  const tituloCab =
    total === 0 && nr > 0
      ? 'Plazos que cierran pronto'
      : tipo === 'consejo'
        ? 'Consejo de Ministros'
        : tipo === 'inmediato'
          ? 'Nuevo en tus alarmas'
          : tipo === 'semanal'
            ? 'Tus alarmas de la semana'
            : 'Tus alarmas de hoy';

  const html = shell(
    `
    ${saludo(firstName)}
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:28px;line-height:1.55;">${intro}</div>
    ${bloqueElectoral(hitoElectoral)}
    ${bloquePlazos}
    ${bloqueNovedades}
    <div style="height:8px;"></div>
    ${button('Ver mis novedades', `${SITE_URL}/novedades`, MORADO)}
    ${pro}
  `,
    {
      antetitulo,
      titulo: tituloCab,
      preheader:
        nr > 0
          ? `${nr} ${nr === 1 ? 'plazo cierra' : 'plazos cierran'} pronto`
          : conPlazo > 0
            ? `${conPlazo} con plazo abierto`
            : `${total} ${total === 1 ? 'novedad' : 'novedades'}`,
      footerExtra: ajustesUrl ? `&nbsp;&nbsp;&nbsp;<a href="${ajustesUrl}" style="color:#c9c6be;">Ajustar mis alarmas</a>` : '',
    }
  );

  return { subject, html };
}

// =====================================================================
// LEYES QUE SIGUES — trámites nuevos de leyes autonómicas
//
// Al momento, desde el sync de parlamentos (lib/ccaa/eventos.js), solo a
// suscriptores. Copy elegido por Jorge el 30-10-2026 (opción 1): el asunto
// dice qué ha pasado y en qué ley («PL-10/2026: comparecencia»); la
// entradilla, quién lo ha publicado. Cada trámite como en Novedades
// (opción A): el trámite, la ley y la cita al boletín con su enlace.
// =====================================================================

// Cómo se dice cada acto en el asunto.
const ACTO_CORTO = {
  registro: 'registro',
  admision: 'admisión a trámite',
  publicacion: 'publicación',
  toma_consideracion: 'toma en consideración',
  criterio_gobierno: 'criterio del Gobierno',
  plazo_enmiendas: 'plazo de enmiendas',
  ampliacion_plazo: 'plazo ampliado',
  enmiendas_totalidad: 'enmiendas a la totalidad',
  enmiendas_parciales: 'enmiendas',
  comparecencias: 'comparecencia',
  ponencia: 'ponencia',
  comision: 'comisión',
  dictamen: 'dictamen',
  pleno: 'Pleno',
  aprobacion: 'aprobada',
  rechazo: 'rechazada',
  retirada: 'retirada',
  caducidad: 'caducada',
  ampliacion_bloqueada: 'plazo ampliado de nuevo',
  plazo_proximo: 'plazo que cierra pronto',
};

// «La Asamblea de Madrid ha», «Las Cortes de Aragón han», «El Parlament…».
function sujetoParlamento(clave) {
  const n = PARLAMENTOS[clave]?.nombre || 'El parlamento';
  if (/^(Cortes|Corts)\b/.test(n)) return { quien: `Las ${n}`, plural: true };
  if (/^(Asamblea|Junta)\b/.test(n)) return { quien: `La ${n}`, plural: false };
  return { quien: `El ${n}`, plural: false };
}

// Trámites antiguos (puesta al día de una ley que se empieza a seguir):
// el correo habla en pasado (petición de Jorge del 30-10-2026). Lo normal
// es que un trámite llegue ~7 días después del acto (el BOAM es semanal);
// con más de DIAS_PASADO días ya no es una novedad.
const DIAS_PASADO = 10;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const diaMes = (iso) => {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
};
// «el 16 de octubre», «entre el 9 y el 16 de octubre».
function rangoFechas(fechas) {
  const f = [...fechas].sort();
  if (!f.length) return '';
  if (f[0] === f[f.length - 1]) return `el ${diaMes(f[0])}`;
  const [a, b] = [f[0], f[f.length - 1]];
  const mismoMes = a.slice(0, 7) === b.slice(0, 7);
  return `entre el ${mismoMes ? Number(a.slice(8, 10)) : diaMes(a)} y el ${diaMes(b)}`;
}

// «del Proyecto de Ley…», «de la Proposición de Ley…», «de «…»».
function deLaLey(titulo) {
  const t = String(titulo || '').trim();
  if (/^(proyecto|projecte)\b/i.test(t)) return `del ${t}`;
  if (/^(proposici[oó]n?|proposici[oó])\b/i.test(t)) return `de la ${t}`;
  return `de «${t}»`;
}

export function seguimientoEmail({ firstName, tramites = [], leyes = [], ajustesUrl }) {
  const MORADO = '#6d5aef';
  const n = tramites.length;
  const unaLey = leyes.length === 1 ? leyes[0] : null;
  const fechas = tramites.map((t) => t.fecha).filter(Boolean);
  const limite = new Date(Date.now() - DIAS_PASADO * 86400000).toISOString().slice(0, 10);
  const pasado = fechas.length === n && n > 0 && fechas.every((f) => f < limite);
  const rango = rangoFechas(fechas);

  // Solo recordatorios de plazo (entrega C): «Quedan 3 días: enmiendas a la
  // totalidad (202-00087/15)».
  const soloPlazos = n > 0 && tramites.every((t) => t.tipo === 'plazo_proximo');

  let subject;
  let intro;
  if (soloPlazos) {
    subject = n === 1 ? `${tramites[0].titulo}${unaLey ? ` (${unaLey.num})` : ''}` : `${n} plazos de leyes que sigues cierran pronto`;
    intro = unaLey
      ? `Se acerca el cierre de ${n === 1 ? 'un plazo' : `${n} plazos`} ${deLaLey(unaLey.titulo)}.`
      : `Se acerca el cierre de ${n} plazos en leyes que sigues.`;
  } else if (pasado) {
    subject = unaLey
      ? n === 1
        ? `${unaLey.num}: ${ACTO_CORTO[tramites[0].tipo] || 'trámite'} del ${diaMes(fechas[0])}`
        : `${unaLey.num}: trámites publicados ${rango}`
      : `Trámites publicados ${rango} en leyes que sigues`;
    if (unaLey) {
      const { quien, plural } = sujetoParlamento(unaLey.parlamento);
      intro = `${quien} ${plural ? 'publicaron' : 'publicó'} ${n === 1 ? 'un trámite' : `${n} trámites`} ${deLaLey(unaLey.titulo)} ${rango}.`;
    } else {
      intro = `${mayuscula(rango)} se publicaron ${n} trámites en ${leyes.length} leyes que sigues.`;
    }
  } else if (unaLey) {
    subject = n === 1
      ? `${unaLey.num}: ${ACTO_CORTO[tramites[0].tipo] || 'nuevo trámite'}`
      : `${unaLey.num}: ${n} trámites nuevos`;
  } else {
    subject = `${n} trámites nuevos en leyes que sigues`;
  }

  if (!pasado && !soloPlazos) {
    if (unaLey) {
      const { quien, plural } = sujetoParlamento(unaLey.parlamento);
      intro = `${quien} ${plural ? 'han' : 'ha'} publicado ${n === 1 ? 'un trámite' : `${n} trámites`} ${deLaLey(unaLey.titulo)}.`;
    } else {
      intro = `Hay ${n} trámites nuevos en ${leyes.length} leyes que sigues.`;
    }
  }

  const fila = (t) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
        <tr>
          <td valign="top">
            <div style="font-size:11px;color:#a8a49c;margin-bottom:4px;">${esc(PARLAMENTOS[t.parlamento]?.nombre || '')}</div>
            <a href="${SITE_URL}${t.ruta || '/novedades'}" style="font-size:14.5px;color:#1a1a18;text-decoration:none;line-height:1.45;letter-spacing:-.1px;">${esc(t.titulo)}</a>
            ${t.detalle ? `<div style="font-size:12.5px;color:#57534e;margin-top:6px;line-height:1.5;">${esc(t.detalle)}</div>` : ''}
            ${t.cita && t.url ? `<div style="margin-top:4px;"><a href="${esc(t.url)}" style="font-size:12.5px;color:${MORADO};text-decoration:none;">${esc(t.cita)}</a></div>` : ''}
          </td>
        </tr>
      </table>`;

  const html = shell(
    `
    ${saludo(firstName)}
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:28px;line-height:1.55;">${esc(intro)}</div>
    ${tramites.map(fila).join('')}
    <div style="height:8px;"></div>
    ${button('Ver mis novedades', `${SITE_URL}/novedades`, MORADO)}
  `,
    {
      antetitulo: 'Leyes que sigues',
      titulo: soloPlazos
        ? n === 1 ? 'Plazo que cierra pronto' : 'Plazos que cierran pronto'
        : pasado ? (n === 1 ? 'Trámite publicado' : 'Trámites publicados') : n === 1 ? 'Nuevo trámite' : `${n} trámites nuevos`,
      preheader: intro,
      footerExtra: ajustesUrl ? `&nbsp;&nbsp;&nbsp;<a href="${ajustesUrl}" style="color:#c9c6be;">Ajustar mis avisos</a>` : '',
    }
  );
  return { subject, html };
}

// =====================================================================
// ESTADO DE UNA LEY AUTONÓMICA — el punto de partida
//
// Lo que ha pasado hasta hoy en la tramitación de una ley, para quien
// empieza a vigilarla (primer uso: la Ley LIDER para Carlos, 30-10-2026).
// Se alimenta de la ficha: trámites con su cita, plazos y fase. Tres
// maquetas (variante): 'cronologia', 'fases' y 'resumen', la elegida por
// Jorge el 30-10-2026 (por defecto).
// =====================================================================

const FASES = [
  { id: 'presentacion', nombre: 'Presentación', tipos: ['registro', 'admision', 'publicacion', 'criterio_gobierno', 'toma_consideracion'] },
  { id: 'enmiendas', nombre: 'Enmiendas', tipos: ['plazo_enmiendas', 'ampliacion_plazo', 'enmiendas_totalidad', 'enmiendas_parciales', 'otro'] },
  { id: 'comision', nombre: 'Comisión', tipos: ['comparecencias', 'ponencia', 'comision', 'dictamen'] },
  { id: 'pleno', nombre: 'Pleno', tipos: ['pleno', 'aprobacion', 'rechazo', 'retirada', 'caducidad'] },
];
const ACTO_LEY = {
  registro: 'Registro', admision: 'Admisión a trámite', publicacion: 'Publicación', criterio_gobierno: 'Criterio del Gobierno',
  toma_consideracion: 'Toma en consideración', ampliacion_plazo: 'Prórroga del plazo', enmiendas_totalidad: 'Enmiendas a la totalidad',
  enmiendas_parciales: 'Enmiendas al articulado', comparecencias: 'Comparecencias', ponencia: 'Ponencia', comision: 'Comisión',
  dictamen: 'Dictamen', pleno: 'Pleno', aprobacion: 'Aprobación', rechazo: 'Rechazo', retirada: 'Retirada', caducidad: 'Caducidad',
};
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaActo = (t) => (t.tipo === 'plazo_enmiendas' || (t.tipo === 'otro' && t.plazo_hasta)
  ? `Plazo de ${CLASE_TEXTO[claseDe(t)] || 'enmiendas'}`
  : ACTO_LEY[t.tipo] || 'Trámite');
const faseDe = (tipo) => FASES.findIndex((f) => f.tipos.includes(tipo));

export function estadoLeyEmail({ firstName, ley, tramites = [], alarma = null, variante = 'resumen' }) {
  const MORADO = '#6d5aef';
  const parlamento = PARLAMENTOS[ley.parlamento]?.nombre || 'el parlamento';
  const boletin = PARLAMENTOS[ley.parlamento]?.boletin || 'Boletín';
  const lista = [...tramites].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const fichaUrl = `${SITE_URL}/parlamentos-autonomicos/${ley.slug}`;
  const actual = Math.max(0, ...lista.map((t) => faseDe(t.tipo)).filter((k) => k >= 0));
  const rechazoTotalidad = lista.some((t) => t.tipo === 'enmiendas_totalidad' && /rechaz/i.test(t.descripcion || ''));
  const fechaLarga = (f) => { const [, m, d] = String(f).split('-').map(Number); return `${d} de ${MESES[m - 1]}`; };
  const cita = (t) => (t.url && t.boletin ? `<a href="${esc(t.url)}" style="color:${MORADO};text-decoration:none;">${boletin} ${esc(t.boletin)}${t.pagina ? `, pág. ${t.pagina}` : ''}</a>` : '');

  const proximos = [];
  const hay = (tipo) => lista.some((t) => t.tipo === tipo);
  if (!ley.is_closed) {
    if (hay('comparecencias') && !hay('ponencia')) proximos.push('Las comparecencias admitidas, en la Comisión');
    if (!hay('ponencia')) proximos.push('El informe de la ponencia');
    if (!hay('dictamen')) proximos.push(`El dictamen de la ${esc(ley.comision || 'Comisión')}`);
    proximos.push('El debate final y la votación en el Pleno');
  }
  const nota = rechazoTotalidad && !ley.is_closed
    ? 'El rechazo de las enmiendas a la totalidad no es la aprobación de la ley: sigue su tramitación en la Comisión.'
    : null;

  const intro = alarma
    ? `Este es el punto de partida de tu alarma «${esc(alarma)}»: lo que ha pasado hasta hoy en la tramitación. Desde ahora te avisamos de cada paso nuevo en cuanto se publique.`
    : 'Este es el punto de partida de la ley: lo que ha pasado hasta hoy en su tramitación. Desde ahora te avisamos de cada paso nuevo en cuanto se publique.';
  const cabeceraLey = `
    <div style="margin:0 0 24px;padding:16px 18px;background-color:#f7f6f2;border-radius:10px;">
      <div style="font-size:11px;color:#a8a49c;margin-bottom:4px;">${esc(parlamento)}, ${esc(ley.num)}</div>
      <a href="${fichaUrl}" style="font-size:15px;color:#1a1a18;text-decoration:none;line-height:1.45;font-weight:500;">${esc(ley.titulo)}</a>
      ${ley.comision ? `<div style="font-size:12.5px;color:#57534e;margin-top:6px;">En la ${esc(ley.comision)}</div>` : ''}
    </div>`;
  const tituloBloque = (t) => `<div style="font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:${MORADO};margin:8px 0 14px;">${t}</div>`;
  const notaHtml = nota ? `<div style="margin:0 0 24px;padding:12px 14px;border-left:3px solid ${MORADO};font-size:13px;color:#3a3a36;line-height:1.55;">${nota}</div>` : '';
  const proximosHtml = proximos.length
    ? `${tituloBloque('Qué viene')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">${proximos.map((p, i) => `
        <tr><td width="26" valign="top" style="font-size:13px;color:${MORADO};font-weight:600;padding:3px 0;">${i + 1}</td>
        <td valign="top" style="font-size:13.5px;color:#3a3a36;padding:3px 0;line-height:1.5;">${p}</td></tr>`).join('')}</table>`
    : '';
  const filaTramite = (t, conFecha = true) => {
    const [, m, d] = String(t.fecha).split('-').map(Number);
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          ${conFecha ? `<td width="52" valign="top" style="padding-right:14px;">
            <div style="font-size:20px;font-weight:500;color:${MORADO};line-height:1;letter-spacing:-.5px;">${d}</div>
            <div style="font-size:11px;color:#b8b4ac;margin-top:2px;">${MES_CORTO[m - 1]}</div>
          </td>` : ''}
          <td valign="top">
            <div style="font-size:13.5px;color:#1a1a18;font-weight:500;line-height:1.4;">${etiquetaActo(t)}</div>
            <div style="font-size:12.5px;color:#57534e;margin-top:3px;line-height:1.5;">${esc(t.descripcion)}</div>
            ${cita(t) ? `<div style="font-size:12.5px;margin-top:3px;">${cita(t)}</div>` : ''}
          </td>
        </tr>
      </table>`;
  };

  let cuerpo;
  if (variante === 'fases') {
    cuerpo = FASES.map((f, k) => {
      const suyos = lista.filter((t) => faseDe(t.tipo) === k);
      const estado = k < actual ? 'Hecho' : k === actual ? 'En curso' : 'Pendiente';
      const color = k <= actual ? MORADO : '#b8b4ac';
      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${suyos.length ? 8 : 18}px;">
          <tr>
            <td valign="middle" style="font-size:15px;font-weight:600;color:${k <= actual ? '#1a1a18' : '#a8a49c'};">${f.nombre}</td>
            <td valign="middle" align="right" style="font-size:11.5px;font-weight:600;color:${color};">${estado}</td>
          </tr>
        </table>
        ${suyos.length ? `<div style="padding-left:14px;border-left:2px solid #ecebe6;margin-bottom:20px;">${suyos.map((t) => filaTramite(t)).join('')}</div>` : ''}`;
    }).join('');
    cuerpo = `${notaHtml}${cuerpo}<div style="height:6px;"></div>${proximosHtml}`;
  } else if (variante === 'resumen') {
    const ult = lista[lista.length - 1];
    const resumen = `La ley está en la fase de <strong>${FASES[actual].nombre.toLowerCase()}</strong>.${ult ? ` El último paso fue el ${fechaLarga(ult.fecha)}: ${etiquetaActo(ult).toLowerCase()}.` : ''}${nota ? ` ${nota}` : ''}`;
    const recientes = [...lista].reverse().slice(0, 3);
    cuerpo = `
      <div style="margin:0 0 26px;font-size:15px;color:#1a1a18;line-height:1.6;">${resumen}</div>
      ${proximosHtml}
      ${tituloBloque('Lo último')}
      ${recientes.map((t) => filaTramite(t)).join('')}
      ${lista.length > 3 ? `<div style="font-size:12.5px;color:#8b8780;margin:0 0 22px;">Y ${lista.length - 3} pasos anteriores en la <a href="${fichaUrl}" style="color:${MORADO};text-decoration:none;">ficha de la ley</a>.</div>` : ''}`;
  } else {
    cuerpo = `${notaHtml}${tituloBloque('Lo que ha pasado')}${lista.map((t) => filaTramite(t)).join('')}<div style="height:6px;"></div>${proximosHtml}`;
  }

  const html = shell(
    `
    ${saludo(firstName)}
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:22px;line-height:1.55;">${intro}</div>
    ${cabeceraLey}
    ${cuerpo}
    ${button('Ver la ficha de la ley', fichaUrl, MORADO)}
  `,
    {
      antetitulo: 'Estado de la ley',
      titulo: 'Dónde está la tramitación',
      preheader: `${ley.num}: lo que ha pasado hasta hoy y qué viene`,
      footerExtra: `&nbsp;&nbsp;&nbsp;<a href="${SITE_URL}/alarmas" style="color:#c9c6be;">Ajustar mis avisos</a>`,
    }
  );
  return { subject: `${ley.num}: dónde está la tramitación`, html };
}

// =====================================================================
// AGENDA DEL GOBIERNO — la agenda de hoy de los ministros que sigues
//
// Uno al día como mucho, por la mañana (app/api/sync/agenda-gobierno).
// Mismo aspecto que el correo de las alarmas: a la izquierda la hora,
// donde allí van los días que quedan. Morado, porque apunta al
// seguimiento. El texto viene de La Moncloa tal cual y se escapa.
// =====================================================================
export function agendaEmail({ firstName, diaTexto, personas = [], ajustesUrl }) {
  const MORADO = '#6d5aef';
  const n = personas.reduce((s, p) => s + p.actos.length, 0);

  const subject =
    personas.length === 1
      ? `La agenda de hoy de ${personas[0].nombre}`.slice(0, 110)
      : `La agenda de hoy de ${personas.length} miembros del Gobierno que sigues`;

  const intro =
    personas.length === 1
      ? `La agenda oficial de hoy, ${esc(diaTexto)}, de ${esc(personas[0].nombre)}.`
      : `La agenda oficial de hoy, ${esc(diaTexto)}, de los ${personas.length} miembros del Gobierno que sigues.`;

  const acto = (a) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
        <tr>
          <td width="52" valign="top" style="padding-right:14px;">
            <div style="font-size:15px;font-weight:500;color:${MORADO};line-height:1.35;letter-spacing:-.2px;">${a.hora ? esc(a.hora) : '—'}</div>
          </td>
          <td valign="top">
            <div style="font-size:14px;color:#1a1a18;line-height:1.5;">${esc(a.texto)}</div>
            ${a.notas?.length ? `<div style="font-size:12px;color:#a8a49c;margin-top:4px;line-height:1.5;">${a.notas.map(esc).join(', ')}</div>` : ''}
          </td>
        </tr>
      </table>`;

  const bloque = (p, i) => `
      ${i > 0 ? '<div style="height:1px;background-color:#ecebe6;margin:6px 0 22px;"></div>' : ''}
      <div style="margin-bottom:14px;">
        <a href="${SITE_URL}${p.ruta}" style="font-size:15px;font-weight:500;color:#1a1a18;text-decoration:none;letter-spacing:-.2px;">${esc(p.nombre)}</a>
        ${p.cargo ? `<div style="font-size:12px;color:#a8a49c;margin-top:2px;line-height:1.45;">${esc(p.cargo)}</div>` : ''}
      </div>
      ${p.actos.map(acto).join('')}`;

  const html = shell(
    `
    ${saludo(esc(firstName))}
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:28px;line-height:1.55;">${intro}</div>
    ${personas.map(bloque).join('')}
    <div style="font-size:12px;color:#a8a49c;margin:10px 0 24px;line-height:1.55;">Es la agenda anunciada por La Moncloa: puede cambiar a lo largo del día.</div>
    ${button('Ver mi seguimiento', `${SITE_URL}/novedades`, MORADO)}
  `,
    {
      preheader: `${n} ${n === 1 ? 'acto' : 'actos'} en la agenda de hoy`,
      antetitulo: 'Agenda del Gobierno',
      titulo: 'La agenda de hoy',
      footerExtra: ajustesUrl ? `&nbsp;&nbsp;&nbsp;<a href="${ajustesUrl}" style="color:#c9c6be;">Ajustar mis avisos</a>` : '',
    }
  );

  return { subject, html };
}

// =====================================================================
// CONSEJO DE MINISTROS — el correo de cada Consejo
//
// A todos los usuarios en cuanto se publica la Referencia
// (app/api/alerts/consejo). Ordenado por tipo de norma (maqueta 1,
// elegida el 30-09-2026): reales decretos-ley, reales decretos, otros
// acuerdos destacados y nombramientos.
//
// Pro y Teams llevan arriba el bloque «Te afecta» con lo que han
// encontrado sus alarmas y lo que cita normas que siguen. Free lleva al
// final una línea de Pro. Morado, porque es un producto de la máquina.
// El texto viene de la IA y de La Moncloa: se escapa todo.
// =====================================================================
export function consejoEmail({
  firstName,
  diaTexto,
  resumen,
  conteo,
  tuyos = [],
  esFree = false,
  referenciaUrl,
  bajaUrl,
}) {
  const MORADO = '#6d5aef';
  const rutaDe = (ids) => `${SITE_URL}/regulatorio/consejo/${encodeURIComponent(ids[0])}`;

  const n = (k, uno, varios) => (conteo[k] === 1 ? `1 ${uno}` : `${conteo[k]} ${varios}`);
  const partes = [
    conteo.real_decreto_ley ? n('real_decreto_ley', 'real decreto-ley', 'reales decretos-ley') : null,
    conteo.real_decreto ? n('real_decreto', 'real decreto', 'reales decretos') : null,
    conteo.resto ? n('resto', 'acuerdo', 'acuerdos') : null,
    conteo.nombramiento ? n('nombramiento', 'nombramiento', 'nombramientos') : null,
  ].filter(Boolean);
  const enumeracion = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0] || 'sus acuerdos';

  const etiqueta = (t) =>
    `<div style="font-size:10.5px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:${MORADO};margin:4px 0 12px;">${t}</div>`;
  const separador = '<div style="height:1px;background-color:#ecebe6;margin:20px 0;"></div>';

  const item = (x) => `
      <div style="margin-bottom:14px;">
        <a href="${rutaDe(x.ids)}" style="font-size:14px;color:#1a1a18;line-height:1.45;font-weight:500;text-decoration:none;">${esc(x.titulo)}</a>
        ${x.resumen ? `<div style="font-size:12.5px;color:#57534e;margin-top:4px;line-height:1.5;">${esc(x.resumen)}</div>` : ''}
      </div>`;

  const bloques = [];
  if (resumen.reales_decretos_ley?.length) bloques.push(`${etiqueta('Reales decretos-ley')}${resumen.reales_decretos_ley.map(item).join('')}`);
  if (resumen.reales_decretos?.length) bloques.push(`${etiqueta('Reales decretos')}${resumen.reales_decretos.map(item).join('')}`);
  if (resumen.destacados?.length) bloques.push(`${etiqueta('Otros acuerdos destacados')}${resumen.destacados.map(item).join('')}`);
  if (resumen.nombramientos?.length) {
    bloques.push(
      `${etiqueta('Nombramientos')}<div style="font-size:12.5px;color:#57534e;line-height:1.65;">${resumen.nombramientos
        .map((x) => esc(x.texto))
        .join('<br/>')}</div>`
    );
  }

  const bloqueTuyo =
    !esFree && tuyos.length > 0
      ? `<div style="background-color:#f0eefe;border-radius:10px;padding:14px 16px;margin-bottom:22px;">
          ${etiqueta(tuyos.length === 1 ? 'Te afecta' : `Te afectan ${tuyos.length}`).replace('margin:4px 0 12px', 'margin:0 0 10px')}
          ${tuyos
            .map(
              (t, i) => `
            <div style="${i > 0 ? 'margin-top:12px;' : ''}">
              ${t.etiqueta ? `<div style="font-size:11px;color:#8a80d8;margin-bottom:3px;">${esc(t.etiqueta)}</div>` : ''}
              <a href="${rutaDe([t.id])}" style="font-size:14px;color:#1a1a18;font-weight:500;line-height:1.45;text-decoration:none;">${esc(t.titulo)}</a>
              ${t.motivo ? `<div style="font-size:12.5px;color:#3c3489;margin-top:5px;line-height:1.5;">${esc(t.motivo)}</div>` : ''}
            </div>`
            )
            .join('')}
        </div>`
      : '';

  // Asunto fijo por decisión de Jorge (20-10-2026). El «asunto» que genera
  // la IA en lib/resumenConsejo.js ya no se usa para el correo.
  const subject = 'Resumen del Consejo de Ministros';

  const html = shell(
    `
    ${saludo(esc(firstName))}
    <div style="color:#8b8780;font-size:13px;margin-bottom:22px;line-height:1.55;">El Consejo de Ministros del ${esc(diaTexto)} ha aprobado ${enumeracion}. Las normas se aplican cuando se publican en el BOE.</div>
    ${bloqueTuyo}
    ${bloques.join(separador)}
    <div style="font-size:11.5px;color:#a8a49c;margin:18px 0;line-height:1.5;">Fuente: Referencia oficial del Consejo de Ministros. Resúmenes elaborados con IA a partir del texto oficial.</div>
    ${button('Ver la Referencia completa', referenciaUrl, MORADO)}
    ${
      esFree
        ? `<div style="margin-top:20px;padding:13px 15px;background-color:#f0eefe;border-radius:10px;font-size:12.5px;color:#3c3489;line-height:1.55;">
             Con suscripción te decimos qué de todo esto afecta a tu organización y te avisamos en el momento.
             <a href="${SITE_URL}/precios" style="color:${MORADO};">Ver planes</a>
           </div>`
        : ''
    }
  `,
    {
      antetitulo: 'Consejo de Ministros',
      titulo: 'Lo que ha aprobado el Consejo',
      fecha: diaTexto,
      preheader: !esFree && tuyos.length > 0 ? `${tuyos.length === 1 ? 'Un asunto te afecta' : `${tuyos.length} asuntos te afectan`}` : `Lo aprobado: ${enumeracion}`,
      footerExtra: bajaUrl ? `&nbsp;&nbsp;&nbsp;<a href="${bajaUrl}" style="color:#c9c6be;">Dejar de recibir este correo</a>` : '',
    }
  );

  return { subject, html };
}


/**
 * Aviso de que una o varias alarmas se han pausado por no encontrar nada
 * de relevancia en 60 días.
 */
export function alarmaPausadaEmail({ firstName, alarmas = [], url }) {
  const n = alarmas.length;
  const subject =
    n === 1 ? `Hemos pausado tu alarma «${alarmas[0]}»`.slice(0, 110) : `Hemos pausado ${n} de tus alarmas`;
  const body = `
    ${saludo(firstName)}
    <p style="margin:0 0 16px;">${
      n === 1
        ? 'Tu alarma no ha encontrado nada relevante en los últimos 60 días, así que la hemos pausado:'
        : 'Estas alarmas no han encontrado nada relevante en los últimos 60 días, así que las hemos pausado:'
    }</p>
    ${lista(alarmas.map((a) => esc(a)))}
    <p style="margin:0 0 22px;">Si ${n === 1 ? 'sigue' : 'siguen'} siendo útil${n === 1 ? '' : 'es'}, puedes reactivarla${n === 1 ? '' : 's'} cuando quieras o ajustar su descripción para afinar lo que vigila${n === 1 ? '' : 'n'}.</p>
    ${button('Ver mis alarmas', url, '#6d5aef')}
  `;
  return { subject, html: shell(body, { preheader: subject, antetitulo: 'Alarmas', titulo: n === 1 ? 'Alarma pausada' : 'Alarmas pausadas' }) };
}

// =====================================================================
// LEYES CADUCADAS CON LA DISOLUCIÓN — correo único (06-10-2026)
//
// A quien seguía leyes que caducaron al disolverse las Cortes: cuáles, en
// qué punto se quedó cada una y un botón para decidir cuáles mantener.
// Se manda una sola vez por usuario (app/api/alerts/caducadas).
// =====================================================================
export function caducadasEmail({ firstName, leyes = [] }) {
  const n = leyes.length;
  const subject =
    n === 1 ? 'Ha caducado una ley que sigues' : `Han caducado ${n} leyes que sigues`;

  const filas = leyes
    .map(
      (l, i) => `
      <div style="padding:${i === 0 ? 0 : 14}px 0 14px;border-bottom:1px solid #f2f0ec;">
        <a href="${SITE_URL}/congreso/${esc(l.slug)}" style="font-size:14.5px;color:#1a1a18;text-decoration:none;line-height:1.45;">${esc(acortar(l.title))}</a>
        ${l.seQuedo ? `<div style="font-size:12.5px;color:#8b8780;margin-top:4px;">Se quedó en ${esc(String(l.seQuedo).replace(/ · /g, ', '))}</div>` : ''}
      </div>`
    )
    .join('');

  const html = shell(
    `
    ${saludo(esc(firstName))}
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:26px;line-height:1.55;">
      Las Cortes se disolvieron el 6 de octubre y con ellas caducó todo lo que estaba en tramitación.
      ${n === 1 ? 'Una de las leyes que sigues estaba entre ellas' : `${n} de las leyes que sigues estaban entre ellas`}.
    </div>
    <div style="font-size:11px;color:#a8a49c;letter-spacing:.4px;margin-bottom:14px;">${n === 1 ? 'LA LEY' : 'LAS LEYES'}</div>
    ${filas}
    <div style="color:#3a3a36;font-size:13.5px;line-height:1.6;margin:22px 0 22px;">
      Si mantienes el seguimiento, te avisaremos si ${n === 1 ? 'se vuelve' : 'alguna se vuelve'} a presentar en la nueva legislatura.
    </div>
    ${button('Decidir qué mantener', `${SITE_URL}/novedades/disolucion`, '#6d5aef')}
  `,
    {
      preheader: n === 1 ? 'Una ley que sigues ha caducado con la disolución' : `${n} leyes que sigues han caducado con la disolución`,
      antetitulo: 'Seguimiento',
      titulo: n === 1 ? 'Una ley que sigues ha caducado' : 'Leyes que sigues han caducado',
    }
  );

  return { subject, html };
}

/**
 * ¡Novedad! Página de las elecciones del 29N (29-10-2026). Se envía una
 * vez a todos los registrados con los correos comerciales activados, desde
 * /api/cron/novedad-29n. Las cifras salen de lib/data/elecciones29n.json.
 */
export function novedad29nEmail({ firstName, seVan = 110 }) {
  const utm = 'utm_source=email&utm_medium=novedad&utm_campaign=elecciones29n';
  const url = `${SITE_URL}/elecciones-29n?${utm}`;
  const subject = 'Quién repite y quién llegará al Congreso el 29N';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>El BOE publicó ayer las candidaturas a las elecciones generales del 29 de noviembre. Las hemos cruzado con el Congreso actual: <b>${seVan} de los 350 diputados no vuelven a presentarse</b>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;">
      <tr><td>
        <a href="${url}" style="text-decoration:none;">
          <img src="${SITE_URL}/og/elecciones-29n.png" width="520" alt="Quién repite y quién llegará al Congreso el 29N" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:10px;" />
        </a>
      </td></tr>
    </table>
    <p style="margin-bottom:8px;">En la nueva página puedes ver:</p>
    ${lista([
      '<b>El hemiciclo escaño a escaño:</b> quién repite, quién pasa al Senado y quién se va.',
      '<b>Quién llegará al Congreso:</b> los candidatos que pueden convertirse en diputados, de dónde vienen y en qué puesto de la lista van.',
      '<b>Los cargos del Gobierno</b> que van en las listas.',
      '<b>El mapa del relevo</b>, provincia a provincia.',
    ])}
    ${button('Explorar el nuevo Congreso', url, '#6d5aef')}
    <p style="margin-top:24px;">Cuando se constituyan las Cortes tendrás en GovTalent el directorio completo: Gobierno y sus equipos, diputados, grupos parlamentarios, comisiones, senadores y asesores, con su cargo y su contacto.</p>
    <p style="margin:0;">La página es pública: si te resulta útil, compártela con tu equipo.</p>
  `,
    {
      preheader: `${seVan} de los 350 diputados no vuelven a presentarse`,
      antetitulo: '¡Novedad!',
      titulo: 'Quién repite y quién llegará al Congreso',
      footerExtra: `<br/><a href="${SITE_URL}/account" style="color:#c9c6be;">Dejar de recibir novedades</a>`,
    }
  );
  return { subject, html };
}
