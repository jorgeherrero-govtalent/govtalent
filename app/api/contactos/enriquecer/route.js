import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { buscarCorreo } from '@/lib/buscarCorreo';

// POST /api/contactos/enriquecer
//   body: { id }                                   (id de directorio_pro)
//   body: { persona: { nombre, institucion } }     (alguien que no está en el directorio)
//   body: { persona, soloDentro: true }            (solo mira si ya está en el directorio; gratis)
//   body: { persona, forzar: true }                (el usuario ha dicho que no es ninguna de las de dentro)
//
// Una persona por llamada (la búsqueda tarda 20–40 s); «Enriquecer todos»
// las lanza desde el navegador de pocas en pocas. La búsqueda, la caché y
// el cobro están en lib/buscarCorreo.js, que comparte con el MCP.

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const userId = authData.user.id;

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, userId))) {
    return NextResponse.json({ error: 'Enriquecer contactos es del Directorio, que se contrata aparte' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const r = await buscarCorreo(admin, userId, body);
  return NextResponse.json(r.cuerpo, { status: r.status });
}
