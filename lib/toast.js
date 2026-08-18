'use client';

/**
 * Avisos de la plataforma.
 *
 * La forma de llamarlo no cambia: toast('Guardado') sigue funcionando en
 * las decenas de sitios que ya lo usan. Lo que se añade son variantes
 * para que el color informe en vez de decorar.
 *
 *   toast('Guardado')                    confirmación
 *   toast.info('Has dejado de seguir')   información
 *   toast.error('No se ha podido')       error
 *
 * Antes todo salía en verde, también al eliminar algo o al fallar. El
 * verde debería significar "ha ido bien", no "ha pasado algo".
 */

let listeners = [];
let siguienteId = 1;

function emitir(msg, type = 'success', options = {}) {
  const aviso = {
    id: siguienteId++,
    msg,
    type,
    // Un aviso con acción dura más: hay que darle tiempo a leerlo y
    // decidir.
    duration: options.duration ?? (options.action ? 8000 : 4000),
    action: options.action || null,
  };
  listeners.forEach((fn) => fn(aviso));
  return aviso.id;
}

export function toast(msg, options) {
  return emitir(msg, 'success', options);
}

toast.success = (msg, options) => emitir(msg, 'success', options);
toast.info = (msg, options) => emitir(msg, 'info', options);
toast.error = (msg, options) => emitir(msg, 'error', options);

// Se mantiene el nombre antiguo por compatibilidad, pero se añade uno
// sin el prefijo "use": no es un hook y React avisa si se llama dentro
// de un efecto con ese nombre.
export function subscribeToast(cb) {
  if (typeof window === 'undefined') return () => {};
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((fn) => fn !== cb);
  };
}

export function useToastListener(cb) {
  return subscribeToast(cb);
}

export function removeToastListener(cb) {
  listeners = listeners.filter((fn) => fn !== cb);
}
