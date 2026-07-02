import { redirect } from 'next/navigation';

// El onboarding ahora se muestra como ventana modal dentro de la app
// (ver components/OnboardingModal.js), no como página independiente.
export default function OnboardingRedirect() {
  redirect('/jobs');
}
