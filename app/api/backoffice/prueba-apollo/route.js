// =====================================================================
// BACKOFFICE — prueba a ciegas de Apollo como proveedor de correos
// app/api/backoffice/prueba-apollo/route.js   (17-11-2026, temporal)
//
// Pasa por la API de Apollo (people/match) a personas del directorio cuyo
// correo nominativo ya conocemos, dándole solo el nombre, la organización
// y el dominio, y compara lo que devuelve con el correo real.
//
//   GET /api/backoffice/prueba-apollo            → la muestra, sin llamar a Apollo
//   GET /api/backoffice/prueba-apollo?ejecutar=1 → lanza la prueba
//   &n=60  personas (máximo 75: la cuenta gratuita tiene 80 créditos)
//
// Apollo cobra 1 crédito por persona encontrada. No se guarda nada: el
// resultado solo sale en la respuesta. Solo para platform_admin.
// Hace falta APOLLO_API_KEY en Vercel. Borrar la ruta al terminar la prueba.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { limpiar, pareceNoPersona, DOMINIOS_GENERICOS } from '@/lib/patronesCorreo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const GRUPOS = {
  'Cargos públicos': ['ejecutivo', 'legislativo', 'autonómico', 'local', 'órganos UE'],
  'Medios': ['medios'],
  'Organizaciones': ['sector público', 'agentes sociales', 'tercer sector', 'institucional'],
};
const MAX_PERSONAS = 75;

async function requireSuperadmin() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
  return profile?.role === 'platform_admin' ? authData.user : null;
}

// Orden fijo y repartido: la misma muestra en cada llamada.
function mezcla(texto) {
  let h = 2166136261;
  for (const c of `apollo-2026-11|${texto}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** «Almodóvar Sánchez, Emilia» → «Emilia Almodóvar Sánchez» */
const nombreNatural = (n) => {
  const t = String(n || '').replace(/\s+/g, ' ').trim();
  if (!t.includes(',')) return t;
  const [apellidos, nombre] = t.split(',').map((x) => x.trim());
  return `${nombre} ${apellidos}`.trim();
};

/** ¿El correo es de esa persona? Lleva en la parte local uno de sus apellidos o su nombre. */
function nominativo(nombre, email) {
  const local = limpiar(email.split('@')[0]).replace(/[^a-z]/g, '');
  return limpiar(nombre)
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4)
    .some((w) => local.includes(w));
}

async function muestra(admin, n) {
  const porGrupo = Math.ceil(n / Object.keys(GRUPOS).length);
  const elegidas = [];
  for (const [grupo, tipos] of Object.entries(GRUPOS)) {
    const filas = [];
    for (let desde = 0; desde < 8000; desde += 1000) {
      const { data, error } = await admin
        .from('directorio_pro_mat')
        .select('id, nombre, cargo, institucion, email')
        .in('tipo_institucion', tipos)
        .not('email', 'is', null)
        .order('id', { ascending: true })
        .range(desde, desde + 999);
      if (error) throw new Error(error.message);
      filas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const validas = filas
      .map((f) => ({ ...f, email: String(f.email).trim().toLowerCase() }))
      .filter((f) => /^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/.test(f.email))
      .filter((f) => !DOMINIOS_GENERICOS.has(f.email.split('@')[1]) && !pareceNoPersona(f.nombre) && nominativo(f.nombre, f.email))
      .sort((a, b) => mezcla(a.id) - mezcla(b.id));
    // Como mucho dos por dominio y una vez cada correo, para que no mande un solo organismo.
    const porDominio = new Map();
    const vistos = new Set();
    let cuantas = 0;
    for (const f of validas) {
      const dom = f.email.split('@')[1];
      if (vistos.has(f.email) || (porDominio.get(dom) || 0) >= 2) continue;
      vistos.add(f.email);
      porDominio.set(dom, (porDominio.get(dom) || 0) + 1);
      elegidas.push({ grupo, id: f.id, nombre: nombreNatural(f.nombre), cargo: f.cargo, institucion: f.institucion, esperado: f.email, dominio: dom });
      if (++cuantas >= porGrupo) break;
    }
  }
  return elegidas.slice(0, n);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function consultar(clave, p) {
  const q = new URLSearchParams({ name: p.nombre, organization_name: p.institucion || '', domain: p.dominio, reveal_personal_emails: 'false', reveal_phone_number: 'false' });
  const res = await fetch(`https://api.apollo.io/api/v1/people/match?${q}`, {
    method: 'POST',
    headers: { 'x-api-key': clave, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', accept: 'application/json' },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export async function GET(request) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const n = Math.min(MAX_PERSONAS, Math.max(3, Number(sp.get('n')) || 60));
  const admin = createAdminClient();
  let personas;
  try {
    personas = await muestra(admin, n);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  if (sp.get('ejecutar') !== '1') {
    return NextResponse.json({ ensayo: true, personas: personas.length, muestra: personas.map(({ grupo, nombre, institucion, dominio }) => ({ grupo, nombre, institucion, dominio })) });
  }

  const clave = process.env.APOLLO_API_KEY;
  if (!clave) return NextResponse.json({ error: 'Falta APOLLO_API_KEY en Vercel' }, { status: 500 });

  const filas = [];
  let parada = null;
  for (const p of personas) {
    let r;
    try {
      r = await consultar(clave, p);
    } catch (e) {
      parada = `Sin respuesta de Apollo: ${e.message}`;
      break;
    }
    if (r.status === 401 || r.status === 403 || r.status === 422 || r.status === 429) {
      parada = `Apollo respondió ${r.status}: ${String(r.json?.error || r.json?.message || '').slice(0, 200)}`;
      break;
    }
    const persona = r.json?.person || null;
    const email = String(persona?.email || '').trim().toLowerCase();
    // Apollo devuelve un correo de relleno cuando lo tiene pero el plan no lo desbloquea.
    const bloqueado = /email_not_unlocked/.test(email);
    const estado = !persona ? 'sin coincidencia' : bloqueado ? 'bloqueado por el plan' : !email ? 'sin correo' : email === p.esperado ? 'acierto' : 'distinto';
    filas.push({
      grupo: p.grupo,
      nombre: p.nombre,
      institucion: p.institucion,
      esperado: p.esperado,
      apollo: bloqueado ? null : email || null,
      estado,
      estado_correo: persona?.email_status || null,
      confianza: r.json?.match_confidence || persona?.match_confidence || null,
      cargo_apollo: persona?.title || null,
      organizacion_apollo: persona?.organization?.name || null,
    });
    await espera(1300); // 50 llamadas por minuto como mucho
  }

  const cuenta = (lista) => {
    const c = { personas: lista.length, acierto: 0, distinto: 0, 'sin correo': 0, 'sin coincidencia': 0, 'bloqueado por el plan': 0 };
    for (const f of lista) c[f.estado]++;
    const devueltos = c.acierto + c.distinto;
    return { ...c, cobertura: lista.length ? Math.round((devueltos / lista.length) * 100) : 0, precision: devueltos ? Math.round((c.acierto / devueltos) * 100) : null };
  };
  const resumen = { total: cuenta(filas) };
  for (const g of Object.keys(GRUPOS)) resumen[g] = cuenta(filas.filter((f) => f.grupo === g));

  return NextResponse.json({ parada, pedidas: personas.length, consultadas: filas.length, resumen, filas }, { headers: { 'Cache-Control': 'private, no-store' } });
}
