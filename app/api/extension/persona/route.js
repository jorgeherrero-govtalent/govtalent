import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { saldoCreditos } from '@/lib/creditos';
import { correosProbables, puedeVerProbables } from '@/lib/correosProbables';

// POST /api/extension/persona  body: { nombre, organizacion? }
//
// La extensión de Chrome (carpeta /extension, 12-11-2026) pregunta si la
// persona del perfil que el usuario tiene abierto está en el directorio.
// Va con la sesión de GovTalent del navegador: no hay token aparte.
//
// De LinkedIn solo llegan el nombre y la organización que el usuario ve
// en pantalla, para buscar. Aquí no se guarda nada de lo que llega.
//
// Sin el Directorio se dice si está y su cargo, pero no su correo ni su
// teléfono: es la misma regla que en las fichas.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const COLUMNAS =
  'id, nombre, cargo, unidad, institucion, tipo_institucion, jurisdiccion, es_titular, orden, email, email_unidad, telefono, nombre_norm, institucion_norm';

const sinTildes = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Palabras que no distinguen a una organización de otra.
const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'con', 'por', 'para', 'the', 'of', 'and', 'sa', 'sl', 'slu', 'spain', 'espana', 'group', 'grupo']);

function publica(f, conContacto) {
  return {
    id: f.id,
    nombre: f.nombre,
    cargo: f.cargo,
    unidad: f.unidad,
    institucion: f.institucion,
    es_titular: f.es_titular === true,
    ...(conContacto ? { email: f.email || null, email_unidad: f.email_unidad || null, telefono: f.telefono || null } : {}),
  };
}

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const userId = authData.user.id;

  const body = await request.json().catch(() => ({}));
  const nombre = String(body.nombre || '').slice(0, 160);
  const organizacion = String(body.organizacion || '').slice(0, 200);
  const palabras = sinTildes(nombre).split(' ').filter((w) => w.length > 2).slice(0, 6);

  const admin = createAdminClient();
  const [directorio, saldo] = await Promise.all([puedeVerContactos(admin, userId), saldoCreditos(admin, userId)]);
  const base = { directorio, saldo: directorio ? saldo : null };

  // Con una sola palabra (un nombre de pila) no se busca: saldrían cientos.
  if (palabras.length < 2) return NextResponse.json({ ...base, persona: null, colegas: [], total_organizacion: 0 });

  // Todas las palabras del nombre tienen que estar en el del directorio.
  let q = admin.from('directorio_pro_mat').select(COLUMNAS).limit(25);
  for (const w of palabras) q = q.like('nombre_norm', `%${w}%`);
  const { data: filas, error } = await q;
  if (error) {
    console.error('[extension/persona]', error.message);
    return NextResponse.json({ error: 'No se pudo consultar el directorio' }, { status: 500 });
  }

  // Si hay varias, gana la de la organización que más se parece a la del
  // perfil; a igualdad, la de más rango. Con homónimos y sin ninguna
  // coincidencia de organización no se elige a nadie: se enseñan todas.
  const orgPalabras = sinTildes(organizacion).split(' ').filter((w) => w.length > 2 && !VACIAS.has(w));
  const puntos = (f) => orgPalabras.filter((w) => (f.institucion_norm || '').includes(w) || sinTildes(f.unidad).includes(w)).length;
  const ordenadas = (filas || [])
    .map((f) => ({ f, p: puntos(f) }))
    .sort((a, b) => b.p - a.p || (a.f.orden ?? 99) - (b.f.orden ?? 99));
  const personasDistintas = new Set(ordenadas.map((x) => x.f.nombre_norm)).size;
  const dudosa = personasDistintas > 1 && (ordenadas[0]?.p || 0) === 0;
  const mejor = dudosa ? null : ordenadas[0]?.f || null;

  if (!mejor) {
    return NextResponse.json({
      ...base,
      persona: null,
      candidatas: dudosa ? ordenadas.slice(0, 5).map((x) => publica(x.f, false)) : [],
      colegas: [],
      total_organizacion: 0,
    });
  }

  // El resto de su organización.
  const [{ data: colegas }, { count }] = await Promise.all([
    admin
      .from('directorio_pro_mat')
      .select('id, nombre, cargo, es_titular, orden')
      .eq('institucion', mejor.institucion)
      .neq('id', mejor.id)
      .order('orden', { ascending: true })
      .order('id', { ascending: true })
      .limit(6),
    admin.from('directorio_pro_mat').select('id', { count: 'exact', head: true }).eq('institucion', mejor.institucion),
  ]);

  // Sin correo publicado: el probable de su organismo, como en las fichas.
  let probable = null;
  if (directorio && !mejor.email && puedeVerProbables()) {
    const p = (await correosProbables(admin, [mejor]).catch(() => ({})))[mejor.id];
    if (p?.email) probable = { email: p.email, verificado: p.verificado === true, baja: p.baja === true };
  }

  return NextResponse.json(
    {
      ...base,
      persona: { ...publica(mejor, directorio), probable },
      colegas: (colegas || []).map((c) => ({ id: c.id, nombre: c.nombre, cargo: c.cargo })),
      total_organizacion: count ?? 0,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
