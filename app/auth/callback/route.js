import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const explicitNext = searchParams.get('next');

  let next = explicitNext || '/jobs';

  if (code) {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.exchangeCodeForSession(code);

    // Si no se pidió un destino concreto (p.ej. recuperar contraseña),
    // comprobamos si el usuario ya completó el onboarding. Los usuarios
    // que se registran con Google llegan aquí por primera vez sin haberlo
    // completado, así que hay que llevarlos ahí en vez de a Empleos.
    if (!explicitNext && sessionData?.user) {
      const { data: profile } = await supabase
        .from('users')
        .select('onboarding_completed')
        .eq('id', sessionData.user.id)
        .single();

      if (profile && !profile.onboarding_completed) {
        next = '/onboarding';
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
