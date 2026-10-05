import { redirect } from 'next/navigation';

/**
 * Desde el 05-10-2026 Regulatorio se divide en Unión Europea y España,
 * cada una con su portada (components/RegulatorioPortada.js). Esta
 * dirección se mantiene porque la enlazan correos, alarmas y migas de
 * pan: lleva a España.
 */
export default function RegulatorioRedirige() {
  redirect('/regulatorio/espana');
}
