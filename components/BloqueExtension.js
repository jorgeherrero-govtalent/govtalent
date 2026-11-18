'use client';

import { URL_EXTENSION } from '@/lib/extension';

/**
 * Configuración → Extensión de Chrome (18-11-2026).
 *
 * La misma idea que «Asistentes de IA»: una tarjeta con lo que es y el
 * botón para instalarla, los pasos para empezar y lo que se puede hacer.
 * La extensión usa la sesión de GovTalent del propio navegador, así que no
 * hay nada que conectar ni que revocar desde aquí.
 */

const BORDE = '#e8e6df';
const GRIS = '#6f6c64';
const MORADO = '#6d5aef';
const CAJA = { background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 10 };

const PASOS = [
  { titulo: 'Añádela a Chrome', texto: 'Pulsa «Añadir a Chrome» y acepta en Chrome Web Store.' },
  { titulo: 'Fíjala en la barra', texto: 'Abre el icono de extensiones de Chrome (la pieza de puzle) y pulsa la chincheta junto a GovTalent para tenerla siempre a mano.' },
  { titulo: 'Inicia sesión en GovTalent', texto: 'La extensión usa tu sesión de govtalent.app en ese mismo navegador. Si no has entrado, te lo pide.' },
  { titulo: 'Ábrela donde estés', texto: 'En un perfil de LinkedIn o en la web de una institución, pulsa el icono de GovTalent: el panel se abre a la derecha.' },
];

const USOS = [
  { icono: 'ti-brand-linkedin', titulo: 'En LinkedIn', texto: 'Con un perfil abierto, te dice si esa persona está en GovTalent y te enseña su cargo, su correo y su organización.' },
  { icono: 'ti-world', titulo: 'En cualquier web', texto: 'Reconoce de qué organización es la página y te enseña sus personas. El buscador está siempre visible.' },
  { icono: 'ti-click', titulo: 'Con el botón derecho', texto: 'Selecciona un nombre en cualquier página y elige «Buscar en GovTalent».' },
  { icono: 'ti-mail-search', titulo: 'Quien no está en GovTalent', texto: 'Puedes buscar su correo desde el panel, con tus créditos, y guardarlo en una lista.' },
];

export default function BloqueExtension() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <style>{`
        .ext-usos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 760px) { .ext-usos { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ ...CAJA, padding: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 46, height: 46, borderRadius: 11, background: '#f7f6f2', border: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-brand-chrome" style={{ fontSize: 26, color: '#1a1a18' }} aria-hidden="true"></i>
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>GovTalent para Chrome</div>
          <div style={{ fontSize: 13.5, color: GRIS, marginTop: 3, lineHeight: 1.55 }}>
            Consulta GovTalent desde LinkedIn o desde cualquier web: quién es, su cargo, su correo y su organización.
          </div>
        </div>
        <a href={URL_EXTENSION} target="_blank" rel="noopener noreferrer" className="btn-ai" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <i className="ti ti-brand-chrome" aria-hidden="true"></i>
          Añadir a Chrome
        </a>
      </div>

      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 10 }}>Cómo empezar</div>
        <div style={{ ...CAJA, overflow: 'hidden' }}>
          {PASOS.map((p, i) => (
            <div key={p.titulo} style={{ display: 'flex', gap: 14, padding: '14px 18px', borderTop: i ? `1px solid ${BORDE}` : 'none', alignItems: 'flex-start' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#f0eefe', color: MORADO, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>
                {i + 1}
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.titulo}</div>
                <div style={{ fontSize: 13.5, color: GRIS, marginTop: 2, lineHeight: 1.55 }}>{p.texto}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 10 }}>Qué puedes hacer</div>
        <div className="ext-usos">
          {USOS.map((u) => (
            <div key={u.titulo} style={{ ...CAJA, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: '#f0eefe', color: MORADO, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${u.icono}`} style={{ fontSize: 18 }} aria-hidden="true"></i>
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{u.titulo}</div>
                <div style={{ fontSize: 13.5, color: GRIS, marginTop: 2, lineHeight: 1.55 }}>{u.texto}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
