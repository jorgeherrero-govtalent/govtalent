'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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

export default function OnboardingPage() {
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);
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
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

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

  async function finish() {
    if (!userId) return;
    setSaving(true);

    let avatarUrl = null;
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true });
      if (!upErr) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = data.publicUrl;
      }
    }

    await supabase
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

    await supabase.from('user_work_areas').delete().eq('user_id', userId);
    if (!form.work_areas.includes('Todos los sectores')) {
      await supabase
        .from('user_work_areas')
        .insert(form.work_areas.map((area) => ({ user_id: userId, area })));
    }

    await supabase.from('user_interest_areas').delete().eq('user_id', userId);
    if (!form.interest_areas.includes('Todas las áreas')) {
      await supabase
        .from('user_interest_areas')
        .insert(form.interest_areas.map((area) => ({ user_id: userId, area })));
    }

    setSaving(false);
    window.location.href = '/jobs';
  }

  return (
    <div>
      <div className="ob-bar">
        <div className="logo">
          gov<span>talent</span>
        </div>
        <div className="stepper">
          <div className={`sc ${step > 1 ? 'done' : 'active'}`}>1</div>
          <div className={`sl2 ${step > 1 ? 'done' : ''}`}></div>
          <div className={`sc ${step > 2 ? 'done' : step === 2 ? 'active' : ''}`}>2</div>
          <div className={`sl2 ${step > 2 ? 'done' : ''}`}></div>
          <div className={`sc ${step === 3 ? 'active' : ''}`}>3</div>
        </div>
        <div></div>
      </div>

      <div className="ob-body">
        {step === 1 && (
          <div className="ob-card">
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
            <button className="mbtn" disabled={saving} onClick={finish}>
              {saving ? 'Creando tu cuenta...' : 'Crear mi cuenta'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
