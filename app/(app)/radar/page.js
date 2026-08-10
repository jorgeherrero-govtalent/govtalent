import { redirect } from 'next/navigation';

// La pantalla de inicio ("Resumen de hoy") ahora vive en la raíz ("/"), no
// aquí. Este archivo se queda solo como redirección por si alguien tiene
// /radar guardado en favoritos o enlazado desde fuera.
export default function RadarRedirect() {
  redirect('/');
}
