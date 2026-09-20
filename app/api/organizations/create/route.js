import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ORG_TYPES, SECTORS } from '@/lib/orgTaxonomy';
import { normalizeLocation } from '@/lib/normalizeLocation';

// Alta de una organización nueva desde la app.
//
// Antes el navegador hacía tres escrituras sueltas: insertar la
// organización, insertarse como miembro y cambiarse el rol a org_admin.
// Eso exigía que la base de datos dejara a cualquier cliente crear
// membresías y tocar su propio rol, que es justo lo que la auditoría
// señaló (puntos 1 y 2). Ahora lo hace el servidor con una lista cerrada
// de campos, y la base de datos rechaza esas escrituras desde el cliente.
//
// Lo que NUNCA entra desde aquí: verified, plan, is_premium, ids de
// Stripe. Una organización recién creada es "claimed" (la ha creado su
// representante) pero no está verificada hasta que lo revises.

const TIPOS_VALIDOS = new Set(ORG_TYPES.map(([value]) => value));
const SECTORES_VALIDOS = new Set(SECTORS.map(([value]) => value));

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const uid = authData.user.id;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const orgType = typeof body.orgType === 'string' ? body.orgType : '';
  const sector = typeof body.sector === 'string' && body.sector ? body.sector : null;
  const location = typeof body.location === 'string' ? body.location.trim() : '';

  if (!name || name.length > 200) {
    return NextResponse.json({ error: 'Indica el nombre de tu organización' }, { status: 400 });
  }
  if (!TIPOS_VALIDOS.has(orgType)) {
    return NextResponse.json({ error: 'Elige el tipo de organización' }, { status: 400 });
  }
  if (sector && !SECTORES_VALIDOS.has(sector)) {
    return NextResponse.json({ error: 'Sector no válido' }, { status: 400 });
  }
  if (!location || location.length > 200) {
    return NextResponse.json({ error: 'Indica al menos una sede' }, { status: 400 });
  }
  if (body.confirmaRepresentante !== true) {
    return NextResponse.json(
      { error: 'Confirma que eres representante autorizado de la organización' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Una organización por cuenta: se comprueba aquí con service_role, no
  // con lo que el navegador diga haber comprobado.
  const { data: yaMiembro } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', uid)
    .limit(1)
    .maybeSingle();
  if (yaMiembro) {
    return NextResponse.json(
      { error: 'Tu cuenta ya administra una organización. Recarga la página.' },
      { status: 409 }
    );
  }

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name,
      org_type: orgType,
      sector,
      location: normalizeLocation(location),
      claimed: true,
    })
    .select('id, slug')
    .single();

  if (orgErr || !org) {
    console.error('[organizations/create] No se pudo crear la organización:', orgErr?.message);
    return NextResponse.json({ error: 'No se pudo crear la página. Inténtalo de nuevo.' }, { status: 500 });
  }

  const { error: memberErr } = await admin.from('organization_members').insert({
    organization_id: org.id,
    user_id: uid,
    role: 'admin',
  });

  if (memberErr) {
    // Sin administrador la organización quedaría huérfana y reclamable:
    // se deshace el alta entera.
    console.error('[organizations/create] No se pudo crear la membresía:', memberErr.message);
    await admin.from('organizations').delete().eq('id', org.id);
    return NextResponse.json({ error: 'No se pudo crear la página. Inténtalo de nuevo.' }, { status: 500 });
  }

  // El rol solo sube de candidato a org_admin: un platform_admin que cree
  // una organización de prueba no pierde su rol.
  const { data: perfil } = await admin.from('users').select('role').eq('id', uid).maybeSingle();
  const cambios = { onboarding_completed: true };
  if (!perfil?.role || perfil.role === 'candidate') cambios.role = 'org_admin';
  const { error: userErr } = await admin.from('users').update(cambios).eq('id', uid);
  if (userErr) {
    console.error('[organizations/create] No se pudo actualizar el usuario:', userErr.message);
  }

  return NextResponse.json({ ok: true, organizationId: org.id, slug: org.slug });
}
