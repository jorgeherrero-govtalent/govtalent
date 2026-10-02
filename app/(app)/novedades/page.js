'use client';

import AlarmasTab from '@/components/AlarmasTab';

/**
 * Novedades: la bandeja de lo que te afecta.
 *
 * Lo que encuentran tus alarmas y lo que cambia en lo que sigues, en una
 * lista, con una etiqueta que dice de dónde viene cada cosa. Es la
 * entrada del menú que lleva el contador. Crear y editar alarmas vive en
 * /alarmas, que comparte componente con esta página.
 */
export default function NovedadesPage() {
  return (
    <div className="sec" style={{ maxWidth: 1040 }}>
      <AlarmasTab seccion="novedades" />
    </div>
  );
}
