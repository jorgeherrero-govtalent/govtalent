import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { palabrasNombre, tipoInstitucion, bandaDeCargo } from '@/lib/descubrir';

// POST /api/contactos/descubrir/alta  body: { id, indices: [0, 2, …] }
//
// De una búsqueda fuera de GovTalent (sql/97), da de alta en el directorio
// a las personas seleccionadas que no estaban (fuentes_personas, fuente
// «Búsqueda en fuentes oficiales») y devuelve las filas de todas, nuevas y
// existentes, para meterlas en la selección de Contactos. Sin coste: la
// búsqueda ya se cobró.

export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, nombre, cargo, unidad, institucion, jurisdiccion, tipo_institucion, pais, banda, es_titular, area, email, email_unidad, telefono, direccion_postal, localidad, provincia, slug, fuente, fuente_fecha, contactabilidad';

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const userId = authData.user.id;

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, userId))) {
    return NextResponse.json({ error: 'Es del Directorio, que se contrata aparte' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  const indices = [...new Set((Array.isArray(body.indices) ? body.indices : []).map(Number).filter(Number.isInteger))].slice(0, 50);
  if (!id || !indices.length) return NextResponse.json({ error: 'No hay nadie seleccionado' }, { status: 400 });

  const { data: d } = await admin.from('descubrimientos').select('id, user_id, personas').eq('id', id).maybeSingle();
  if (!d || d.user_id !== userId) return NextResponse.json({ error: 'Búsqueda no encontrada' }, { status: 404 });

  const hoy = new Date().toISOString().slice(0, 10);
  const ids = [];
  let altas = 0;
  for (const i of indices) {
    const p = d.personas?.[i];
    if (!p) continue;
    if (p.existente_id) {
      ids.push(p.existente_id);
      continue;
    }
    const clave = `descubrir:${palabrasNombre(p.nombre).join('-')}|${palabrasNombre(p.organizacion).join('-')}`.slice(0, 200);
    const { data: fila, error } = await admin
      .from('fuentes_personas')
      .upsert(
        {
          fuente: 'Búsqueda en fuentes oficiales',
          fuente_fecha: p.fecha_fuente || hoy,
          fuente_clave: clave,
          jurisdiccion: p.ambito === 'UE' ? 'UE' : 'España',
          tipo_institucion: tipoInstitucion(p.organizacion, p.ambito),
          institucion: p.organizacion,
          unidad: p.unidad || null,
          nombre: p.nombre,
          cargo: p.cargo,
          banda: bandaDeCargo(p.cargo),
          es_titular: true,
          web: p.fuente_url || null,
          extra: { alta: 'descubrir', descubrimiento: d.id, fuente_url: p.fuente_url || null, dudoso: !!p.dudoso, fecha: hoy },
          activo: true,
        },
        { onConflict: 'fuente_clave' }
      )
      .select('id')
      .single();
    if (error) {
      console.error('[contactos/descubrir/alta]', error.message);
      continue;
    }
    ids.push(`fuente:${fila.id}`);
    altas += 1;
  }

  if (!ids.length) return NextResponse.json({ error: 'No se pudo dar de alta a nadie' }, { status: 500 });
  const { data: filas } = await admin.from('directorio_pro').select(COLUMNAS).in('id', ids);
  return NextResponse.json({ filas: filas || [], altas });
}
