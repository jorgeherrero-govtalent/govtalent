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

  function contextAround(needle, before = 150, after = 900) {
    const idx = html.indexOf(needle);
    if (idx < 0) return null;
    return html.slice(Math.max(0, idx - before), idx + after).replace(/\s+/g, ' ').trim();
  }

  return {
    http_status: res.status,
    readFormDiputados_full: contextAround('function readFormDiputados', 20, 1200),
    searchDiputados_function: contextAround('function searchDiputados', 20, 700),
    opendataExport_trigger: contextAround('opendataExport', 400, 900),
  };
}
