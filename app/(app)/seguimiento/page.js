import { redirect } from 'next/navigation';

// Seguimiento se fusionó con Novedades (18-11-2026): es su pestaña «Lo que
// sigues». Esta ruta se mantiene para los enlaces de los correos y del MCP.
// Los enlaces antiguos a ?alarmas=1 y ?ajustes=1 siguen llevando a /alarmas.
export default function SeguimientoPage({ searchParams }) {
  if (searchParams?.alarmas === '1' || searchParams?.ajustes === '1') redirect('/alarmas');
  redirect('/novedades?ver=seguimiento');
}
