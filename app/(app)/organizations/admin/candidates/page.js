'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';

const COLUMNS = [
  ['enviada', 'Enviada'],
  ['en_revision', 'En revisión'],
  ['entrevista', 'Entrevista'],
  ['oferta', 'Oferta'],
  ['rechazada', 'Rechazada'],
];

// Cuatro y "ver todas": lo normal es mirar las últimas, no recorrer
// la lista entera cada vez.
const POR_PAGINA = 4;


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
  const [ranking, setRanking] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState(null);

  const [detailApp, setDetailApp] = useState(null);
  const [etapa, setEtapa] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Modal que aparece al mover un candidato a "Oferta" o "Rechazada"
  const [statusAction, setStatusAction] = useState(null); // { appId, targetStatus, step }
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionDetails, setRejectionDetails] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [generatingMessage, setGeneratingMessage] = useState(false);
  const [savingStatusAction, setSavingStatusAction] = useState(false);

  const REJECTION_REASONS = [
    'No cumple los requisitos mínimos',
    'Otro candidato más adecuado para el puesto',
    'Expectativas salariales no alineadas',
    'Falta de experiencia relevante',
    'No superó la entrevista',
    'El puesto se ha cubierto internamente',
    'Otro motivo',
  ];

  useEffect(() => {
    load();
  }, []);

  async function viewCandidateCv(applicationId) {
    try {
      const res = await fetch('/api/cv/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'application', applicationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo abrir el CV');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast(err.message);
    }
  }

  useEffect(() => {
    setVerTodos(false);
  }, [nameFilter, jobFilter, scoreFilter]);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .limit(1)
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
        `id, status, applied_at, cover_note, cv_url_snapshot, notes, candidate_id, rejection_reason, rejection_details,
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

  async function updateStatus(appId, newStatus, extra = {}) {
    setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: newStatus, ...extra } : a)));
    const { error } = await supabase.from('job_applications').update({ status: newStatus, ...extra }).eq('id', appId);
    if (error) toast('No se pudo mover el candidato');
  }

  // Cambiar de etapa no es solo actualizar un campo: rechazar pide un
  // motivo y pasar a entrevista u oferta ofrece escribir al candidato.
  // Esa lógica vivía en el arrastre del tablero; ahora vive aquí, que es
  // el único sitio desde donde se cambia.
  function cambiarEtapa(appId, nuevoEstado) {
    if (nuevoEstado === 'rechazada') {
      setStatusAction({ appId, targetStatus: 'rechazada', step: 'reason' });
    } else if (nuevoEstado === 'oferta' || nuevoEstado === 'entrevista') {
      updateStatus(appId, nuevoEstado);
      setStatusAction({ appId, targetStatus: nuevoEstado, step: 'message' });
    } else {
      updateStatus(appId, nuevoEstado);
    }
  }

  function closeStatusAction() {
    setStatusAction(null);
    setRejectionReason('');
    setRejectionDetails('');
    setDraftMessage('');
  }

  async function confirmRejectionReason() {
    if (!rejectionReason) {
      toast('Elige un motivo para continuar');
      return;
    }
    setSavingStatusAction(true);
    await updateStatus(statusAction.appId, 'rechazada', {
      rejection_reason: rejectionReason,
      rejection_details: rejectionDetails || null,
    });
    setSavingStatusAction(false);
    setStatusAction((prev) => ({ ...prev, step: 'message' }));
  }

  async function generateStatusMessage() {
    if (!statusAction) return;
    setGeneratingMessage(true);
    try {
      const res = await fetch('/api/ai/candidate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: statusAction.appId, messageType: statusAction.targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      setDraftMessage(data.message);
    } catch (err) {
      toast('No se pudo generar el mensaje: ' + err.message);
    }
    setGeneratingMessage(false);
  }

  function copyDraftMessage() {
    navigator.clipboard?.writeText(draftMessage);
    toast('Mensaje copiado ✓');
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
      if (!res.ok) {
        if (data.upgradeRequired) {
          setUpgradeModal({ title: 'Matching de candidatos con IA', message: data.error });
          setRanking(false);
          return;
        }
        throw new Error(data.error || 'Error desconocido');
      }
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

  // Dos listas: una con todos los filtros menos la etapa —para contar
  // cuántos hay en cada pastilla— y otra con la etapa ya aplicada.
  const sinEtapa = applications.filter(passesFilters);
  const filtered = etapa ? sinEtapa.filter((a) => a.status === etapa) : sinEtapa;

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

  const totalFiltrado = filtered.length;
  const lista = sortedForColumn(filtered).slice(0, verTodos ? totalFiltrado : POR_PAGINA);

  const chip = (activo) => ({
    padding: '6px 12px',
    borderRadius: 7,
    fontSize: 12.5,
    cursor: 'pointer',
    border: 'none',
    background: activo ? '#f0eefe' : 'transparent',
    color: activo ? '#6d5aef' : '#8b8780',
    whiteSpace: 'nowrap',
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>Candidatos</h2>
          <p style={{ fontSize: 13, color: '#888' }}>
            {totalFiltrado} {totalFiltrado === 1 ? 'candidatura' : 'candidaturas'}
          </p>
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
          <button className="btn-ai" disabled={ranking || !jobFilter} onClick={rankCandidates} title={!jobFilter ? 'Elige una oferta concreta primero' : ''}>
            <i className="ti ti-bolt"></i> {ranking ? 'Ordenando...' : 'Ordenar con IA'}
          </button>
        </div>
      </div>

      {/* Pastillas, como en Seguimiento y en el resto de la plataforma.
          Antes la etapa se elegía desde un desplegable, que esconde
          cuántas candidaturas hay en cada una. */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={() => setEtapa('')} style={chip(etapa === '')}>
          Todas {sinEtapa.length}
        </button>
        {COLUMNS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setEtapa(key)} style={chip(etapa === key)}>
            {label} {sinEtapa.filter((a) => a.status === key).length}
          </button>
        ))}
      </div>

      {/* Una sola vista, en lista. El tablero de cinco columnas obligaba
          a desplazarse en horizontal y no cabía en un teléfono; la etapa
          se cambia desde el desplegable de cada fila. */}
      <div className="card" style={{ padding: '4px 18px' }}>
        {lista.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#999', padding: '22px 0', textAlign: 'center' }}>
            Ninguna candidatura con estos filtros.
          </div>
        )}

        {lista.map((a, i) => (
          <div
            key={a.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '13px 0',
              borderTop: i === 0 ? 'none' : '.5px solid #e0dfd8',
            }}
          >
            <button
              onClick={() => openDetail(a)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', padding: 0 }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: '#e8f4f0',
                  color: '#1d6f5c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12.5,
                  fontWeight: 600,
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                {a.users?.avatar_url ? (
                  <img src={a.users.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  (a.users?.first_name || '?').charAt(0).toUpperCase()
                )}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.users?.first_name} {a.users?.last_name}
                  </span>
                  {a.ai_score != null && (
                    <span
                      className="badge"
                      style={{
                        background: a.ai_score >= 70 ? '#e8f4f0' : a.ai_score >= 40 ? '#fff8e1' : '#fdecea',
                        color: a.ai_score >= 70 ? '#1d6f5c' : a.ai_score >= 40 ? '#b8860b' : '#b3261e',
                        fontSize: 10.5,
                        flexShrink: 0,
                      }}
                      title={a.ai_rationale || ''}
                    >
                      {a.ai_score}/100
                    </span>
                  )}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[a.jobs?.title, a.users?.professional_title].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>

            <select
              className="fsel"
              value={a.status}
              onChange={(e) => cambiarEtapa(a.id, e.target.value)}
              style={{ width: 'auto', flexShrink: 0, fontSize: 12 }}
            >
              {COLUMNS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {!verTodos && totalFiltrado > POR_PAGINA && (
        <button
          onClick={() => setVerTodos(true)}
          style={{ background: 'none', border: 'none', color: '#6d5aef', fontSize: 12.5, padding: '12px 0 0' }}
        >
          Ver todas ({totalFiltrado}) →
        </button>
      )}

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

            {/* Cambiar de etapa es lo que de verdad se hace desde aquí.
                Antes había que cerrar el modal y arrastrar la tarjeta. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: '#888' }}>Etapa</span>
              <select
                className="fsel"
                value={detailApp.status}
                onChange={(e) => cambiarEtapa(detailApp.id, e.target.value)}
                style={{ width: 'auto', fontSize: 12.5 }}
              >
                {COLUMNS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>



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
                <span
                  onClick={() => viewCandidateCv(detailApp.id)}
                  style={{ color: '#1d6f5c', fontWeight: 500, cursor: 'pointer' }}
                >
                  <i className="ti ti-file-cv"></i> Ver CV
                </span>
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

      {statusAction && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && closeStatusAction()}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <h2>
                {statusAction.targetStatus === 'rechazada'
                  ? 'Motivo del rechazo'
                  : statusAction.targetStatus === 'entrevista'
                  ? 'Invitar a entrevista'
                  : 'Comunicar oferta'}
              </h2>
              <div className="modal-x" onClick={closeStatusAction}>
                <i className="ti ti-x"></i>
              </div>
            </div>

            {statusAction.step === 'reason' && (
              <div>
                <div className="field">
                  <label>Motivo</label>
                  <select value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}>
                    <option value="">Elige un motivo</option>
                    {REJECTION_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Detalles (opcional)</label>
                  <textarea
                    value={rejectionDetails}
                    onChange={(e) => setRejectionDetails(e.target.value)}
                    placeholder="Cualquier detalle adicional que quieras registrar internamente..."
                    style={{
                      width: '100%',
                      minHeight: 80,
                      padding: '10px 12px',
                      border: '1px solid #e0dfd8',
                      borderRadius: 9,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  ></textarea>
                </div>
                <p style={{ fontSize: 11.5, color: '#999', marginBottom: 14 }}>
                  Esto es solo para uso interno de tu organización — el candidato no verá este motivo tal cual.
                </p>
                <div className="m-foot">
                  <button className="m-back" onClick={closeStatusAction}>
                    Cancelar
                  </button>
                  <button className="m-next" disabled={savingStatusAction} onClick={confirmRejectionReason}>
                    {savingStatusAction ? 'Guardando...' : 'Continuar'}
                  </button>
                </div>
              </div>
            )}

            {statusAction.step === 'message' && (
              <div>
                <p style={{ fontSize: 12.5, color: '#888', marginBottom: 12 }}>
                  Genera un borrador de mensaje para comunicárselo al candidato. Puedes editarlo antes de copiarlo.
                </p>
                {!draftMessage ? (
                  <button className="btn-ai" style={{ width: '100%', marginBottom: 6 }} disabled={generatingMessage} onClick={generateStatusMessage}>
                    <i className="ti ti-bolt"></i> {generatingMessage ? 'Generando...' : 'Generar mensaje con IA'}
                  </button>
                ) : (
                  <>
                    <textarea
                      value={draftMessage}
                      onChange={(e) => setDraftMessage(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: 160,
                        padding: '10px 12px',
                        border: '1px solid #e0dfd8',
                        borderRadius: 9,
                        fontSize: 13,
                        fontFamily: 'inherit',
                        outline: 'none',
                        resize: 'vertical',
                        marginBottom: 10,
                      }}
                    ></textarea>
                    <button
                      type="button"
                      className="btn-ai-o"
                      style={{ width: '100%', fontSize: 12, marginBottom: 6 }}
                      disabled={generatingMessage}
                      onClick={generateStatusMessage}
                    >
                      <i className="ti ti-bolt"></i> Regenerar
                    </button>
                  </>
                )}
                <div className="m-foot">
                  <button className="m-back" onClick={closeStatusAction}>
                    Cerrar
                  </button>
                  {draftMessage && (
                    <button className="m-next" onClick={copyDraftMessage}>
                      <i className="ti ti-copy"></i> Copiar mensaje
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {upgradeModal && (
        <UpgradeModal
          title={upgradeModal.title}
          message={upgradeModal.message}
          onClose={() => setUpgradeModal(null)}
        />
      )}
    </div>
  );
}
