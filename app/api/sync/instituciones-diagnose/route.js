import { NextResponse } from 'next/server';
import { diagnoseFase2 } from '@/lib/instituciones/syncDeputyDetails';

export const maxDuration = 30;

// Ruta TEMPORAL de solo lectura, sin protección a propósito, para poder
// abrirla directamente desde el navegador mientras validamos el enfoque de
// la Fase 2. No toca la base de datos ni expone nada sensible — solo lee
// una página pública del Congreso y devuelve un diagnóstico. Borrar este
// archivo en cuanto terminemos de validar.
export async function GET() {
  try {
    const result = await diagnoseFase2();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
