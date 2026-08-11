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
  const res = await fetch('https://www.congreso.es/es/busqueda-de-diputados', { headers: BROWSER_HEADERS });
  const html = await res.text();

  const codeMatches = [...html.matchAll(/codParlamentario=(\d+)/g)];
  const uniqueCodes = [...new Set(codeMatches.map((m) => m[1]))];

  const idx = html.indexOf('codParlamentario=');
  const around = idx >= 0 ? html.slice(Math.max(0, idx - 300), idx + 300).replace(/\s+/g, ' ').trim() : '(no aparece en absoluto)';

  return {
    http_status: res.status,
    html_length: html.length,
    total_codParlamentario_occurrences: codeMatches.length,
    unique_codes_found: uniqueCodes.length,
    sample_codes: uniqueCodes.slice(0, 5),
    context_around_first_match: around,
  };
}
