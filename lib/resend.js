import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

// Dirección "From" verificada en Resend para el dominio govtalent.app.
// Debe coincidir con un dominio verificado en el panel de Resend.
export const EMAIL_FROM = 'GovTalent <hola@govtalent.app>';
