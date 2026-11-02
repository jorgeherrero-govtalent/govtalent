import { redirect } from 'next/navigation';

// La entrada a un parlamento autonómico es su pestaña de Comisiones, como
// la del Congreso (/institutions/comisiones). El Senado, que no tiene
// comisiones cargadas, entra por sus senadores (/institutions/senado).
export default function ParlamentoPage({ params }) {
  if (params.p === 'senado') redirect('/institutions/senado/senadores');
  redirect(`/institutions/parlamentos/${params.p}/comisiones`);
}
