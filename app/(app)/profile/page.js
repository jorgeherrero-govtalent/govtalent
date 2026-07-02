'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function ProfilePage() {
  const supabase = createClient();
  const [userId, setUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [experiences, setExperiences] = useState([]);
  const [education, setEducation] = useState([]);
  const [skills, setSkills] = useState([]);
  const [savedJobs, setSavedJobs] = useState([]);
  const [followedOrgs, setFollowedOrgs] = useState([]);

  const [tab, setTab] = useState('e');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showExpForm, setShowExpForm] = useState(false);
  const [showEduForm, setShowEduForm] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const uid = authData.user.id;
      setUserId(uid);

      const results = await Promise.allSettled([
        supabase.from('users').select('*').eq('id', uid).single(),
        supabase.from('candidate_profiles').select('*').eq('user_id', uid).single(),
        supabase.from('experiences').select('*').eq('user_id', uid).order('start_date', { ascending: false }),
        supabase.from('education').select('*').eq('user_id', uid).order('start_date', { ascending: false }),
        supabase.from('skills').select('*').eq('user_id', uid),
        supabase.from('saved_jobs').select('jobs(id, title, organizations(name))').eq('user_id', uid),
        supabase.from('organization_follows').select('organizations(id, slug, name)').eq('user_id', uid),
      ]);

      const [rUser, rProfile, rExp, rEdu, rSk, rSaved, rFollows] = results;

      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error('Profile load query', i, 'rejected:', r.reason);
        else if (r.value?.error) console.error('Profile load query', i, 'error:', r.value.error);
      });

      const u = rUser.status === 'fulfilled' ? rUser.value.data : null;
      const p = rProfile.status === 'fulfilled' ? rProfile.value.data : null;

      // Si por lo que sea no existe fila en "users" todavía, usamos los datos
      // básicos de auth para no dejar la pantalla colgada.
      setUser(
        u || {
          id: uid,
          first_name: authData.user.email?.split('@')[0] || 'Usuario',
          last_name: '',
        }
      );
      setProfile(p || { bio: '' });
      setExperiences(rExp.status === 'fulfilled' ? rExp.value.data || [] : []);
      setEducation(rEdu.status === 'fulfilled' ? rEdu.value.data || [] : []);
      setSkills(rSk.status === 'fulfilled' ? rSk.value.data || [] : []);
      setSavedJobs(rSaved.status === 'fulfilled' ? rSaved.value.data || [] : []);
      setFollowedOrgs(rFollows.status === 'fulfilled' ? rFollows.value.data || [] : []);
    } catch (err) {
      console.error('Error inesperado cargando el perfil:', err);
      // Aseguramos que la pantalla no se quede colgada aunque algo falle.
      setUser((prev) => prev || { id: userId, first_name: 'Usuario', last_name: '' });
      setProfile((prev) => prev || { bio: '' });
    }
  }

  async function saveProfileEdit(e) {
    e.preventDefault();
    setSavingProfile(true);
    const f = new FormData(e.target);
    const userUpdates = {
      first_name: f.get('first_name'),
      last_name: f.get('last_name'),
      professional_title: f.get('professional_title') || null,
    };
    const profileUpdates = {
      website_url: f.get('website_url') || null,
      linkedin_url: f.get('linkedin_url') || null,
      bio: f.get('bio') || null,
    };

    const [{ error: uErr }, { error: pErr }] = await Promise.all([
      supabase.from('users').update(userUpdates).eq('id', userId),
      supabase.from('candidate_profiles').update(profileUpdates).eq('user_id', userId),
    ]);

    setSavingProfile(false);
    if (uErr || pErr) {
      toast('No se pudieron guardar los cambios');
      return;
    }
    setUser({ ...user, ...userUpdates });
    setProfile({ ...profile, ...profileUpdates });
    setShowEditProfile(false);
    toast('Perfil actualizado ✓');
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploadingAvatar(true);
    const ext = file.name.split('.').pop();
    const path = `${userId}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    setUploadingAvatar(false);
    if (upErr) {
      toast('No se pudo subir la foto. Comprueba que existe el bucket "avatars".');
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', userId);
    setUser({ ...user, avatar_url: avatarUrl });
    toast('Foto de perfil actualizada ✓');
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploadingCover(true);
    const ext = file.name.split('.').pop();
    const path = `${userId}/cover.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('covers')
      .upload(path, file, { upsert: true });
    setUploadingCover(false);
    if (upErr) {
      toast('No se pudo subir la portada. Comprueba que existe el bucket "covers".');
      return;
    }
    const { data } = supabase.storage.from('covers').getPublicUrl(path);
    const coverUrl = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from('candidate_profiles').update({ cover_url: coverUrl }).eq('user_id', userId);
    setProfile({ ...profile, cover_url: coverUrl });
    toast('Portada actualizada ✓');
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
    const { error: upErr } = await supabase.storage
      .from('cvs')
      .upload(path, file, { upsert: true });
    setUploadingCv(false);
    if (upErr) {
      toast('No se pudo subir el CV. Comprueba que existe el bucket "cvs".');
      return;
    }
    const { data } = supabase.storage.from('cvs').getPublicUrl(path);
    const cvUrl = `${data.publicUrl}?t=${Date.now()}`;
    const uploadedAt = new Date().toISOString();
    await supabase
      .from('candidate_profiles')
      .update({ cv_url: cvUrl, cv_uploaded_at: uploadedAt })
      .eq('user_id', userId);
    setProfile({ ...profile, cv_url: cvUrl, cv_uploaded_at: uploadedAt });
    toast('CV subido correctamente ✓');
  }

  async function addExperience(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const row = {
      user_id: userId,
      title: f.get('title'),
      organization_name: f.get('organization_name'),
      location: f.get('location'),
      start_date: f.get('start_date'),
      end_date: f.get('end_date') || null,
      description: f.get('description'),
    };
    const { data } = await supabase.from('experiences').insert(row).select().single();
    if (data) setExperiences([data, ...experiences]);
    setShowExpForm(false);
    e.target.reset();
    toast('Experiencia añadida ✓');
  }

  async function deleteExperience(id) {
    await supabase.from('experiences').delete().eq('id', id);
    setExperiences(experiences.filter((x) => x.id !== id));
  }

  async function addEducation(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const row = {
      user_id: userId,
      degree: f.get('degree'),
      institution: f.get('institution'),
      start_date: f.get('start_date') || null,
      end_date: f.get('end_date') || null,
    };
    const { data } = await supabase.from('education').insert(row).select().single();
    if (data) setEducation([data, ...education]);
    setShowEduForm(false);
    e.target.reset();
    toast('Educación añadida ✓');
  }

  async function deleteEducation(id) {
    await supabase.from('education').delete().eq('id', id);
    setEducation(education.filter((x) => x.id !== id));
  }

  async function addSkill(e) {
    e.preventDefault();
    const name = skillInput.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from('skills')
      .insert({ user_id: userId, skill_name: name })
      .select()
      .single();
    if (!error && data) setSkills([...skills, data]);
    setSkillInput('');
  }

  async function deleteSkill(id) {
    await supabase.from('skills').delete().eq('id', id);
    setSkills(skills.filter((s) => s.id !== id));
  }

  if (!user) return <div className="spinner"></div>;

  const completion = computeCompletion(user, profile, experiences, education, skills);

  return (
    <div className="sec">
      <div className="card" style={{ maxWidth: 1080, margin: '0 auto 13px' }}>
        <div
          className="p-cover"
          style={
            profile?.cover_url
              ? {
                  backgroundImage: `url(${profile.cover_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        >
          <label
            title="Cambiar portada"
            style={{
              position: 'absolute',
              top: 11,
              right: 11,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(0,0,0,.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
            }}
          >
            {uploadingCover ? (
              <i className="ti ti-loader-2" style={{ fontSize: 15 }}></i>
            ) : (
              <i className="ti ti-camera" style={{ fontSize: 15 }}></i>
            )}
            <input type="file" accept="image/*" hidden onChange={handleCoverUpload} disabled={uploadingCover} />
          </label>

          <label className="p-av" style={{ cursor: 'pointer' }} title="Cambiar foto de perfil">
            {user.avatar_url ? <img src={user.avatar_url} alt="" /> : user.first_name?.[0]}
            <div className="av-c">
              {uploadingAvatar ? <i className="ti ti-loader-2"></i> : <i className="ti ti-camera"></i>}
            </div>
            <input type="file" accept="image/*" hidden onChange={handleAvatarUpload} disabled={uploadingAvatar} />
          </label>
        </div>
        <div className="p-info">
          <div className="p-name">
            {user.first_name} {user.last_name}
          </div>
          <div className="p-title">{user.professional_title || 'Añade tu título profesional'}</div>
          <div className="p-meta">
            {user.location && (
              <span>
                <i className="ti ti-map-pin" style={{ fontSize: 12 }}></i> {user.location}
              </span>
            )}
            {user.looking_for_job && (
              <span style={{ color: '#1d6f5c', fontWeight: 500 }}>
                <i className="ti ti-briefcase" style={{ fontSize: 12 }}></i> Buscando empleo activamente
              </span>
            )}
            {profile?.website_url && (
              <span>
                <i className="ti ti-world" style={{ fontSize: 12 }}></i>{' '}
                <a
                  href={profile.website_url.startsWith('http') ? profile.website_url : `https://${profile.website_url}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#1d6f5c' }}
                >
                  {profile.website_url.replace(/^https?:\/\//, '')}
                </a>
              </span>
            )}
            {profile?.linkedin_url && (
              <span>
                <i className="ti ti-brand-linkedin" style={{ fontSize: 12 }}></i>{' '}
                <a
                  href={profile.linkedin_url.startsWith('http') ? profile.linkedin_url : `https://${profile.linkedin_url}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#1d6f5c' }}
                >
                  LinkedIn
                </a>
              </span>
            )}
          </div>
        </div>
        <div className="p-sec" style={{ borderBottom: 'none' }}>
          <h3>
            Acerca de
            <button className="btn-g" style={{ fontSize: 12 }} onClick={() => setShowEditProfile(true)}>
              <i className="ti ti-edit"></i> Editar
            </button>
          </h3>
          <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.7 }}>
            {profile?.bio || 'Añade una biografía para que otros profesionales sepan más sobre ti.'}
          </div>
        </div>
      </div>

      {showEditProfile && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setShowEditProfile(false)}>
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <h2>Editar perfil</h2>
              <div className="modal-x" onClick={() => setShowEditProfile(false)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <form onSubmit={saveProfileEdit}>
              <div className="two">
                <div className="field">
                  <label>Nombre</label>
                  <input name="first_name" defaultValue={user.first_name || ''} required />
                </div>
                <div className="field">
                  <label>Apellidos</label>
                  <input name="last_name" defaultValue={user.last_name || ''} required />
                </div>
              </div>
              <div className="field">
                <label>Título profesional</label>
                <input
                  name="professional_title"
                  defaultValue={user.professional_title || ''}
                  placeholder="Ej: Public Affairs Manager"
                />
              </div>
              <div className="two">
                <div className="field">
                  <label>Sitio web</label>
                  <input name="website_url" defaultValue={profile?.website_url || ''} placeholder="https://tuweb.com" />
                </div>
                <div className="field">
                  <label>LinkedIn URL</label>
                  <input
                    name="linkedin_url"
                    defaultValue={profile?.linkedin_url || ''}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
              </div>
              <div className="field">
                <label>Biografía</label>
                <textarea
                  name="bio"
                  defaultValue={profile?.bio || ''}
                  style={{
                    width: '100%',
                    minHeight: 100,
                    padding: '10px 12px',
                    border: '1px solid #e0dfd8',
                    borderRadius: 9,
                    fontSize: 13.5,
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                  placeholder="Cuenta tu experiencia y especialización..."
                ></textarea>
              </div>
              <div className="m-foot">
                <button type="button" className="m-back" onClick={() => setShowEditProfile(false)}>
                  Cancelar
                </button>
                <button className="m-next" disabled={savingProfile}>
                  <i className="ti ti-check"></i> {savingProfile ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 13, maxWidth: 1080, margin: '0 auto' }}>
        <div className="card">
          <div className="p-tabs">
            <button className={`p-tab ${tab === 'e' ? 'on' : ''}`} onClick={() => setTab('e')}>
              Experiencia
            </button>
            <button className={`p-tab ${tab === 'ed' ? 'on' : ''}`} onClick={() => setTab('ed')}>
              Educación
            </button>
            <button className={`p-tab ${tab === 'sk' ? 'on' : ''}`} onClick={() => setTab('sk')}>
              Habilidades
            </button>
          </div>

          {tab === 'e' && (
            <div className="p-sec" style={{ borderBottom: 'none' }}>
              <h3>
                Experiencia
                <button className="btn-g" style={{ fontSize: 12 }} onClick={() => setShowExpForm(!showExpForm)}>
                  <i className="ti ti-plus"></i> Añadir
                </button>
              </h3>
              {showExpForm && (
                <form onSubmit={addExperience} style={{ marginBottom: 16, background: '#f8faf9', padding: 14, borderRadius: 10 }}>
                  <div className="form-row">
                    <div className="form-g">
                      <label>Puesto</label>
                      <input name="title" required />
                    </div>
                    <div className="form-g">
                      <label>Organización</label>
                      <input name="organization_name" required />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-g">
                      <label>Ubicación</label>
                      <input name="location" />
                    </div>
                    <div className="form-g"></div>
                  </div>
                  <div className="form-row">
                    <div className="form-g">
                      <label>Fecha inicio</label>
                      <input type="date" name="start_date" required />
                    </div>
                    <div className="form-g">
                      <label>Fecha fin (vacío = actualidad)</label>
                      <input type="date" name="end_date" />
                    </div>
                  </div>
                  <div className="form-g">
                    <label>Descripción</label>
                    <textarea name="description"></textarea>
                  </div>
                  <button className="btn-p">Guardar experiencia</button>
                </form>
              )}
              {experiences.length === 0 && !showExpForm && (
                <div style={{ fontSize: 13, color: '#999' }}>Aún no has añadido experiencia.</div>
              )}
              {experiences.map((exp) => (
                <div className="exp-item" key={exp.id}>
                  <div className="exp-logo">🏛️</div>
                  <div className="exp-body" style={{ flex: 1 }}>
                    <div className="et">{exp.title}</div>
                    <div className="eo">{exp.organization_name}</div>
                    <div className="ep">
                      {exp.start_date} – {exp.end_date || 'Actualidad'}
                    </div>
                    <div className="ed">{exp.description}</div>
                  </div>
                  <button className="btn-g" style={{ height: 'fit-content' }} onClick={() => deleteExperience(exp.id)}>
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'ed' && (
            <div className="p-sec" style={{ borderBottom: 'none' }}>
              <h3>
                Educación
                <button className="btn-g" style={{ fontSize: 12 }} onClick={() => setShowEduForm(!showEduForm)}>
                  <i className="ti ti-plus"></i> Añadir
                </button>
              </h3>
              {showEduForm && (
                <form onSubmit={addEducation} style={{ marginBottom: 16, background: '#f8faf9', padding: 14, borderRadius: 10 }}>
                  <div className="form-g">
                    <label>Titulación</label>
                    <input name="degree" required />
                  </div>
                  <div className="form-g">
                    <label>Institución</label>
                    <input name="institution" required />
                  </div>
                  <div className="form-row">
                    <div className="form-g">
                      <label>Año inicio</label>
                      <input type="date" name="start_date" />
                    </div>
                    <div className="form-g">
                      <label>Año fin</label>
                      <input type="date" name="end_date" />
                    </div>
                  </div>
                  <button className="btn-p">Guardar educación</button>
                </form>
              )}
              {education.length === 0 && !showEduForm && (
                <div style={{ fontSize: 13, color: '#999' }}>Aún no has añadido educación.</div>
              )}
              {education.map((ed) => (
                <div className="exp-item" key={ed.id}>
                  <div className="exp-logo">🎓</div>
                  <div className="exp-body" style={{ flex: 1 }}>
                    <div className="et">{ed.degree}</div>
                    <div className="eo">{ed.institution}</div>
                  </div>
                  <button className="btn-g" style={{ height: 'fit-content' }} onClick={() => deleteEducation(ed.id)}>
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'sk' && (
            <div className="p-sec" style={{ borderBottom: 'none' }}>
              <h3>Habilidades</h3>
              <form onSubmit={addSkill} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  placeholder="Ej: Lobbying, Inglés C2..."
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    border: '1px solid #e0dfd8',
                    borderRadius: 8,
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button className="btn-p">Añadir</button>
              </form>
              <div>
                {skills.map((s) => (
                  <span className="skill" key={s.id}>
                    {s.skill_name}
                    <button onClick={() => deleteSkill(s.id)}>
                      <i className="ti ti-x"></i>
                    </button>
                  </span>
                ))}
                {skills.length === 0 && <div style={{ fontSize: 13, color: '#999' }}>Sin habilidades añadidas.</div>}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="sw">
            <h4>Currículum (CV)</h4>
            {profile?.cv_url ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <i className="ti ti-file-cv" style={{ fontSize: 18, color: '#1d6f5c' }}></i>
                  <div style={{ fontSize: 12.5, color: '#555', flex: 1 }}>
                    CV subido
                    {profile.cv_uploaded_at && (
                      <div style={{ fontSize: 11, color: '#999' }}>
                        {new Date(profile.cv_uploaded_at).toLocaleDateString('es-ES')}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={profile.cv_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-o"
                    style={{ flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: 12.5 }}
                  >
                    Ver CV
                  </a>
                  <label className="btn-g" style={{ cursor: 'pointer', fontSize: 12.5 }}>
                    {uploadingCv ? 'Subiendo...' : 'Reemplazar'}
                    <input type="file" accept="application/pdf" hidden onChange={handleCvUpload} disabled={uploadingCv} />
                  </label>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: '#999', marginBottom: 10 }}>
                  Sube tu CV en PDF para que los reclutadores te encuentren más rápido.
                </div>
                <label className="btn-p" style={{ width: '100%', textAlign: 'center', display: 'block', cursor: 'pointer' }}>
                  {uploadingCv ? 'Subiendo...' : 'Subir CV'}
                  <input type="file" accept="application/pdf" hidden onChange={handleCvUpload} disabled={uploadingCv} />
                </label>
              </>
            )}
          </div>

          <div className="sw">
            <h4>Tu visibilidad</h4>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 7 }}>
              Perfil completado al <b style={{ color: '#1d6f5c' }}>{completion}%</b>
            </div>
            <div style={{ background: '#f0efe9', borderRadius: 6, height: 6, marginBottom: 10 }}>
              <div style={{ background: '#1d6f5c', borderRadius: 6, height: 6, width: `${completion}%` }}></div>
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>Añade foto, bio y experiencia para aumentar tu visibilidad.</div>
          </div>

          <div className="sw">
            <h4>Empleos guardados</h4>
            {savedJobs.length === 0 && <div style={{ fontSize: 12.5, color: '#999' }}>Ninguno todavía.</div>}
            {savedJobs.map((sj, i) => (
              <div className="sp" key={i}>
                <div className="sp-av" style={{ borderRadius: 8 }}>
                  <i className="ti ti-briefcase"></i>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{sj.jobs?.title}</div>
                  <div style={{ fontSize: 11.5, color: '#888' }}>{sj.jobs?.organizations?.name}</div>
                </div>
              </div>
            ))}
            <Link href="/jobs" style={{ fontSize: 12.5, color: '#1d6f5c' }}>
              Ver todos los empleos
            </Link>
          </div>

          <div className="sw">
            <h4>Organizaciones que sigues</h4>
            {followedOrgs.length === 0 && <div style={{ fontSize: 12.5, color: '#999' }}>Ninguna todavía.</div>}
            {followedOrgs.map((f, i) => (
              <Link href={`/organizations/${f.organizations?.slug}`} className="sp" key={i} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="sp-av" style={{ borderRadius: 8 }}>
                  <i className="ti ti-building"></i>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{f.organizations?.name}</div>
              </Link>
            ))}
            <Link href="/organizations" style={{ fontSize: 12.5, color: '#1d6f5c' }}>
              Ver directorio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function computeCompletion(user, profile, exp, edu, skills) {
  let pts = 0;
  const total = 9;
  if (user?.avatar_url) pts++;
  if (profile?.cover_url) pts++;
  if (profile?.cv_url) pts++;
  if (profile?.bio) pts++;
  if (user?.professional_title) pts++;
  if (profile?.website_url || profile?.linkedin_url) pts++;
  if (exp.length > 0) pts++;
  if (edu.length > 0) pts++;
  if (skills.length > 0) pts++;
  return Math.round((pts / total) * 100);
}
