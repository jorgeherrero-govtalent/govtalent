// =====================================================================
// CORREO DE LOS ASESORES DE UN GRUPO — solo para quien tiene el plan
// app/api/instituciones/asesores/contacto/route.js
//
// El BOCG publica el nombramiento de cada asesor, pero nunca su correo:
// las direcciones salen de enriquecimiento, no de la Cámara. Por eso van
// por la misma puerta que las de la AGE y no por la de los diputados,
// que sí son públicas en congreso.es.
//
// POR QUÉ DEVUELVE EL GRUPO ENTERO Y NO UNA PERSONA. La pestaña Equipo
// pinta hasta noventa filas de una vez. Pedir un correo por fila serían
// noventa viajes y noventa comprobaciones de plan para la misma
// respuesta. Se resuelve con una consulta por grupo.
//
// Va con la clave de servicio a propósito: la columna `email` está
// cerrada a los roles del cliente (sql/54), así que esta ruta es la
// única puerta. Lo que el navegador sí puede leer es `tiene_email`
// (sql/55), que dice si hay correo pero no cuál: con eso se pinta el
// candado sin que el dato salga de aquí.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const grupoId = new URL(request.url).searchParams.get('grupo');
  if (!grupoId) {
    return NextResponse.json({ error: 'Falta el grupo' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();

  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return NextResponse.json(
      { error: 'Tu plan no incluye el contacto de los asesores parlamentarios' },
      { status: 403 }
    );
  }

  // `objecion` se filtra en origen, igual que en el directorio
  // institucional: quien ha ejercido su derecho de oposición no sale por
  // ninguna puerta, tenga o no tenga plan quien pregunta.
  const { data, error } = await admin
    .from('parliamentary_staff')
    .select('slug, email')
    .eq('parliamentary_group_id', grupoId)
    .eq('active', true)
    .eq('objecion', false)
    .not('email', 'is', null);

  if (error) {
    console.error('[asesores/contacto]', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar los contactos' }, { status: 500 });
  }

  // Mapa slug -> correo. La página lo cruza con las filas que ya tiene,
  // sin volver a pedir nada.
  const correos = {};
  for (const fila of data || []) {
    if (fila.slug && fila.email) correos[fila.slug] = fila.email;
  }

  return NextResponse.json({ correos });
}
