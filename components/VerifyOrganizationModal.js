'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function VerifyOrganizationModal({ organizationId, organizationName, userId, onClose, onSubmitted }) {
  const supabase = createClient();
  const [roleTitle, setRoleTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.type.startsWith('image/')) {
      setError('El documento debe ser un PDF o una imagen (JPG, PNG).');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('El archivo no puede superar los 10 MB.');
      return;
    }
    setError('');
    setFile(f);
  }

  async function submit() {
    if (!file) {
      setError('Sube un documento que acredite tu vínculo con la organización (ej. CIF, escritura, tarjeta de representante).');
      return;
    }
    setError('');
    setUploading(true);

    const ext = file.name.split('.').pop();
    const path = `${userId}/${organizationId}.${ext}`;

    const { error: upErr } = await supabase.storage.from('claim-documents').upload(path, file, { upsert: true });
    if (upErr) {
      setUploading(false);
      setError('No se pudo subir el documento. Inténtalo de nuevo.');
      return;
    }

    const res = await fetch('/api/organizations/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId, documentPath: path, roleTitle, note }),
    });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) {
      setError(data.error || 'No se pudo enviar la solicitud.');
      return;
    }

    toast('Solicitud enviada ✓ Te avisaremos cuando la revisemos');
    if (onSubmitted) onSubmitted();
    if (onClose) onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,18,.5)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 460, width: '100%', position: 'relative' }}>
        <div
          onClick={onClose}
          title="Cerrar"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            cursor: 'pointer',
            color: '#aaa',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
          }}
        >
          <i className="ti ti-x" style={{ fontSize: 15 }}></i>
        </div>

        <div className="modal-head">
          <h2>Verifica tu organización</h2>
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          <p style={{ fontSize: 12.5, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
            Antes de publicar tu primera oferta, necesitamos confirmar que representas a <b>{organizationName}</b> —
            un documento acreditativo (ej. CIF de la organización, escritura de constitución, o tarjeta de
            representante). Lo revisará el equipo de GovTalent, normalmente en menos de 48h. Mientras tanto, tu
            oferta queda guardada como borrador.
          </p>

          {error && <div className="err-msg" style={{ marginBottom: 12 }}>{error}</div>}

          <div className="field">
            <label>Tu cargo en la organización</label>
            <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Ej: Directora de Comunicación" />
          </div>

          <div className="field">
            <label>Documento acreditativo *</label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: '1.5px dashed #d0cfc8',
                borderRadius: 10,
                padding: '14px 16px',
                cursor: 'pointer',
                fontSize: 12.5,
                color: file ? '#1d6f5c' : '#888',
              }}
            >
              <i className={`ti ${file ? 'ti-file-check' : 'ti-upload'}`} style={{ fontSize: 18 }}></i>
              {file ? file.name : 'Subir PDF o imagen (máx. 10 MB)'}
              <input type="file" accept="application/pdf,image/*" hidden onChange={handleFileChange} />
            </label>
          </div>

          <div className="field">
            <label>Nota adicional (opcional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cualquier información que nos ayude a verificar tu solicitud"
              rows={3}
            />
          </div>

          <button className="mbtn" disabled={uploading} onClick={submit}>
            {uploading ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}
