'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import {
  CAREER_SITUATIONS,
  ORG_TYPES,
  ROLE_TYPES,
  LEVEL_TYPES,
  SHOWS_DETAIL_QUESTIONS,
} from '@/lib/professionalSituation';

const WORK_AREAS = [
  'Public Affairs',
  'Relaciones Institucionales',
  'Comunicación Política',
  'Lobbying',
  'Asuntos Europeos',
  'Regulación',
  'Administración Pública',
  'Gabinete político',
  'Asesoría parlamentaria',
  'Think Tank / Investigación',
  'Derecho público',
  'Fondos europeos',
  'Diplomacia',
];

const INTEREST_AREAS = [
  'Política económica',
  'Política social',
  'Medio ambiente y clima',
  'Energía y transición',
  'Salud pública',
  'Digitalización e IA',
  'Defensa y seguridad',
  'Política exterior',
  'Política europea',
  'Justicia y derechos',
  'Educación e investigación',
  'Infraestructuras',
  'Empleo y relaciones laborales',
  'Transparencia',
  'Política territorial',
  'Sector financiero',
  'Agricultura y medio rural',
];

// Se muestra como ventana obligatoria mientras el usuario no haya
// completado el onboarding, independientemente de por dónde haya
// entrado a la aplicación (email, Google, enlace directo...).
export default function OnboardingModal({ userId, onComplete }) {
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    professional_title: '',
    looking_for_job: false,
    location: '',
    work_areas: ['Todos los sectores'],
    interest_areas: ['Todas las áreas'],
    career_situation: '',
    org_type: '',
    role_type: '',
    level_type: '',
  });

  function selectSingle(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleArea(field, value, allLabel) {
    setForm((f) => {
      let current = f[field];
      if (value === allLabel) return { ...f, [field]: [allLabel] };
      current = current.filter((v) => v !== allLabel);
      if (current.includes(value)) {
        current = current.filter((v) => v !== value);
      } else {
        if (current.length >= 3) return f;
        current = [...current, value];
      }
      if (current.length === 0) current = [allLabel];
      return { ...f, [field]: current };
    });
  }

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function chooseOrganization() {
    setRedirecting(true);
    window.location.href = '/organizations/new';
  }

  async function finish() {
    if (!userId) {
      setError('No se ha podido identificar tu sesión. Recarga la página e inténtalo de nuevo.');
      return;
    }
    setError('');
    setSaving(true);

    let avatarUrl = null;
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true });
      if (upErr) {
        console.error('Error subiendo avatar en onboarding:', upErr);
      } else {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = data.publicUrl;
      }
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({
        first_name: form.first_name,
        last_name: form.last_name,
        professional_title: form.professional_title,
        looking_for_job: form.looking_for_job,
        location: form.location,
        onboarding_completed: true,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('Error guardando el onboarding:', updateErr);
      setSaving(false);
      setError('No se pudieron guardar tus datos. Comprueba tu conexión e inténtalo de nuevo.');
      toast('No se pudo completar el registro');
      return;
    }

    const { error: workErr } = await supabase.from('user_work_areas').delete().eq('user_id', userId);
    if (workErr) console.error('Error limpiando áreas de trabajo:', workErr);
    if (!form.work_areas.includes('Todos los sectores')) {
      const { error: insWorkErr } = await supabase
        .from('user_work_areas')
        .insert(form.work_areas.map((area) => ({ user_id: userId, area })));
      if (insWorkErr) console.error('Error guardando áreas de trabajo:', insWorkErr);
    }

    const { error: intErr } = await supabase.from('user_interest_areas').delete().eq('user_id', userId);
    if (intErr) console.error('Error limpiando áreas de interés:', intErr);
    if (!form.interest_areas.includes('Todas las áreas')) {
      const { error: insIntErr } = await supabase
        .from('user_interest_areas')
        .insert(form.interest_areas.map((area) => ({ user_id: userId, area })));
      if (insIntErr) console.error('Error guardando áreas de interés:', insIntErr);
    }

    const { error: profileErr } = await supabase
      .from('candidate_profiles')
      .upsert(
        {
          user_id: userId,
          career_situation: form.career_situation || null,
          org_type: form.org_type || null,
          role_type: form.role_type || null,
          level_type: form.level_type || null,
        },
        { onConflict: 'user_id' }
      );
    if (profileErr) console.error('Error guardando situación profesional:', profileErr);

    setSaving(false);
    toast('¡Bienvenido/a a GovTalent! ✓');

    fetch('/api/email/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'candidate' }),
    }).catch((err) => console.error('Error enviando email de bienvenida:', err));

    if (onComplete) onComplete();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#f0efe9',
        zIndex: 5000,
        overflowY: 'auto',
      }}
    >
      <div className="ob-bar">
        <div className="logo">
          gov<span>talent</span>
        </div>
        {step > 0 && (
          <div className="stepper">
            <div className={`sc ${step > 1 ? 'done' : 'active'}`}>1</div>
            <div className={`sl2 ${step > 1 ? 'done' : ''}`}></div>
            <div className={`sc ${step > 2 ? 'done' : step === 2 ? 'active' : ''}`}>2</div>
            <div className={`sl2 ${step > 2 ? 'done' : ''}`}></div>
            <div className={`sc ${step > 3 ? 'done' : step === 3 ? 'active' : ''}`}>3</div>
            <div className={`sl2 ${step > 3 ? 'done' : ''}`}></div>
            <div className={`sc ${step === 4 ? 'active' : ''}`}>4</div>
          </div>
        )}
        <div></div>
      </div>

      <div className="ob-body">
        {error && (
          <div className="err-msg" style={{ maxWidth: 580, margin: '0 auto 12px' }}>
            {error}
          </div>
        )}

        {step === 0 && (
          <div className="ob-card" style={{ maxWidth: 480, textAlign: 'center' }}>
            <h1>¿Cómo vas a usar GovTalent?</h1>
            <p className="sub">Así te mostramos justo lo que necesitas, nada más.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
              <button
                type="button"
                className="ob-choice"
                onClick={() => setStep(1)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 18px',
                  borderRadius: 12,
                  border: '1.5px solid #e0dfd8',
                  background: '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: '#eaf5f0',
                    color: '#1d6f5c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 19,
                    flexShrink: 0,
                  }}
                >
                  <i className="ti ti-user"></i>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: '#222' }}>Busco oportunidades profesionales</div>
                  <div style={{ fontSize: 12.5, color: '#888', marginTop: 2 }}>
                    Crea tu perfil, descubre ofertas y conecta con organizaciones del sector.
                  </div>
                </div>
              </button>

              <button
                type="button"
                className="ob-choice"
                onClick={chooseOrganization}
                disabled={redirecting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 18px',
                  borderRadius: 12,
                  border: '1.5px solid #e0dfd8',
                  background: '#fff',
                  textAlign: 'left',
                  cursor: redirecting ? 'default' : 'pointer',
                  opacity: redirecting ? 0.7 : 1,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: '#eaf5f0',
                    color: '#1d6f5c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 19,
                    flexShrink: 0,
                  }}
                >
                  <i className="ti ti-building"></i>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: '#222' }}>Represento a una organización</div>
                  <div style={{ fontSize: 12.5, color: '#888', marginTop: 2 }}>
                    Publica ofertas, gestiona candidaturas y crea la página de tu organización.
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="ob-card">
            <div className="back" onClick={() => setStep(0)}>
              <i className="ti ti-arrow-left"></i> Volver
            </div>
            <h1>Completa tu perfil</h1>
            <p className="sub">Solo unos datos para personalizar tu experiencia.</p>
            <div className="two">
              <div className="field">
                <label>Nombre</label>
                <input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="Ana"
                />
              </div>
              <div className="field">
                <label>Apellidos</label>
                <input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Martínez López"
                />
              </div>
            </div>
            <div className="field">
              <label>Tu título profesional</label>
              <p style={{ fontSize: 11.5, color: '#aaa', marginBottom: 5 }}>
                Ej: Director de Public Affairs, Asesor parlamentario, Técnico de RRII...
              </p>
              <input
                value={form.professional_title}
                onChange={(e) => setForm({ ...form, professional_title: e.target.value })}
                placeholder="Escribe tu título"
              />
            </div>
            <div className="tog-row">
              <button
                type="button"
                className={`tog ${form.looking_for_job ? 'on' : ''}`}
                onClick={() => setForm({ ...form, looking_for_job: !form.looking_for_job })}
              ></button>
              Estoy buscando empleo activamente
            </div>
            <div className="slbl">Tu área de trabajo</div>
            <div className="hint">Selecciona hasta 3</div>
            <div className="tags">
              <div
                className={`tp ${form.work_areas.includes('Todos los sectores') ? 'on' : ''}`}
                onClick={() => toggleArea('work_areas', 'Todos los sectores', 'Todos los sectores')}
              >
                Todos los sectores
              </div>
              {WORK_AREAS.map((a) => (
                <div
                  key={a}
                  className={`tp ${form.work_areas.includes(a) ? 'on' : ''}`}
                  onClick={() => toggleArea('work_areas', a, 'Todos los sectores')}
                >
                  {a}
                </div>
              ))}
            </div>
            <div className="field" style={{ position: 'relative' }}>
              <label>Localización</label>
              <i
                className="ti ti-map-pin"
                style={{ position: 'absolute', left: 11, bottom: 11, color: '#bbb', fontSize: 14 }}
              ></i>
              <input
                style={{ paddingLeft: 30 }}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Ciudad, País"
              />
            </div>
            <button
              className="mbtn"
              disabled={!form.first_name || !form.last_name}
              onClick={() => setStep(2)}
            >
              Siguiente
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="ob-card" style={{ maxWidth: 420, textAlign: 'center' }}>
            <div className="back" onClick={() => setStep(1)}>
              <i className="ti ti-arrow-left"></i> Volver
            </div>
            <h1>Foto de perfil</h1>
            <p className="sub">Añade una foto para que los profesionales te reconozcan.</p>
            <label className="av">
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar" />
              ) : (
                <i className="ti ti-user"></i>
              )}
              <div className="av-c">
                <i className="ti ti-camera"></i>
              </div>
              <input type="file" accept="image/*" hidden onChange={handleAvatarChange} />
            </label>
            <button className="mbtn" onClick={() => setStep(3)}>
              Siguiente
            </button>
            <div className="skip" onClick={() => setStep(3)}>
              Saltar
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="ob-card">
            <div className="back" onClick={() => setStep(2)}>
              <i className="ti ti-arrow-left"></i> Volver
            </div>
            <h1>Áreas de interés</h1>
            <p className="sub">Elige hasta 3 áreas temáticas en las que te especializas.</p>
            <div className="tags">
              <div
                className={`tp ${form.interest_areas.includes('Todas las áreas') ? 'on' : ''}`}
                onClick={() => toggleArea('interest_areas', 'Todas las áreas', 'Todas las áreas')}
              >
                Todas las áreas
              </div>
              {INTEREST_AREAS.map((a) => (
                <div
                  key={a}
                  className={`tp ${form.interest_areas.includes(a) ? 'on' : ''}`}
                  onClick={() => toggleArea('interest_areas', a, 'Todas las áreas')}
                >
                  {a}
                </div>
              ))}
            </div>
            <button className="mbtn" onClick={() => setStep(4)}>
              Siguiente
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="ob-card">
            <div className="back" onClick={() => setStep(3)}>
              <i className="ti ti-arrow-left"></i> Volver
            </div>
            <h1>Tu situación profesional</h1>
            <p className="sub">Así podremos comparar tu perfil con el del sector con más precisión.</p>

            <div className="slbl">¿Cuál es tu situación profesional actual respecto a los asuntos públicos?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {CAREER_SITUATIONS.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => selectSingle('career_situation', opt.value)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: form.career_situation === opt.value ? '1.5px solid #1d6f5c' : '1.5px solid #e0dfd8',
                    background: form.career_situation === opt.value ? '#eaf5f0' : '#fff',
                    fontSize: 13,
                    fontWeight: form.career_situation === opt.value ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </div>
              ))}
            </div>

            {SHOWS_DETAIL_QUESTIONS.includes(form.career_situation) && (
              <>
                <div className="slbl">¿En qué tipo de entorno trabajas actualmente?</div>
                <div className="tags" style={{ marginBottom: 20 }}>
                  {ORG_TYPES.map((opt) => (
                    <div
                      key={opt.value}
                      className={`tp ${form.org_type === opt.value ? 'on' : ''}`}
                      onClick={() => selectSingle('org_type', opt.value)}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>

                <div className="slbl">¿Cuál de estos describe mejor tu rol actual?</div>
                <div className="tags" style={{ marginBottom: 20 }}>
                  {ROLE_TYPES.map((opt) => (
                    <div
                      key={opt.value}
                      className={`tp ${form.role_type === opt.value ? 'on' : ''}`}
                      onClick={() => selectSingle('role_type', opt.value)}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>

                <div className="slbl">¿Qué nivel describe mejor tu puesto actual?</div>
                <div className="tags" style={{ marginBottom: 20 }}>
                  {LEVEL_TYPES.map((opt) => (
                    <div
                      key={opt.value}
                      className={`tp ${form.level_type === opt.value ? 'on' : ''}`}
                      onClick={() => selectSingle('level_type', opt.value)}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              className="mbtn"
              disabled={
                saving ||
                !form.career_situation ||
                (SHOWS_DETAIL_QUESTIONS.includes(form.career_situation) &&
                  (!form.org_type || !form.role_type || !form.level_type))
              }
              onClick={finish}
            >
              {saving ? 'Creando tu cuenta...' : 'Crear mi cuenta'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
