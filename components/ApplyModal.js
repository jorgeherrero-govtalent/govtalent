'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function ApplyModal({ job, onClose, onSuccess }) {
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [error, setError] = useState('');

  const [userId, setUserId] = useState(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cvUrl, setCvUrl] = useState(null);
  const [coverNote, setCoverNote] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    setUserId(authData.user.id);

    const [{ data: u }, { data: p }] = await Promise.all([
      supabase.from('users').select('first_name, last_name, professional_title, phone').eq('id', authData.user.id).single(),
      supabase.from('candidate_profiles').select('cv_url, contact_email').eq('user_id', authData.user.id).single(),
    ]);

    if (u) {
      setName(`${u.first_name || ''} ${u.last_name || ''}`.trim());
      setTitle(u.professional_title || '');
      setPhone(u.phone || '');
    }
    setEmail(p?.contact_email || authData.user.email || '');
    if (p) setCvUrl(p.cv_url || null);
    setLoading(false);
  }

  async function handleCvUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.type !== 'application/pdf') {
      toast('El CV debe estar en formato PDF');
      return;
    }
    setUploadingCv(true);
    const path = `${userId}/cv.pdf`;
    const { error: upErr } = await supabase.storage.from('cvs').upload(path, file, { upsert: true });
    setUploadingCv(false);
    if (upErr) {
      toast('No se pudo subir el CV');
      return;
    }
    const { data } = supabase.storage.from('cvs').getPublicUrl(path);
    const newUrl = `${data.publicUrl}?t=${Date.now()}`;
    await supabase
      .from('candidate_profiles')
      .update({ cv_url: newUrl, cv_uploaded_at: new Date().toISOString() })
      .eq('user_id', userId);
    setCvUrl(newUrl);
    toast('CV actualizado ✓');
  }

  function goStep2() {
    if (!phone.trim()) {
      setError('Indica un teléfono de contacto para continuar');
      return;
    }
    setError('');
    setStep(2);
  }

  function goStep3() {
    if (!cvUrl) {
      setError('Sube tu CV en PDF para continuar');
      return;
    }
    setError('');
    setStep(3);
  }

  async function submitApplication() {
    setSubmitting(true);
    setError('');

    await supabase.from('users').update({ phone: phone.trim() }).eq('id', userId);

    const { error: appErr } = await supabase.from('job_applications').insert({
      job_id: job.id,
      candidate_id: userId,
      cover_note: coverNote.trim() || null,
      cv_url_snapshot: cvUrl,
    });

    setSubmitting(false);
    if (appErr) {
      setError('No se pudo enviar la solicitud. Inténtalo de nuevo.');
      return;
    }
    toast('Solicitud enviada ✓');
    onSuccess();
  }

  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h2>Solicitar empleo</h2>
          <div className="modal-x" onClick={onClose}>
            <i className="ti ti-x"></i>
          </div>
        </div>

        <div style={{ fontSize: 13, color: '#666', marginBottom: 18 }}>
          <b>{job.title}</b> · {job.organizations?.name}
        </div>

        <div className="m-steps">
          <div className={`m-sc ${step === 1 ? 'on' : 'done'}`}>1</div>
          <div className={`m-sl ${step > 1 ? 'done' : ''}`}></div>
          <div className={`m-sc ${step === 2 ? 'on' : step > 2 ? 'done' : ''}`}>2</div>
          <div className={`m-sl ${step > 2 ? 'done' : ''}`}></div>
          <div className={`m-sc ${step === 3 ? 'on' : step > 3 ? 'done' : ''}`}>3</div>
          <div className={`m-sl ${step > 3 ? 'done' : ''}`}></div>
          <div className={`m-sc ${step === 4 ? 'on' : ''}`}>4</div>
        </div>

        {loading ? (
          <div className="spinner"></div>
        ) : (
          <>
            {error && <div className="err-msg">{error}</div>}

            {step === 1 && (
              <div>
                <div className="m-title">
                  <h3>Información de contacto</h3>
                  <p>Así te podrá contactar la organización</p>
                </div>
                <div className="field">
                  <label>Nombre</label>
                  <input value={name} disabled style={{ background: '#f4f4f0', color: '#888' }} />
                </div>
                <div className="two">
                  <div className="field">
                    <label>Email de contacto</label>
                    <input value={email} disabled style={{ background: '#f4f4f0', color: '#888' }} />
                  </div>
                  <div className="field">
                    <label>Teléfono *</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+34 600 000 000"
                    />
                  </div>
                </div>
                <div className="m-foot">
                  <div></div>
                  <button className="m-next" onClick={goStep2}>
                    Continuar <i className="ti ti-arrow-right"></i>
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="m-title">
                  <h3>Currículum (CV)</h3>
                  <p>Se adjuntará a tu solicitud</p>
                </div>
                {cvUrl ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: '#f8faf9',
                      border: '1px solid #e0dfd8',
                      borderRadius: 10,
                      padding: 14,
                      marginBottom: 14,
                    }}
                  >
                    <i className="ti ti-file-cv" style={{ fontSize: 22, color: '#1d6f5c' }}></i>
                    <div style={{ flex: 1, fontSize: 13 }}>Tu CV está listo para enviar</div>
                    <a href={cvUrl} target="_blank" rel="noreferrer" className="btn-g" style={{ textDecoration: 'none' }}>
                      Ver
                    </a>
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: '#999', marginBottom: 14 }}>
                    Todavía no tienes un CV subido. Súbelo para continuar.
                  </div>
                )}
                <label className="btn-o" style={{ display: 'inline-block', cursor: 'pointer' }}>
                  {uploadingCv ? 'Subiendo...' : cvUrl ? 'Reemplazar CV' : 'Subir CV (PDF)'}
                  <input type="file" accept="application/pdf" hidden onChange={handleCvUpload} disabled={uploadingCv} />
                </label>
                <div className="m-foot">
                  <button className="m-back" onClick={() => setStep(1)}>
                    <i className="ti ti-arrow-left"></i> Atrás
                  </button>
                  <button className="m-next" onClick={goStep3}>
                    Continuar <i className="ti ti-arrow-right"></i>
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <div className="m-title">
                  <h3>Carta de presentación</h3>
                  <p>Opcional, pero ayuda a destacar tu candidatura</p>
                </div>
                <textarea
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value)}
                  placeholder="Cuenta brevemente por qué encajas en este puesto..."
                  style={{
                    width: '100%',
                    minHeight: 130,
                    padding: '10px 12px',
                    border: '1px solid #e0dfd8',
                    borderRadius: 9,
                    fontSize: 13.5,
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                ></textarea>
                <div className="m-foot">
                  <button className="m-back" onClick={() => setStep(2)}>
                    <i className="ti ti-arrow-left"></i> Atrás
                  </button>
                  <button className="m-next" onClick={() => setStep(4)}>
                    Continuar <i className="ti ti-arrow-right"></i>
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="m-title">
                  <h3>Revisa tu solicitud</h3>
                  <p>Comprueba que todo esté correcto antes de enviarla</p>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.9, background: '#f8faf9', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div>
                    <b>Nombre:</b> {name}
                  </div>
                  <div>
                    <b>Email:</b> {email}
                  </div>
                  <div>
                    <b>Teléfono:</b> {phone}
                  </div>
                  <div>
                    <b>CV:</b> {cvUrl ? 'Adjunto ✓' : 'Sin adjuntar'}
                  </div>
                  <div>
                    <b>Carta de presentación:</b> {coverNote.trim() ? 'Incluida' : 'No incluida'}
                  </div>
                </div>
                <div className="m-foot">
                  <button className="m-back" onClick={() => setStep(3)}>
                    <i className="ti ti-arrow-left"></i> Atrás
                  </button>
                  <button className="m-next" disabled={submitting} onClick={submitApplication}>
                    <i className="ti ti-send"></i> {submitting ? 'Enviando...' : 'Enviar solicitud'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
