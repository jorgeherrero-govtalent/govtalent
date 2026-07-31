import crypto from 'crypto';

// Clave usada para firmar los enlaces de baja de alertas por email.
// Añade UNSUBSCRIBE_SECRET en las variables de entorno de Vercel (cualquier cadena aleatoria larga).
const SECRET = process.env.UNSUBSCRIBE_SECRET || 'govtalent-unsubscribe-fallback';

export function signAlertToken(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
}

export function verifyAlertToken(payload, token) {
  if (!token) return false;
  const expected = signAlertToken(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
