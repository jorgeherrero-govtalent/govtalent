import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { SECCIONES_DIRECTORIO, SECCION_CCAA, seccionPorSlug } from '@/lib/directorio';

// Datos de las secciones del directorio que salen de la Agenda de la
// Comunicación (sql/69) y de las asociaciones ya cargadas.
//
//   ?vista=resumen               cifras de cada tarjeta
//   ?vista=listado&s=<slug>      una fila por organización (lista como
//                                Organismos: nombre, tipo, ciudad, titular)
//   ?vista=ficha&s=<slug>&id=<n> la ficha de una organización: sus datos
//                                generales, sus unidades y sus personas
//
// Las tablas tienen RLS sin políticas: el navegador no puede leerlas y
// todo pasa por aquí.
//
// CORREOS Y TELÉFONOS: solo para organizaciones con el plan que incluye
// la Base de datos (canAccessDatabase, el mismo criterio que
// /api/instituciones/directorio/data). Se decide AQUÍ, en el servidor:
// sin ese plan la ficha no lleva ni un correo ni un teléfono, y
// `contacto: false` le dice a la página que enseñe el aviso de Teams.
// La web de cada organización va siempre, porque es pública.

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

// "Josefa Valcárcel, 40 BIS. 28027 MADRID"            -> ciudad Madrid, provincia Madrid
// "Corredera, 46. 14550 MONTILLA (CORDOBA)"             -> ciudad Montilla, provincia Cordoba
// "Navarra, 2. 01007 VITORIA-GASTEIZ (ARABA/ÁLAVA)"     -> ciudad Vitoria-Gasteiz, provincia Araba/Álava
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'i', 'd']);
function capitalizar(t) {
  return String(t)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && MINUSCULAS.has(w) ? w : w.replace(/(^|[-/])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase())
    )
    .join(' ');
}
function lugar(direccion) {
  const m = String(direccion || '').match(/\b\d{5}\s+([^()]+?)\s*(?:\(([^()]+)\))?\s*$/);
  if (!m) return { ciudad: null, provincia: null };
  const ciudad = capitalizar(m[1]);
  return { ciudad, provincia: m[2] ? capitalizar(m[2]) : ciudad };
}
function ciudad(direccion) {
  return lugar(direccion).ciudad;
}

function primeraWeb(w) {
  return w ? String(w).split(';')[0].trim() || null : null;
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
      id: o.id,
      organizacion: o.name,
      sector: o.sector,
      ciudad: o.location,
      web: o.website_url,
    }));
}

async function contactosDe(admin, ids, columnas) {
  const contactos = [];
  // .in() viaja en la URL: en tandas para no pasarse de longitud.
  for (let i = 0; i < ids.length; i += 300) {
    const tanda = ids.slice(i, i + 300);
    contactos.push(
      ...(await todas(() =>
        admin
          .from('directorio_contactos')
          .select(columnas)
          .in('entidad_id', tanda)
          .eq('activo', true)
          .eq('objecion', false)
          .order('orden', { ascending: true })
      ))
    );
  }
  return contactos.filter((c) => c.nombre);
}

// Una fila por organización. El id de la fila es el de su primer bloque en
// la Agenda: es lo que lleva la URL de la ficha.
async function listadoAgenda(admin, cat) {
  const entidades = await todas(() =>
    admin
      .from('directorio_entidades')
      .select('id, organizacion, subcategoria, ccaa, direccion, orden')
      .eq('categoria', cat)
      .eq('activo', true)
      .order('orden', { ascending: true })
  );
  const contactos = await contactosDe(
    admin,
    entidades.map((e) => e.id),
    'entidad_id, nombre, cargo, orden'
  );
  const porEntidad = new Map();
  for (const c of contactos) {
    if (!porEntidad.has(c.entidad_id)) porEntidad.set(c.entidad_id, []);
    porEntidad.get(c.entidad_id).push(c);
  }

  const filas = new Map();
  for (const e of entidades) {
    const k = clave(e.organizacion);
    if (!filas.has(k)) {
      filas.set(k, {
        id: e.id,
        organizacion: e.organizacion,
        tipo: e.subcategoria || null,
        ccaa: e.ccaa || null,
        ciudad: lugar(e.direccion).ciudad,
        provincia: lugar(e.direccion).provincia,
        unidades: 0,
        personas: 0,
        titular: null,
      });
    }
    const f = filas.get(k);
    f.unidades += 1;
    if (!f.ciudad) Object.assign(f, lugar(e.direccion));
    const ps = porEntidad.get(e.id) || [];
    f.personas += ps.length;
    if (!f.titular && ps[0]) f.titular = { nombre: ps[0].nombre, cargo: ps[0].cargo || '' };
  }
  return [...filas.values()];
}

async function ficha(admin, cat, id, conContacto) {
  const { data: base, error } = await admin
    .from('directorio_entidades')
    .select('organizacion')
    .eq('id', id)
    .eq('categoria', cat)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!base) return null;

  const entidades = await todas(() =>
    admin
      .from('directorio_entidades')
      .select('id, organizacion, unidad, grupo, subcategoria, ccaa, web, email_general, telefono, direccion, orden')
      .eq('categoria', cat)
      .eq('organizacion', base.organizacion)
      .eq('activo', true)
      .order('orden', { ascending: true })
  );
  const contactos = await contactosDe(
    admin,
    entidades.map((e) => e.id),
    conContacto ? 'id, entidad_id, nombre, cargo, email, telefono, orden' : 'entidad_id, nombre, cargo, orden'
  );
  const porEntidad = new Map();
  for (const c of contactos) {
    if (!porEntidad.has(c.entidad_id)) porEntidad.set(c.entidad_id, []);
    porEntidad.get(c.entidad_id).push(
      conContacto
        ? { id: `agenda:${c.id}`, nombre: c.nombre, cargo: c.cargo || '', email: c.email || null, telefono: c.telefono || null }
        : { nombre: c.nombre, cargo: c.cargo || '' }
    );
  }

  const principal = entidades[0];
  return {
    id,
    organizacion: base.organizacion,
    tipo: principal.subcategoria || null,
    ccaa: principal.ccaa || null,
    grupo: principal.grupo || null,
    ciudad: ciudad(principal.direccion),
    web: primeraWeb(entidades.find((e) => e.web)?.web),
    // Dirección, correo y teléfono generales: los del primer bloque. La
    // dirección es pública; correo y teléfono, solo con el plan.
    direccion: principal.direccion || null,
    email: conContacto ? principal.email_general || null : null,
    telefono: conContacto ? principal.telefono || null : null,
    unidades: entidades.map((e) => ({
      nombre: e.unidad || null,
      ciudad: ciudad(e.direccion),
      direccion: e.direccion || null,
      email: conContacto ? e.email_general || null : null,
      telefono: conContacto ? e.telefono || null : null,
      personas: porEntidad.get(e.id) || [],
    })),
  };
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

    const seccion = seccionPorSlug(params.get('s'));
    if (!seccion) return NextResponse.json({ error: 'Sección desconocida' }, { status: 404 });

    if (vista === 'listado') {
      const items = seccion.cat ? await listadoAgenda(admin, seccion.cat) : await listadoAsociaciones(admin);
      return NextResponse.json({ items }, { headers: CABECERAS });
    }

    if (vista === 'ficha') {
      const id = Math.floor(Number(params.get('id')));
      if (!seccion.cat || !(id > 0)) return NextResponse.json({ error: 'Ficha desconocida' }, { status: 404 });

      const conContacto = await puedeVerContactos(admin, authData.user.id);

      const datos = await ficha(admin, seccion.cat, id, conContacto);
      if (!datos) return NextResponse.json({ error: 'Ficha desconocida' }, { status: 404 });
      return NextResponse.json({ ficha: datos, contacto: conContacto }, { headers: CABECERAS });
    }

    return NextResponse.json({ error: 'Vista desconocida' }, { status: 400 });
  } catch (e) {
    console.error('[api/directorio]', e.message);
    return NextResponse.json({ error: 'No se pudo cargar el directorio' }, { status: 500 });
  }
}
