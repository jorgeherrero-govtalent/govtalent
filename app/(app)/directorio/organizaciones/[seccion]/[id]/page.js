'use client';

import { notFound } from 'next/navigation';
import DirectorioFicha from '@/components/DirectorioFicha';
import { SECCIONES_DIRECTORIO } from '@/lib/directorio';

// Ficha de una organización del directorio: un medio, un partido, una
// patronal… El id es el de su primer bloque en directorio_entidades.
export default function FichaOrganizacionPage({ params }) {
  const seccion = SECCIONES_DIRECTORIO.find((s) => s.slug === params.seccion);
  if (!seccion || !seccion.cat) notFound();
  return (
    <DirectorioFicha
      slug={params.seccion}
      id={params.id}
      volverA={`/directorio/organizaciones/${params.seccion}`}
      volverEtiqueta={seccion.titulo}
    />
  );
}
