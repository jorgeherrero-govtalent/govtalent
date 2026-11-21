// =====================================================================
// GOBIERNOS AUTONÓMICOS: datos de Instituciones › Comunidades autónomas
// app/api/instituciones/gobiernos-ccaa/route.js
//
//   ?vista=listado          una fila por gobierno (las tarjetas)
//   ?vista=ficha&g=<slug>   un gobierno: presidencia, consejeros,
//                           consejerías y personas
//
// De dónde sale cada cosa: lib/ccaa/gobiernos.js. Las tablas tienen RLS
// sin políticas, así que todo pasa por aquí.
//
// CORREOS: solo con el Directorio (puedeVerContactos), decidido aquí, en
// el servidor. Sin él no llega ningún correo y la página enseña el
// difuminado de siempre (CorreoCargo).
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import {
  GOBIERNOS,
  gobiernoPorSlug,
  norm,
  esConsejero,
  esVicepresidente,
  esPresidente,
  consejeriaDe,
  rolCorto,
  PARLAMENTO_DE,
  buscadorDeFotos,
} from '@/lib/ccaa/gobiernos';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGINA = 1000;

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

// «Òscar Ordeig i Molist» y «Òscar Ordeig Molist» son la misma persona.
const clavePersona = (n) => norm(n).replace(/\b(i|y)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Los contactos de la Agenda de la Comunicación de cada gobierno, por ccaa. */
async function contactosAgenda(admin, ccaas, conContacto) {
  const { data: entidades, error } = await admin
    .from('directorio_entidades')
    .select('id, organizacion, ccaa, web')
    .eq('categoria', 'ccaa')
    .eq('subcategoria', 'Gobierno')
    .eq('activo', true)
    .in('ccaa', ccaas);
  if (error) throw new Error(error.message);
  const ids = (entidades || []).map((e) => e.id);
  const contactos = ids.length
    ? await todas(() =>
        admin
          .from('directorio_contactos')
          .select(conContacto ? 'id, entidad_id, nombre, cargo, email, orden' : 'id, entidad_id, nombre, cargo, orden')
          .in('entidad_id', ids)
          .eq('activo', true)
          .order('orden', { ascending: true })
      )
    : [];
  const ccaaDe = new Map((entidades || []).map((e) => [e.id, e.ccaa]));
  const porCcaa = new Map();
  for (const c of contactos) {
    const k = ccaaDe.get(c.entidad_id);
    if (!porCcaa.has(k)) porCcaa.set(k, []);
    porCcaa.get(k).push(c);
  }
  const webDe = new Map((entidades || []).map((e) => [e.ccaa, e.web ? String(e.web).split(';')[0].trim() : null]));
  return { porCcaa, webDe };
}

/**
 * El gobierno a partir de sus filas: presidente, vicepresidentes y un
 * consejero por consejería. Si dos fuentes dan dos consejeros para la
 * misma consejería, vale la más reciente (el Visor de la Generalitat va
 * por delante del directorio público).
 */
function componer(agenda, filas) {
  const presidenteA = (agenda || []).find((c) => esPresidente(c.cargo)) || null;
  const presidente = presidenteA
    ? { id: `agenda:${presidenteA.id}`, nombre: presidenteA.nombre, cargo: presidenteA.cargo, email: presidenteA.email || null }
    : null;

  const candidatas = [
    ...filas.map((f) => ({ ...f, idp: `fuente:${f.id}` })),
    ...(agenda || []).filter((c) => c !== presidenteA).map((c) => ({ ...c, idp: `agenda:${c.id}`, unidad: null, fuente_fecha: null })),
  ];
  const fecha = (f) => String(f.fuente_fecha || '');

  const vices = new Map();
  const porConsejeria = new Map();
  for (const f of candidatas) {
    const k = clavePersona(f.nombre);
    if (presidente && k === clavePersona(presidente.nombre)) continue;
    if (esConsejero(f.cargo)) {
      const consejeria = consejeriaDe(f.cargo, f.unidad);
      if (!consejeria) continue;
      const kc = norm(consejeria);
      const ya = porConsejeria.get(kc);
      if (!ya || fecha(f) > fecha(ya.f)) porConsejeria.set(kc, { f, consejeria });
    } else if (esVicepresidente(f.cargo)) {
      if (!vices.has(k)) vices.set(k, f);
    }
  }

  // Una persona, una tarjeta: si alguien sale dos veces con consejerías
  // escritas distinto (catalán y castellano), queda la más reciente.
  const porPersona = new Map();
  for (const { f, consejeria } of porConsejeria.values()) {
    const k = clavePersona(f.nombre);
    const ya = porPersona.get(k);
    if (!ya || fecha(f) > fecha(ya.f)) porPersona.set(k, { f, consejeria });
  }
  const consejeros = [...porPersona.values()]
    .map(({ f, consejeria }) => ({
      id: f.idp,
      nombre: f.nombre,
      cargo: f.cargo,
      rol: rolCorto(f.cargo),
      consejeria,
      vicepresidencia: /^vice(president|lehendakari|lendakari)/i.test(String(f.cargo || '')),
      email: f.email || null,
    }))
    .sort((a, b) => Number(b.vicepresidencia) - Number(a.vicepresidencia) || a.consejeria.localeCompare(b.consejeria, 'es'));

  // Los vicepresidentes sin cartera van con la presidencia; los que
  // también son consejeros, con su consejería (marcados).
  const conCartera = new Set(consejeros.map((c) => clavePersona(c.nombre)));
  const vicepresidentes = [...vices.values()]
    .filter((f) => !conCartera.has(clavePersona(f.nombre)))
    .map((f) => ({ id: f.idp, nombre: f.nombre, cargo: f.cargo, email: f.email || null }));

  return { presidente, vicepresidentes, consejeros };
}

async function listado(admin) {
  const conFuentes = GOBIERNOS.filter((g) => g.fuentes);
  const filas = await todas(() =>
    admin
      .from('fuentes_personas')
      .select('id, institucion, nombre, cargo, unidad, fuente_fecha')
      .eq('activo', true)
      .in(
        'institucion',
        conFuentes.map((g) => g.fuentes)
      )
      .order('id', { ascending: true })
  );
  const porInst = new Map();
  for (const f of filas) {
    if (!porInst.has(f.institucion)) porInst.set(f.institucion, []);
    porInst.get(f.institucion).push(f);
  }
  const { porCcaa } = await contactosAgenda(
    admin,
    GOBIERNOS.map((g) => g.ccaa),
    false
  );
  return GOBIERNOS.map((g) => {
    const propias = g.fuentes ? porInst.get(g.fuentes) || [] : [];
    const agenda = porCcaa.get(g.ccaa) || [];
    const { presidente, consejeros } = componer(agenda, propias);
    return {
      slug: g.slug,
      nombre: g.nombre,
      ccaa: g.ccaa,
      presidente: presidente ? presidente.nombre : null,
      consejerias: consejeros.length,
      personas: propias.length + agenda.length,
      organigrama: propias.length > 0,
    };
  });
}

async function ficha(admin, g, conContacto) {
  const filas = g.fuentes
    ? await todas(() =>
        admin
          .from('fuentes_personas')
          .select(conContacto ? 'id, nombre, cargo, unidad, area, banda, orden, fuente_fecha, email' : 'id, nombre, cargo, unidad, area, banda, orden, fuente_fecha')
          .eq('activo', true)
          .eq('institucion', g.fuentes)
          .order('id', { ascending: true })
      )
    : [];
  const { porCcaa, webDe } = await contactosAgenda(admin, [g.ccaa], conContacto);
  const agenda = porCcaa.get(g.ccaa) || [];
  const { presidente, vicepresidentes, consejeros } = componer(agenda, filas);

  // Fotos: las del parlamento de la comunidad, para quien es diputado (el
  // presidente y muchos consejeros). Al resto, las iniciales.
  let fotoDe = () => null;
  if (PARLAMENTO_DE[g.slug]) {
    const { data: diputados } = await admin
      .from('ccaa_diputados')
      .select('nombre, foto_url, foto_storage_url')
      .eq('parlamento', PARLAMENTO_DE[g.slug])
      .eq('activo', true);
    fotoDe = buscadorDeFotos(diputados || []);
  }
  for (const p of [presidente, ...vicepresidentes, ...consejeros]) if (p) p.foto = fotoDe(p.nombre);

  // Consejería de cada persona: el departamento si la fuente lo trae
  // (Cataluña), la propia unidad si es una consejería, o la del consejero.
  const nombresConsejeria = new Map(consejeros.map((c) => [norm(c.consejeria), c.consejeria]));
  const departamento = (f) => {
    if (f.area) return f.area;
    const u = nombresConsejeria.get(norm(f.unidad));
    return u || null;
  };

  const personas = [
    ...agenda.map((c) => ({
      id: `agenda:${c.id}`,
      nombre: c.nombre,
      cargo: c.cargo || '',
      unidad: 'Presidencia',
      departamento: null,
      nivel: esPresidente(c.cargo) ? 'alta_direccion' : 'direccion',
      email: c.email || null,
      foto: fotoDe(c.nombre),
    })),
    ...filas.map((f) => ({
      id: `fuente:${f.id}`,
      nombre: f.nombre,
      cargo: f.cargo || '',
      unidad: f.unidad || null,
      departamento: departamento(f),
      nivel: f.banda || 'mando_intermedio',
      email: f.email || null,
      foto: f.banda === 'alta_direccion' ? fotoDe(f.nombre) : null,
    })),
  ];
  // Los consejeros llevan su consejería también en Personas.
  const consejeriaDePersona = new Map(consejeros.map((c) => [c.id, c.consejeria]));
  for (const p of personas) if (!p.departamento && consejeriaDePersona.has(p.id)) p.departamento = consejeriaDePersona.get(p.id);

  const cuenta = new Map();
  for (const p of personas) if (p.departamento) cuenta.set(norm(p.departamento), (cuenta.get(norm(p.departamento)) || 0) + 1);
  const consejerias = consejeros.map((c) => ({
    nombre: c.consejeria,
    titular: c.nombre,
    rol: c.rol,
    personas: cuenta.get(norm(c.consejeria)) || 1,
  }));

  return {
    gobierno: { slug: g.slug, nombre: g.nombre, ccaa: g.ccaa, web: webDe.get(g.ccaa) || null },
    organigrama: filas.length > 0,
    presidente,
    vicepresidentes,
    consejeros,
    consejerias,
    personas,
  };
}

export async function GET(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const vista = params.get('vista');
  const admin = createAdminClient();

  try {
    if (vista === 'listado') {
      return NextResponse.json({ gobiernos: await listado(admin) }, { headers: { 'Cache-Control': 'private, max-age=300' } });
    }
    if (vista === 'ficha') {
      const g = gobiernoPorSlug(params.get('g'));
      if (!g) return NextResponse.json({ error: 'Gobierno desconocido' }, { status: 404 });
      const conContacto = await puedeVerContactos(admin, authData.user.id);
      const datos = await ficha(admin, g, conContacto);
      // Sin caché: cambia según quién la pida (con o sin correos).
      return NextResponse.json({ ...datos, contacto: conContacto }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json({ error: 'Vista desconocida' }, { status: 400 });
  } catch (e) {
    console.error('[api/instituciones/gobiernos-ccaa]', e.message);
    return NextResponse.json({ error: 'No se pudieron cargar los gobiernos' }, { status: 500 });
  }
}
