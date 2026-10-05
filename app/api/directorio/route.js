import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SECCIONES_DIRECTORIO, SECCION_CCAA, seccionPorSlug } from '@/lib/directorio';

// Datos de las secciones del directorio que salen de la Agenda de la
// Comunicación (sql/69) y de las asociaciones ya cargadas.
//
//   ?vista=resumen          cifras de cada tarjeta
//   ?vista=listado&s=<slug> organizaciones de una sección, con sus unidades
//                           y las personas (solo nombre y cargo)
//
// Las tablas tienen RLS sin políticas: el navegador no puede leerlas y
// todo pasa por aquí. Esta ruta NUNCA devuelve correos ni teléfonos de
// personas: eso es la Base de datos, que es de pago. Sí devuelve la web
// de cada organización, que es pública.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const PAGINA = 1000;

// supabase-js devuelve 1.000 filas como mucho por consulta.
async function todas(consulta) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta().range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return filas;
}

function clave(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CABECERAS = { 'Cache-Control': 'private, max-age=600' };

async function resumen(admin) {
  const [{ data: filas, error }, { count: asociaciones }] = await Promise.all([
    admin.from('directorio_resumen').select('categoria, organizaciones, personas'),
    admin
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('org_type', 'asociacion_profesional'),
  ]);
  if (error) throw new Error(error.message);
  const porCat = Object.fromEntries((filas || []).map((f) => [f.categoria, f]));
  const cifras = {};
  for (const s of [...SECCIONES_DIRECTORIO, SECCION_CCAA]) {
    if (s.cat) {
      const f = porCat[s.cat];
      cifras[s.slug] = f ? { organizaciones: f.organizaciones, personas: f.personas } : null;
    } else if (s.slug === 'asociaciones') {
      cifras[s.slug] = asociaciones === null ? null : { organizaciones: asociaciones, personas: null };
    }
  }
  return cifras;
}

async function listadoAsociaciones(admin) {
  const [orgs, patronales] = await Promise.all([
    todas(() =>
      admin
        .from('organizations')
        .select('id, name, sector, location, website_url')
        .eq('org_type', 'asociacion_profesional')
        .order('name', { ascending: true })
    ),
    todas(() => admin.from('directorio_entidades').select('organizacion').eq('categoria', 'patronal')),
  ]);
  // Las patronales de la Agenda tienen su propia sección: aquí no se repiten.
  const yaEnPatronales = new Set(patronales.map((p) => clave(p.organizacion)));
  return orgs
    .filter((o) => !yaEnPatronales.has(clave(o.name)))
    .map((o) => ({
      organizacion: o.name,
      sector: o.sector,
      lugar: o.location,
      web: o.website_url,
    }));
}

async function listadoAgenda(admin, cat) {
  const entidades = await todas(() =>
    admin
      .from('directorio_entidades')
      .select('id, organizacion, unidad, grupo, subcategoria, ccaa, web, orden')
      .eq('categoria', cat)
      .eq('activo', true)
      .order('orden', { ascending: true })
  );
  const ids = entidades.map((e) => e.id);
  const contactos = [];
  // .in() viaja en la URL: en tandas para no pasarse de longitud.
  for (let i = 0; i < ids.length; i += 300) {
    const tanda = ids.slice(i, i + 300);
    contactos.push(
      ...(await todas(() =>
        admin
          .from('directorio_contactos')
          .select('entidad_id, nombre, cargo, orden')
          .in('entidad_id', tanda)
          .eq('activo', true)
          .eq('objecion', false)
          .order('orden', { ascending: true })
      ))
    );
  }
  const porEntidad = new Map();
  for (const c of contactos) {
    if (!c.nombre) continue;
    if (!porEntidad.has(c.entidad_id)) porEntidad.set(c.entidad_id, []);
    porEntidad.get(c.entidad_id).push({ nombre: c.nombre, cargo: c.cargo || '' });
  }

  // Una ficha por organización, con sus unidades en el orden de la Agenda.
  const grupos = new Map();
  for (const e of entidades) {
    const k = `${e.ccaa || ''}|${e.organizacion}`;
    if (!grupos.has(k)) {
      grupos.set(k, {
        organizacion: e.organizacion,
        subcategoria: e.subcategoria || null,
        ccaa: e.ccaa || null,
        grupo: e.grupo || null,
        web: null,
        unidades: [],
      });
    }
    const g = grupos.get(k);
    if (!g.web && e.web) g.web = e.web.split(';')[0].trim();
    const personas = porEntidad.get(e.id) || [];
    if (personas.length || e.unidad) {
      g.unidades.push({ nombre: e.unidad || null, personas });
    }
  }
  return [...grupos.values()];
}

export async function GET(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const vista = params.get('vista');
  const admin = createAdminClient();

  try {
    if (vista === 'resumen') {
      return NextResponse.json({ cifras: await resumen(admin) }, { headers: CABECERAS });
    }
    if (vista === 'listado') {
      const seccion = seccionPorSlug(params.get('s'));
      if (!seccion) return NextResponse.json({ error: 'Sección desconocida' }, { status: 404 });
      const items = seccion.cat ? await listadoAgenda(admin, seccion.cat) : await listadoAsociaciones(admin);
      return NextResponse.json({ items }, { headers: CABECERAS });
    }
    return NextResponse.json({ error: 'Vista desconocida' }, { status: 400 });
  } catch (e) {
    console.error('[api/directorio]', e.message);
    return NextResponse.json({ error: 'No se pudo cargar el directorio' }, { status: 500 });
  }
}
