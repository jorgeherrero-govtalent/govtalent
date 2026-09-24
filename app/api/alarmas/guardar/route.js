// =====================================================================
// ALARMAS — guardar una alarma nueva o editada
// app/api/alarmas/guardar/route.js
//
// La alarma se escribe CON LA SESIÓN DEL USUARIO, no con service_role:
// así pasa por el RLS (solo las suyas) y por el trigger del límite
// (sql/59), que es quien decide si cabe otra alarma activa y fuerza la
// frecuencia semanal en Free. Si el trigger dice que no, se devuelve su
// motivo traducido.
//
// Lo que el agente ya encontró abierto al proponerla se guarda como
// coincidencias de la alarma, MARCADAS COMO YA AVISADAS: el usuario las
// está viendo en pantalla, no son novedades para un correo. Eso sí se
// hace con service_role, porque el usuario no puede escribir
// coincidencias (solo marcarlas como vistas o descartarlas).
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient as crearClienteSesion } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { FUENTES_ALARMA, mensajeError } from '@/lib/alarmas';

export const dynamic = 'force-dynamic';

const FRECUENCIAS = new Set(['inmediato', 'diario', 'semanal']);

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

const textos = (v, max, largo = 120) =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x || '').trim().slice(0, largo))
    .filter(Boolean)
    .slice(0, max);

export async function POST(request) {
  const sesion = crearClienteSesion();
  const {
    data: { user },
  } = await sesion.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });

  let a;
  try {
    a = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición no válida.' }, { status: 400 });
  }

  const criterios = a?.criterios || {};
  const fila = {
    nombre: String(a?.nombre || '').trim().slice(0, 60) || 'Mi alarma',
    descripcion: String(a?.descripcion || '').trim().slice(0, 3000),
    keywords: textos(a?.keywords, 15, 60).map((k) => k.toLowerCase()),
    sectores: textos(a?.sectores, 6, 60),
    criterios: {
      resumen: String(criterios.resumen || '').trim().slice(0, 240),
      temas: textos(criterios.temas, 8, 60),
      normativa: textos(criterios.normativa, 8),
      territorios: textos(criterios.territorios, 10, 60),
      excluye: textos(criterios.excluye, 8),
    },
    fuentes: FUENTES_ALARMA,
    frecuencia: FRECUENCIAS.has(a?.frecuencia) ? a.frecuencia : 'semanal',
    activa: a?.activa !== false,
  };

  if (!fila.descripcion || fila.keywords.length === 0) {
    return NextResponse.json({ error: 'A la alarma le falta la descripción o los criterios.' }, { status: 400 });
  }

  // --- La alarma, con la sesión del usuario ---------------------------
  let guardada;
  if (a?.id) {
    const { data, error } = await sesion
      .from('sector_alerts')
      .update(fila)
      .eq('id', a.id)
      .eq('user_id', user.id)
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: mensajeError(error) }, { status: 409 });
    if (!data) return NextResponse.json({ error: 'No se ha encontrado esa alarma.' }, { status: 404 });
    guardada = data;
  } else {
    const { data, error } = await sesion
      .from('sector_alerts')
      .insert({ ...fila, user_id: user.id })
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: mensajeError(error) }, { status: 409 });
    guardada = data;
  }

  // --- Lo ya encontrado ------------------------------------------------
  const encaja = Array.isArray(a?.encaja) ? a.encaja.slice(0, 20) : [];
  if (guardada && encaja.length > 0) {
    const ahora = new Date().toISOString();
    const filas = encaja
      .filter((m) => m && m.kind && m.ref_id)
      .map((m) => ({
        alert_id: guardada.id,
        user_id: user.id,
        kind: String(m.kind),
        ref_id: String(m.ref_id),
        titulo: String(m.titulo || '').slice(0, 500),
        motivo: String(m.motivo || '').slice(0, 300),
        relevancia: Math.min(3, Math.max(1, parseInt(m.relevancia, 10) || 2)),
        plazo: m.plazo || null,
        ruta: m.ruta || null,
        fuente: m.fuente || null,
        avisado_at: ahora,
        canal: 'creacion',
      }));
    const db = admin();
    await db.from('sector_alert_matches').upsert(filas, { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true });
    // Y quedan como ya evaluados: la vigilancia no los volverá a mirar.
    await db
      .from('sector_alert_seen')
      .upsert(
        filas.map((f) => ({ alert_id: f.alert_id, kind: f.kind, ref_id: f.ref_id })),
        { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true }
      );
  }

  // Una alarma NUEVA empieza a vigilar desde ahora. Lo que entró en los
  // últimos siete días ya lo revisó el agente al proponerla; sin esto, la
  // primera pasada lo volvería a evaluar y mandaría un correo con cosas
  // de hace una semana como si fueran novedades.
  if (guardada && !a?.id) {
    const db = admin();
    const { data: reciente } = await db.from('regulatorio_reciente').select('kind, ref_id').limit(3000);
    const filas = (reciente || []).map((r) => ({ alert_id: guardada.id, kind: r.kind, ref_id: r.ref_id }));
    for (let i = 0; i < filas.length; i += 500) {
      await db
        .from('sector_alert_seen')
        .upsert(filas.slice(i, i + 500), { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true });
    }
  }

  return NextResponse.json({ alarma: guardada });
}
