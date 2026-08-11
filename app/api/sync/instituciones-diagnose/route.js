import { NextResponse } from 'next/server';
import { diagnoseAgendaComunicacion } from '@/lib/instituciones/syncDeputyDetails';

export const maxDuration = 30;

// Ruta TEMPORAL de solo lectura, sin protección a propósito, para poder
// abrirla directamente desde el navegador mientras validamos la Agenda de
// la Comunicación (Secretarios de Estado, gabinetes). No toca la base de
// datos ni expone nada sensible. Borrar este archivo en cuanto terminemos
// de validar.
export async function GET() {
  try {
    const result = await diagnoseAgendaComunicacion();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
