import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="ft">
      <div className="ft-inner">
        <span>© {year} GovTalent. Todos los derechos reservados</span>
        <span className="ft-sep">·</span>
        <Link href="/legal">Aviso legal</Link>
        <span className="ft-sep">·</span>
        <Link href="/privacidad">Privacidad</Link>
        <span className="ft-sep">·</span>
        <Link href="/condiciones">Condiciones del servicio</Link>
        <span className="ft-sep">·</span>
        <Link href="/cookies">Cookies</Link>
        <span className="ft-sep">·</span>
        <a href="mailto:hola@govtalent.app">Contacto: hola@govtalent.app</a>
      </div>
    </footer>
  );
}
