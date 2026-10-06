'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Si el usuario tiene el Directorio: los contactos (correo, teléfono y web
 * de cargos, unidades, diputados y asesores) y la Base de datos.
 *
 * Desde octubre de 2026 el Directorio se contrata aparte del plan de
 * vigilancia, así que ya no basta con usePlanPro para enseñar un correo.
 * La regla vive en SQL (public.tiene_directorio, sql/73).
 *
 * Igual que usePlanPro, DEVUELVE null MIENTRAS CARGA: quien lo use no
 * debe pintar nada mientras sea null, para no hacer parpadear un candado.
 *
 * NO ES UNA MEDIDA DE SEGURIDAD: lo que protege el dato es que las rutas
 * del servidor no lo devuelvan sin el Directorio (lib/accesoContactos.js).
 */
export default function useDirectorio() {
  const supabase = createClient();
  const [tiene, setTiene] = useState(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        if (!cancelado) setTiene(false);
        return;
      }
      const { data, error } = await supabase.rpc('tiene_directorio');
      if (!cancelado) setTiene(!error && data === true);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return tiene;
}
