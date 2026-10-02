'use client';

import AlarmasTab from '@/components/AlarmasTab';

/**
 * Alarmas: crear, revisar y editar lo que el agente vigila por ti, y
 * cómo te avisa.
 *
 * Lo que encuentran las alarmas se revisa en /novedades. Aquí llega lo
 * que se escribe en la caja de la home (AlarmasTab lee CLAVE_PEDIDO al
 * cargar y se lo pide al agente con su progreso a la vista).
 */
export default function AlarmasPage() {
  return (
    <div className="sec" style={{ maxWidth: 1040 }}>
      <AlarmasTab seccion="alarmas" />
    </div>
  );
}
