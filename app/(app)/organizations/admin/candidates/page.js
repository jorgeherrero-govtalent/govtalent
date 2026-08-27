'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import UpgradeModal from '@/components/UpgradeModal';

const ETIQUETA_MODAL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.3px' };

// Para enseñar la etapa como texto en el modal, sin ofrecer cambiarla:
// eso se hace arrastrando en el tablero.
const ETIQUETA_ESTADO = {
  enviada: 'Enviada',
  en_revision: 'En revisión',
  entrevista: 'Entrevista',
  oferta: 'Oferta',
  rechazada: 'Rechazada',
};

function tiempoDesde(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias < 1) return 'se postuló hoy';
  if (dias === 1) return 'se postuló ayer';
  if (dias < 30) return `se postuló hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return `se postuló hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

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
  const [ofertaFiltro, setOfertaFiltro] = useState(new Set());
  const [puntuacionFiltro, setPuntuacionFiltro] = useState(new Set());
  const [nameFilter, setNameFilter] = useState('');
  const [dragId, setDragId] = useState(null);
  const [ranking, setRanking] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState(null);
  const PAGE_SIZE = 6;
  const [visibleCounts, setVisibleCounts] = useState({});

  const [detailApp, setDetailApp] = useState(null);
  const [estadoNotas, setEstadoNotas] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Modal que aparece al mover un candidato a "Rechazada", para recoger
  // el motivo. Mover a oferta o entrevista no interrumpe: arrastrar ya
  // expresa la intención y un modal detrás de cada movimiento hace el
  // tablero incómodo de usar.
  const [statusAction, setStatusAction] = useState(null); // { appId, targetStatus, step }
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionDetails, setRejectionDetails] = useState('');
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
    setJobFilter(ofertaFiltro.size === 1 ? [...ofertaFiltro][0] : '');
  }, [ofertaFiltro]);

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
    setVisibleCounts({});
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

  function onDrop(newStatus) {
    if (!dragId) return;
    if (newStatus === 'rechazada') {
      setStatusAction({ appId: dragId, targetStatus: 'rechazada', step: 'reason' });
    } else {
      updateStatus(dragId, newStatus);
    }
    setDragId(null);
  }

  function closeStatusAction() {
    setStatusAction(null);
    setRejectionReason('');
    setRejectionDetails('');
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
    closeStatusAction();
  }

  function openDetail(app) {
    setDetailApp(app);
  }

  function closeDetail() {
    setDetailApp(null);
  }

  // Guardar al salir del campo, con un aviso discreto en vez de un
  // botón: si hay que acordarse de pulsarlo, se pierden notas.
  async function guardarNotasSolo(valor) {
    if (!detailApp) return;
    const texto = valor.trim();
    if (texto === (detailApp.notes || '').trim()) return;
    setEstadoNotas('Guardando…');
    const { error } = await supabase.from('job_applications').update({ notes: texto }).eq('id', detailApp.id);
    if (error) {
      setEstadoNotas('No se han podido guardar');
      return;
    }
    setApplications((prev) => prev.map((a) => (a.id === detailApp.id ? { ...a, notes: texto } : a)));
    setDetailApp((prev) => ({ ...prev, notes: texto }));
    setEstadoNotas('Guardado');
    setTimeout(() => setEstadoNotas(''), 1600);
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
    <div className="sec">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>Candidatos</h2>
          <p style={{ fontSize: 13, color: '#888' }}>Arrastra las tarjetas entre columnas, o haz clic en una para ver el detalle</p>
        </div>
        {/* Los mismos filtros que el resto de la plataforma: etiqueta,
            recuento de lo seleccionado y buscador dentro. Antes eran
            desplegables sueltos, con otro aspecto. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="fsel"
            placeholder="Buscar por nombre..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            style={{ minWidth: 150 }}
          />
          <MultiSelectFilter
            label="Oferta"
            values={jobs.map((j) => ({ value: j.id, label: j.title }))}
            selected={ofertaFiltro}
            onApply={(sel) => {
              setOfertaFiltro(sel);
              // La puntuación solo tiene sentido dentro de una oferta:
              // comparar candidatos de procesos distintos no dice nada.
              if (sel.size !== 1) {
                setScoreFilter('');
                setPuntuacionFiltro(new Set());
              }
            }}
          />
          {ofertaFiltro.size === 1 && (
            <MultiSelectFilter
              label="Puntuación"
              values={SCORE_FILTERS.filter(([k]) => k).map(([k, l]) => ({ value: k, label: l }))}
              selected={puntuacionFiltro}
              onApply={(sel) => {
                setPuntuacionFiltro(sel);
                setScoreFilter([...sel][0] || '');
              }}
            />
          )}
          <button className="btn-ai" disabled={ranking || !jobFilter} onClick={rankCandidates} title={!jobFilter ? 'Elige una oferta concreta primero' : ''}>
            <i className="ti ti-bolt"></i> {ranking ? 'Ordenando...' : 'Ordenar con IA'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, overflowX: 'auto' }}>
        {COLUMNS.map(([key, label]) => {
          const items = sortedForColumn(filtered.filter((a) => a.status === key));
          const visibleCount = visibleCounts[key] || PAGE_SIZE;
          const visibleItems = items.slice(0, visibleCount);
          const remaining = items.length - visibleItems.length;
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
              {visibleItems.map((a) => (
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
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleCounts((prev) => ({ ...prev, [key]: visibleCount + PAGE_SIZE }))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '.5px dashed #cfcec6',
                    borderRadius: 8,
                    background: '#fff',
                    color: '#666',
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  Ver {Math.min(remaining, PAGE_SIZE)} más ({remaining} restantes)
                </button>
              )}
            </div>
          );
        })}
      </div>

      {detailApp && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && closeDetail()}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            {/* Sin colores y sin botones grandes, como el briefing de un
                proyecto: el color se reservaba para el puesto y para el
                fondo del resumen, dos cosas que no lo necesitaban.

                Tampoco lleva selector de etapa: eso se hace arrastrando
                en el tablero, y dos formas de mover a alguien invitan a
                preguntarse cuál es la buena. */}
            <div className="modal-head">
              <h2>
                {detailApp.users?.first_name} {detailApp.users?.last_name}
              </h2>
              <div className="modal-x" onClick={closeDetail}>
                <i className="ti ti-x"></i>
              </div>
            </div>

            <div style={{ fontSize: 12.5, color: '#888', marginTop: -6, marginBottom: 14 }}>
              {[detailApp.users?.professional_title, tiempoDesde(detailApp.applied_at)]
                .filter(Boolean)
                .join(' · ')}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                paddingBottom: 14,
                marginBottom: 14,
                borderBottom: '.5px solid #e0dfd8',
                fontSize: 12,
                color: '#888',
              }}
            >
              <span>{detailApp.jobs?.title}</span>
              <span style={{ color: '#d5d3c9' }}>·</span>
              <span>{ETIQUETA_ESTADO[detailApp.status] || detailApp.status}</span>
              {detailApp.ai_score != null && (
                <span style={{ marginLeft: 'auto' }} title={detailApp.ai_rationale || ''}>
                  {detailApp.ai_score}/100
                </span>
              )}
            </div>

            <div style={{ ...ETIQUETA_MODAL, marginBottom: 8 }}>CONTACTO</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 18 }}>
              {detailApp.contact_email && <span style={{ color: '#555' }}>{detailApp.contact_email}</span>}
              {detailApp.users?.phone && <span style={{ color: '#555' }}>{detailApp.users.phone}</span>}
              {detailApp.cv_url_snapshot && (
                <button
                  onClick={() => viewCandidateCv(detailApp.id)}
                  style={{ background: 'none', border: 'none', color: '#1d6f5c', fontSize: 12.5, padding: 0 }}
                >
                  Ver CV
                </button>
              )}
            </div>

            {detailApp.cover_note && (
              <>
                <div style={{ ...ETIQUETA_MODAL, marginBottom: 8 }}>CARTA DE PRESENTACIÓN</div>
                <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.65, marginBottom: 18 }}>
                  {detailApp.cover_note}
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={ETIQUETA_MODAL}>RESUMEN CON IA</span>
              <button
                onClick={() => generateSummary(detailApp)}
                disabled={summaryLoading}
                style={{ background: 'none', border: 'none', color: '#6d5aef', fontSize: 11.5, padding: 0 }}
              >
                {summaryLoading ? 'Generando…' : detailApp.ai_summary ? 'Regenerar' : 'Generar'}
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: detailApp.ai_summary ? '#555' : '#999', lineHeight: 1.65, marginBottom: 18 }}>
              {detailApp.ai_summary || 'Todavía no se ha generado un resumen para este candidato.'}
            </div>

            <div style={{ ...ETIQUETA_MODAL, marginBottom: 8 }}>NOTAS</div>
            {/* Se guardan al salir del campo, como en Proyectos: un botón
                de guardar obliga a acordarse de pulsarlo. */}
            <textarea
              key={detailApp.id}
              defaultValue={detailApp.notes || ''}
              onBlur={(e) => guardarNotasSolo(e.target.value)}
              placeholder="Apunta lo que salga de una llamada o entrevista…"
              style={{
                width: '100%',
                minHeight: 84,
                padding: '9px 11px',
                border: '.5px solid #e0dfd8',
                borderRadius: 9,
                fontSize: 12.5,
                lineHeight: 1.6,
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
                background: '#fafaf7',
              }}
            ></textarea>
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
              {estadoNotas || 'Se guardan solas. Solo las ve tu equipo.'}
            </div>
          </div>
        </div>
      )}

      {statusAction && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && closeStatusAction()}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <h2>Motivo del rechazo</h2>
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
                    {savingStatusAction ? 'Guardando...' : 'Guardar'}
                  </button>
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
