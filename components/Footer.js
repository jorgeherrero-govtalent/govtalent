import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="ft">
      <div className="ft-inner">
        <span>© {year} GovTalent. Todos los derechos reservados</span>
        <span className="ft-sep">·</span>
        <Link href="/legal">Aviso legal y Privacidad</Link>
        <span className="ft-sep">·</span>
        <Link href="/cookies">Configuración y política de Cookies</Link>
        <span className="ft-sep">·</span>
        <a href="mailto:info@govtalent.io">Contacto: info@govtalent.io</a>
      </div>
    </footer>
  );
}
