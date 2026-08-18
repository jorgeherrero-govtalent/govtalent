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
                <span style="font-size:19px;font-weight:800;color:#1a1a18;">gov<span style="background:#1d6f5c;color:#ffffff;padding:2px 7px;border-radius:5px;">talent</span></span>
                <div style="font-size:11.5px;color:#a8a49c;margin-top:9px;line-height:1.5;">La plataforma all in one del ecosistema profesional de los asuntos públicos</div>
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
                © ${new Date().getFullYear()} GovTalent · Todo lo que necesitas para crecer. En un único lugar.<br/>
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

export function welcomeCandidateEmail({ firstName }) {
  const subject = `¡Bienvenido/a a GovTalent, ${firstName}!`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">Hola ${firstName},</h2>
    <p>Tu perfil ya está listo en GovTalent, la plataforma de talento para el sector de los asuntos públicos, la política y el gobierno en España.</p>
    <p>Desde aquí puedes explorar el directorio de organizaciones del sector, aplicar a ofertas de empleo y dejar que la IA te ayude a completar tu perfil y tus cartas de presentación.</p>
    ${button('Explorar ofertas de empleo', `${SITE_URL}/jobs`)}
    <p style="margin-top:22px;font-size:12.5px;color:#999;">Si no has creado esta cuenta, puedes ignorar este email.</p>
  `,
    { preheader: 'Tu perfil ya está listo en GovTalent' }
  );
  return { subject, html };
}

export function welcomeOrganizationEmail({ orgName, firstName }) {
  const subject = `¡Bienvenida a GovTalent, ${orgName}!`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">Hola ${firstName},</h2>
    <p>La página de <b>${orgName}</b> ya está creada en GovTalent. A partir de ahora puedes publicar ofertas de empleo y acceder a los profesionales del sector de los asuntos públicos y el gobierno en España.</p>
    <p>Tu perfil aparecerá como <b>no verificado</b> hasta que completes la información de la organización — te recomendamos hacerlo cuanto antes para dar más confianza a los candidatos.</p>
    ${button('Ir al panel de la organización', `${SITE_URL}/organizations/admin`)}
  `,
    { preheader: `La página de ${orgName} ya está creada en GovTalent` }
  );
  return { subject, html };
}

export function applicationConfirmationEmail({ firstName, jobTitle, orgName }) {
  const subject = `Hemos recibido tu solicitud para ${jobTitle}`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">¡Solicitud enviada, ${firstName}!</h2>
    <p>Tu candidatura para el puesto de <b>${jobTitle}</b> en <b>${orgName}</b> se ha enviado correctamente.</p>
    <p>Puedes hacer seguimiento del estado de tu solicitud en cualquier momento desde tu cuenta.</p>
    ${button('Ver mis solicitudes', `${SITE_URL}/profile/jobs`)}
  `,
    { preheader: `Tu candidatura a ${jobTitle} se ha enviado correctamente` }
  );
  return { subject, html };
}

export function newCandidacyEmail({ jobTitle, candidateName, orgName }) {
  const subject = `Nueva candidatura: ${candidateName} para ${jobTitle}`;
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

export function newClaimRequestEmail({ orgName, requesterName, requesterEmail }) {
  const subject = `Nueva solicitud de reclamación: ${orgName}`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">Nueva solicitud de reclamación</h2>
    <p><b>${requesterName}</b> (${requesterEmail}) ha solicitado reclamar la página de <b>${orgName}</b>, adjuntando un documento acreditativo.</p>
    <p>Revisa el documento y aprueba o rechaza la solicitud desde el backoffice.</p>
    ${button('Ver solicitudes de reclamación', `${SITE_URL}/backoffice/reclamaciones`)}
  `,
    { preheader: `${requesterName} quiere reclamar la página de ${orgName}` }
  );
  return { subject, html };
}

export function claimApprovedEmail({ firstName, orgName }) {
  const subject = `Reclamación aprobada: ya administras ${orgName}`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">¡Buenas noticias, ${firstName}!</h2>
    <p>Hemos verificado tu documentación y ya eres administrador/a de la página de <b>${orgName}</b> en GovTalent.</p>
    <p>Ya puedes completar la información de la organización, publicar ofertas de empleo y gestionar candidaturas.</p>
    ${button('Ir al panel de la organización', `${SITE_URL}/organizations/admin`)}
  `,
    { preheader: `Ya administras la página de ${orgName} en GovTalent` }
  );
  return { subject, html };
}

export function claimRejectedEmail({ firstName, orgName, reason }) {
  const subject = `No hemos podido verificar tu solicitud para ${orgName}`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">Hola ${firstName},</h2>
    <p>No hemos podido verificar tu solicitud para administrar la página de <b>${orgName}</b> en GovTalent.</p>
    ${reason ? `<p><b>Motivo:</b> ${reason}</p>` : ''}
    <p>Puedes volver a intentarlo con un documento distinto, o escribirnos si crees que se trata de un error.</p>
    ${button('Ver la página de la organización', `${SITE_URL}/organizations`)}
  `,
    { preheader: `No hemos podido verificar tu solicitud para ${orgName}` }
  );
  return { subject, html };
}

export function jobAlertEmail({ firstName, jobTitle, orgName, location, modality, reason, jobUrl, unsubscribeUrl }) {
  const MODALITY_LABELS = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };
  const subject = `Nueva oferta: ${jobTitle} en ${orgName}`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">Hola ${firstName},</h2>
    <p>${reason}</p>
    <div style="margin:18px 0;padding:16px 18px;background:#f4f3ee;border-radius:10px;">
      <div style="font-size:15px;font-weight:700;color:#1a1a18;margin-bottom:4px;">${jobTitle}</div>
      <div style="font-size:13px;color:#666;">${orgName} · ${location} · ${MODALITY_LABELS[modality] || modality}</div>
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

export function accountDeletionRequestEmail({ userName, userEmail, role }) {
  const subject = `Solicitud de borrado de cuenta: ${userName}`;
  const html = shell(
    `
    <h2 style="margin:0 0 14px;font-size:18px;color:#1a1a18;">Nueva solicitud de borrado</h2>
    <p><b>${userName}</b> (${userEmail}) ha solicitado el borrado de su cuenta desde "Mi cuenta".</p>
    <p>Rol: ${role}</p>
    <p>Revísalo y procésalo manualmente desde Supabase — este flujo todavía no borra datos automáticamente.</p>
  `,
    { preheader: `Solicitud de borrado de cuenta: ${userName}` }
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
export function weeklyDigestEmail({ firstName, novedades = [], plazos = [], totalSeguidos = 0, unsubscribeUrl }) {
  const n = novedades.length;
  const p = plazos.length;

  // El asunto dice lo más urgente: un plazo que vence pesa más que un
  // cambio de fase.
  const subject =
    p > 0
      ? `${p} ${p === 1 ? 'plazo se acerca' : 'plazos se acercan'} en lo que sigues`
      : `${n} ${n === 1 ? 'novedad' : 'novedades'} en lo que sigues`;

  const bloquePlazos =
    p === 0
      ? ''
      : `
      <div style="font-size:11px;color:#a8a49c;letter-spacing:.4px;margin-bottom:16px;">PLAZOS</div>
      ${plazos
        .map(
          (x, i) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${i === plazos.length - 1 ? 26 : 18}px;">
        <tr>
          <td width="44" valign="top" style="padding-right:16px;">
            <div style="font-size:24px;font-weight:500;color:#1d6f5c;line-height:1;letter-spacing:-.5px;">${x.dias}</div>
            <div style="font-size:11px;color:#b8b4ac;margin-top:2px;">${x.dias === 1 ? 'día' : 'días'}</div>
          </td>
          <td valign="top" style="padding-bottom:${i === plazos.length - 1 ? 26 : 18}px;border-bottom:1px solid #f2f0ec;">
            <a href="${SITE_URL}${x.ruta}" style="font-size:14.5px;color:#1a1a18;text-decoration:none;line-height:1.45;letter-spacing:-.1px;">${x.title}</a>
            ${x.fuente ? `<div style="font-size:12px;color:#b8b4ac;margin-top:5px;">${x.fuente}</div>` : ''}
          </td>
        </tr>
      </table>`
        )
        .join('')}`;

  const bloqueNovedades =
    n === 0
      ? ''
      : `
      <div style="font-size:11px;color:#a8a49c;letter-spacing:.4px;margin-bottom:16px;">NOVEDADES</div>
      ${novedades
        .map(
          (x) => `
      <div style="font-size:14.5px;line-height:1.55;margin-bottom:14px;letter-spacing:-.1px;">
        <a href="${SITE_URL}${x.ruta || '/seguimiento'}" style="color:#1a1a18;text-decoration:none;">${x.title}</a><br/>
        <span style="color:#8b8780;font-size:13px;">${x.detail || ''}</span>
      </div>`
        )
        .join('')}
      <div style="height:16px;"></div>`;

  const html = shell(
    `
    <div style="font-size:19px;color:#1a1a18;font-weight:500;letter-spacing:-.3px;margin-bottom:5px;">Hola${firstName ? ` ${firstName}` : ''}</div>
    <div style="color:#8b8780;font-size:13.5px;margin-bottom:30px;line-height:1.55;">Esto se ha movido en los ${totalSeguidos} ${totalSeguidos === 1 ? 'asunto que sigues' : 'asuntos que sigues'}.</div>
    ${bloquePlazos}
    ${bloqueNovedades}
    ${button('Ver mi seguimiento', `${SITE_URL}/seguimiento`, '#6d5aef')}
  `,
    {
      preheader:
        p > 0 ? `${p} ${p === 1 ? 'plazo se acerca' : 'plazos se acercan'}` : `${n} ${n === 1 ? 'novedad' : 'novedades'}`,
      footerExtra: unsubscribeUrl
        ? ` · <a href="${unsubscribeUrl}" style="color:#b8b4ac;">Dejar de recibir estos avisos</a>`
        : '',
    }
  );

  return { subject, html };
}
