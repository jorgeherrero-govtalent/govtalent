import LegalPageShell from '@/components/LegalPageShell';

export const metadata = { title: 'Configuración y política de Cookies · GovTalent' };

export default function CookiesPage() {
  return (
    <LegalPageShell title="Configuración y política de Cookies">
      <p>GovTalent utiliza cookies técnicas necesarias para el funcionamiento de la plataforma (por ejemplo,
      mantener tu sesión iniciada) y, cuando corresponda, cookies analíticas para entender el uso de la Web y
      mejorar el servicio.</p>

      <p>Actualmente GovTalent no utiliza cookies de publicidad ni de seguimiento de terceros con fines
      comerciales. Si esto cambiara en el futuro, se actualizará este documento y se solicitará el consentimiento
      del Usuario antes de instalar cualquier cookie no técnica, mediante un panel de configuración específico.</p>

      <p>Mientras tanto, puedes gestionar las cookies directamente desde los ajustes de tu navegador. Si tienes
      dudas sobre el uso de cookies en GovTalent, escríbenos a{' '}
      <a href="mailto:[EMAIL DE CONTACTO]" style={{ color: '#1d6f5c' }}>[EMAIL DE CONTACTO]</a>.</p>
    </LegalPageShell>
  );
}
