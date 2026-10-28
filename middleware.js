import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Páginas legales: accesibles sin sesión y desde la propia pantalla de login.
// Deben poder consultarse antes de registrarse y antes de aceptar las
// condiciones en el proceso de contratación.
// /bot explica qué es GovTalentBot a las webs que lee: tiene que poder
// abrirla cualquiera, sin cuenta.
// /elecciones-29n es una página de contenido abierta para compartir.
const PUBLIC_LEGAL_PATHS = ['/legal', '/privacidad', '/cookies', '/condiciones', '/bot', '/elecciones-29n'];

// Secciones ocultas desde el 04-10-2026: Organizaciones (el directorio y
// sus páginas públicas), Empleos (listado, ofertas públicas y candidatos)
// y el perfil. Quien llegue por un enlace antiguo va a la portada. El
// panel de la propia organización (/organizations/admin) y el alta
// (/organizations/new) siguen, porque de ahí cuelgan el plan y la factura.
// Para volver a enseñarlas, basta con quitarlas de esta lista (y devolver
// sus entradas a MenuLateral, BarraMovil, MenuUsuario y BuscadorGlobal).
function estaOculta(path) {
  if (path === '/jobs' || path.startsWith('/jobs/')) return true;
  if (path.startsWith('/empleo/') || path.startsWith('/candidates')) return true;
  if (path === '/profile' || path.startsWith('/profile/')) return true;
  if (path === '/organizations' || path === '/organizations/') return true;
  if (path.startsWith('/organizations/') && !path.startsWith('/organizations/admin') && !path.startsWith('/organizations/new')) return true;
  return false;
}

export async function middleware(request) {
  if (estaOculta(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

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

  // Portada pública: quien llega a / sin sesión ve la landing, con la misma
  // dirección (reescritura, no redirección: es lo que indexa Google). Con
  // sesión, / sigue siendo el Asistente. /landing no se sirve por sí sola:
  // vuelve a / para que la portada tenga una única dirección.
  if (path === '/landing') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url, 308);
  }
  if (!user && path === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/landing';
    return NextResponse.rewrite(url);
  }

  const isAuthRoute = path === '/login' || path.startsWith('/auth');
  const isOnboarding = path.startsWith('/onboarding');
  const isPublicJobPage = path.startsWith('/empleo/');
  const isBackoffice = path.startsWith('/backoffice');
  const isPublicOrgPage =
    path.startsWith('/organizations/') &&
    !path.startsWith('/organizations/admin') &&
    !path.startsWith('/organizations/new');
  const isPublicUnsubscribe = path.startsWith('/api/alerts/unsubscribe');
  const isPublicLegal = PUBLIC_LEGAL_PATHS.includes(path);
  // Los calendarios de suscripción (.ics) los piden Google, Apple y
  // Outlook sin sesión cada pocas horas. Sin esto recibían el login.
  const isPublicCalendar = path.startsWith('/calendario/');
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
    // El correo del Consejo de Ministros, igual (cron cada 15 minutos).
    path.startsWith('/api/alerts/consejo') ||
    // El correo único de leyes caducadas con la disolución (manual).
    path.startsWith('/api/alerts/caducadas') ||
    path.startsWith('/api/alarmas/vigilar') ||
    path.startsWith('/api/cron/');

  if (
    !user &&
    !isAuthRoute &&
    !isPublicJobPage &&
    !isPublicOrgPage &&
    !isPublicUnsubscribe &&
    !isPublicLegal &&
    !isPublicCalendar &&
    !isInternalSync &&
    !isScheduledEmail
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Los precios solo se ven con sesión (28-10-2026). Quien llega a
    // /precios desde un correo o un enlace antiguo vuelve ahí al entrar.
    if (path === '/precios') url.search = '?redirect=/precios';
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
