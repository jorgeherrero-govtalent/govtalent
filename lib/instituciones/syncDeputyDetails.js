import { createClient } from '@supabase/supabase-js';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Fase 2, paso 0: solo diagnóstico. No escribe nada en deputies todavía —
// solo comprueba si la página de búsqueda base ya trae codParlamentario en
// su HTML (lo que nos ahorraría 350 peticiones individuales), antes de
// construir el parser definitivo a ciegas.
export async function diagnoseFase2() {
  // Primero cargamos la página normal para sacar el token de seguridad
  // (p_auth) que Liferay exige en las peticiones AJAX de tipo "resource".
  const pageRes = await fetch('https://www.congreso.es/es/busqueda-de-diputados', { headers: BROWSER_HEADERS });
  const pageHtml = await pageRes.text();
  // res.headers.get('set-cookie') solo devuelve UNA cookie si el servidor
  // manda varias (JSESSIONID, GUEST_LANGUAGE_ID, etc.) — getSetCookie() las
  // trae todas, que es lo que de verdad hace falta reenviar.
  const cookieArray = typeof pageRes.headers.getSetCookie === 'function' ? pageRes.headers.getSetCookie() : [];
  const cookieHeader = cookieArray.map((c) => c.split(';')[0]).join('; ');

  const authMatch = pageHtml.match(/Liferay\.authToken\s*=\s*['"]([^'"]+)['"]/) || pageHtml.match(/p_auth['"]?\s*[:=]\s*['"]([^'"]+)['"]/);
  const pAuth = authMatch ? authMatch[1] : null;

  const url =
    'https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=searchDiputados&p_p_cacheability=cacheLevelPage' +
    (pAuth ? `&p_auth=${pAuth}` : '');

  const body = new URLSearchParams({
    _diputadomodule_idLegislatura: '15',
    _diputadomodule_genero: '',
    _diputadomodule_grupo: '',
    _diputadomodule_tipo: '0',
    _diputadomodule_nombre: '',
    _diputadomodule_apellidos: '',
    _diputadomodule_formacion: '',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      Referer: 'https://www.congreso.es/es/busqueda-de-diputados',
    },
    body,
  });

  const raw = await res.text();
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parseError = e.message;
  }

  return {
    p_auth_found: !!pAuth,
    p_auth_sample: pAuth ? pAuth.slice(0, 6) + '...' : null,
    cookies_found: cookieArray.length,
    cookie_names: cookieArray.map((c) => c.split('=')[0]),
    http_status: res.status,
    content_type: res.headers.get('content-type'),
    raw_length: raw.length,
    raw_first_800_chars: raw.slice(0, 800),
    parse_error: parseError,
    total_results: parsed?.data?.length ?? null,
    first_two_records: parsed?.data ? parsed.data.slice(0, 2) : null,
  };
}
