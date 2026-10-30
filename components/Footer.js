import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="ft">
      <div className="ft-inner">
        <span>© {year} GovTalent. Todos los derechos reservados</span>
        <Link href="/legal">Aviso legal</Link>
        <Link href="/privacidad">Privacidad</Link>
        <Link href="/condiciones">Condiciones de contratación</Link>
        <Link href="/cookies">Cookies</Link>
        <a href="mailto:hola@govtalent.app">Contacto: hola@govtalent.app</a>
      </div>
    </footer>
  );
}
