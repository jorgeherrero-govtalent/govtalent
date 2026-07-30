import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Igual que /api/cv/signed-url: el bucket "claim-documents" es privado, y
// este es el único sitio que genera enlaces temporales para ver un
// documento de reclamación, comprobando explícitamente que quien lo pide
// es el propio solicitante o un superadmin de la plataforma.
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutos

export async function POST(request) {
  const { claimId } = await request.json();
  if (!claimId) {
    return NextResponse.json({ error: 'Falta claimId' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const uid = authData.user.id;
  const admin = createAdminClient();

  const { data: claim } = await admin.from('organization_claims').select('document_path, user_id').eq('id', claimId).single();
  if (!claim) {
    return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
  }

  const isOwner = claim.user_id === uid;
  let isSuperadmin = false;
  if (!isOwner) {
    const { data: requester } = await supabase.from('users').select('role').eq('id', uid).single();
    isSuperadmin = requester?.role === 'platform_admin';
  }

  if (!isOwner && !isSuperadmin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from('claim-documents')
    .createSignedUrl(claim.document_path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'No se pudo generar el enlace del documento' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
