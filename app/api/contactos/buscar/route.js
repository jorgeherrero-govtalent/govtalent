import { reveladosDe } from '@/lib/revelados';
import { enriquecidoPublico } from '@/lib/enriquecidoPublico';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { normalizarFiltros, filtrosVacios } from '@/lib/contactosFiltros';
import { correosProbables, puedeVerProbables } from '@/lib/correosProbables';

// POST /api/contactos/buscar  body: { filtros, desde?, cuantos? }
// Ejecuta los filtros sobre directorio_pro (sql/75, buscar_contactos).
// Gratis. Solo con el Directorio: los contactos son lo que se vende.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const COLUMNAS = [
  'id', 'nombre', 'cargo', 'unidad', 'institucion', 'jurisdiccion', 'tipo_institucion', 'pais', 'banda',
  'es_titular', 'area', 'email', 'email_unidad', 'telefono', 'direccion_postal', 'localidad', 'provincia',
  'slug', 'fuente', 'fuente_fecha', 'contactabilidad',
];

const ORIGENES = ['frase', 'idea', 'filtros'];
const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ¿Sale la persona que se buscaba por nombre? Mismo criterio que la página:
// todas las palabras de su nombre (de más de 2 letras) en el de algún resultado.
function personaEncontrada(nombre, filas) {
  const palabras = sinTildes(nombre).split(/[^a-z]+/).filter((w) => w.length > 2);
  if (!palabras.length) return null;
  return filas.some((f) => {
    const n = sinTildes(f.nombre);
    return palabras.every((w) => n.includes(w));
  });
}

async function registrarBusqueda(admin, userId, body, filtros, total, filas) {
  try {
    const persona = body.persona ? String(body.persona).trim().slice(0, 200) : null;
    const { error } = await admin.from('contactos_busquedas').insert({
      user_id: userId,
      consulta: body.consulta ? String(body.consulta).trim().slice(0, 500) : null,
      origen: ORIGENES.includes(body.origen) ? body.origen : 'filtros',
      filtros,
      persona,
      persona_encontrada: persona ? personaEncontrada(persona, filas) : null,
      total,
      en_pagina: filas.length,
      con_correo: filas.filter((f) => f.email).length,
      con_enriquecido: filas.filter((f) => f.enriquecido?.email).length,
      con_probable: filas.filter((f) => f.probable).length,
    });
    if (error) console.error('[contactos/buscar] registrar:', error.message);
  } catch (e) {
    console.error('[contactos/buscar] registrar:', e.message);
  }
}

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return NextResponse.json({ error: 'El buscador de contactos es del Directorio, que se contrata aparte' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const filtros = normalizarFiltros(body.filtros || {});
  if (filtrosVacios(filtros)) return NextResponse.json({ total: 0, filas: [] });

  const desde = Math.max(0, Math.floor(Number(body.desde) || 0));
  const cuantos = Math.min(2000, Math.max(1, Math.floor(Number(body.cuantos) || 50)));

  const { data, error } = await admin.rpc('buscar_contactos', { p_filtros: filtros, p_desde: desde, p_cuantos: cuantos });
  if (error) {
    console.error('[contactos/buscar]', error.message);
    return NextResponse.json({ error: 'No se pudo hacer la búsqueda' }, { status: 500 });
  }

  const filas = (data?.filas || []).map((f) => Object.fromEntries(COLUMNAS.map((c) => [c, f[c] ?? null])));

  // Lo que ya se haya enriquecido (caché compartida, sql/76): se ve gratis.
  const ids = filas.map((f) => f.id);
  const enriquecidos = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: enr } = await admin
      .from('contactos_enriquecidos')
      .select('persona_id, estado, email, telefono, tipo, fuente_url, verificado, notas, created_at')
      .in('persona_id', ids.slice(i, i + 300));
    for (const e of enr || []) enriquecidos.set(e.persona_id, e);
  }
  // Un correo encontrado solo se enseña si el equipo ya lo ha pagado (sql/88).
  const conCorreo = [...enriquecidos.values()].filter((e) => e.email).map((e) => e.persona_id);
  const pagados = await reveladosDe(admin, authData.user.id, conCorreo);
  for (const f of filas) {
    const e = enriquecidos.get(f.id);
    f.enriquecido = e && (!e.email || pagados.has(e.persona_id)) ? enriquecidoPublico({ ...e, persona_id: undefined }) : null;
  }

  // Correo probable (sql/86): el patrón del organismo, para quien no tiene
  // correo ni enriquecido. Para todos los que tienen el Directorio (13-10-2026).
  if (puedeVerProbables()) {
    const sin = filas.filter((f) => !f.email && !(f.enriquecido?.estado === 'encontrado' && f.enriquecido?.email));
    const prob = await correosProbables(admin, sin).catch(() => ({}));
    for (const f of filas) f.probable = prob[f.id] || null;
  }

  // Registro de la búsqueda (sql/114): solo la primera página de unos filtros
  // nuevos, que es cuando el cliente manda registrar. Si falla, no se nota.
  if (body.registrar === true && desde === 0) {
    await registrarBusqueda(admin, authData.user.id, body, filtros, Number(data?.total) || 0, filas);
  }

  return NextResponse.json({ total: Number(data?.total) || 0, filas }, { headers: { 'Cache-Control': 'no-store' } });
}
