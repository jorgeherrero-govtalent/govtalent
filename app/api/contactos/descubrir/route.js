import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { checkAndLogAiUsage } from '@/lib/aiRateLimit';
import { saldoCreditos, consumirCreditos } from '@/lib/creditos';
import { descubrirPorCargo, palabrasNombre } from '@/lib/descubrir';
import { normalizarFiltros, FILTROS_VACIOS } from '@/lib/contactosFiltros';

// POST /api/contactos/descubrir  body: { q }
//
// Busca fuera de GovTalent quién ocupa hoy unos cargos (lib/descubrir.js),
// marca a quien ya está en el directorio y guarda el resultado (sql/97)
// para dar de alta después solo a quien el usuario seleccione
// (/api/contactos/descubrir/alta).
// 2 créditos por búsqueda, solo si encuentra a alguien nuevo (decisión de
// Jorge, 13-10-2026). Solo con el Directorio.

export const dynamic = 'force-dynamic';
export const maxDuration = 200;

const CREDITOS_BUSQUEDA = 2;

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const userId = authData.user.id;

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, userId))) {
    return NextResponse.json({ error: 'Buscar fuera de GovTalent es del Directorio, que se contrata aparte' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const q = String(body.q || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (q.length < 5) return NextResponse.json({ error: 'Describe qué cargos buscas' }, { status: 400 });

  const saldo = await saldoCreditos(admin, userId);
  if (!(saldo.disponibles >= CREDITOS_BUSQUEDA)) {
    return NextResponse.json({ error: `Buscar fuera de GovTalent cuesta ${CREDITOS_BUSQUEDA} créditos`, sinCreditos: true, saldo }, { status: 402 });
  }

  const uso = await checkAndLogAiUsage(userId, 'contactos-descubrir');
  if (!uso.allowed) return NextResponse.json({ error: uso.reason }, { status: 429 });

  let r;
  try {
    r = await descubrirPorCargo(q);
  } catch (e) {
    console.error('[contactos/descubrir]', e.message);
    return NextResponse.json({ error: 'No se pudo completar la búsqueda. No se ha descontado ningún crédito.' }, { status: 502 });
  }

  // ¿Quién está ya en el directorio? Por su primer apellido (sin tildes) y
  // comprobando que el nombre y ese apellido coinciden.
  const personas = [];
  for (const p of r.personas) {
    const pal = palabrasNombre(p.nombre);
    let existente = null;
    try {
      const { data } = await admin.rpc('buscar_contactos', {
        p_filtros: normalizarFiltros({ ...FILTROS_VACIOS, nombre: pal[1] }),
        p_desde: 0,
        p_cuantos: 50,
      });
      existente =
        (data?.filas || []).find((f) => {
          const c = new Set(palabrasNombre(f.nombre));
          return c.has(pal[0]) && c.has(pal[1]);
        }) || null;
    } catch {
      /* sin cruce: se trata como nuevo */
    }
    personas.push({
      ...p,
      existente_id: existente?.id || null,
      existente_cargo: existente?.cargo || null,
      existente_institucion: existente?.institucion || null,
    });
  }
  const nuevos = personas.filter((p) => !p.existente_id).length;

  let cobrado = false;
  if (nuevos > 0) {
    const c = await consumirCreditos(admin, userId, CREDITOS_BUSQUEDA, `Buscar fuera de GovTalent: ${q.slice(0, 80)}`, `desc:${userId}:${Date.now()}`);
    cobrado = c?.ok === true;
  }

  const { data: guardado, error } = await admin
    .from('descubrimientos')
    .insert({ user_id: userId, q, personas, nuevos, cobrado, coste_usd: r.coste_usd, diagnostico: r.diagnostico })
    .select('id')
    .single();
  if (error) console.error('[contactos/descubrir] guardar:', error.message);

  return NextResponse.json({
    id: guardado?.id || null,
    personas: personas.map((p, i) => ({
      i,
      nombre: p.nombre,
      cargo: p.cargo,
      organizacion: p.organizacion,
      unidad: p.unidad,
      fuente_dominio: p.fuente_dominio,
      fecha_fuente: p.fecha_fuente,
      dudoso: p.dudoso,
      existente_id: p.existente_id,
    })),
    nuevos,
    notas: r.notas || null,
    cobrado,
    creditos: cobrado ? CREDITOS_BUSQUEDA : 0,
    saldo: await saldoCreditos(admin, userId),
  });
}
