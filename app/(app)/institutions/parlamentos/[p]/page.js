import { redirect } from 'next/navigation';

// La entrada a un parlamento autonómico es su pestaña de Comisiones, como
// la del Congreso (/institutions/comisiones).
export default function ParlamentoPage({ params }) {
  redirect(`/institutions/parlamentos/${params.p}/comisiones`);
}
