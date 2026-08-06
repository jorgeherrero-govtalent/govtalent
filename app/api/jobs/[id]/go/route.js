import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Todo candidato que pulsa "Aplicar en la web de la organización" pasa por
// aquí antes de llegar a la web externa — así queda registrado el clic
// (para el contador que ve la organización) y se añaden UTMs para que, si
// la organización ya usa analítica propia, vea también ahí cuánto tráfico
// le manda GovTalent. No requiere sesión: el enlace puede venir tanto de
// /jobs (candidato logueado) como de la ficha pública /empleo/[id].
export async function GET(request, { params }) {
  const { id } = params;
  const admin = createAdminClient();

  const { data: job } = await admin
    .from('jobs')
    .select('external_apply_url, application_mode')
    .eq('id', id)
    .maybeSingle();

  if (!job || job.application_mode !== 'externa' || !job.external_apply_url) {
    return NextResponse.redirect(new URL('/jobs', request.url));
  }

  // No bloqueamos la redirección si el contador falla por lo que sea — más
  // vale que el candidato llegue a la oferta a que se quede colgado.
  admin.rpc('increment_external_apply_clicks', { p_job_id: id }).catch(() => {});

  try {
    const target = new URL(job.external_apply_url);
    target.searchParams.set('utm_source', 'govtalent');
    target.searchParams.set('utm_medium', 'referral');
    target.searchParams.set('utm_campaign', id);
    return NextResponse.redirect(target.toString());
  } catch {
    // Si la URL guardada no es válida por algún motivo, redirige tal cual
    // en vez de romper la experiencia del candidato.
    return NextResponse.redirect(job.external_apply_url);
  }
}
