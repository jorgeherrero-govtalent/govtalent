import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';

// POST /api/extension/foto  (multipart)  persona_id, foto, origen_url?
//
// La extensión de Chrome manda la foto del perfil de LinkedIn de alguien
// que ya está en el directorio (decisión de Jorge, 12-11-2026). Se guarda
// una copia propia en Storage y queda en directorio_fotos (sql/131).
//
// Lo que llega de un navegador no es de fiar:
//  - solo con sesión y con el Directorio contratado;
//  - la persona tiene que existir en el directorio;
//  - tiene que ser una imagen de verdad (se miran sus primeros bytes, no
//    lo que diga el navegador) y pesar menos de 1 MB;
//  - la primera foto se queda: no se puede pisar la de alguien desde fuera.
//    Para cambiarla hay que borrar su fila en directorio_fotos.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BUCKET = 'directorio-fotos';
const MAX_BYTES = 1024 * 1024;

function tipoDe(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const userId = authData.user.id;

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, userId))) return NextResponse.json({ error: 'Es del Directorio' }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const personaId = String(form?.get('persona_id') || '').slice(0, 120);
  const archivo = form?.get('foto');
  if (!personaId || !archivo || typeof archivo.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Faltan la persona o la foto' }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'La foto pesa demasiado' }, { status: 413 });

  let origenUrl = null;
  try {
    const u = new URL(String(form.get('origen_url') || ''));
    if (u.protocol === 'https:' && u.hostname === 'www.linkedin.com' && u.pathname.startsWith('/in/')) origenUrl = (u.origin + u.pathname).slice(0, 300);
  } catch {}

  const { data: ya } = await admin.from('directorio_fotos').select('url').eq('persona_id', personaId).maybeSingle();
  if (ya?.url) return NextResponse.json({ url: ya.url, guardada: false });

  const { data: persona } = await admin.from('directorio_pro_mat').select('id').eq('id', personaId).maybeSingle();
  if (!persona) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 });

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const tipo = tipoDe(buffer);
  if (!tipo) return NextResponse.json({ error: 'No es una imagen válida' }, { status: 415 });

  // La ruta no se deduce del id: quien no tenga la fila no la adivina.
  const ruta = `${createHash('sha256').update(`${personaId}|${buffer.length}|${Date.now()}`).digest('hex').slice(0, 32)}.${tipo.ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(ruta, buffer, { contentType: tipo.mime, cacheControl: '604800', upsert: false });
  if (upErr) {
    console.error('[extension/foto] subida:', upErr.message);
    return NextResponse.json({ error: 'No se pudo guardar la foto' }, { status: 500 });
  }
  const url = admin.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;

  const { error: dbErr } = await admin
    .from('directorio_fotos')
    .insert({ persona_id: personaId, ruta, url, origen: 'linkedin', origen_url: origenUrl, subido_por: userId });
  if (dbErr) {
    // Otra pestaña la guardó a la vez: se retira esta copia y vale la primera.
    await admin.storage.from(BUCKET).remove([ruta]).catch(() => {});
    const { data: otra } = await admin.from('directorio_fotos').select('url').eq('persona_id', personaId).maybeSingle();
    if (otra?.url) return NextResponse.json({ url: otra.url, guardada: false });
    console.error('[extension/foto] guardado:', dbErr.message);
    return NextResponse.json({ error: 'No se pudo guardar la foto' }, { status: 500 });
  }
  return NextResponse.json({ url, guardada: true });
}
