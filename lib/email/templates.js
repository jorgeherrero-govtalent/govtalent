const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

/**
 * La estructura común de todos los correos.
 *
 * Sin bordes ni cajas dentro de cajas, y con el pie fuera de la tarjeta:
 * el correo termina y la letra pequeña queda aparte, como en Linear o
 * Stripe.
 */
function shell(bodyHtml, { preheader = '', footerExtra = '' } = {}) {
  return `
<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <span style="display:none;font-size:1px;color:#f6f5f2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:26px 30px 22px;border-bottom:1px solid #f2f0ec;">
                <img src="${SITE_URL}/govtalent-logo-email.png" width="180" height="31" alt="GovTalent" style="display:block;border:0;outline:none;text-decoration:none;" />
                <div style="font-size:11.5px;color:#a8a49c;margin-top:9px;line-height:1.5;">La plataforma all in one para profesionales de los asuntos públicos</div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 30px 30px;color:#3a3a36;font-size:14.5px;line-height:1.55;">
                ${bodyHtml}
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:20px 30px 0;font-size:11.5px;color:#b8b4ac;line-height:1.7;text-align:center;">
                © ${new Date().getFullYear()} GovTalent. Todo lo que necesitas para crecer, en un único lugar<br/>
                <a href="${SITE_URL}/privacidad" style="color:#b8b4ac;">Privacidad</a> ·
                <a href="${SITE_URL}/condiciones" style="color:#b8b4ac;">Condiciones</a>${footerExtra}
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
  return `<a href="${url}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:13.5px;font-weight:500;letter-spacing:-.1px;">${text}</a>`;
}

// Saludo con o sin nombre: sin él, «Hola,» y no «Hola candidato/a,».
function saludo(firstName) {
  const n = String(firstName || '').trim();
  return `<h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">Hola${n ? ` ${n}` : ''},</h2>`;
}

function lista(items) {
  return `<ul style="margin:0 0 22px;padding-left:20px;">${items
    .map((t, i) => `<li style="margin-bottom:${i === items.length - 1 ? 0 : 7}px;">${t}</li>`)
    .join('')}</ul>`;
}

function notaPie(text) {
  return `<p style="margin-top:22px;font-size:12.5px;color:#8b8780;">${text}</p>`;
}

export function welcomeCandidateEmail({ firstName }) {
  const subject = 'Tu cuenta de GovTalent está activa';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Tu cuenta ya está lista en GovTalent, la plataforma que reúne todas las herramientas que necesitas para trabajar y crecer en el sector de los asuntos públicos.</p>
    <p style="margin-bottom:8px;">Desde un único espacio podrás, según tu plan:</p>
    ${lista([
      'Acceder a un directorio institucional de España y la Unión Europea, con más de 12.000 contactos.',
      'Monitorizar y anticipar la normativa que afecta a tu sector a partir de fuentes oficiales españolas y europeas.',
      'Gestionar tus proyectos, mapear stakeholders y preparar briefings.',
      'Planificar tu agenda y mantener la trazabilidad de tus reuniones.',
      'Explorar oportunidades de empleo en asuntos públicos y relaciones institucionales.',
    ])}
    ${button('Acceder a GovTalent', `${SITE_URL}/radar`)}
  `,
    { preheader: 'Todo lo que necesitas para trabajar en asuntos públicos, en un único espacio' }
  );
  return { subject, html };
}

export function welcomeOrganizationEmail({ orgName, firstName }) {
  const subject = `La página de ${orgName} ya está creada`;
  const html = shell(
    `
    ${saludo(firstName)}
    <p>La página de <b>${orgName}</b> ya está creada en GovTalent. Desde el panel de tu organización podrás, según el plan que elijas:</p>
    ${lista([
      'Crear una página pública verificada para reforzar la visibilidad y credibilidad de tu organización.',
      'Publicar ofertas de empleo y gestionar las candidaturas desde un ATS integrado.',
      'Acceder al directorio institucional de España y la Unión Europea, con más de 12.000 contactos.',
      'Gestionar proyectos colaborativos, mapear stakeholders y preparar briefings.',
      'Compartir agendas y notas, registrar la actividad del equipo y automatizar las actas de las reuniones.',
    ])}
    <p>Para empezar a disfrutar de todas las ventajas de tu cuenta, accede al panel, completa la información de <b>${orgName}</b> y sube un documento que acredite su identidad. Nuestro equipo revisará la documentación antes de validar la organización.</p>
    ${button('Ir al panel de la organización', `${SITE_URL}/organizations/admin`)}
  `,
    { preheader: `Siguiente paso: verificar ${orgName}` }
  );
  return { subject, html };
}

export function applicationConfirmationEmail({ firstName, jobTitle, orgName }) {
  const subject = `Hemos recibido tu solicitud para ${jobTitle}`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">¡Solicitud enviada${String(firstName || '').trim() ? `, ${String(firstName).trim()}` : ''}!</h2>
    <p>Tu candidatura para el puesto de <b>${jobTitle}</b> en <b>${orgName}</b> se ha enviado correctamente.</p>
    <p>Puedes hacer seguimiento del estado de tu solicitud en cualquier momento desde tu cuenta.</p>
    ${button('Ver mis solicitudes', `${SITE_URL}/profile/jobs`)}
  `,
    { preheader: `Tu candidatura a ${jobTitle} se ha enviado correctamente` }
  );
  return { subject, html };
}

export function newCandidacyEmail({ jobTitle, candidateName, orgName }) {
  const subject = `Nueva candidatura para ${jobTitle}`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">Nueva candidatura recibida</h2>
    <p><b>${candidateName}</b> ha aplicado al puesto de <b>${jobTitle}</b> en ${orgName}.</p>
    <p>Puedes revisar el perfil completo, generar un resumen con IA y gestionar la candidatura desde el tablero de candidatos.</p>
    ${button('Ver candidatura', `${SITE_URL}/organizations/admin/candidates`)}
  `,
    { preheader: `${candidateName} ha aplicado a ${jobTitle}` }
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
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">${subject}</h2>
    <p><b>${requesterName}</b> (${requesterEmail}) ha solicitado ${
      esVerificacion ? 'verificar' : 'reclamar'
    } la página de <b>${orgName}</b>, adjuntando un documento acreditativo.</p>
    <p>Revisa el documento y aprueba o rechaza la solicitud desde el backoffice.</p>
    ${button('Ver solicitudes', `${SITE_URL}/backoffice/reclamaciones`)}
  `,
    { preheader: `${orgName} · ${requesterName}` }
  );
  return { subject, html };
}

export function claimApprovedEmail({ firstName, orgName }) {
  const n = String(firstName || '').trim();
  const subject = `Verificación completada: ${orgName} ya está activa en GovTalent`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">¡Buenas noticias${n ? `, ${n}` : ''}!</h2>
    <p>Hemos revisado la documentación y verificado correctamente la información de tu cuenta.</p>
    <p><b>${orgName}</b> ya está activa en GovTalent y puedes empezar a disfrutar de todas las ventajas incluidas en tu plan: completar su página, publicar ofertas de empleo, gestionar candidaturas y acceder a las herramientas disponibles para tu equipo.</p>
    ${button('Ir al panel de la organización', `${SITE_URL}/organizations/admin`)}
  `,
    { preheader: `${orgName} ya está activa en GovTalent` }
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
    ${button('Ir al panel de la organización', `${SITE_URL}/organizations/admin`)}`
    : `<p>Hemos revisado la documentación enviada y no nos permite aprobar tu solicitud para administrar la página de <b>${orgName}</b>.</p>
    ${reason ? `<p><b>Motivo:</b> ${reason}</p>` : ''}
    <p>Puedes enviar una nueva solicitud con otro documento desde la página de la organización. Si crees que se trata de un error, responde a este correo.</p>
    ${button('Ver la página de la organización', orgSlug ? `${SITE_URL}/organizations/${orgSlug}` : `${SITE_URL}/organizations`)}`;
  const html = shell(`${saludo(firstName)}${cuerpo}`, { preheader: 'Revisa el motivo y envía una nueva solicitud' });
  return { subject, html };
}

export function jobAlertEmail({ firstName, jobTitle, orgName, location, modality, reason, jobUrl, unsubscribeUrl }) {
  const MODALITY_LABELS = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };
  const subject = `Nueva oferta: ${jobTitle} en ${orgName}`;
  const html = shell(
    `
    ${saludo(firstName)}
    <p>${reason}</p>
    <div style="margin:18px 0;padding:16px 18px;background:#f4f3ee;border-radius:10px;">
      <div style="font-size:15px;font-weight:700;color:#1a1a18;margin-bottom:4px;">${jobTitle}</div>
      <div style="font-size:13px;color:#666;">${[orgName, location, MODALITY_LABELS[modality] || modality].filter(Boolean).join(' · ')}</div>
    </div>
    ${button('Ver la oferta', jobUrl)}
  `,
    {
      preheader: `${jobTitle} en ${orgName}`,
      footerExtra: unsubscribeUrl
        ? `<br/><a href="${unsubscribeUrl}" style="color:#999;">Darte de baja de esta alerta</a>`
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
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">Nueva solicitud de borrado</h2>
    <p><b>${quien}</b> (${userEmail}) ha solicitado el borrado de su cuenta desde "Mi cuenta".</p>
    <p>Rol: ${ROLE_LABELS[role] || role}</p>
    <p>Revísalo y procésalo manualmente desde Supabase — este flujo todavía no borra datos automáticamente.</p>
  `,
    { preheader: `Solicitud de borrado de cuenta: ${quien}` }
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

export function newSignupAdminEmail({ type, firstName, lastName, email, professionalTitle, provider, orgName, createdAt }) {
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
    ['Acceso', provider === 'google' ? 'Google' : 'Email y contraseña'],
    fecha ? ['Alta', fecha] : null,
  ].filter(Boolean);
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">${esOrg ? 'Nueva organización en GovTalent' : 'Nuevo registro en GovTalent'}</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;font-size:14px;">
      ${filas
        .map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#8b8780;">${k}</td><td style="padding:3px 0;">${esc(v)}</td></tr>`)
        .join('')}
    </table>
    ${button(esOrg ? 'Ver organizaciones' : 'Ver usuarios', `${SITE_URL}/backoffice/${esOrg ? 'organizaciones' : 'usuarios'}`)}
  `,
    { preheader: esc(subject) }
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
    { preheader: 'La tramitaremos en un plazo máximo de un mes' }
  );
  return { subject, html };
}

/**
 * Suscripción personal Pro activada. Se envía una vez, al completar el
 * checkout. `foundingMember` añade el recordatorio del precio de renovación.
 */
export function proActivatedEmail({ firstName, foundingMember = false }) {
  const subject = 'Tu suscripción Pro está activa';
  const html = shell(
    `
    ${saludo(firstName)}
    <p>Tu suscripción <b>Pro</b> ya está activa. Desde ahora puedes seguir iniciativas, normas y organizaciones, recibir alertas diarias de tu sector y usar el resto de funciones reservadas a Pro.</p>
    ${
      foundingMember
        ? '<p style="padding:14px 16px;background:#f0eefe;border-radius:10px;font-size:13.5px;color:#3C3489;">Como Founding Member, tu primer año cuesta 30 €. A partir de la renovación se aplicará el precio vigente de Pro.</p>'
        : ''
    }
    ${button('Acceder a GovTalent', `${SITE_URL}/radar`, '#6d5aef')}
    ${notaPie('Stripe te enviará el recibo por separado. Tus facturas y el método de pago están en Mi cuenta.')}
  `,
    { preheader: 'Ya tienes acceso a las funciones Pro' }
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
    ${button('Ir al panel de la organización', `${SITE_URL}/organizations/admin`)}
    ${notaPie('Stripe te enviará el recibo por separado. Las facturas están en la pestaña Plan del panel.')}
  `,
    { preheader: 'El plan Teams está activo' }
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
    { preheader: 'Publica ofertas sin límite y gestiona candidaturas con IA' }
  );
  return { subject, html };
}

/**
 * Recordatorio para completar el perfil profesional. Llega unos días
 * después de la bienvenida, una sola vez y solo si el perfil sigue vacío.
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
    { preheader: 'Unos minutos para tener tu perfil listo' }
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
        ${x.sector ? `<span style="font-size:11px;color:#3C3489;background:#f0eefe;padding:3px 8px;border-radius:11px;">${x.sector}</span><br/>` : ''}
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
        <a href="${SITE_URL}${x.ruta || '/alarmas'}" style="color:#1a1a18;text-decoration:none;">${acortar(x.title)}</a><br/>
        <span style="color:#8b8780;font-size:13px;">${acortar(x.detail || '', 70)}</span>
      </div>`
        )
        .join('')}
      <div style="height:16px;"></div>`;

  const html = shell(
    `
    <div style="font-size:19px;color:#1a1a18;font-weight:500;letter-spacing:-.3px;margin-bottom:5px;">Hola${firstName ? ` ${firstName}` : ''}</div>
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:30px;line-height:1.55;">${entradilla}</div>
    ${bloqueEstaSemana}
    ${bloquePlazos}
    ${bloquePublicado}
    ${bloqueNovedades}
    ${button('Ver mis alarmas', `${SITE_URL}/alarmas`, '#6d5aef')}
  `,
    {
      preheader:
        s > 0
          ? `${s} ${s === 1 ? 'cierra' : 'cierran'} en los próximos siete días`
          : p > 0
            ? `${p} ${p === 1 ? 'plazo se acerca' : 'plazos se acercan'}`
            : b > 0
              ? `${b} ${b === 1 ? 'norma publicada' : 'normas publicadas'}`
              : `${n} ${n === 1 ? 'novedad' : 'novedades'}`,
      footerExtra: unsubscribeUrl
        ? ` · <a href="${unsubscribeUrl}" style="color:#b8b4ac;">Dejar de recibir estos avisos</a>`
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
    <div style="font-size:19px;color:#1a1a18;font-weight:500;letter-spacing:-.3px;margin-bottom:5px;">Hola${firstName ? ` ${firstName}` : ''}</div>
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
      preheader:
        conPlazo > 0
          ? `${conPlazo} con plazo abierto`
          : `${total} ${total === 1 ? 'novedad' : 'novedades'} en tu sector`,
      footerExtra: unsubscribeUrl
        ? ` · <a href="${unsubscribeUrl}" style="color:#b8b4ac;">Ajustar mis avisos</a>`
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
            <div style="font-size:11px;color:#a8a49c;margin-bottom:4px;">${[m.fuente, m.alarma].filter(Boolean).join(' · ')}</div>
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
         ${n > 0 ? '<div style="height:1px;background:#ecebe6;margin:6px 0 22px;"></div>' : ''}`
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
    ? `<div style="margin-top:26px;padding:14px 16px;background:#f0eefe;border-radius:10px;font-size:12.5px;color:#3c3489;line-height:1.55;">
         Con Pro te avisamos el mismo día en que se abre un plazo, te recordamos cuándo cierra y puedes tener hasta 3 alarmas.
         <a href="${SITE_URL}/precios" style="color:${MORADO};">Ver Pro</a>
       </div>`
    : '';

  const html = shell(
    `
    <div style="font-size:19px;color:#1a1a18;font-weight:500;letter-spacing:-.3px;margin-bottom:5px;">Hola${firstName ? ` ${firstName}` : ''}</div>
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:28px;line-height:1.55;">${intro}</div>
    ${bloquePlazos}
    ${bloqueNovedades}
    <div style="height:8px;"></div>
    ${button('Ver mis alarmas', `${SITE_URL}/alarmas`, MORADO)}
    ${pro}
  `,
    {
      preheader:
        nr > 0
          ? `${nr} ${nr === 1 ? 'plazo cierra' : 'plazos cierran'} pronto`
          : conPlazo > 0
            ? `${conPlazo} con plazo abierto`
            : `${total} ${total === 1 ? 'novedad' : 'novedades'}`,
      footerExtra: ajustesUrl ? ` · <a href="${ajustesUrl}" style="color:#b8b4ac;">Ajustar mis alarmas</a>` : '',
    }
  );

  return { subject, html };
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
            ${a.notas?.length ? `<div style="font-size:12px;color:#a8a49c;margin-top:4px;line-height:1.5;">${a.notas.map(esc).join(' · ')}</div>` : ''}
          </td>
        </tr>
      </table>`;

  const bloque = (p, i) => `
      ${i > 0 ? '<div style="height:1px;background:#ecebe6;margin:6px 0 22px;"></div>' : ''}
      <div style="margin-bottom:14px;">
        <a href="${SITE_URL}${p.ruta}" style="font-size:15px;font-weight:500;color:#1a1a18;text-decoration:none;letter-spacing:-.2px;">${esc(p.nombre)}</a>
        ${p.cargo ? `<div style="font-size:12px;color:#a8a49c;margin-top:2px;line-height:1.45;">${esc(p.cargo)}</div>` : ''}
      </div>
      ${p.actos.map(acto).join('')}`;

  const html = shell(
    `
    <div style="font-size:19px;color:#1a1a18;font-weight:500;letter-spacing:-.3px;margin-bottom:5px;">Hola${firstName ? ` ${esc(firstName)}` : ''}</div>
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:28px;line-height:1.55;">${intro}</div>
    ${personas.map(bloque).join('')}
    <div style="font-size:12px;color:#a8a49c;margin:10px 0 24px;line-height:1.55;">Es la agenda anunciada por La Moncloa: puede cambiar a lo largo del día.</div>
    ${button('Ver mi seguimiento', `${SITE_URL}/alarmas`, MORADO)}
  `,
    {
      preheader: `${n} ${n === 1 ? 'acto' : 'actos'} en la agenda de hoy`,
      footerExtra: ajustesUrl ? ` · <a href="${ajustesUrl}" style="color:#b8b4ac;">Ajustar mis avisos</a>` : '',
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
  const separador = '<div style="height:1px;background:#ecebe6;margin:20px 0;"></div>';

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
        .join(' · ')}</div>`
    );
  }

  const bloqueTuyo =
    !esFree && tuyos.length > 0
      ? `<div style="background:#f0eefe;border-radius:10px;padding:14px 16px;margin-bottom:22px;">
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

  const subject = resumen.asunto || `Consejo de Ministros del ${diaTexto}`;

  const html = shell(
    `
    <div style="font-size:18px;color:#1a1a18;font-weight:500;letter-spacing:-.3px;margin-bottom:4px;">Hola${firstName ? ` ${esc(firstName)}` : ''}</div>
    <div style="color:#8b8780;font-size:13px;margin-bottom:22px;line-height:1.55;">El Consejo de Ministros del ${esc(diaTexto)} ha aprobado ${enumeracion}. Las normas se aplican cuando se publican en el BOE.</div>
    ${bloqueTuyo}
    ${bloques.join(separador)}
    <div style="font-size:11.5px;color:#a8a49c;margin:18px 0;line-height:1.5;">Fuente: Referencia oficial del Consejo de Ministros. Resúmenes elaborados con IA a partir del texto oficial.</div>
    ${button('Ver la Referencia completa', referenciaUrl, MORADO)}
    ${
      esFree
        ? `<div style="margin-top:20px;padding:13px 15px;background:#f0eefe;border-radius:10px;font-size:12.5px;color:#3c3489;line-height:1.55;">
             Con Pro te decimos qué de todo esto afecta a tu organización y te avisamos en el momento.
             <a href="${SITE_URL}/precios" style="color:${MORADO};">Ver Pro</a>
           </div>`
        : ''
    }
  `,
    {
      preheader: !esFree && tuyos.length > 0 ? `${tuyos.length === 1 ? 'Un asunto te afecta' : `${tuyos.length} asuntos te afectan`}` : `Lo aprobado: ${enumeracion}`,
      footerExtra: bajaUrl ? ` · <a href="${bajaUrl}" style="color:#b8b4ac;">Dejar de recibir este correo</a>` : '',
    }
  );

  return { subject, html };
}
