'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [languages, setLanguages] = useState([]);
  const [savedJobs, setSavedJobs] = useState([]);
  const [followedOrgs, setFollowedOrgs] = useState([]);

  const [tab, setTab] = useState('e');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showExpForm, setShowExpForm] = useState(false);
  const [showEduForm, setShowEduForm] = useState(false);
  const [editingExpId, setEditingExpId] = useState(null);
  const [editingEduId, setEditingEduId] = useState(null);
  const [editingLangId, setEditingLangId] = useState(null);
  const [skillInput, setSkillInput] = useState('');
  const [langName, setLangName] = useState('');
  const [langLevel, setLangLevel] = useState('B2');
  const [dragIndex, setDragIndex] = useState(null);
  const [savingLookingForJob, setSavingLookingForJob] = useState(false);
  const [showInterestsMenu, setShowInterestsMenu] = useState(false);

  const INTEREST_OPTIONS = [
    {
      key: 'contrataciones',
      icon: 'ti-users',
      title: 'Contrataciones',
      desc: 'Comparte que estás buscando personal y atrae a candidatos cualificados.',
    },
    {
      key: 'buscar_empleo',
      icon: 'ti-briefcase',
      title: 'Encontrar un nuevo empleo',
      desc: 'Muestra que buscas empleo a las organizaciones que ven tu perfil.',
    },
    {
      key: 'ofrecer_servicios',
      icon: 'ti-tool',
      title: 'Ofrecer servicios',
      desc: 'Muestra los servicios que ofreces para que nuevos clientes puedan descubrirte.',
    },
  ];
  const bioRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [extractingCv, setExtractingCv] = useState(false);
  const [cvExtractResult, setCvExtractResult] = useState(null);
  const [applyingExtract, setApplyingExtract] = useState(false);
  const [selectedExpIdx, setSelectedExpIdx] = useState(new Set());
  const [selectedEduIdx, setSelectedEduIdx] = useState(new Set());
  const [selectedSkills, setSelectedSkills] = useState(new Set());

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
        supabase.from('experiences').select('*').eq('user_id', uid).order('sort_order', { ascending: true }),
        supabase.from('education').select('*').eq('user_id', uid).order('sort_order', { ascending: true }),
        supabase.from('skills').select('*').eq('user_id', uid).order('sort_order', { ascending: true }),
        supabase.from('languages').select('*').eq('user_id', uid).order('sort_order', { ascending: true }),
        supabase.from('saved_jobs').select('jobs(id, title, organizations(name, logo_url))').eq('user_id', uid),
        supabase.from('organization_follows').select('organizations(id, slug, name, logo_url)').eq('user_id', uid),
      ]);

      const [rUser, rProfile, rExp, rEdu, rSk, rLang, rSaved, rFollows] = results;

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
      setLanguages(rLang.status === 'fulfilled' ? rLang.value.data || [] : []);
      setSavedJobs(rSaved.status === 'fulfilled' ? rSaved.value.data || [] : []);
      setFollowedOrgs(rFollows.status === 'fulfilled' ? rFollows.value.data || [] : []);
    } catch (err) {
      console.error('Error inesperado cargando el perfil:', err);
      // Aseguramos que la pantalla no se quede colgada aunque algo falle.
      setUser((prev) => prev || { id: userId, first_name: 'Usuario', last_name: '' });
      setProfile((prev) => prev || { bio: '' });
    }
  }

  async function toggleInterest(key) {
    const current = user.interests || [];
    const newInterests = current.includes(key) ? current.filter((i) => i !== key) : [...current, key];
    setSavingLookingForJob(true);
    const { error } = await supabase
      .from('users')
      .update({ interests: newInterests, looking_for_job: newInterests.includes('buscar_empleo') })
      .eq('id', userId);
    setSavingLookingForJob(false);
    if (error) {
      toast('No se pudo actualizar');
      return;
    }
    setUser((prev) => ({ ...prev, interests: newInterests, looking_for_job: newInterests.includes('buscar_empleo') }));
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
      contact_email: f.get('contact_email') || null,
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

  async function extractFromCv() {
    if (!profile?.cv_url) return;
    setExtractingCv(true);
    try {
      const res = await fetch('/api/ai/extract-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvUrl: profile.cv_url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      setCvExtractResult(data);
      setSelectedExpIdx(new Set(data.experiences.map((_, i) => i)));
      setSelectedEduIdx(new Set(data.education.map((_, i) => i)));
      setSelectedSkills(new Set(data.skills));
    } catch (err) {
      toast('No se pudo leer el CV: ' + err.message);
    }
    setExtractingCv(false);
  }

  function toggleSetIdx(setter, set, idx) {
    setter((prev) => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  }

  async function applyCvExtract() {
    if (!cvExtractResult) return;
    setApplyingExtract(true);

    const userUpdates = {};
    if (cvExtractResult.professional_title && !user.professional_title) {
      userUpdates.professional_title = cvExtractResult.professional_title;
    }
    if (Object.keys(userUpdates).length > 0) {
      await supabase.from('users').update(userUpdates).eq('id', userId);
    }

    if (cvExtractResult.bio && !profile?.bio) {
      await supabase.from('candidate_profiles').update({ bio: cvExtractResult.bio }).eq('user_id', userId);
    }

    const expToInsert = cvExtractResult.experiences
      .filter((_, i) => selectedExpIdx.has(i))
      .map((e) => ({
        user_id: userId,
        title: e.title,
        organization_name: e.organization_name,
        location: e.location || null,
        start_date: e.start_date,
        end_date: e.end_date || null,
        description: e.description || null,
      }));
    const eduToInsert = cvExtractResult.education
      .filter((_, i) => selectedEduIdx.has(i))
      .map((e) => ({
        user_id: userId,
        degree: e.degree,
        institution: e.institution,
        start_date: e.start_date || null,
        end_date: e.end_date || null,
      }));
    const skillsToInsert = [...selectedSkills].map((s) => ({ user_id: userId, skill_name: s }));

    const [expRes, eduRes] = await Promise.all([
      expToInsert.length > 0 ? supabase.from('experiences').insert(expToInsert).select() : Promise.resolve({ data: [] }),
      eduToInsert.length > 0 ? supabase.from('education').insert(eduToInsert).select() : Promise.resolve({ data: [] }),
    ]);
    if (skillsToInsert.length > 0) {
      // Ignoramos errores de duplicado (habilidad ya existente para este usuario)
      await supabase.from('skills').insert(skillsToInsert).select();
    }

    if (expRes.data?.length) setExperiences((prev) => [...expRes.data, ...prev]);
    if (eduRes.data?.length) setEducation((prev) => [...eduRes.data, ...prev]);
    if (userUpdates.professional_title) setUser((prev) => ({ ...prev, ...userUpdates }));
    if (cvExtractResult.bio && !profile?.bio) setProfile((prev) => ({ ...prev, bio: cvExtractResult.bio }));

    const { data: freshSkills } = await supabase.from('skills').select('*').eq('user_id', userId);
    if (freshSkills) setSkills(freshSkills);

    setApplyingExtract(false);
    setCvExtractResult(null);
    toast('Perfil actualizado a partir de tu CV ✓');
  }

  // ── Ayudante genérico para mover un elemento arriba/abajo intercambiando
  // su sort_order con el vecino, tanto en la base de datos como en pantalla.
  async function moveItem(table, list, setList, id, direction) {
    const idx = list.findIndex((x) => x.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;

    const a = list[idx];
    const b = list[swapIdx];
    const aOrder = a.sort_order ?? idx;
    const bOrder = b.sort_order ?? swapIdx;

    const newList = [...list];
    newList[idx] = { ...b, sort_order: aOrder };
    newList[swapIdx] = { ...a, sort_order: bOrder };
    setList(newList);

    await Promise.all([
      supabase.from(table).update({ sort_order: aOrder }).eq('id', b.id),
      supabase.from(table).update({ sort_order: bOrder }).eq('id', a.id),
    ]);
  }

  // ── Reordenar arrastrando: mueve el elemento a cualquier posición y
  // renumera el sort_order de toda la lista de una vez.
  async function reorderByDrag(table, list, setList, fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;
    const newList = [...list];
    const [moved] = newList.splice(fromIndex, 1);
    newList.splice(toIndex, 0, moved);
    const withOrder = newList.map((item, i) => ({ ...item, sort_order: i }));
    setList(withOrder);
    await Promise.all(withOrder.map((item, i) => supabase.from(table).update({ sort_order: i }).eq('id', item.id)));
  }

  // ── Sustituye el "fantasma" por defecto del navegador (una foto
  // semitransparente de toda la tarjeta, con la que se ve el texto de
  // debajo) por una pequeña etiqueta limpia que sigue al cursor.
  // Se elimina en dos "frames" después, para darle tiempo al navegador
  // a capturar la imagen antes de borrarla (si se borra demasiado
  // pronto, algunos navegadores no llegan a usarla).
  function handleCardDragStart(e, index, label) {
    setDragIndex(index);
    const pill = document.createElement('div');
    pill.textContent = label;
    pill.style.cssText =
      'position:fixed;top:-999px;left:-999px;background:#1d6f5c;color:#fff;padding:7px 16px;' +
      'border-radius:20px;font-size:13px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
      'white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);';
    document.body.appendChild(pill);
    e.dataTransfer.setDragImage(pill, 16, 16);
    requestAnimationFrame(() => requestAnimationFrame(() => pill.remove()));
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
      sort_order: experiences.length,
    };
    const { data } = await supabase.from('experiences').insert(row).select().single();
    if (data) setExperiences([...experiences, data]);
    setShowExpForm(false);
    e.target.reset();
    toast('Experiencia añadida ✓');
  }

  async function updateExperience(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const updates = {
      title: f.get('title'),
      organization_name: f.get('organization_name'),
      location: f.get('location'),
      start_date: f.get('start_date'),
      end_date: f.get('end_date') || null,
      description: f.get('description'),
    };
    await supabase.from('experiences').update(updates).eq('id', editingExpId);
    setExperiences(experiences.map((x) => (x.id === editingExpId ? { ...x, ...updates } : x)));
    setEditingExpId(null);
    toast('Experiencia actualizada ✓');
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
      sort_order: education.length,
    };
    const { data } = await supabase.from('education').insert(row).select().single();
    if (data) setEducation([...education, data]);
    setShowEduForm(false);
    e.target.reset();
    toast('Educación añadida ✓');
  }

  async function updateEducation(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const updates = {
      degree: f.get('degree'),
      institution: f.get('institution'),
      start_date: f.get('start_date') || null,
      end_date: f.get('end_date') || null,
    };
    await supabase.from('education').update(updates).eq('id', editingEduId);
    setEducation(education.map((x) => (x.id === editingEduId ? { ...x, ...updates } : x)));
    setEditingEduId(null);
    toast('Educación actualizada ✓');
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
      .insert({ user_id: userId, skill_name: name, sort_order: skills.length })
      .select()
      .single();
    if (!error && data) setSkills([...skills, data]);
    setSkillInput('');
  }

  async function deleteSkill(id) {
    await supabase.from('skills').delete().eq('id', id);
    setSkills(skills.filter((s) => s.id !== id));
  }

  const LANGUAGE_LEVELS = ['Nativo', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'];

  async function addLanguage(e) {
    e.preventDefault();
    const name = langName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from('languages')
      .insert({ user_id: userId, language_name: name, proficiency: langLevel, sort_order: languages.length })
      .select()
      .single();
    if (!error && data) setLanguages([...languages, data]);
    setLangName('');
  }

  async function deleteLanguage(id) {
    await supabase.from('languages').delete().eq('id', id);
    setLanguages(languages.filter((l) => l.id !== id));
  }

  async function updateLanguage(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const updates = {
      language_name: f.get('language_name'),
      proficiency: f.get('proficiency'),
    };
    await supabase.from('languages').update(updates).eq('id', editingLangId);
    setLanguages(languages.map((x) => (x.id === editingLangId ? { ...x, ...updates } : x)));
    setEditingLangId(null);
    toast('Idioma actualizado ✓');
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
            {(user.interests || []).map((key) => {
              const opt = INTEREST_OPTIONS.find((o) => o.key === key);
              if (!opt) return null;
              return (
                <span key={key} style={{ color: '#1d6f5c', fontWeight: 500 }}>
                  <i className={`ti ${opt.icon}`} style={{ fontSize: 12 }}></i> {opt.title}
                </span>
              );
            })}
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

          <div style={{ position: 'relative', marginTop: 10 }}>
            <button
              className="btn-o"
              style={{ fontSize: 12.5 }}
              onClick={() => setShowInterestsMenu(!showInterestsMenu)}
            >
              <i className="ti ti-target-arrow"></i> Tengo interés en...{' '}
              <i className={`ti ${showInterestsMenu ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
            </button>

            {showInterestsMenu && (
              <>
                <div onClick={() => setShowInterestsMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }}></div>
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 6,
                    background: '#fff',
                    border: '1px solid #e0dfd8',
                    borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                    zIndex: 11,
                    width: 320,
                    padding: 6,
                  }}
                >
                  {INTEREST_OPTIONS.map((opt) => {
                    const active = (user.interests || []).includes(opt.key);
                    return (
                      <label
                        key={opt.key}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '10px 10px',
                          borderRadius: 8,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8faf9')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={savingLookingForJob}
                          onChange={() => toggleInterest(opt.key)}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{opt.title}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>{opt.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
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
            <div
              style={{
                background: '#faf9ff',
                border: '1px solid #d8d3fb',
                borderRadius: 10,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-bolt" style={{ color: '#6d5aef' }}></i> La forma más rápida de rellenar tu perfil
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: profile?.cv_url ? '#1d6f5c' : '#e0dfd8',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {profile?.cv_url ? <i className="ti ti-check" style={{ fontSize: 13 }}></i> : '1'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Sube tu CV</div>
                  {profile?.cv_url ? (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      CV subido ✓{' '}
                      <label style={{ color: '#1d6f5c', cursor: 'pointer', fontWeight: 500 }}>
                        Reemplazar
                        <input type="file" accept="application/pdf" hidden onChange={handleCvUpload} disabled={uploadingCv} />
                      </label>
                    </div>
                  ) : (
                    <label className="btn-o" style={{ display: 'inline-block', marginTop: 6, cursor: 'pointer', fontSize: 12 }}>
                      {uploadingCv ? 'Subiendo...' : 'Elegir archivo PDF'}
                      <input type="file" accept="application/pdf" hidden onChange={handleCvUpload} disabled={uploadingCv} />
                    </label>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#e0dfd8',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Autocompleta tu perfil con IA</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2, marginBottom: 8 }}>
                    Rellena experiencia, educación y habilidades leyendo tu CV, en segundos.
                  </div>
                  <button
                    type="button"
                    className="btn-ai"
                    style={{ fontSize: 12.5 }}
                    disabled={!profile?.cv_url || extractingCv}
                    onClick={extractFromCv}
                    title={!profile?.cv_url ? 'Sube tu CV primero' : ''}
                  >
                    <i className="ti ti-bolt"></i> {extractingCv ? 'Leyendo tu CV...' : 'Autocompletar perfil con IA'}
                  </button>
                </div>
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
                <label>Email de la cuenta</label>
                <input type="email" defaultValue={user.email || ''} disabled style={{ background: '#f4f4f0', color: '#888' }} />
                <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                  Es el email con el que inicias sesión. No se puede editar aquí.
                </p>
              </div>
              <div className="field">
                <label>Email de contacto para contrataciones</label>
                <input
                  type="email"
                  name="contact_email"
                  defaultValue={profile?.contact_email || user.email || ''}
                  placeholder="nombre@ejemplo.com"
                />
                <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                  Es el email que verán las organizaciones al recibir tus solicitudes. Puede ser distinto al de tu cuenta.
                </p>
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
                  ref={bioRef}
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
            <button className={`p-tab ${tab === 'lang' ? 'on' : ''}`} onClick={() => setTab('lang')}>
              Idiomas
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
                  <button className="btn-p">Guardar experiencia</button>{' '}
                  <button type="button" className="btn-g" onClick={() => setShowExpForm(false)}>
                    Cancelar
                  </button>
                </form>
              )}
              {experiences.length === 0 && !showExpForm && (
                <EmptySection
                  icon="ti-briefcase"
                  title="Destaca con tu experiencia"
                  description="Añade tu experiencia profesional para destacar ante organizaciones y reclutadores."
                  ctaLabel="Añadir experiencia"
                  onCta={() => setShowExpForm(true)}
                />
              )}
              {experiences.map((exp, i) =>
                editingExpId === exp.id ? (
                  <form
                    key={exp.id}
                    onSubmit={updateExperience}
                    style={{ marginBottom: 14, background: '#f8faf9', padding: 14, borderRadius: 10 }}
                  >
                    <div className="form-row">
                      <div className="form-g">
                        <label>Puesto</label>
                        <input name="title" defaultValue={exp.title} required />
                      </div>
                      <div className="form-g">
                        <label>Organización</label>
                        <input name="organization_name" defaultValue={exp.organization_name} required />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-g">
                        <label>Ubicación</label>
                        <input name="location" defaultValue={exp.location || ''} />
                      </div>
                      <div className="form-g"></div>
                    </div>
                    <div className="form-row">
                      <div className="form-g">
                        <label>Fecha inicio</label>
                        <input type="date" name="start_date" defaultValue={exp.start_date} required />
                      </div>
                      <div className="form-g">
                        <label>Fecha fin (vacío = actualidad)</label>
                        <input type="date" name="end_date" defaultValue={exp.end_date || ''} />
                      </div>
                    </div>
                    <div className="form-g">
                      <label>Descripción</label>
                      <textarea name="description" defaultValue={exp.description || ''}></textarea>
                    </div>
                    <button className="btn-p">Guardar cambios</button>{' '}
                    <button type="button" className="btn-g" onClick={() => setEditingExpId(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div
                    className="exp-item"
                    key={exp.id}
                    draggable
                    onDragStart={(e) => handleCardDragStart(e, i, exp.title)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      reorderByDrag('experiences', experiences, setExperiences, dragIndex, i);
                      setDragIndex(null);
                    }}
                    style={{ cursor: 'grab' }}
                  >
                    <i className="ti ti-grip-vertical" style={{ color: '#ccc', fontSize: 16, marginTop: 3 }}></i>
                    <div className="exp-logo">🏛️</div>
                    <div className="exp-body" style={{ flex: 1 }}>
                      <div className="et">{exp.title}</div>
                      <div className="eo">{exp.organization_name}</div>
                      <div className="ep">
                        {exp.start_date} – {exp.end_date || 'Actualidad'}
                      </div>
                      <div className="ed">{exp.description}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: 'fit-content' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn-g"
                          style={{ padding: '5px 7px' }}
                          disabled={i === 0}
                          onClick={() => moveItem('experiences', experiences, setExperiences, exp.id, 'up')}
                        >
                          <i className="ti ti-arrow-up"></i>
                        </button>
                        <button
                          className="btn-g"
                          style={{ padding: '5px 7px' }}
                          disabled={i === experiences.length - 1}
                          onClick={() => moveItem('experiences', experiences, setExperiences, exp.id, 'down')}
                        >
                          <i className="ti ti-arrow-down"></i>
                        </button>
                        <button className="btn-g" style={{ padding: '5px 7px' }} onClick={() => setEditingExpId(exp.id)}>
                          <i className="ti ti-edit"></i>
                        </button>
                        <button className="btn-g" style={{ padding: '5px 7px' }} onClick={() => deleteExperience(exp.id)}>
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              )}
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
                  <button className="btn-p">Guardar educación</button>{' '}
                  <button type="button" className="btn-g" onClick={() => setShowEduForm(false)}>
                    Cancelar
                  </button>
                </form>
              )}
              {education.length === 0 && !showEduForm && (
                <EmptySection
                  icon="ti-school"
                  title="Añade tu formación"
                  description="Comparte tu titulación e institución para dar más contexto a tu perfil."
                  ctaLabel="Añadir educación"
                  onCta={() => setShowEduForm(true)}
                />
              )}
              {education.map((ed, i) =>
                editingEduId === ed.id ? (
                  <form
                    key={ed.id}
                    onSubmit={updateEducation}
                    style={{ marginBottom: 14, background: '#f8faf9', padding: 14, borderRadius: 10 }}
                  >
                    <div className="form-g">
                      <label>Titulación</label>
                      <input name="degree" defaultValue={ed.degree} required />
                    </div>
                    <div className="form-g">
                      <label>Institución</label>
                      <input name="institution" defaultValue={ed.institution} required />
                    </div>
                    <div className="form-row">
                      <div className="form-g">
                        <label>Año inicio</label>
                        <input type="date" name="start_date" defaultValue={ed.start_date || ''} />
                      </div>
                      <div className="form-g">
                        <label>Año fin</label>
                        <input type="date" name="end_date" defaultValue={ed.end_date || ''} />
                      </div>
                    </div>
                    <button className="btn-p">Guardar cambios</button>{' '}
                    <button type="button" className="btn-g" onClick={() => setEditingEduId(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div
                    className="exp-item"
                    key={ed.id}
                    draggable
                    onDragStart={(e) => handleCardDragStart(e, i, ed.degree)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      reorderByDrag('education', education, setEducation, dragIndex, i);
                      setDragIndex(null);
                    }}
                    style={{ cursor: 'grab' }}
                  >
                    <i className="ti ti-grip-vertical" style={{ color: '#ccc', fontSize: 16 }}></i>
                    <div className="exp-logo">🎓</div>
                    <div className="exp-body" style={{ flex: 1 }}>
                      <div className="et">{ed.degree}</div>
                      <div className="eo">{ed.institution}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, height: 'fit-content' }}>
                      <button
                        className="btn-g"
                        style={{ padding: '5px 7px' }}
                        disabled={i === 0}
                        onClick={() => moveItem('education', education, setEducation, ed.id, 'up')}
                      >
                        <i className="ti ti-arrow-up"></i>
                      </button>
                      <button
                        className="btn-g"
                        style={{ padding: '5px 7px' }}
                        disabled={i === education.length - 1}
                        onClick={() => moveItem('education', education, setEducation, ed.id, 'down')}
                      >
                        <i className="ti ti-arrow-down"></i>
                      </button>
                      <button className="btn-g" style={{ padding: '5px 7px' }} onClick={() => setEditingEduId(ed.id)}>
                        <i className="ti ti-edit"></i>
                      </button>
                      <button className="btn-g" style={{ padding: '5px 7px' }} onClick={() => deleteEducation(ed.id)}>
                        <i className="ti ti-trash"></i>
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {tab === 'sk' && (
            <div className="p-sec" style={{ borderBottom: 'none' }}>
              <h3>Habilidades</h3>
              <form onSubmit={addSkill} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  placeholder="Ej: Lobbying, Negociación..."
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
                {skills.map((s, i) => (
                  <span
                    className="skill"
                    key={s.id}
                    draggable
                    onDragStart={(e) => handleCardDragStart(e, i, s.skill_name)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      reorderByDrag('skills', skills, setSkills, dragIndex, i);
                      setDragIndex(null);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', cursor: 'grab' }}
                  >
                    <button
                      onClick={() => moveItem('skills', skills, setSkills, s.id, 'up')}
                      disabled={i === 0}
                      title="Mover antes"
                      style={{ opacity: i === 0 ? 0.3 : 0.6 }}
                    >
                      <i className="ti ti-chevron-left"></i>
                    </button>
                    {s.skill_name}
                    <button
                      onClick={() => moveItem('skills', skills, setSkills, s.id, 'down')}
                      disabled={i === skills.length - 1}
                      title="Mover después"
                      style={{ opacity: i === skills.length - 1 ? 0.3 : 0.6 }}
                    >
                      <i className="ti ti-chevron-right"></i>
                    </button>
                    <button onClick={() => deleteSkill(s.id)}>
                      <i className="ti ti-x"></i>
                    </button>
                  </span>
                ))}
                {skills.length === 0 && (
                  <EmptySection
                    icon="ti-bulb"
                    title="Muestra tus puntos fuertes"
                    description="Añade las habilidades que mejor te representan, arriba en el campo de texto."
                  />
                )}
              </div>
            </div>
          )}

          {tab === 'lang' && (
            <div className="p-sec" style={{ borderBottom: 'none' }}>
              <h3>Idiomas</h3>
              <form onSubmit={addLanguage} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  placeholder="Ej: Inglés, Francés..."
                  value={langName}
                  onChange={(e) => setLangName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    border: '1px solid #e0dfd8',
                    borderRadius: 8,
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <select
                  value={langLevel}
                  onChange={(e) => setLangLevel(e.target.value)}
                  style={{ padding: '9px 10px', border: '1px solid #e0dfd8', borderRadius: 8, fontSize: 13 }}
                >
                  {LANGUAGE_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
                <button className="btn-p">Añadir</button>
              </form>
              {languages.length === 0 && (
                <EmptySection
                  icon="ti-language"
                  title="Añade tus idiomas"
                  description="Indica qué idiomas hablas y tu nivel, arriba en el desplegable."
                />
              )}
              {languages.map((l, i) =>
                editingLangId === l.id ? (
                  <form
                    key={l.id}
                    onSubmit={updateLanguage}
                    style={{ marginBottom: 14, background: '#f8faf9', padding: 14, borderRadius: 10 }}
                  >
                    <div className="form-row">
                      <div className="form-g">
                        <label>Idioma</label>
                        <input name="language_name" defaultValue={l.language_name} required />
                      </div>
                      <div className="form-g">
                        <label>Nivel</label>
                        <select name="proficiency" defaultValue={l.proficiency}>
                          {LANGUAGE_LEVELS.map((lvl) => (
                            <option key={lvl} value={lvl}>
                              {lvl}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button className="btn-p">Guardar cambios</button>{' '}
                    <button type="button" className="btn-g" onClick={() => setEditingLangId(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div
                    className="exp-item"
                    key={l.id}
                    draggable
                    onDragStart={(e) => handleCardDragStart(e, i, l.language_name)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      reorderByDrag('languages', languages, setLanguages, dragIndex, i);
                      setDragIndex(null);
                    }}
                    style={{ alignItems: 'center', cursor: 'grab' }}
                  >
                    <i className="ti ti-grip-vertical" style={{ color: '#ccc', fontSize: 16 }}></i>
                    <div className="exp-logo">🌐</div>
                    <div className="exp-body" style={{ flex: 1 }}>
                      <div className="et">
                        {l.language_name} <span className="badge bg" style={{ marginLeft: 6 }}>{l.proficiency}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, height: 'fit-content' }}>
                      <button
                        className="btn-g"
                        style={{ padding: '5px 7px' }}
                        disabled={i === 0}
                        onClick={() => moveItem('languages', languages, setLanguages, l.id, 'up')}
                      >
                        <i className="ti ti-arrow-up"></i>
                      </button>
                      <button
                        className="btn-g"
                        style={{ padding: '5px 7px' }}
                        disabled={i === languages.length - 1}
                        onClick={() => moveItem('languages', languages, setLanguages, l.id, 'down')}
                      >
                        <i className="ti ti-arrow-down"></i>
                      </button>
                      <button className="btn-g" style={{ padding: '5px 7px' }} onClick={() => setEditingLangId(l.id)}>
                        <i className="ti ti-edit"></i>
                      </button>
                      <button className="btn-g" style={{ padding: '5px 7px' }} onClick={() => deleteLanguage(l.id)}>
                        <i className="ti ti-trash"></i>
                      </button>
                    </div>
                  </div>
                )
              )}
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
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
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
                <button className="btn-ai" style={{ width: '100%', fontSize: 12.5 }} disabled={extractingCv} onClick={extractFromCv}>
                  <i className="ti ti-bolt"></i> {extractingCv ? 'Leyendo tu CV...' : 'Autocompletar perfil con IA'}
                </button>
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
            <h4>Mis empleos guardados y solicitados</h4>
            {savedJobs.length === 0 && <div style={{ fontSize: 12.5, color: '#999' }}>Ninguno todavía.</div>}
            {savedJobs.map((sj, i) => (
              <div className="sp" key={i}>
                <div className="sp-av" style={{ borderRadius: 8, overflow: 'hidden' }}>
                  {sj.jobs?.organizations?.logo_url ? (
                    <img
                      src={sj.jobs.organizations.logo_url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <i className="ti ti-briefcase"></i>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{sj.jobs?.title}</div>
                  <div style={{ fontSize: 11.5, color: '#888' }}>{sj.jobs?.organizations?.name}</div>
                </div>
              </div>
            ))}
            <Link href="/profile/jobs" style={{ fontSize: 12.5, color: '#1d6f5c' }}>
              Ver todos los empleos
            </Link>
          </div>

          <div className="sw">
            <h4>Organizaciones que sigues</h4>
            {followedOrgs.length === 0 && <div style={{ fontSize: 12.5, color: '#999' }}>Ninguna todavía.</div>}
            {followedOrgs.map((f, i) => (
              <Link href={`/organizations/${f.organizations?.slug}`} className="sp" key={i} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="sp-av" style={{ borderRadius: 8, overflow: 'hidden' }}>
                  {f.organizations?.logo_url ? (
                    <img
                      src={f.organizations.logo_url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <i className="ti ti-building"></i>
                  )}
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

      {cvExtractResult && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setCvExtractResult(null)}>
          <div className="modal-box" style={{ maxWidth: 620 }}>
            <div className="modal-head">
              <h2>Revisa lo que hemos leído de tu CV</h2>
              <div className="modal-x" onClick={() => setCvExtractResult(null)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: '#888', marginBottom: 16 }}>
              Desmarca lo que no quieras añadir. Esto se sumará a lo que ya tienes en tu perfil (no se borra nada).
            </p>

            {cvExtractResult.professional_title && !user.professional_title && (
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                <b>Título profesional:</b> {cvExtractResult.professional_title}
              </div>
            )}
            {cvExtractResult.bio && !profile?.bio && (
              <div style={{ fontSize: 13, marginBottom: 16, background: '#f8faf9', borderRadius: 8, padding: 10 }}>
                <b>Biografía:</b> {cvExtractResult.bio}
              </div>
            )}

            {cvExtractResult.experiences.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Experiencia detectada</div>
                {cvExtractResult.experiences.map((e, i) => (
                  <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, marginBottom: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedExpIdx.has(i)}
                      onChange={() => toggleSetIdx(setSelectedExpIdx, selectedExpIdx, i)}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <b>{e.title}</b> · {e.organization_name}
                      <div style={{ color: '#999', fontSize: 11 }}>
                        {e.start_date} – {e.end_date || 'Actualidad'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {cvExtractResult.education.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Educación detectada</div>
                {cvExtractResult.education.map((e, i) => (
                  <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, marginBottom: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedEduIdx.has(i)}
                      onChange={() => toggleSetIdx(setSelectedEduIdx, selectedEduIdx, i)}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <b>{e.degree}</b> · {e.institution}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {cvExtractResult.skills.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Habilidades detectadas</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cvExtractResult.skills.map((s) => (
                    <div
                      key={s}
                      onClick={() =>
                        setSelectedSkills((prev) => {
                          const n = new Set(prev);
                          n.has(s) ? n.delete(s) : n.add(s);
                          return n;
                        })
                      }
                      className={`tp ${selectedSkills.has(s) ? 'on' : ''}`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="m-foot">
              <button type="button" className="m-back" onClick={() => setCvExtractResult(null)}>
                Cancelar
              </button>
              <button className="m-next" disabled={applyingExtract} onClick={applyCvExtract}>
                <i className="ti ti-check"></i> {applyingExtract ? 'Aplicando...' : 'Añadir a mi perfil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptySection({ icon, title, description, ctaLabel, onCta }) {
  return (
    <div style={{ textAlign: 'center', padding: '36px 20px' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: '#e8f4f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        <i className={`ti ${icon}`} style={{ fontSize: 26, color: '#1d6f5c' }}></i>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#888', maxWidth: 320, margin: '0 auto 18px', lineHeight: 1.6 }}>{description}</div>
      {ctaLabel && (
        <button className="btn-p" onClick={onCta}>
          <i className="ti ti-plus"></i> {ctaLabel}
        </button>
      )}
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
