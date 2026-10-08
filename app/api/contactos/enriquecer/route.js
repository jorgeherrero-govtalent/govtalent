import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { saldoCreditos, consumirCreditos } from '@/lib/creditos';
import { enriquecerPersona } from '@/lib/enriquecer';
import { correoPorServidor } from '@/lib/correoPorServidor';
import { limpiar } from '@/lib/patronesCorreo';

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
export const maxDuration = 120;

const VIGENCIA_ENCONTRADO_DIAS = 180;
const VIGENCIA_NO_ENCONTRADO_DIAS = 30;

function vigente(fila) {
  const dias = (Date.now() - new Date(fila.created_at).getTime()) / 86400000;
  return dias < (fila.estado === 'encontrado' ? VIGENCIA_ENCONTRADO_DIAS : VIGENCIA_NO_ENCONTRADO_DIAS);
}

const publico = (f) => ({
  estado: f.estado,
  email: f.email,
  telefono: f.telefono,
  tipo: f.tipo,
  fuente_url: f.fuente_url,
  verificado: f.verificado,
  notas: f.notas,
  created_at: f.created_at,
});

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
  if (cache && vigente(cache)) {
    return NextResponse.json({ resultado: publico(cache), cobrado: false, cache: true, saldo: await saldoCreditos(admin, userId) });
  }

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
    const s = await correoPorServidor(admin, persona).catch((e) => {
      console.error('[contactos/enriquecer] servidor:', e.message);
      return null;
    });
    r = s
      ? {
          estado: 'encontrado',
          email: s.email,
          telefono: null,
          tipo: 'personal',
          fuente_url: null,
          verificado: true,
          notas: `Comprobado en el servidor de correo de ${s.dominio}`,
          coste_usd: Number((s.probados.length * 0.002).toFixed(5)),
        }
      : await enriquecerPersona(persona);
  } catch (e) {
    console.error('[contactos/enriquecer]', id, e.message);
    return NextResponse.json({ error: 'No se pudo completar la búsqueda. No se ha descontado ningún crédito.' }, { status: 502 });
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
  }

  return NextResponse.json({
    resultado: publico(guardada || fila),
    cobrado,
    cache: false,
    saldo: await saldoCreditos(admin, userId),
  });
}
