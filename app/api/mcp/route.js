// =====================================================================
// MCP DE GOVTALENT
// app/api/mcp/route.js
//
// La dirección que el usuario pega en su asistente (Claude, ChatGPT…)
// para que trabaje con GovTalent: https://govtalent.app/api/mcp
//
// CÓMO ENTRA UN ASISTENTE
//   1. Llama aquí sin permiso y recibe un 401 que le indica dónde está
//      descrito el acceso (/.well-known/oauth-protected-resource).
//   2. Ahí lee que quien da los permisos es Supabase Auth, se registra
//      y manda al usuario a iniciar sesión en GovTalent.
//   3. El usuario pulsa «Permitir» en /oauth/consent.
//   4. El asistente vuelve con un token y ya puede usar las herramientas.
//
// No guarda sesiones: cada petición se resuelve sola (Streamable HTTP
// sin estado), así que no necesita Redis ni nada más que esta ruta.
//
// Qué herramientas hay: lib/mcp/servidor.js.
// Quién llama y con qué plan: lib/mcp/sesion.js.
// Topes de uso y registro: lib/mcp/cuota.js.
//
// El middleware deja pasar esta ruta sin sesión de navegador: se
// autentica aquí, con el token.
// =====================================================================

import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { registrarHerramientas, INSTRUCCIONES } from '@/lib/mcp/servidor';
import { verificarToken } from '@/lib/mcp/sesion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 180; // buscar_correo tarda hasta un minuto

const servidor = createMcpHandler((server) => registrarHerramientas(server), {
  serverInfo: { name: 'GovTalent', version: '1.0.0' },
  instructions: INSTRUCCIONES,
});

const handler = withMcpAuth(servidor, verificarToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
});

export { handler as GET, handler as POST, handler as DELETE };
