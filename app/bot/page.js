import LegalPageShell from '@/components/LegalPageShell';

// Página pública que explica qué es GovTalentBot. Es la URL que va en su
// identificación (lib/govtalentBot.js) y en las peticiones de acceso a
// los parlamentos. Pública: está en PUBLIC_LEGAL_PATHS del middleware.

export const metadata = {
  title: 'GovTalentBot · GovTalent',
  description: 'Qué es GovTalentBot, qué publicaciones lee, cómo lo hace y cómo contactar o limitar su acceso.',
};

export default function BotPage() {
  return (
    <LegalPageShell title="GovTalentBot">
      <p>GovTalentBot es el nombre con el que GovTalent se identifica cuando lee de forma automatizada las webs de
      instituciones públicas.</p>
      <p>GovTalent (<a href="https://govtalent.app" style={aLink}>govtalent.app</a>) es una plataforma española de
      seguimiento legislativo y regulatorio para profesionales de asuntos públicos.</p>

      <h3>Qué lee</h3>
      <p>Solo publicaciones oficiales y públicas: boletines oficiales, diarios de sesiones, órdenes del día, agendas
      y fichas de tramitación de iniciativas.</p>
      <p>No accede a zonas privadas, no rellena formularios y no recoge datos personales que no figuren en esas
      publicaciones oficiales.</p>

      <h3>Cómo lo hace</h3>
      <ul>
        <li>Se identifica siempre con este agente de usuario:
          <pre style={pre}>Mozilla/5.0 (compatible; GovTalentBot/1.0; +https://govtalent.app/bot)</pre>
        </li>
        <li>Respeta el archivo robots.txt de cada sitio, incluida la directiva Crawl-delay.</li>
        <li>Hace pocas peticiones, de una en una por sitio, y concentradas en horario de publicación.</li>
        <li>Cita siempre el documento original y enlaza a la web de la institución.</li>
      </ul>

      <h3>Cómo limitar o autorizar su acceso</h3>
      <p>GovTalentBot sigue las reglas que el robots.txt dirige a su nombre y, si no hay ninguna, las del grupo
      general. Por ejemplo, para impedir el acceso a todo el sitio:</p>
      <pre style={pre}>{'User-agent: GovTalentBot\nDisallow: /'}</pre>
      <p>Y para permitirlo, aunque el resto de bots tengan el acceso restringido:</p>
      <pre style={pre}>{'User-agent: GovTalentBot\nAllow: /\nCrawl-delay: 10'}</pre>

      <h3>Contacto</h3>
      <p>Para cualquier consulta, petición de autorización o incidencia, escriba a{' '}
      <a href="mailto:hola@govtalent.app" style={aLink}>hola@govtalent.app</a>. Atendemos estas peticiones con
      prioridad.</p>

      <p style={updated}>Última actualización: 4 de octubre de 2026.</p>
    </LegalPageShell>
  );
}

const aLink = { color: '#1d6f5c' };
const pre = {
  background: '#faf9f5',
  border: '.5px solid #e0dfd8',
  borderRadius: 6,
  padding: '8px 12px',
  margin: '8px 0',
  fontSize: 12.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
const updated = { marginTop: 24, fontSize: 12, color: '#999' };
