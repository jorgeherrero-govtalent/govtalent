import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { checkAndLogAiUsage } from '@/lib/aiRateLimit';
import { interpretarConsulta } from '@/lib/contactos';
import { normalizarFiltros, filtrosVacios, filtrosDeTexto, FILTROS_VACIOS } from '@/lib/contactosFiltros';
import { IDEAS } from '@/lib/contactosIdeas';
import { PRUEBA_BUSQUEDAS, PRUEBA_FILAS } from '@/lib/pruebaAIFinder';

// La prueba de AI Finder para las cuentas sin el Directorio (18-11-2026).
//
//   GET   cuántas búsquedas le quedan.
//   POST  body: { q }  hace una búsqueda de prueba.
//
// Son PRUEBA_BUSQUEDAS búsquedas en total, no al mes. De cada una salen
// las primeras PRUEBA_FILAS personas con nombre, cargo, unidad e
// institución, el total y cuántas tienen correo. El correo NO sale de
// aquí: solo se dice si lo hay (tiene_correo), que es lo que se enseña con
// un candado. Lo que protege el dato es que no viaja.
//
// Las búsquedas se cuentan en contactos_busquedas (sql/114): quien no
// tiene el Directorio no puede crear filas allí por ningún otro camino.
// Repetir una frase ya buscada (recargar la página) no gasta otra.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

async function previas(admin, userId) {
  const { data, error } = await admin
    .from('contactos_busquedas')
    .select('consulta, filtros, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return data || [];
}

async function sesion() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  return authData?.user || null;
}

export async function GET() {
  const user = await sesion();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = createAdminClient();
  try {
    const hechas = await previas(admin, user.id);
    return NextResponse.json(
      { quedan: Math.max(0, PRUEBA_BUSQUEDAS - hechas.length), de: PRUEBA_BUSQUEDAS },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[contactos/prueba]', e.message);
    return NextResponse.json({ error: 'No se pudo consultar la prueba' }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await sesion();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  // Con el Directorio no hay prueba: la búsqueda completa está en la página.
  if (await puedeVerContactos(admin, user.id)) {
    return NextResponse.json({ error: 'Ya tienes el Directorio' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const q = String(body.q || '').trim().slice(0, 500);
  if (q.length < 3) return NextResponse.json({ error: 'Describe a quién buscas' }, { status: 400 });

  let hechas;
  try {
    hechas = await previas(admin, user.id);
  } catch (e) {
    console.error('[contactos/prueba]', e.message);
    return NextResponse.json({ error: 'No se pudo hacer la búsqueda' }, { status: 500 });
  }
  const repetida = hechas.find((h) => igual(h.consulta, q));
  if (!repetida && hechas.length >= PRUEBA_BUSQUEDAS) {
    return NextResponse.json({ error: 'Has usado tus búsquedas de prueba', agotadas: true, quedan: 0, de: PRUEBA_BUSQUEDAS }, { status: 402 });
  }

  // La frase → filtros. Una búsqueda repetida usa los filtros que ya dio;
  // una de las recomendadas, sus filtros fijos; el resto pasa por la IA.
  let filtros;
  let origen = 'frase';
  const idea = IDEAS.find((x) => igual(x.texto, q));
  if (repetida) {
    filtros = normalizarFiltros(repetida.filtros || {});
  } else if (idea) {
    filtros = normalizarFiltros({ ...FILTROS_VACIOS, ...idea.filtros });
    origen = 'idea';
  } else {
    const uso = await checkAndLogAiUsage(user.id, 'contactos-busqueda');
    try {
      filtros = uso.allowed ? normalizarFiltros((await interpretarConsulta(q)).filtros || {}) : filtrosDeTexto(q);
    } catch (e) {
      console.error('[contactos/prueba] interpretar:', e.message);
      filtros = filtrosDeTexto(q);
    }
  }
  if (filtrosVacios(filtros)) filtros = filtrosDeTexto(q);

  const { data, error } = await admin.rpc('buscar_contactos', { p_filtros: filtros, p_desde: 0, p_cuantos: PRUEBA_FILAS });
  if (error) {
    console.error('[contactos/prueba]', error.message);
    return NextResponse.json({ error: 'No se pudo hacer la búsqueda' }, { status: 500 });
  }
  const total = Number(data?.total) || 0;

  // Cuántas de todas tienen correo: la misma búsqueda, solo con correo.
  let conCorreo = null;
  if (filtros.correo === 'sin') conCorreo = 0;
  else {
    const r = await admin.rpc('buscar_contactos', { p_filtros: { ...filtros, correo: 'con' }, p_desde: 0, p_cuantos: 1 });
    if (!r.error) conCorreo = Number(r.data?.total) || 0;
  }

  const filas = (data?.filas || []).map((f) => ({
    id: f.id,
    nombre: f.nombre || null,
    cargo: f.cargo || null,
    unidad: f.unidad || null,
    institucion: f.institucion || null,
    tiene_correo: Boolean(f.email),
  }));

  if (!repetida) {
    const { error: e2 } = await admin.from('contactos_busquedas').insert({
      user_id: user.id,
      consulta: q,
      origen,
      filtros,
      total,
      en_pagina: filas.length,
      con_correo: filas.filter((f) => f.tiene_correo).length,
    });
    if (e2) console.error('[contactos/prueba] registrar:', e2.message);
  }

  const usadas = hechas.length + (repetida ? 0 : 1);
  return NextResponse.json(
    { consulta: q, filas, total, conCorreo, quedan: Math.max(0, PRUEBA_BUSQUEDAS - usadas), de: PRUEBA_BUSQUEDAS },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
