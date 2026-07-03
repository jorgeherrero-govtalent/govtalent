'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const COLUMNS = [
  ['enviada', 'Enviada'],
  ['en_revision', 'En revisión'],
  ['entrevista', 'Entrevista'],
  ['oferta', 'Oferta'],
  ['rechazada', 'Rechazada'],
];

const SCORE_FILTERS = [
  ['', 'Todas las puntuaciones'],
  ['high', 'Alto encaje (70+)'],
  ['mid', 'Encaje medio (40-69)'],
  ['low', 'Encaje bajo (<40)'],
];

export default function CandidatesBoardPage() {
  return (
    <Suspense fallback={<div className="spinner"></div>}>
      <CandidatesBoardInner />
    </Suspense>
  );
}

function CandidatesBoardInner() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const [jobFilter, setJobFilter] = useState(searchParams.get('job') || '');
  const [scoreFilter, setScoreFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [dragId, setDragId] = useState(null);
  const [ranking, setRanking] = useState(false);

  const [detailApp, setDetailApp] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
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
        `id, status, applied_at, cover_note, cv_url_snapshot, notes, candidate_id,
         ai_summary, ai_score, ai_rationale, ai_analyzed_at,
         job_id, jobs(title),
         users(first_name, last_name, professional_title, email, phone)`
      )
      .in('job_id', (jobsData || []).map((j) => j.id))
      .neq('status', 'retirada')
      .order('applied_at', { ascending: false });

    // El email "de cuenta" (con el que el candidato inicia sesión) es
    // privado; a las organizaciones les mostramos el de contacto para
    // contrataciones que el candidato haya configurado en su perfil,
    // cayendo de vuelta al de la cuenta solo si no ha puesto ninguno.
    const candidateIds = [...new Set((apps || []).map((a) => a.candidate_id).filter(Boolean))];
    let contactEmailByUser = {};
    if (candidateIds.length > 0) {
      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('user_id, contact_email')
        .in('user_id', candidateIds);
      contactEmailByUser = Object.fromEntries((profiles || []).map((p) => [p.user_id, p.contact_email]));
    }

    const appsWithContactEmail = (apps || []).map((a) => ({
      ...a,
      contact_email: contactEmailByUser[a.candidate_id] || a.users?.email || null,
    }));

    setApplications(appsWithContactEmail);
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

  function openDetail(app) {
    setDetailApp(app);
    setNotesDraft(app.notes || '');
  }

  function closeDetail() {
    setDetailApp(null);
    setNotesDraft('');
  }

  async function saveNotes() {
    if (!detailApp) return;
    setSavingNotes(true);
    const { error } = await supabase.from('job_applications').update({ notes: notesDraft }).eq('id', detailApp.id);
    setSavingNotes(false);
    if (error) {
      toast('No se pudieron guardar las notas');
      return;
    }
    setApplications((prev) => prev.map((a) => (a.id === detailApp.id ? { ...a, notes: notesDraft } : a)));
    setDetailApp((prev) => ({ ...prev, notes: notesDraft }));
    toast('Notas guardadas ✓');
  }

  async function generateSummary(app) {
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
      setDetailApp((prev) => (prev && prev.id === app.id ? { ...prev, ai_summary: data.summary } : prev));
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

  function passesFilters(a) {
    if (jobFilter && a.job_id !== jobFilter) return false;
    if (nameFilter) {
      const full = `${a.users?.first_name || ''} ${a.users?.last_name || ''}`.toLowerCase();
      if (!full.includes(nameFilter.toLowerCase())) return false;
    }
    if (scoreFilter && jobFilter) {
      const s = a.ai_score;
      if (s == null) return false;
      if (scoreFilter === 'high' && s < 70) return false;
      if (scoreFilter === 'mid' && (s < 40 || s >= 70)) return false;
      if (scoreFilter === 'low' && s >= 40) return false;
    }
    return true;
  }

  const filtered = applications.filter(passesFilters);

  function sortedForColumn(list) {
    if (!jobFilter) return list;
    return [...list].sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1));
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>Candidatos</h2>
          <p style={{ fontSize: 13, color: '#888' }}>Arrastra las tarjetas entre columnas, o haz clic en una para ver el detalle</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="fsel"
            placeholder="Buscar por nombre..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            style={{ minWidth: 150 }}
          />
          <select className="fsel" value={jobFilter} onChange={(e) => { setJobFilter(e.target.value); setScoreFilter(''); }}>
            <option value="">Todas las ofertas</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
          {jobFilter && (
            <select className="fsel" value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)}>
              {SCORE_FILTERS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          )}
          <button className="btn-ai" disabled={ranking || !jobFilter} onClick={rankCandidates} title={!jobFilter ? 'Elige una oferta concreta primero' : ''}>
            <i className="ti ti-bolt"></i> {ranking ? 'Ordenando...' : 'Ordenar con IA'}
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
                  onClick={() => openDetail(a)}
                  style={{
                    background: '#fff',
                    border: '1px solid #e0dfd8',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                    cursor: 'pointer',
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
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10.5, color: '#999' }}>
                    {a.users?.phone && <span>{a.users.phone}</span>}
                    {a.notes && (
                      <span style={{ color: '#1d6f5c' }}>
                        <i className="ti ti-note" style={{ fontSize: 11 }}></i> Con notas
                      </span>
                    )}
                    {a.ai_summary && (
                      <span style={{ color: '#6d5aef' }}>
                        <i className="ti ti-bolt" style={{ fontSize: 11 }}></i> Resumen IA
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: 20 }}>Sin candidatos</div>}
            </div>
          );
        })}
      </div>

      {detailApp && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && closeDetail()}>
          <div className="modal-box" style={{ maxWidth: 620 }}>
            <div className="modal-head">
              <h2>
                {detailApp.users?.first_name} {detailApp.users?.last_name}
              </h2>
              <div className="modal-x" onClick={closeDetail}>
                <i className="ti ti-x"></i>
              </div>
            </div>

            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{detailApp.users?.professional_title}</div>
            <div style={{ fontSize: 12, color: '#1d6f5c', marginBottom: 14 }}>{detailApp.jobs?.title}</div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: '#666', marginBottom: 14 }}>
              {detailApp.contact_email && (
                <span>
                  <i className="ti ti-mail"></i> {detailApp.contact_email}
                </span>
              )}
              {detailApp.users?.phone && (
                <span>
                  <i className="ti ti-phone"></i> {detailApp.users.phone}
                </span>
              )}
              {detailApp.cv_url_snapshot && (
                <a href={detailApp.cv_url_snapshot} target="_blank" rel="noreferrer" style={{ color: '#1d6f5c', fontWeight: 500 }}>
                  <i className="ti ti-file-cv"></i> Ver CV
                </a>
              )}
            </div>

            {detailApp.cover_note && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>Carta de presentación</div>
                <div style={{ fontSize: 12.5, color: '#555', background: '#f8faf9', borderRadius: 8, padding: 10, lineHeight: 1.6 }}>
                  {detailApp.cover_note}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Resumen con IA</div>
                <button className="btn-ai-o" style={{ fontSize: 11, padding: '4px 9px' }} disabled={summaryLoading} onClick={() => generateSummary(detailApp)}>
                  <i className="ti ti-bolt" style={{ fontSize: 11 }}></i>{' '}
                  {summaryLoading ? 'Generando...' : detailApp.ai_summary ? 'Regenerar' : 'Generar'}
                </button>
              </div>
              {detailApp.ai_summary ? (
                <div style={{ fontSize: 12.5, color: '#555', background: '#faf9ff', border: '1px solid #d8d3fb', borderRadius: 8, padding: 10, lineHeight: 1.6 }}>
                  {detailApp.ai_summary}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#999' }}>Todavía no se ha generado un resumen para este candidato.</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>Tus notas privadas</div>
              <p style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                Útil para apuntar impresiones de una llamada o entrevista. Solo lo ve tu equipo.
              </p>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Escribe aquí tus notas..."
                style={{
                  width: '100%',
                  minHeight: 110,
                  padding: '10px 12px',
                  border: '1px solid #e0dfd8',
                  borderRadius: 9,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                }}
              ></textarea>
              <div className="m-foot">
                <div></div>
                <button className="m-next" disabled={savingNotes} onClick={saveNotes}>
                  <i className="ti ti-check"></i> {savingNotes ? 'Guardando...' : 'Guardar notas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
