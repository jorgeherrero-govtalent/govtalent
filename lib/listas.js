// Listas de contactos (sql/76). Solo servidor.
//
// Una lista es de la organización del usuario si pertenece a una (la ven y
// editan todos sus miembros, como la bolsa de créditos); si no, solo suya.
// Cada miembro guarda una foto de su fila de directorio_pro al añadirlo:
// los cambios salen de comparar esa foto con el dato actual.

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';

export const MAX_MIEMBROS = 2000;

/** Usuario autenticado con Directorio, o { error, status }. */
export async function usuarioConDirectorio() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { error: 'No autenticado', status: 401 };
  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return { error: 'Las listas son del Directorio, que se contrata aparte', status: 403 };
  }
  return { admin, userId: authData.user.id };
}

/** La organización del usuario (la primera a la que se unió), o null. */
export async function organizacionDe(admin, userId) {
  const { data } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.organization_id || null;
}

export async function listaAccesible(admin, listaId, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(listaId || ''))) return false;
  const { data, error } = await admin.rpc('lista_accesible', { p_lista: listaId, p_user: userId });
  return !error && data === true;
}

/** Filas actuales de directorio_pro para unos ids (en tandas). */
export async function filasPorIds(admin, ids) {
  const out = [];
  const unicos = [...new Set(ids.map(String))].slice(0, MAX_MIEMBROS);
  for (let i = 0; i < unicos.length; i += 500) {
    const { data, error } = await admin.rpc('contactos_por_ids', { p_ids: unicos.slice(i, i + 500) });
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

/**
 * Añade personas a una lista con su foto actual. Devuelve cuántas.
 * Admite también a quien se encontró con «Buscar correo» sin estar en el
 * directorio (ids «libre:…»): su foto sale de lo encontrado.
 */
export async function anadirMiembros(admin, listaId, ids) {
  const libres = [...new Set(ids.map(String).filter((x) => x.startsWith('libre:')))];
  const filas = await filasPorIds(admin, ids.filter((x) => !String(x).startsWith('libre:')));
  const nuevas = filas.map((f) => ({ lista_id: listaId, persona_id: f.id, snapshot: f }));
  if (libres.length) {
    const { data } = await admin
      .from('contactos_enriquecidos')
      .select('persona_id, nombre, institucion, email, telefono')
      .in('persona_id', libres.slice(0, 500))
      .eq('estado', 'encontrado');
    for (const e of data || []) {
      if (!e.email) continue;
      nuevas.push({
        lista_id: listaId,
        persona_id: e.persona_id,
        mantener_salida: true,
        snapshot: {
          id: e.persona_id,
          libre: true,
          nombre: e.nombre,
          institucion: e.institucion,
          cargo: null,
          unidad: null,
          email: null,
          email_unidad: null,
          telefono: null,
        },
      });
    }
  }
  if (!nuevas.length) return 0;
  const { error } = await admin
    .from('contactos_lista_miembros')
    .upsert(nuevas, { onConflict: 'lista_id,persona_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  await tocarLista(admin, listaId);
  return nuevas.length;
}

export async function tocarLista(admin, listaId) {
  await admin.from('contactos_listas').update({ updated_at: new Date().toISOString() }).eq('id', listaId);
}
