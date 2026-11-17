import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { saldoCreditos } from '@/lib/creditos';

// POST /api/extension/web
//   body: { dominio }  → la organización de la web abierta y sus personas
//   body: { q }        → búsqueda en el directorio (personas, cargos, organizaciones)
//
// La extensión de Chrome fuera de LinkedIn (17-11-2026): en cualquier web
// pública el panel reconoce de qué organización es y deja buscar en
// GovTalent. De la página solo llega su dominio (o lo que el usuario
// escribe o selecciona); aquí no se guarda nada.
//
// Como en /api/extension/persona, sin el Directorio se ven nombres y
// cargos, pero no correos: los correos salen en la ficha de cada persona.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const sinTildes = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Dominios compartidos por muchas organizaciones o que no son de ninguna:
// con ellos no se puede decir de quién es la web.
const COMPARTIDOS = new Set(['gob.es', 'europa.eu', 'correo.gob.es', 'com', 'es', 'org', 'net', 'eu', 'cat', 'gal', 'eus', 'google.com', 'linkedin.com']);

/** «www.asambleamadrid.es» → ['asambleamadrid.es']; «sede.cnmc.gob.es» → ['sede.cnmc.gob.es', 'cnmc.gob.es'] */
function candidatos(host) {
  const limpio = String(host || '').toLowerCase().trim().replace(/^www\./, '');
  if (!/^[a-z0-9.-]{3,120}$/.test(limpio) || !limpio.includes('.')) return [];
  const partes = limpio.split('.');
  const lista = [];
  for (let i = 0; i < partes.length - 1; i++) {
    const d = partes.slice(i).join('.');
    if (!COMPARTIDOS.has(d)) lista.push(d);
  }
  return lista.slice(0, 4);
}

async function organizacionDe(admin, host) {
  const doms = candidatos(host);
  if (!doms.length) return null;
  const [{ data: deCorreos }, { data: manuales }] = await Promise.all([
    admin.from('email_dominios_institucion').select('institucion, dominio, n').in('dominio', doms),
    admin.from('email_dominios_manual').select('institucion, dominio').in('dominio', doms),
  ]);
  // El dominio más específico manda; dentro de él, la organización con más correos.
  for (const d of doms) {
    const filas = (deCorreos || []).filter((f) => f.dominio === d).sort((a, b) => (b.n || 0) - (a.n || 0));
    if (filas.length) return filas[0].institucion;
    const m = (manuales || []).find((f) => f.dominio === d);
    if (m) return m.institucion;
  }
  return null;
}

const fila = (f) => ({ id: f.id, nombre: f.nombre, cargo: f.cargo || null, institucion: f.institucion || null });

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const userId = authData.user.id;

  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const [directorio, saldo] = await Promise.all([puedeVerContactos(admin, userId), saldoCreditos(admin, userId)]);
  const base = { directorio, saldo: directorio ? saldo : null };
  const cabeceras = { headers: { 'Cache-Control': 'private, no-store' } };

  // Búsqueda: todas las palabras, en el nombre, el cargo, la unidad o la organización.
  if (typeof body.q === 'string') {
    const palabras = sinTildes(body.q.slice(0, 160)).split(' ').filter((w) => w.length > 1).slice(0, 6);
    if (!palabras.length || palabras.join('').length < 3) return NextResponse.json({ ...base, resultados: [] }, cabeceras);
    let q = admin.from('directorio_pro_mat').select('id, nombre, cargo, institucion, orden, nombre_norm').order('orden', { ascending: true }).order('id', { ascending: true }).limit(40);
    for (const w of palabras) q = q.like('busqueda', `%${w}%`);
    const { data, error } = await q;
    if (error) {
      console.error('[extension/web] buscar:', error.message);
      return NextResponse.json({ error: 'No se pudo consultar el directorio' }, { status: 500 });
    }
    // Primero quien lleva las palabras en el nombre; una persona, una vez.
    const enNombre = (f) => (palabras.every((w) => (f.nombre_norm || '').includes(w)) ? 0 : 1);
    const vistos = new Set();
    const resultados = [];
    for (const f of (data || []).sort((a, b) => enNombre(a) - enNombre(b))) {
      const clave = `${f.nombre_norm}|${f.institucion}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      resultados.push(fila(f));
      if (resultados.length >= 8) break;
    }
    return NextResponse.json({ ...base, resultados }, cabeceras);
  }

  // La organización de la web abierta.
  const institucion = await organizacionDe(admin, body.dominio).catch((e) => {
    console.error('[extension/web] dominio:', e.message);
    return null;
  });
  if (!institucion) return NextResponse.json({ ...base, organizacion: null }, cabeceras);

  const [{ data: personas }, { count }] = await Promise.all([
    admin
      .from('directorio_pro_mat')
      .select('id, nombre, cargo, institucion, orden')
      .eq('institucion', institucion)
      .order('orden', { ascending: true })
      .order('id', { ascending: true })
      .limit(6),
    admin.from('directorio_pro_mat').select('id', { count: 'exact', head: true }).eq('institucion', institucion),
  ]);
  if (!count) return NextResponse.json({ ...base, organizacion: null }, cabeceras);

  return NextResponse.json({ ...base, organizacion: { nombre: institucion, total: count, personas: (personas || []).map(fila) } }, cabeceras);
}
