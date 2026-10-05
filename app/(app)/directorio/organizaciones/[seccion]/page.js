'use client';

import { notFound } from 'next/navigation';
import DirectorioListado from '@/components/DirectorioListado';
import { SECCIONES_DIRECTORIO } from '@/lib/directorio';

// Listado de una sección de Organizaciones (patronales, prensa, ONG…).
export default function SeccionOrganizacionesPage({ params }) {
  if (!SECCIONES_DIRECTORIO.some((s) => s.slug === params.seccion)) notFound();
  return (
    <DirectorioListado
      slug={params.seccion}
      base={`/directorio/organizaciones/${params.seccion}`}
      volverA="/directorio/organizaciones"
      volverEtiqueta="Organizaciones"
    />
  );
}
