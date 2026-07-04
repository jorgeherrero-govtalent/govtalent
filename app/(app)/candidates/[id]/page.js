'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function CandidateProfileViewPage() {
  const { id } = useParams();
  const supabase = createClient();

  const [candidate, setCandidate] = useState(null);
  const [profile, setProfile] = useState(null);
  const [experiences, setExperiences] = useState([]);
  const [education, setEducation] = useState([]);
  const [skills, setSkills] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);

  const [myOrgId, setMyOrgId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;

    if (uid) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', uid)
        .maybeSingle();
      if (membership) setMyOrgId(membership.organization_id);
    }

    const [{ data: u }, { data: p }, { data: exp }, { data: edu }, { data: sk }, { data: lang }] = await Promise.all([
      supabase.from('users').select('*').eq('id', id).single(),
      supabase.from('candidate_profiles').select('*').eq('user_id', id).single(),
      supabase.from('experiences').select('*').eq('user_id', id).order('sort_order', { ascending: true }),
      supabase.from('education').select('*').eq('user_id', id).order('sort_order', { ascending: true }),
      supabase.from('skills').select('*').eq('user_id', id).order('sort_order', { ascending: true }),
      supabase.from('languages').select('*').eq('user_id', id).order('sort_order', { ascending: true }),
    ]);

    setCandidate(u);
    setProfile(p);
    setExperiences(exp || []);
    setEducation(edu || []);
    setSkills(sk || []);
    setLanguages(lang || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!myOrgId || !id) return;
    supabase
      .from('saved_candidates')
      .select('id')
      .eq('organization_id', myOrgId)
      .eq('candidate_id', id)
      .maybeSingle()
      .then(({ data }) => setSaved(!!data));
  }, [myOrgId, id]);

  async function toggleSaveCandidate() {
    if (!myOrgId) return;
    setSaving(true);
    if (saved) {
      await supabase.from('saved_candidates').delete().eq('organization_id', myOrgId).eq('candidate_id', id);
      setSaved(false);
      toast('Candidato eliminado de guardados');
    } else {
      const { data: authData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('saved_candidates')
        .insert({ organization_id: myOrgId, candidate_id: id, saved_by: authData.user?.id });
      if (!error) {
        setSaved(true);
        toast('Candidato guardado ✓');
      }
    }
    setSaving(false);
  }

  if (loading) return <div className="spinner"></div>;

  if (!candidate) {
    return (
      <div className="sec">
        <div className="empty-state">
          <i className="ti ti-user-off"></i>
          No se encontró este perfil.
        </div>
      </div>
    );
  }

  return (
    <div className="sec">
      <div style={{ maxWidth: 1080, margin: '0 auto 10px' }}>
        <button onClick={() => history.back()} style={{ fontSize: 12.5, color: '#1d6f5c', background: 'none', border: 'none', cursor: 'pointer' }}>
          <i className="ti ti-arrow-left"></i> Volver
        </button>
      </div>

      <div className="card" style={{ maxWidth: 1080, margin: '0 auto 13px' }}>
        <div
          className="p-cover"
          style={
            profile?.cover_url
              ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
        >
          <div className="p-av">
            {candidate.avatar_url ? <img src={candidate.avatar_url} alt="" /> : candidate.first_name?.[0]}
          </div>
        </div>
        <div className="p-info">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="p-name">
                {candidate.first_name} {candidate.last_name}
              </div>
              <div className="p-title">{candidate.professional_title}</div>
              <div className="p-meta">
                {candidate.location && (
                  <span>
                    <i className="ti ti-map-pin" style={{ fontSize: 12 }}></i> {candidate.location}
                  </span>
                )}
              </div>
            </div>
            {myOrgId && (
              <button className={saved ? 'btn-o' : 'btn-p'} disabled={saving} onClick={toggleSaveCandidate}>
                <i className={`ti ${saved ? 'ti-bookmark-filled' : 'ti-bookmark'}`}></i>{' '}
                {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar candidato'}
              </button>
            )}
          </div>
        </div>
        {profile?.bio && (
          <div className="p-sec" style={{ borderBottom: 'none' }}>
            <h3>Acerca de</h3>
            <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.7 }}>{profile.bio}</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 13, maxWidth: 1080, margin: '0 auto' }}>
        <div className="card">
          {experiences.length > 0 && (
            <div className="p-sec">
              <h3>Experiencia</h3>
              {experiences.map((exp) => (
                <div className="exp-item" key={exp.id}>
                  <div className="exp-logo">🏛️</div>
                  <div className="exp-body">
                    <div className="et">{exp.title}</div>
                    <div className="eo">{exp.organization_name}</div>
                    <div className="ep">
                      {exp.start_date} – {exp.end_date || 'Actualidad'}
                    </div>
                    <div className="ed">{exp.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {education.length > 0 && (
            <div className="p-sec" style={{ borderBottom: 'none' }}>
              <h3>Educación</h3>
              {education.map((ed) => (
                <div className="exp-item" key={ed.id}>
                  <div className="exp-logo">🎓</div>
                  <div className="exp-body">
                    <div className="et">{ed.degree}</div>
                    <div className="eo">{ed.institution}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {experiences.length === 0 && education.length === 0 && (
            <div className="empty-state">
              <i className="ti ti-file-off"></i>
              Este candidato aún no ha completado su experiencia ni educación.
            </div>
          )}
        </div>

        <div>
          {skills.length > 0 && (
            <div className="sw">
              <h4>Habilidades</h4>
              <div>
                {skills.map((s) => (
                  <span className="skill" key={s.id}>
                    {s.skill_name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {languages.length > 0 && (
            <div className="sw">
              <h4>Idiomas</h4>
              {languages.map((l) => (
                <div className="sp" key={l.id}>
                  <div className="sp-av" style={{ borderRadius: 8 }}>
                    🌐
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{l.language_name}</div>
                    <div style={{ fontSize: 11.5, color: '#888' }}>{l.proficiency}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
