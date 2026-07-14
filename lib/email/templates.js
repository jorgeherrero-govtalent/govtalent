const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

function shell(bodyHtml, { preheader = '' } = {}) {
  return `
<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f0efe9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <span style="display:none;font-size:1px;color:#f0efe9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0efe9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e0dfd8;">
            <tr>
              <td style="padding:22px 28px;border-bottom:1px solid #e0dfd8;">
                <span style="font-size:19px;font-weight:800;color:#1a1a18;">gov<span style="background:#1d6f5c;color:#ffffff;padding:2px 7px;border-radius:5px;">talent</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;color:#3a3a36;font-size:14px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;border-top:1px solid #e0dfd8;font-size:11.5px;color:#999;">
                © ${new Date().getFullYear()} GovTalent · La plataforma de talento para asuntos públicos, política y gobierno.<br/>
                <a href="${SITE_URL}/privacidad" style="color:#999;">Privacidad</a> ·
                <a href="${SITE_URL}/condiciones" style="color:#999;">Condiciones</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(text, url) {
  return `<a href="${url}" style="display:inline-block;background:#1d6f5c;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:13.5px;font-weight:600;margin-top:6px;">${text}</a>`;
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
