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
    .select('slug, email, unit_email, unit_phone, unit_website')
    .eq('active', true)
    .or(
      // En la ficha de un cargo cuenta también su correo personal (para no
      // ofrecer «Buscar correo» a quien ya lo tiene); en el listado, solo
      // el contacto de la unidad, que es lo que enseña su columna.
      slug ? 'email.not.is.null,unit_email.not.is.null,unit_phone.not.is.null,unit_website.not.is.null' : 'unit_email.not.is.null,unit_phone.not.is.null,unit_website.not.is.null'
    );
  if (slug) query = query.eq('slug', slug).limit(1);

  const { data, error } = await query;
  if (error) {
    console.error('[instituciones/contactos]', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar los contactos' }, { status: 500 });
  }

  const contactos = {};
  for (const fila of data || []) {
    contactos[fila.slug] = pro
      ? { ...(slug ? { email: fila.email } : {}), unit_email: fila.unit_email, unit_phone: fila.unit_phone, unit_website: fila.unit_website }
      : true;
  }

  // Ficha de un cargo sin contacto propio: el de esa misma persona en otra
  // fuente del directorio (p. ej. la Agenda de la Comunicación trae
  // prensa@csn.es y el teléfono del CSN para su presidente).
  if (slug && pro) {
    const c = contactos[slug];
    if (!c || (!c.email && !c.unit_email && !c.unit_phone)) {
      const otro = await contactoDeOtraFuente(admin, slug).catch(() => null);
      if (otro) contactos[slug] = { ...(c || {}), ...otro };
    }
  }

  return NextResponse.json({ pro, contactos });
}

const sinTildes = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function contactoDeOtraFuente(admin, slug) {
  const { data: g } = await admin.from('government_officials').select('nombre_display, dir3_code').eq('slug', slug).maybeSingle();
  if (!g?.nombre_display) return null;
  const { data: u } = await admin.from('age_units').select('nombre, raiz_nombre').eq('dir3_code', g.dir3_code).maybeSingle();
  const palabras = sinTildes(g.nombre_display).split(' ').filter((w) => w.length > 2);
  const apellido = palabras[palabras.length - 1];
  if (!apellido || palabras.length < 2) return null;
  const { data: filas } = await admin
    .from('directorio_pro')
    .select('id, nombre, institucion, unidad, email, email_unidad, telefono, fuente')
    .ilike('nombre', `%${apellido}%`)
    .not('id', 'like', 'es-ejecutivo:%')
    .limit(50);
  const lugares = [u?.nombre, u?.raiz_nombre].filter(Boolean).map(sinTildes);
  const casa = (filas || []).find((f) => {
    const n = sinTildes(f.nombre);
    if (!palabras.every((w) => n.includes(w))) return false;
    const suyos = [f.institucion, f.unidad].filter(Boolean).map(sinTildes);
    return suyos.some((x) => lugares.some((l) => l && (x === l || x.includes(l) || l.includes(x))));
  });
  if (!casa || (!casa.email && !casa.email_unidad && !casa.telefono)) return null;
  return {
    ...(casa.email ? { email: casa.email } : {}),
    ...(casa.email_unidad ? { unit_email: casa.email_unidad } : {}),
    ...(casa.telefono ? { unit_phone: casa.telefono } : {}),
    fuente_otra: casa.fuente || null,
  };
}
