// =====================================================================
// CONTACTO DE UN DIPUTADO AUTONÓMICO — solo con el Directorio
// app/api/parlamentos-autonomicos/diputados/contacto/route.js
//
// Igual que /api/instituciones/diputados/contacto (Congreso): el correo
// que publica el parlamento es dato del Directorio. La columna `email`
// de ccaa_diputados está cerrada a los roles del navegador (sql/91), así
// que esta ruta, con la clave de servicio, es la única puerta, y solo la
// abre si el plan lo incluye.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Falta el diputado' }, { status: 400 });

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return NextResponse.json({ error: 'Tu plan no incluye el contacto de los diputados' }, { status: 403 });
  }

  const { data, error } = await admin.from('ccaa_diputados').select('email').eq('slug', slug).limit(1).maybeSingle();
  if (error) {
    console.error('[parlamentos-autonomicos/diputados/contacto]', error.message);
    return NextResponse.json({ error: 'No se pudo cargar el contacto' }, { status: 500 });
  }
  return NextResponse.json({ email: data?.email || null });
}
