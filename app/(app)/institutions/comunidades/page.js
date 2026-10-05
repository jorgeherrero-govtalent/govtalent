'use client';

import DirectorioListado from '@/components/DirectorioListado';

// Comunidades autónomas: Gobierno, Parlamento y TSJ de cada una.
export default function ComunidadesPage() {
  return (
    <DirectorioListado slug="comunidades" base="/institutions/comunidades" volverA="/institutions" volverEtiqueta="Instituciones" />
  );
}
