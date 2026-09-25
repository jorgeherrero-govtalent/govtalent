'use client';

import AlarmasTab from '@/components/AlarmasTab';

/**
 * Alarmas: todo lo que te afecta, en una sola página.
 *
 * Lo que encuentran tus alarmas y lo que cambia en lo que sigues, en una
 * lista, con una etiqueta que dice de dónde viene cada cosa. Sustituye a
 * la campana y a la pestaña «Alarmas» de Seguimiento: eran dos sitios con
 * dos contadores para responder a la misma pregunta, «¿qué me afecta y
 * cuándo cierra?».
 *
 * /seguimiento se queda como la lista completa de lo que sigues, para
 * gestionarla. Sus enlaces antiguos (?alarmas=1, ?ajustes=1, los de los
 * correos) traen aquí.
 */
export default function AlarmasPage() {
  return (
    <div className="sec" style={{ maxWidth: 1040 }}>
      <AlarmasTab />
    </div>
  );
}
