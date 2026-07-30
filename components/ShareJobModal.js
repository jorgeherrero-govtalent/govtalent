'use client';

import { toast } from '@/lib/toast';

function publicJobUrl(jobId) {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/empleo/${jobId}`;
}

function buildShareTemplates(job, orgName, voice) {
  const url = publicJobUrl(job.id);
  const name = orgName || 'esta organización';
  const modLabel = job.modality === 'presencial' ? 'Presencial' : job.modality === 'hibrido' ? 'Híbrido' : 'Remoto';

  if (voice === 'employer') {
    return {
      linkedin: `📢 Buscamos ${job.title} en ${name}.\n\n📍 ${job.location} · ${modLabel}\n\nSi te interesa o conoces a alguien que pueda encajar, aquí tienes toda la información:\n${url}`,
      whatsapp: `¡Hola! 👋 Desde *${name}* buscamos *${job.title}*. Si te interesa o conoces a alguien que pueda encajar, aquí está la oferta: ${url}`,
    };
  }

  return {
    linkedin: `📢 Desde ${name} están buscando un/a ${job.title}, ¿te interesa?\n\n📍 ${job.location} · ${modLabel}\n\nSi conoces a alguien que pueda encajar (¡o te interesa a ti!), aquí tienes toda la información:\n${url}`,
    whatsapp: `¡Hola! 👋 Desde *${name}* están buscando un/a *${job.title}*, ¿te interesa? Aquí está la oferta: ${url}`,
  };
}

export default function ShareJobModal({ job, orgName, voice = 'recommend', onClose }) {
  if (!job) return null;
  const t = buildShareTemplates(job, orgName, voice);
  const url = publicJobUrl(job.id);

  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h2>
            <i className="ti ti-share" style={{ color: '#6d5aef' }}></i> Compartir "{job.title}"
          </h2>
          <div className="modal-x" onClick={onClose}>
            <i className="ti ti-x"></i>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: '#888', marginBottom: 16 }}>
          Comparte esta oferta con alguien a quien le pueda interesar — puede verla y aplicar sin tener cuenta
          todavía en GovTalent.
        </p>

        <div className="field">
          <label>Enlace público</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={url} onClick={(e) => e.target.select()} />
            <button
              type="button"
              className="btn-o"
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => {
                navigator.clipboard?.writeText(url);
                toast('Enlace copiado ✓');
              }}
            >
              <i className="ti ti-copy"></i> Copiar
            </button>
          </div>
        </div>

        <div style={{ background: '#f8faf9', borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              <i className="ti ti-brand-linkedin" style={{ color: '#888' }}></i> LinkedIn
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn-g"
                style={{ fontSize: 11.5, padding: '5px 9px' }}
                onClick={() => {
                  navigator.clipboard?.writeText(t.linkedin);
                  toast('Texto copiado ✓ — pégalo al crear la publicación');
                }}
              >
                Copiar texto
              </button>
              <a
                className="btn-p"
                style={{ fontSize: 11.5, padding: '5px 9px', textDecoration: 'none' }}
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir LinkedIn
              </a>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#666', whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'auto' }}>
            {t.linkedin}
          </div>
          <p style={{ fontSize: 10.5, color: '#aaa', marginTop: 6 }}>
            LinkedIn no permite prerrellenar el texto de la publicación — cópialo y pégalo tú al abrir el editor.
          </p>
        </div>

        <div style={{ background: '#f8faf9', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              <i className="ti ti-brand-whatsapp" style={{ color: '#888' }}></i> WhatsApp
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn-g"
                style={{ fontSize: 11.5, padding: '5px 9px' }}
                onClick={() => {
                  navigator.clipboard?.writeText(t.whatsapp);
                  toast('Mensaje copiado ✓');
                }}
              >
                Copiar
              </button>
              <a
                className="btn-p"
                style={{ fontSize: 11.5, padding: '5px 9px', textDecoration: 'none' }}
                href={`https://wa.me/?text=${encodeURIComponent(t.whatsapp)}`}
                target="_blank"
                rel="noreferrer"
              >
                Enviar
              </a>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#666', whiteSpace: 'pre-wrap' }}>{t.whatsapp}</div>
        </div>
      </div>
    </div>
  );
}
