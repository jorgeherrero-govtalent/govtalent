'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Si el usuario tiene plan Pro.
 *
 * La consulta estaba repetida a mano en FollowButton, en la ficha de
 * iniciativas, en la de procedimientos y en la del Congreso, y cada
 * copia era una oportunidad de escribir `plan === 'Pro'` con mayúscula
 * o de olvidar el caso de que no haya sesión. Aquí vive una vez.
 *
 * DEVUELVE null MIENTRAS CARGA, y eso importa: con `false` de partida,
 * un usuario Pro vería aparecer un candado durante medio segundo antes
 * de que llegue la respuesta. Quien use el hook debe distinguir los tres
 * estados y no pintar nada mientras sea null.
 *
 *   const esPro = usePlanPro();
 *   if (esPro === null) return null;      // todavía no se sabe
 *   if (esPro === false) return <Panel/>; // sin plan
 *
 * NO ES UNA MEDIDA DE SEGURIDAD. Es para decidir qué se enseña. Lo que
 * de verdad protege un dato es no pedirlo, o RLS; una comprobación en el
 * navegador se salta con las herramientas de desarrollo.
 */
export default function usePlanPro() {
  const supabase = createClient();
  const [esPro, setEsPro] = useState(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;

      // Sin sesión no hay plan que consultar. Se resuelve a false y no a
      // null: null significa "aún no se sabe", y aquí ya se sabe.
      if (!uid) {
        if (!cancelado) setEsPro(false);
        return;
      }

      const { data: perfil } = await supabase.from('users').select('plan').eq('id', uid).single();
      if (!cancelado) setEsPro(perfil?.plan === 'pro');
    })();

    return () => {
      cancelado = true;
    };
    // supabase se recrea en cada render de createClient(), así que no va
    // en las dependencias: si fuera, esto se relanzaría en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return esPro;
}
