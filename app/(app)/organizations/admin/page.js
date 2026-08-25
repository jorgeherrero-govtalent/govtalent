'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Aquí vivía el Dashboard: una pantalla entera para tres cifras y la
 * lista de ofertas. Las cifras están ahora en la cabecera de Talento y
 * las ofertas en su propia pestaña, así que no quedaba nada que enseñar.
 *
 * La ruta se mantiene y redirige, porque hay enlaces guardados apuntando
 * aquí — el menú de la esquina, entre otros.
 */

export default function TalentoInicio() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/organizations/admin/jobs');
  }, [router]);

  return <div className="spinner"></div>;
}
