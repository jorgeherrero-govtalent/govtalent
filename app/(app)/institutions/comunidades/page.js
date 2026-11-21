'use client';

import DirectorioListado from '@/components/DirectorioListado';
import { pestanasComunidades } from '@/components/PestanasComunidades';

// Comunidades autónomas, pestaña Parlamentos. Los gobiernos tienen su
// pestaña (./gobiernos) desde el 21-11-2026; los TSJ no van aquí.
export default function ComunidadesPage() {
  return (
    <DirectorioListado
      slug="comunidades"
      base="/institutions/comunidades"
      volverA="/institutions"
      volverEtiqueta="Instituciones"
      pestanas={pestanasComunidades('Parlamentos')}
    />
  );
}
