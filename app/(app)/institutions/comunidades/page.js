'use client';

import DirectorioListado from '@/components/DirectorioListado';

// Comunidades autónomas: Gobierno, Parlamento y TSJ de cada una, con los
// cargos de la Agenda de la Comunicación 2026-2027.
export default function ComunidadesPage() {
  return <DirectorioListado slug="comunidades" volverA="/institutions" volverEtiqueta="Instituciones" />;
}
