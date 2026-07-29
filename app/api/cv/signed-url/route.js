import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// El bucket "cvs" es privado. Este endpoint es el único sitio de la app
// que genera enlaces temporales para ver un CV, y comprueba explícitamente
// quién tiene derecho a verlo en cada uno de los tres casos posibles:
//   - "own": el propio candidato viendo su CV
//   - "application": una organización viendo el CV adjunto a una candidatura suya
//   - "backoffice": el superadmin de la plataforma
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutos

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { context } = body;

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const uid = authData.user.id;
  const admin = createAdminClient();

  let path = null;

  if (context === 'own') {
    const { data: profile } = await supabase
      .from('candidate_profiles')
      .select('cv_url')
      .eq('user_id', uid)
      .single();
    if (!profile?.cv_url) {
      return NextResponse.json({ error: 'No tienes un CV subido' }, { status: 404 });
    }
    path = profile.cv_url;
  } else if (context === 'application') {
    const { applicationId } = body;
    if (!applicationId) {
      return NextResponse.json({ error: 'Falta applicationId' }, { status: 400 });
    }

    const { data: application } = await admin
      .from('job_applications')
      .select('cv_url_snapshot, candidate_id, jobs(organization_id)')
      .eq('id', applicationId)
      .single();

    if (!application?.cv_url_snapshot) {
      return NextResponse.json({ error: 'No hay CV asociado a esta candidatura' }, { status: 404 });
    }

    const isOwnApplication = application.candidate_id === uid;
    let isOrgMember = false;
    if (!isOwnApplication && application.jobs?.organization_id) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', uid)
        .eq('organization_id', application.jobs.organization_id)
        .maybeSingle();
      isOrgMember = !!membership;
    }

    if (!isOwnApplication && !isOrgMember) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    path = application.cv_url_snapshot;
  } else if (context === 'backoffice') {
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: 'Falta userId' }, { status: 400 });
    }

    const { data: requester } = await supabase.from('users').select('role').eq('id', uid).single();
    if (requester?.role !== 'platform_admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { data: profile } = await admin
      .from('candidate_profiles')
      .select('cv_url')
      .eq('user_id', userId)
      .single();
    if (!profile?.cv_url) {
      return NextResponse.json({ error: 'Este usuario no tiene CV subido' }, { status: 404 });
    }
    path = profile.cv_url;
  } else {
    return NextResponse.json({ error: 'Contexto no válido' }, { status: 400 });
  }

  const { data: signed, error: signErr } = await admin.storage.from('cvs').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'No se pudo generar el enlace del CV' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
