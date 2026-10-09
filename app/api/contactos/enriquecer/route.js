import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { saldoCreditos, consumirCreditos } from '@/lib/creditos';
import { enriquecerPersona, buscarCorreoPublicado } from '@/lib/enriquecer';
import { enriquecidoPublico } from '@/lib/enriquecidoPublico';
import { correoPorServidor } from '@/lib/correoPorServidor';
import { limpiar } from '@/lib/patronesCorreo';
import { reveladosDe, revelar } from '@/lib/revelados';

// POST /api/contactos/enriquecer
//   body: { id }                                   (id de directorio_pro)
//   body: { persona: { nombre, institucion } }     (alguien que no está en el directorio)
//
// Una persona por llamada (la búsqueda tarda 20–40 s); «Enriquecer todos»
// las lanza desde el navegador de pocas en pocas.
//
// 1. Caché compartida (sql/76): si alguien ya la enriqueció hace poco, se
//    devuelve gratis.
// 2. Si no, hace falta al menos 1 crédito disponible.
// 3. Primero se deduce con el patrón de su dominio y se comprueba en su
//    servidor de correo (lib/correoPorServidor.js); si no se confirma,
//    Claude busca en fuentes oficiales (lib/enriquecer.js).
// 4. Se guarda en la caché y, solo si ha encontrado un correo, se
//    descuenta 1 crédito.

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const VIGENCIA_ENCONTRADO_DIAS = 180;
const VIGENCIA_NO_ENCONTRADO_DIAS = 30;

function vigente(fila) {
  const dias = (Date.now() - new Date(fila.created_at).getTime()) / 86400000;
  return dias < (fila.estado === 'encontrado' ? VIGENCIA_ENCONTRADO_DIAS : VIGENCIA_NO_ENCONTRADO_DIAS);
}

// Sin enlace a la fuente ni notas (09-10-2026): ver lib/enriquecidoPublico.js.
const publico = (f) =>
  enriquecidoPublico({
    estado: f.estado,
    email: f.email,
    telefono: f.telefono,
    tipo: f.tipo,
    verificado: f.verificado,
    created_at: f.created_at,
  });

// Lo que devuelve el servidor de correo, como resultado. Si es un correo
// deducido en un dominio que acepta cualquier dirección (s.probable), se
// busca esa dirección exacta en fuentes públicas: si aparece, verificado;
// si no, probable. Las dos cosas cobran 1 crédito (decisión de Jorge).
async function desdeServidor(s, persona, costePrevio = 0) {
  const costeServidor = costePrevio + s.probados.length * 0.002;
  if (!s.probable) {
    return {
      estado: 'encontrado',
      email: s.email,
      tipo: 'personal',
      fuente_url: null,
      verificado: true,
      notas: `Comprobado en el servidor de correo de ${s.dominio}`,
      coste_usd: Number(costeServidor.toFixed(5)),
    };
  }
  const pub = await buscarCorreoPublicado(s.email, persona).catch((e) => {
    console.error('[contactos/enriquecer] publicado:', e.message);
    return null;
  });
  return {
    estado: 'encontrado',
    email: s.email,
    tipo: 'personal',
    fuente_url: pub?.fuente_url || null,
    verificado: pub?.publicado === true,
    notas:
      pub?.publicado === true
        ? `Publicado en una fuente pública; sigue el patrón de ${s.dominio}`
        : `Probable: sigue el patrón de ${s.dominio} (${s.patron}, ${s.muestras} correos reales); su servidor acepta cualquier dirección y no permite comprobarlo`,
    coste_usd: Number((costeServidor + (pub?.coste_usd || 0)).toFixed(5)),
  };
}

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const userId = authData.user.id;

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, userId))) {
    return NextResponse.json({ error: 'Enriquecer contactos es del Directorio, que se contrata aparte' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  // Alguien fuera del directorio: su id sale del nombre y la organización,
  // para que la caché sirva a quien busque a la misma persona.
  let libre = null;
  if (body.persona && typeof body.persona === 'object') {
    const nombre = String(body.persona.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const institucion = String(body.persona.institucion || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (nombre.split(' ').length < 2 || !institucion) {
      return NextResponse.json({ error: 'Indica nombre, apellido y organización' }, { status: 400 });
    }
    const clave = (t) => limpiar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    libre = { id: `libre:${clave(nombre)}|${clave(institucion)}`.slice(0, 120), nombre, institucion, cargo: null };
  }
  const id = libre ? libre.id : String(body.id || '').slice(0, 120);
  if (!id) return NextResponse.json({ error: 'Falta la persona' }, { status: 400 });

  // 1. Caché compartida.
  const { data: cache } = await admin.from('contactos_enriquecidos').select('*').eq('persona_id', id).maybeSingle();
  // Con correo nominativo: sale al momento. Gratis si su equipo ya lo pagó;
  // si no, 1 crédito (sql/88: cada equipo paga la primera vez que lo ve).
  // Con un correo genérico (comunicacion@, prensa@…) o sin correo: no se
  // repite la IA, pero sí se busca el nominativo en el servidor de correo,
  // que es barato. Si no aparece, se devuelve lo que había.
  const enVigor = cache && vigente(cache);
  const cacheNominativo = enVigor && cache.email && cache.tipo === 'personal';
  const cacheGenerico = enVigor && cache.email && cache.tipo !== 'personal';
  const cacheSinCorreo = enVigor && !cache.email;

  async function devolverCache() {
    const pagado = (await reveladosDe(admin, userId, [id])).has(id);
    let cobrado = false;
    if (!pagado) {
      const saldo0 = await saldoCreditos(admin, userId);
      if (!(saldo0.disponibles >= 1)) {
        return NextResponse.json({ error: 'No te quedan créditos este mes', sinCreditos: true, saldo: saldo0 }, { status: 402 });
      }
      const c = await consumirCreditos(admin, userId, 1, `Enriquecer: ${cache.nombre || id}`, `enr:${id}:${userId}:${Date.now()}`);
      if (c?.ok !== true) {
        return NextResponse.json({ error: 'No te quedan créditos este mes', sinCreditos: true, saldo: await saldoCreditos(admin, userId) }, { status: 402 });
      }
      cobrado = true;
      await revelar(admin, userId, id);
    }
    return NextResponse.json({ resultado: publico(cache), cobrado, cache: true, persona_id: id, saldo: await saldoCreditos(admin, userId) });
  }

  if (cacheNominativo) return devolverCache();

  // 2. Saldo.
  const saldo = await saldoCreditos(admin, userId);
  if (!(saldo.disponibles >= 1)) {
    return NextResponse.json({ error: 'No te quedan créditos este mes', sinCreditos: true, saldo }, { status: 402 });
  }

  // La persona, tal como está en el directorio (o como la ha escrito el usuario).
  let persona = libre;
  if (!persona) {
    const { data: filas, error: errFila } = await admin.rpc('contactos_por_ids', { p_ids: [id] });
    persona = Array.isArray(filas) ? filas[0] : null;
    if (errFila || !persona) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 });
  }

  // 3. Búsqueda: servidor de correo y, si no, IA.
  let r;
  try {
    const pistas = cache?.email ? [String(cache.email).toLowerCase().split('@')[1]] : [];
    const s = await correoPorServidor(admin, persona, { pistas }).catch((e) => {
      console.error('[contactos/enriquecer] servidor:', e.message);
      return null;
    });
    r = s
      ? { ...(await desdeServidor(s, persona)), telefono: cache?.telefono || null }
      : cacheSinCorreo || cacheGenerico
        ? null
        : await enriquecerPersona(persona);
  } catch (e) {
    console.error('[contactos/enriquecer]', id, e.message);
    return NextResponse.json({ error: 'No se pudo completar la búsqueda. No se ha descontado ningún crédito.' }, { status: 502 });
  }

  // La IA solo ha encontrado un correo genérico: con su dominio, se busca
  // aún el nominativo en el servidor (comunicacion@correos.com → correos.com).
  if (r && r.email && r.tipo !== 'personal') {
    const dom = String(r.email).toLowerCase().split('@')[1];
    const s2 = await correoPorServidor(admin, persona, { pistas: [dom] }).catch(() => null);
    if (s2) r = { ...r, ...(await desdeServidor(s2, persona, r.coste_usd || 0)) };
  }

  if (!r) {
    if (cacheGenerico) return devolverCache();
    return NextResponse.json({ resultado: publico(cache), cobrado: false, cache: true, persona_id: id, saldo: await saldoCreditos(admin, userId) });
  }

  // 4. Caché y cobro.
  const fila = {
    persona_id: id,
    nombre: persona.nombre || null,
    institucion: persona.institucion || null,
    ...r,
    creado_por: userId,
    created_at: new Date().toISOString(),
  };
  const { data: guardada, error: errGuardar } = await admin
    .from('contactos_enriquecidos')
    .upsert(fila, { onConflict: 'persona_id' })
    .select('*')
    .single();
  if (errGuardar) console.error('[contactos/enriquecer] guardar:', errGuardar.message);

  // Solo se cobra si hay correo: un teléfono suelto (casi siempre la
  // centralita) se enseña, pero no cuesta un crédito.
  let cobrado = false;
  if (r.estado === 'encontrado' && r.email) {
    const c = await consumirCreditos(admin, userId, 1, `Enriquecer: ${persona.nombre || id}`, `enr:${id}:${userId}:${Date.now()}`);
    cobrado = c?.ok === true;
    if (cobrado) await revelar(admin, userId, id);
  }

  return NextResponse.json({
    resultado: publico(guardada || fila),
    cobrado,
    cache: false,
    persona_id: id,
    saldo: await saldoCreditos(admin, userId),
  });
}
