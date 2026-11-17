// =====================================================================
// MCP — dónde se piden los permisos
// app/.well-known/oauth-protected-resource/[[...recurso]]/route.js
//
// Lo primero que lee un asistente al conectarse al MCP (RFC 9728): qué
// recurso es y qué servidor da los permisos. En GovTalent los da
// Supabase Auth, que hace de servidor OAuth 2.1 sobre los usuarios de
// siempre.
//
// Responde en las dos direcciones que prueban los asistentes:
//   /.well-known/oauth-protected-resource
//   /.well-known/oauth-protected-resource/api/mcp
//
// Es público por diseño: no contiene nada secreto.
// =====================================================================

import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from 'mcp-handler';

export const dynamic = 'force-dynamic';

export function GET(request) {
  const metadatos = generateProtectedResourceMetadata({
    authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    resourceUrl: `${getPublicOrigin(request)}/api/mcp`,
    additionalMetadata: {
      resource_name: 'GovTalent',
      bearer_methods_supported: ['header'],
    },
  });
  return new Response(JSON.stringify(metadatos), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

const opciones = metadataCorsOptionsRequestHandler();
export { opciones as OPTIONS };
