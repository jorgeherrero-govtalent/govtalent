// =====================================================================
// ANÁLISIS DE SECTOR — retirado
// app/api/sector/analyze/route.js
//
// Desde el 24-09-2026 el análisis de sector forma parte de las alarmas:
// /api/alarmas/proponer hace lo mismo (criterios, candidatos y
// evaluación con motivo) con límite de uso por plan y registro en
// ai_usage_log, que esta ruta no tenía.
//
// Se deja respondiendo 410 en vez de borrarla para que cualquier
// pestaña abierta con la página antigua reciba un mensaje claro y no un
// 404 sin explicación.
// =====================================================================

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    { error: 'El análisis de sector ahora se hace al crear una alarma, en Seguimiento → Alarmas.' },
    { status: 410 }
  );
}
