// =====================================================================
// MCP — quién llama y qué plan tiene
// lib/mcp/sesion.js
//
// El MCP de GovTalent (app/api/mcp) lo usan Claude, ChatGPT y otros
// asistentes en nombre de un usuario. El permiso lo da el propio usuario
// en GovTalent (/oauth/consent) y lo emite Supabase Auth, que hace de
// servidor OAuth 2.1: el asistente llega aquí con un token de acceso que
// es un JWT de Supabase con un dato más, `client_id` (qué asistente es).
//
//   verificarToken()  comprueba el token contra Supabase Auth. Solo
//                     valen los que traen `client_id`: un token de
//                     sesión normal del navegador no abre el MCP.
//   contextoDe()      lo que necesita cada herramienta: el usuario, su
//                     plan y dos clientes de base de datos.
//
// DOS CLIENTES, COMO EN /api/alarmas/guardar:
//   usuario  lleva el token del usuario, así que pasa por el RLS y por
//            los triggers de límites. Todo lo que es SUYO (alarmas,
//            seguimientos, tareas, proyectos) se lee y se escribe con él.
//   admin    service_role, para los datos comunes (normativa, directorio)
//            y para saber el plan.
//
// Solo servidor.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { nivelAvisos } from '@/lib/nivelAvisos';
import { puedeVerContactos } from '@/lib/accesoContactos';

export const WEB = 'https://govtalent.app';

// Sin caché de Next: las lecturas de Supabase se quedaban congeladas
// (ver engineering-learnings). Vale para los dos clientes.
const sinCache = (url, options = {}) => fetch(url, { ...options, cache: 'no-store' });

function clienteAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: sinCache },
  });
}

function clienteUsuario(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: sinCache, headers: { Authorization: `Bearer ${token}` } },
  });
}

/** El contenido del JWT, sin comprobar la firma: eso lo hace Supabase Auth. */
export function contenidoDelToken(token) {
  try {
    const medio = String(token || '').split('.')[1];
    if (!medio) return null;
    return JSON.parse(Buffer.from(medio, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Para withMcpAuth. Devuelve los datos de quien llama, o undefined si el
 * token no vale (el asistente recibe un 401 y vuelve a pedir permiso).
 */
export async function verificarToken(_req, bearer) {
  if (!bearer) return undefined;
  const datos = contenidoDelToken(bearer);
  if (!datos?.sub || !datos?.client_id) return undefined;

  const { data, error } = await clienteAdmin().auth.getUser(bearer);
  if (error || !data?.user || data.user.id !== datos.sub) return undefined;

  return {
    token: bearer,
    clientId: String(datos.client_id),
    scopes: String(datos.scope || '').split(' ').filter(Boolean),
    expiresAt: typeof datos.exp === 'number' ? datos.exp : undefined,
    extra: { userId: data.user.id, email: data.user.email || null },
  };
}

/**
 * El contexto de una llamada. `authInfo` es lo que devolvió verificarToken.
 *
 *   pago        tiene el plan de Vigilancia (propio o por su organización)
 *   directorio  tiene el Directorio contratado
 */
export async function contextoDe(authInfo) {
  const userId = authInfo?.extra?.userId;
  if (!userId || !authInfo?.token) throw new Error('SIN_SESION');

  const admin = clienteAdmin();
  const [nivel, directorio, { data: perfil }] = await Promise.all([
    nivelAvisos(admin, userId),
    puedeVerContactos(admin, userId),
    admin.from('users').select('first_name, last_name, plan, plan_usuarios, organizacion_nombre').eq('id', userId).limit(1).maybeSingle(),
  ]);

  return {
    userId,
    email: authInfo.extra.email || null,
    clientId: authInfo.clientId || null,
    admin,
    usuario: clienteUsuario(authInfo.token),
    nivel,
    pago: nivel === 'pro',
    directorio,
    perfil: perfil || {},
  };
}
