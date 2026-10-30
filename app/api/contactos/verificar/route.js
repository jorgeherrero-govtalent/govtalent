import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { correosProbables, probableParaDominio } from '@/lib/correosProbables';
import { comprobar, PATRONES_HABITUALES, MIN_ALTERNATIVA } from '@/lib/correoPorServidor';
import { hayVerificador } from '@/lib/verificarCorreo';
import { aplicarPatron, DESCRIPCION, limpiar } from '@/lib/patronesCorreo';
import { saldoCreditos, consumirCreditos } from '@/lib/creditos';

// POST /api/contactos/verificar
//   body: { id }                                  (id de directorio_pro)
//   body: { persona: { nombre, institucion, dominio } }  (fuera del directorio)
//
// Verifica en su servidor de correo el correo probable de una persona
// (decisión de Jorge, 13-10-2026):
// - Existe → «Verificado» para todos. 1 crédito.
// - No existe → se prueban las otras formas del patrón dentro de la misma
//   verificación; si una existe, verificada. 1 crédito.
// - No existe ninguna → se deja la más probable como «No confirmado». Sin coste.
// - No se pudo (servidor lento, acepta cualquier dirección…) → sigue
//   probable. Sin coste.
// Solo con el Directorio.

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const MAX_VARIANTES = 4;

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const userId = authData.user.id;

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, userId))) {
    return NextResponse.json({ error: 'Verificar correos es del Directorio, que se contrata aparte' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  let id;
  let persona;
  let p;
  if (body.persona && typeof body.persona === 'object') {
    // Alguien fuera del directorio: el correo se vuelve a deducir aquí, con
    // el mismo id que usa /api/contactos/enriquecer.
    const nombre = String(body.persona.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const institucion = String(body.persona.institucion || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const dominio = String(body.persona.dominio || '').trim().toLowerCase().slice(0, 120);
    if (nombre.split(' ').length < 2 || !institucion || !dominio) {
      return NextResponse.json({ error: 'Falta la persona' }, { status: 400 });
    }
    const clave = (t) => limpiar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    id = `libre:${clave(nombre)}|${clave(institucion)}`.slice(0, 120);
    persona = { id, nombre, institucion };
    const { data: v } = await admin.from('correos_verificados').select('email, resultado, patron').eq('persona_id', id).maybeSingle();
    p = await probableParaDominio(admin, nombre, dominio).catch(() => null);
    if (p && v?.resultado === 'ok' && v.email) p = { ...p, email: v.email, patron: v.patron, verificado: true, baja: false, origen: 'verificado' };
    if (p && v?.resultado === 'no_existe') p = { ...p, noConfirmado: true, verificable: false };
    if (p && v?.resultado === 'catch_all') p = { ...p, verificable: false };
  } else {
    id = String(body.id || '').slice(0, 120);
    if (!id) return NextResponse.json({ error: 'Falta la persona' }, { status: 400 });
    const { data } = await admin
      .from('directorio_pro')
      .select('id, nombre, institucion, email, email_unidad')
      .eq('id', id)
      .maybeSingle();
    persona = data;
    if (!persona) return NextResponse.json({ error: 'No encontramos a esa persona' }, { status: 404 });
    if (persona.email) return NextResponse.json({ resultado: 'publicado', cobrado: false });
    p = (await correosProbables(admin, [persona]).catch(() => ({})))[id];
  }
  if (!p) return NextResponse.json({ error: 'No hay correo que verificar' }, { status: 404 });
  if (p.verificado) return NextResponse.json({ resultado: 'ok', probable: p, cobrado: false });
  if (!p.verificable) return NextResponse.json({ resultado: 'no_verificable', probable: p, cobrado: false });
  if (!hayVerificador()) return NextResponse.json({ resultado: 'no_se_pudo', probable: p, cobrado: false });

  const saldo = await saldoCreditos(admin, userId);
  if ((saldo?.disponibles ?? 0) < 1) {
    return NextResponse.json({ error: 'No te quedan créditos este mes', sinCreditos: true, saldo }, { status: 402 });
  }

  // Formas a probar, por orden: la que se enseña, las alternativas del
  // dominio y las habituales.
  const { data: pat } = await admin
    .from('email_patrones')
    .select('alternativas')
    .eq('dominio', p.dominio)
    .maybeSingle();
  const patrones = [p.patron, ...((pat?.alternativas || []).filter((a) => a.fiabilidad >= MIN_ALTERNATIVA).map((a) => a.patron))];
  for (const x of PATRONES_HABITUALES) if (!patrones.includes(x)) patrones.push(x);
  const variantes = [{ email: p.email, patron: p.patron }];
  for (const x of patrones) {
    const e = aplicarPatron(persona.nombre, x, p.dominio);
    if (e && !variantes.some((v) => v.email === e)) variantes.push({ email: e, patron: x });
    if (variantes.length >= MAX_VARIANTES) break;
  }

  // En paralelo: cada comprobación puede tardar 15–20 s.
  const resultados = await Promise.all(variantes.map((v) => comprobar(admin, v.email).catch(() => 'error')));
  const probados = variantes.map((v, i) => ({ ...v, resultado: resultados[i] }));
  const guardar = (fila) =>
    admin.from('correos_verificados').upsert({ persona_id: id, dominio: p.dominio, probados, actualizado: new Date().toISOString(), ...fila });

  // El servidor acepta cualquier dirección: no se puede saber.
  if (resultados.includes('catch_all')) {
    await admin.from('email_patrones').update({ catch_all: true }).eq('dominio', p.dominio);
    await guardar({ email: p.email, resultado: 'catch_all', patron: p.patron });
    return NextResponse.json({ resultado: 'no_verificable', probable: { ...p, verificable: false }, cobrado: false });
  }

  const ok = probados.find((x) => x.resultado === 'ok');
  if (ok) {
    await guardar({ email: ok.email, resultado: 'ok', patron: ok.patron });
    const c = await consumirCreditos(admin, userId, 1, 'Verificar correo', id);
    return NextResponse.json({
      resultado: 'ok',
      probable: { ...p, email: ok.email, patron: ok.patron, descripcion: DESCRIPCION[ok.patron] || ok.patron, verificado: true, baja: false, origen: 'verificado' },
      cobrado: c?.ok === true,
      saldo: await saldoCreditos(admin, userId),
    });
  }

  if (probados.every((x) => x.resultado === 'invalid' || x.resultado === 'disposable')) {
    await guardar({ email: p.email, resultado: 'no_existe', patron: p.patron });
    return NextResponse.json({
      resultado: 'no_existe',
      probable: { ...p, noConfirmado: true, verificable: false },
      cobrado: false,
    });
  }

  // Servidor lento o sin respuesta: se puede reintentar más tarde.
  return NextResponse.json({ resultado: 'no_se_pudo', probable: p, cobrado: false });
}
