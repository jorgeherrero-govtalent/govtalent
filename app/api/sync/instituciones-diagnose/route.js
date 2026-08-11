import { NextResponse } from 'next/server';
import { diagnoseBioPage } from '@/lib/instituciones/syncDeputyDetails';

export const maxDuration = 30;

// Ruta TEMPORAL de solo lectura, sin protección a propósito, para poder
// abrirla directamente desde el navegador mientras validamos la ficha de
// biografía de los ministros. No toca la base de datos ni expone nada
// sensible — solo lee una página pública de lamoncloa.gob.es y devuelve un
// diagnóstico. Borrar este archivo en cuanto terminemos de validar.
export async function GET() {
  try {
    const result = await diagnoseBioPage();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
