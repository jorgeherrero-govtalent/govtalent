import { Resend } from 'resend';

const client = new Resend(process.env.RESEND_API_KEY);

// El SDK de Resend no lanza excepción cuando el envío falla: devuelve
// { data: null, error }. Sin esto los fallos pasaban sin dejar rastro.
// Se registra en los logs de Vercel y se devuelve igual que antes, para no
// cambiar el comportamiento de ninguna ruta que ya lo usa.
const sendOriginal = client.emails.send.bind(client.emails);
client.emails.send = async (payload, options) => {
  const result = await sendOriginal(payload, options);
  if (result?.error) {
    const to = Array.isArray(payload?.to) ? payload.to.join(', ') : payload?.to;
    console.error(`[email] Resend rechazó "${payload?.subject}" para ${to}:`, result.error);
  }
  return result;
};

export const resend = client;

// Dirección "From" verificada en Resend para el dominio govtalent.app.
// Debe coincidir con un dominio verificado en el panel de Resend.
export const EMAIL_FROM = 'GovTalent <hola@govtalent.app>';
