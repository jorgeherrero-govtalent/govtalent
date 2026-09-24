import { redirect } from 'next/navigation';

/**
 * El análisis de sector se ha fusionado con las alarmas (24-09-2026).
 *
 * Crear una alarma hace lo mismo que hacía este análisis —describir la
 * organización, sacar criterios y ver qué de lo abierto le afecta, con
 * su motivo— y además vigila a partir de ese momento. Esta dirección se
 * mantiene porque la enlazan correos ya enviados, la home y Regulatorio:
 * lleva directamente a Alarmas.
 */
export default function AnalisisSectorRedirige() {
  redirect('/seguimiento?alarmas=1');
}
