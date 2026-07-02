import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/jobs';

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // El onboarding ya no se decide aquí: el layout de la app comprueba
  // en cada carga si el usuario lo tiene pendiente y, si es así, se lo
  // muestra como ventana obligatoria. Así funciona igual sin importar
  // por dónde entre el usuario (email, Google, enlace directo...).
  return NextResponse.redirect(`${origin}${next}`);
}
