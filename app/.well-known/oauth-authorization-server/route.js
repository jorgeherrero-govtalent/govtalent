// =====================================================================
// MCP — compatibilidad con asistentes antiguos
// app/.well-known/oauth-authorization-server/route.js
//
// Los asistentes actuales leen /.well-known/oauth-protected-resource y
// de ahí van a Supabase Auth. Algunos anteriores a esa norma buscan la
// descripción del servidor de permisos en el propio dominio del MCP.
// Para ellos se devuelve aquí, tal cual, la de Supabase Auth.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function GET() {
  const origen = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`;
  try {
    const r = await fetch(origen, { cache: 'no-store' });
    if (!r.ok) return new Response(JSON.stringify({ error: 'not_available' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(await r.text(), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'not_available' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}
