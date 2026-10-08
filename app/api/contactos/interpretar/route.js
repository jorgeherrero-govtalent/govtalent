import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { checkAndLogAiUsage } from '@/lib/aiRateLimit';
import { interpretarConsulta, filtrosDeTexto } from '@/lib/contactos';

// POST /api/contactos/interpretar  body: { q }
// La frase del buscador → filtros editables. No gasta créditos.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return NextResponse.json({ error: 'El buscador de contactos es del Directorio, que se contrata aparte' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const q = String(body.q || '').trim();
  if (q.length < 3) return NextResponse.json({ error: 'Escribe a quién buscas' }, { status: 400 });

  const uso = await checkAndLogAiUsage(authData.user.id, 'contactos-busqueda');
  if (!uso.allowed) {
    // Sin IA, la búsqueda sigue funcionando con la frase como texto.
    return NextResponse.json({ filtros: filtrosDeTexto(q), resumen: '', aviso: uso.reason });
  }

  try {
    const { filtros, resumen, persona } = await interpretarConsulta(q);
    return NextResponse.json({ filtros, resumen, persona });
  } catch (e) {
    console.error('[contactos/interpretar]', e.message);
    return NextResponse.json({
      filtros: filtrosDeTexto(q),
      resumen: '',
      aviso: 'No hemos podido interpretar la frase con IA; buscamos por las palabras.',
    });
  }
}
