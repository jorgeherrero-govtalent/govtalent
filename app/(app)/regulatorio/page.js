import PanelRegulatorio from '@/components/PanelRegulatorio';

/**
 * Regulatorio abre en su Dashboard (20-11-2026): lo que hacen tus agentes y la
 * actividad general. España y Unión Europea, las portadas de fuentes, son
 * las otras dos pestañas (components/RegulatorioPortada.js).
 *
 * Hasta ahora esta dirección redirigía a /regulatorio/espana. La enlazan
 * correos, alarmas y migas de pan: ahora llevan al Dashboard, que tiene a un
 * clic la pestaña España.
 */
export default function Regulatorio() {
  return <PanelRegulatorio />;
}
