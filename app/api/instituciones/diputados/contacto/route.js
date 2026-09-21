// =====================================================================
// CONTACTO DE UN DIPUTADO — solo para Pro
// app/api/instituciones/diputados/contacto/route.js
//
// El correo institucional de los diputados lo publica el Congreso en su
// ficha oficial, y lo tienen 319 de los 350. Es dato de Pro.
//
// POR QUÉ UNA RUTA Y NO UN CAMPO MÁS DE LA FICHA. Si la página lo pide
// junto al resto y lo tapa en el cliente, el correo ya ha llegado al
// navegador y se lee en la pestaña de red. Es la misma fuga que se
// cerró en el directorio institucional: la comprobación del plan tiene
// que estar en el servidor, y el dato no puede salir de aquí cuando la
// respuesta es que no.
//
// Va con la clave de servicio a propósito: la columna `email` está
// cerrada a los roles del cliente (sql/53), así que esta ruta es la
// única puerta.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'Falta el diputado' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from('users')
    .select('plan')
    .eq('id', authData.user.id)
    .limit(1)
    .maybeSingle();

  if (perfil?.plan !== 'pro') {
    return NextResponse.json({ error: 'Tu plan no incluye el contacto de los diputados' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('deputies')
    .select('email')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[diputados/contacto]', error.message);
    return NextResponse.json({ error: 'No se pudo cargar el contacto' }, { status: 500 });
  }

  // Sin correo no es un error: hay 31 diputados que no lo publican. La
  // ficha lo dice con sus palabras en vez de dejar un hueco mudo.
  return NextResponse.json({ email: data?.email || null });
}
