'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const COLUMNS = [
  ['enviada', 'Enviada'],
  ['en_revision', 'En revisión'],
  ['entrevista', 'Entrevista'],
  ['oferta', 'Oferta'],
  ['rechazada', 'Rechazada'],
];

export default function CandidatesBoardPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobFilter, setJobFilter] = useState('');
  const [dragId, setDragId] = useState(null);
  const [ranking, setRanking] = useState(false);
  const [summaryFor, setSummaryFor] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .maybeSingle();

    if (!membership) return setLoading(false);
    setOrg(membership.organizations);

    const { data: jobsData } = await supabase
      .from('jobs')
      .select('id, title')
      .eq('organization_id', membership.organizations.id)
      .order('created_at', { ascending: false });
    setJobs(jobsData || []);

    const { data: apps } = await supabase
      .from('job_applications')
      .select(
        `id, status, applied_at, cover_note, cv_url_snapshot, ai_summary, ai_score, ai_rationale, ai_analyzed_at,
         job_id, jobs(title),
         users(first_name, last_name, professional_title, email, phone)`
      )
      .in('job_id', (jobsData || []).map((j) => j.id))
      .neq('status', 'retirada')
      .order('applied_at', { ascending: false });

    setApplications(apps || []);
    setLoading(false);
  }

  async function updateStatus(appId, newStatus) {
    setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a)));
    const { error } = await supabase.from('job_applications').update({ status: newStatus }).eq('id', appId);
    if (error) toast('No se pudo mover el candidato');
  }

  function onDrop(newStatus) {
    if (!dragId) return;
    updateStatus(dragId, newStatus);
    setDragId(null);
  }

  async function generateSummary(app) {
    setSummaryFor(app.id);
    setSummaryLoading(true);
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: app.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      setApplications((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, ai_summary: data.summary, ai_analyzed_at: new Date().toISOString() } : a))
      );
    } catch (err) {
      toast('No se pudo generar el resumen: ' + err.message);
    }
    setSummaryLoading(false);
  }

  async function rankCandidates() {
    if (!jobFilter) {
      toast('Elige primero una oferta concreta para poder ordenarla');
      return;
    }
    setRanking(true);
    try {
      const res = await fetch('/api/ai/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobFilter }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      const scoreMap = new Map(data.rankings.map((r) => [r.applicationId, r]));
      setApplications((prev) =>
        prev.map((a) =>
          scoreMap.has(a.id)
            ? { ...a, ai_score: scoreMap.get(a.id).score, ai_rationale: scoreMap.get(a.id).rationale, ai_analyzed_at: new Date().toISOString() }
            : a
        )
      );
      toast('Candidatos ordenados con IA ✓');
    } catch (err) {
      toast('No se pudo generar el ranking: ' + err.message);
    }
    setRanking(false);
  }

  const filtered = jobFilter ? applications.filter((a) => a.job_id === jobFilter) : applications;

  function sortedForColumn(list) {
    if (!jobFilter) return list;
    return [...list].sort((a, b) => (b.ai_score || -1) - (a.ai_score || -1));
  }

  if (loading) return <div className="spinner"></div>;

  if (!org) {
    return (
      <div className="sec">
        <div className="empty-state">
          <i className="ti ti-building-off"></i>
          Todavía no administras ninguna organización.
        </div>
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>Candidatos</h2>
          <p style={{ fontSize: 13, color: '#888' }}>Arrastra las tarjetas entre columnas para actualizar su fase</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="fsel" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
            <option value="">Todas las ofertas</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
          <button className="btn-p" disabled={ranking || !jobFilter} onClick={rankCandidates} title={!jobFilter ? 'Elige una oferta concreta primero' : ''}>
            <i className="ti ti-sparkles"></i> {ranking ? 'Ordenando...' : 'Ordenar con IA'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, overflowX: 'auto' }}>
        {COLUMNS.map(([key, label]) => {
          const items = sortedForColumn(filtered.filter((a) => a.status === key));
          return (
            <div
              key={key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(key)}
              style={{ background: '#f4f4f0', borderRadius: 10, padding: 10, minHeight: 300 }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#555', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                {label}
                <span style={{ color: '#aaa' }}>{items.length}</span>
              </div>
              {items.map((a) => (
                <div
                  key={a.id}
                  draggable
                  onDragStart={() => setDragId(a.id)}
                  style={{
                    background: '#fff',
                    border: '1px solid #e0dfd8',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                    cursor: 'grab',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {a.users?.first_name} {a.users?.last_name}
                    </div>
                    {a.ai_score != null && (
                      <span
                        className="badge"
                        style={{
                          background: a.ai_score >= 70 ? '#e8f4f0' : a.ai_score >= 40 ? '#fff8e1' : '#fdecea',
                          color: a.ai_score >= 70 ? '#1d6f5c' : a.ai_score >= 40 ? '#b8860b' : '#b3261e',
                          fontSize: 10.5,
                        }}
                        title={a.ai_rationale || ''}
                      >
                        {a.ai_score}/100
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{a.users?.professional_title}</div>
                  {!jobFilter && <div style={{ fontSize: 10.5, color: '#1d6f5c', marginBottom: 4 }}>{a.jobs?.title}</div>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10.5, color: '#999', marginBottom: 6 }}>
                    {a.users?.phone && <span>{a.users.phone}</span>}
                    {a.cv_url_snapshot && (
                      <a href={a.cv_url_snapshot} target="_blank" rel="noreferrer" style={{ color: '#1d6f5c' }}>
                        Ver CV
                      </a>
                    )}
                  </div>
                  {a.ai_summary && summaryFor !== a.id && (
                    <div style={{ fontSize: 10.5, color: '#666', background: '#f8faf9', borderRadius: 6, padding: 6, marginBottom: 6, lineHeight: 1.5 }}>
                      {a.ai_summary}
                    </div>
                  )}
                  <button
                    className="btn-g"
                    style={{ fontSize: 10.5, padding: '4px 8px', width: '100%' }}
                    disabled={summaryLoading && summaryFor === a.id}
                    onClick={() => generateSummary(a)}
                  >
                    <i className="ti ti-sparkles" style={{ fontSize: 11 }}></i>{' '}
                    {summaryLoading && summaryFor === a.id
                      ? 'Generando...'
                      : a.ai_summary
                      ? 'Regenerar resumen IA'
                      : 'Generar resumen IA'}
                  </button>
                </div>
              ))}
              {items.length === 0 && <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: 20 }}>Sin candidatos</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
