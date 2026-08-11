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

// Diagnóstico de la ficha de biografía de un ministro/a, para ver cómo está
// construido de verdad el bloque de texto de la trayectoria.
export async function diagnoseBioPage() {
  const url = 'https://www.lamoncloa.gob.es/gobierno/Paginas/biografias-xv-legislatura/ministro-carlos-cuerpo.aspx';
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  const html = await res.text();

  function contextAround(needle, before = 100, after = 800) {
    const idx = html.indexOf(needle);
    if (idx < 0) return null;
    return html.slice(Math.max(0, idx - before), idx + after).replace(/\s+/g, ' ').trim();
  }

  return {
    http_status: res.status,
    html_length: html.length,
    around_rtestate: contextAround('ms-rtestate-field'),
    around_ingreso: contextAround('Ingresó') || contextAround('Licenciad'),
    around_biography_class: contextAround('class="biograf') || contextAround('id="biograf'),
  };
}

// Diagnóstico de la Agenda de la Comunicación: 1) cómo se ven las filas de
// persona+cargo en el HTML real, y 2) cómo descubrir los códigos Nivel2 de
// los 26 ministerios/vicepresidencias sin tener que adivinarlos uno a uno.
export async function diagnoseAgendaComunicacion() {
  const sectionUrl = 'https://www.lamoncloa.gob.es/serviciosdeprensa/agendacom/paginas/index.aspx?Nivel1=1&Nivel2=5';
  const sectionRes = await fetch(sectionUrl, { headers: BROWSER_HEADERS });
  const sectionHtml = await sectionRes.text();

  function contextAround(html, needle, before = 100, after = 900) {
    const idx = html.indexOf(needle);
    if (idx < 0) return null;
    return html.slice(Math.max(0, idx - before), idx + after).replace(/\s+/g, ' ').trim();
  }

  // Buscamos el selector "Nivel 3" (cada ministerio dentro de "Gobierno y
  // Administración Central") — puede ser un <select> con <option value=...>
  // o una lista de enlaces con Nivel3= en el href.
  const nivel3Options = [...sectionHtml.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]+)</g)].slice(0, 40);
  const nivel3Links = [...sectionHtml.matchAll(/Nivel3=(\d+)[^"']*["'][^>]*>([^<]+)</g)].slice(0, 40);

  const idxSelect = sectionHtml.indexOf('agendaComunicacion_selectNivel3');
  const aroundSelectId = idxSelect >= 0 ? sectionHtml.slice(idxSelect, idxSelect + 3000).replace(/\s+/g, ' ').trim() : '(no aparece "agendaComunicacion_selectNivel3" en el HTML)';

  // Probamos si Nivel3 funciona como simple parámetro GET en la URL (como
  // Nivel2), o si de verdad hace falta enviar el formulario completo.
  const testUrl =
    'https://www.lamoncloa.gob.es/serviciosdeprensa/agendacom/paginas/index.aspx?Nivel1=1&Nivel2=5&Nivel3=531-G';
  const testRes = await fetch(testUrl, { headers: BROWSER_HEADERS });
  const testHtml = await testRes.text();
  const testHasExteriores = testHtml.includes('Asuntos Exteriores');
  const testHasPresidencia = testHtml.includes('Presidencia del Gobierno') && !testHtml.includes('Secretaria de Estado de Comunicación');

  // No funcionó como GET simple — necesitamos enviar el formulario ASP.NET
  // completo. Buscamos los campos ocultos habituales (__VIEWSTATE y
  // compañía) y el nombre real (name=) del <select>, no solo su id.
  function extractHiddenValue(fieldId) {
    const re = new RegExp(`id="${fieldId}"[^>]*value="([^"]*)"`);
    const m = sectionHtml.match(re);
    return m ? m[1].length : null; // solo la longitud, son campos larguísimos
  }
  const selectNameMatch = sectionHtml.match(/<select[^>]*id="ctl00_PlaceHolderMain_DisplayMode_agendaComunicacion_selectNivel3"[^>]*name="([^"]+)"/);
  const formActionMatch = sectionHtml.match(/<form[^>]*action="([^"]*)"/);
  const formNameMatch = sectionHtml.match(/<form[^>]*name="([^"]*)"/);

  return {
    section_http_status: sectionRes.status,
    section_html_length: sectionHtml.length,
    test_get_nivel3_status: testRes.status,
    test_contains_asuntos_exteriores: testHasExteriores,
    test_still_shows_presidencia: testHasPresidencia,
    viewstate_length: extractHiddenValue('__VIEWSTATE'),
    viewstategenerator_length: extractHiddenValue('__VIEWSTATEGENERATOR'),
    eventvalidation_length: extractHiddenValue('__EVENTVALIDATION'),
    select_name_attribute: selectNameMatch ? selectNameMatch[1] : null,
    form_action: formActionMatch ? formActionMatch[1] : null,
    form_name: formNameMatch ? formNameMatch[1] : null,
  };
}
