import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Páginas legales: accesibles sin sesión y desde la propia pantalla de login.
// Deben poder consultarse antes de registrarse y antes de aceptar las
// condiciones en el proceso de contratación.
const PUBLIC_LEGAL_PATHS = ['/legal', '/privacidad', '/cookies', '/condiciones'];

export async function middleware(request) {
  // El webhook de Stripe entra sin cookies de sesión: se autentica con la
  // firma criptográfica que se verifica dentro de la propia ruta. Si pasa por
  // la comprobación de sesión de abajo, el middleware lo redirige a /login con
  // un 307 y la ruta nunca llega a ejecutarse. Salimos antes de tocar nada.
  if (request.nextUrl.pathname.startsWith('/api/stripe/webhook')) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path === '/login' || path.startsWith('/auth');
  const isOnboarding = path.startsWith('/onboarding');
  const isPublicJobPage = path.startsWith('/empleo/');
  const isBackoffice = path.startsWith('/backoffice');
  const isPublicOrgPage =
    path.startsWith('/organizations/') &&
    !path.startsWith('/organizations/admin') &&
    !path.startsWith('/organizations/new');
  const isPublicUnsubscribe = path.startsWith('/api/alerts/unsubscribe');
  const isPublicPricing = path === '/precios';
  const isPublicLegal = PUBLIC_LEGAL_PATHS.includes(path);
  // Rutas de sincronización que llama Vercel Cron directamente (sin sesión
  // de usuario) — se autentican con su propio secreto dentro de la propia
  // ruta, no con el login normal de la app.
  const isInternalSync = path.startsWith('/api/sync/');
  // Los correos programados (resumen de los lunes y alertas diarias) también
  // los llama Vercel Cron sin sesión. Sin esta excepción el middleware los
  // redirigía a /login, el cron no sigue redirecciones y la ruta no llegaba
  // a ejecutarse nunca. Se autentican con CRON_SECRET o DEBUG_KEY dentro.
  //
  // La vigilancia de las alarmas es lo mismo: la lanza el cron tres veces
  // al día, sin sesión, y se autentica dentro con CRON_SECRET.
  const isScheduledEmail =
    path.startsWith('/api/alerts/weekly') ||
    path.startsWith('/api/alerts/daily') ||
    path.startsWith('/api/alarmas/vigilar') ||
    path.startsWith('/api/cron/');

  if (
    !user &&
    !isAuthRoute &&
    !isPublicJobPage &&
    !isPublicOrgPage &&
    !isPublicUnsubscribe &&
    !isPublicPricing &&
    !isPublicLegal &&
    !isInternalSync &&
    !isScheduledEmail
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (user && isBackoffice) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (profile?.role !== 'platform_admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html|txt|xml)$).*)',
  ],
};
