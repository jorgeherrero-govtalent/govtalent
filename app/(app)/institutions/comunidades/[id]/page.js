'use client';

import DirectorioFicha from '@/components/DirectorioFicha';

// Ficha de una institución autonómica (Gobierno, Parlamento o TSJ).
export default function FichaComunidadPage({ params }) {
  return (
    <DirectorioFicha slug="comunidades" id={params.id} volverA="/institutions/comunidades" volverEtiqueta="Comunidades autónomas" />
  );
}
