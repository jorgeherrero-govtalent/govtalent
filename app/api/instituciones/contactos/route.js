import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';

// Contactos de las unidades de la AGE (email, teléfono y web del cargo).
//
// Antes el listado de ministerios y la ficha de cada cargo pedían estas
// columnas directamente a Supabase para cualquier usuario con sesión, y la
// página ponía el candado de Pro encima. Los datos llegaban igual al
// navegador. Ahora esas columnas están cerradas al cliente y solo salen de
// aquí, comprobando el plan en el servidor.
//
// Sin plan se devuelve únicamente QUÉ cargos tienen contacto (para poder
// enseñar el candado donde hay algo que vender), nunca el contacto.
//
//   GET /api/instituciones/contactos             → todos los cargos activos
//   GET /api/instituciones/contactos?slug=<slug> → un cargo

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();
  const pro = await puedeVerContactos(admin, authData.user.id);

  const slug = new URL(request.url).searchParams.get('slug');

  let query = admin
    .from('government_officials')
    .select('slug, unit_email, unit_phone, unit_website')
    .eq('active', true)
    .or('unit_email.not.is.null,unit_phone.not.is.null,unit_website.not.is.null');
  if (slug) query = query.eq('slug', slug).limit(1);

  const { data, error } = await query;
  if (error) {
    console.error('[instituciones/contactos]', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar los contactos' }, { status: 500 });
  }

  const contactos = {};
  for (const fila of data || []) {
    contactos[fila.slug] = pro
      ? { unit_email: fila.unit_email, unit_phone: fila.unit_phone, unit_website: fila.unit_website }
      : true;
  }

  return NextResponse.json({ pro, contactos });
}
