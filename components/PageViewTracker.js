'use client';

// Registro de páginas visitadas → tabla public.page_views (Supabase).
// Va montado UNA vez en app/(app)/layout.js y solo con sesión iniciada.
// Solo guarda la ruta (pathname), nunca la query string ni el texto de
// las búsquedas. Las escrituras no esperan respuesta: si fallan, no
// rompen la navegación ni muestran nada al usuario.
//
// La tabla solo admite INSERT (sin SELECT): por eso el insert no lleva
// .select(). El cierre lo hace la RPC cerrar_page_view, que pone la hora
// del servidor.

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function getTabId() {
  try {
    let id = sessionStorage.getItem('gt_tab_id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('gt_tab_id', id);
    }
    return id;
  } catch {
    return 'sin-tab';
  }
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const supabaseRef = useRef(null);
  const currentId = useRef(null);
  const currentPath = useRef(null);

  const db = () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  };

  const close = () => {
    const id = currentId.current;
    if (!id) return;
    currentId.current = null;
    try {
      db().rpc('cerrar_page_view', { p_id: id }).then(() => {}, () => {});
    } catch {}
  };

  const open = (path) => {
    let id;
    try {
      id = crypto.randomUUID();
    } catch {
      return;
    }
    currentId.current = id;
    currentPath.current = path;
    try {
      db()
        .from('page_views')
        .insert({
          id,
          path: path.slice(0, 300),
          referrer: document.referrer ? document.referrer.slice(0, 300) : null,
          tab_id: getTabId(),
          user_agent: navigator.userAgent.slice(0, 300),
        })
        .then(() => {}, () => {});
    } catch {}
  };

  // Cambio de ruta: cierra la visita anterior y abre la nueva.
  useEffect(() => {
    if (!pathname || pathname === currentPath.current) return; // evita duplicados al re-renderizar
    close();
    if (document.visibilityState === 'visible') open(pathname);
    else currentPath.current = pathname;
  }, [pathname]);

  // Pestaña oculta → cierra; vuelve a estar visible → abre otra visita de
  // la misma ruta. Al desmontarse (p. ej. al cerrar sesión) también cierra.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') close();
      else if (!currentId.current && currentPath.current) open(currentPath.current);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', close);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', close);
      close();
      currentPath.current = null;
    };
  }, []);

  return null;
}
