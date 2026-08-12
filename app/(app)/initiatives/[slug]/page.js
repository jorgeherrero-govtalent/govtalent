'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const ACT_TYPES = {
  REG: 'Reglamento',
  REG_DEL: 'Reglamento delegado',
  REG_IMPL: 'Reglamento de ejecución',
  DIR: 'Directiva',
  DIR_DEL: 'Directiva delegada',
  DEC: 'Decisión',
  DEC_DEL: 'Decisión delegada',
  DEC_IMPL: 'Decisión de ejecución',
  COM: 'Comunicación',
  SWD: 'Documento de trabajo',
  REC: 'Recomendación',
  RPT: 'Informe',
  OTHER: 'Otros',
};

// Etapas del procedimiento en la Comisión. Solo se traducen las
// verificadas; el resto se muestra en formato legible a partir del código,
// para no atribuir un significado que no conocemos.
const STAGES = {
  PLANNING_WORKFLOW: 'Planificación',
  ISC_WORKFLOW: 'Consulta entre servicios',
  ADOPTION_WORKFLOW: 'Adopción',
  FEEDBACK_WORKFLOW: 'Aportaciones',
  PUBLICATION_WORKFLOW: 'Publicación',
};

const actLabel = (c) => ACT_TYPES[c] || c || '—';

function stageLabel(code) {
  if (!code) return 'Etapa sin identificar';
  if (STAGES[code]) return STAGES[code];
  // ISC_WORKFLOW -> "Isc workflow": legible, y se ve que es el código crudo.
  const limpio = code.replace(/_/g, ' ').toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function CircleButton({ icon, label, onClick, href, active, disabled, title }) {
  const [hover, setHover] = useState(false);
  const on = active || (hover && !disabled);
  const style = {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: `.5px solid ${on ? '#6d5aef' : '#e0dfd8'}`,
    background: on ? '#EEEDFE' : '#fff',
    color: disabled ? '#ccc' : on ? '#6d5aef' : '#888',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s ease',
    padding: 0,
    flexShrink: 0,
  };
  const inner = <i className={`ti ti-${icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>;

  if (href && !disabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        title={title || label}
        style={{ ...style, textDecoration: 'none' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {inner}
    </button>
  );
}

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 14,
};

export default function InitiativeDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [item, setItem] = useState(undefined); // undefined = cargando, null = no existe
  const [stages, setStages] = useState([]);
  const [userId, setUserId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [radarNote, setRadarNote] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('eu_initiatives_directory')
        .select('*')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setItem(null);
        return;
      }
      setItem(data);

      const [{ data: st }, { data: auth }] = await Promise.all([
        supabase.from('eu_initiative_stages').select('*').eq('initiative_id', data.id).order('ord'),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;
      setStages(st || []);

      const uid = auth?.user?.id || null;
      setUserId(uid);
      if (uid) {
        const { data: s } = await supabase
          .from('saved_initiatives')
          .select('id')
          .eq('user_id', uid)
          .eq('initiative_id', data.id)
          .limit(1)
          .maybeSingle();
        if (!cancelled) setSaved(!!s);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Se ordenan por fecha de inicio: la fuente no garantiza que el array
  // venga cronológico.
  const recorrido = useMemo(() => {
    return [...stages].sort((a, b) => {
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return new Date(a.start_date) - new Date(b.start_date);
    });
  }, [stages]);

  async function toggleSave() {
    if (!userId) {
      toast('Inicia sesión para guardar expedientes');
      return;
    }
    if (saved) {
      setSaved(false);
      const { error } = await supabase
        .from('saved_initiatives')
        .delete()
        .eq('user_id', userId)
        .eq('initiative_id', item.id);
      if (error) setSaved(true);
      else toast('Eliminado de guardados');
    } else {
      setSaved(true);
      const { error } = await supabase.from('saved_initiatives').insert({ user_id: userId, initiative_id: item.id });
      if (error) setSaved(false);
      else toast('Expediente guardado ✓');
    }
  }

  if (item === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 720 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (item === null) {
    return (
      <div className="sec" style={{ maxWidth: 720 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-file-off"></i>
            No se ha encontrado este expediente.
          </div>
        </div>
        <Link href="/initiatives" style={{ fontSize: 12.5, color: '#6d5aef' }}>
          ← Volver a Expedientes
        </Link>
      </div>
    );
  }

  const abierta = item.is_open;
  const dias = item.dias_restantes;

  return (
    <div className="sec" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 12, fontSize: 11.5, color: '#999' }}>
        <Link href="/initiatives" style={{ color: '#999', textDecoration: 'none' }}>
          Expedientes
        </Link>
        {' › '}
        <span style={{ color: '#666' }}>{item.reference || item.id}</span>
      </div>

      <div style={{ ...CARD, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{item.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: '#6d5aef', flexShrink: 0 }}></span>
              <span style={{ fontSize: 12, color: '#555' }}>{actLabel(item.act_type)}</span>
              <span style={{ color: '#ddd' }}>·</span>
              <span style={{ fontSize: 12, color: '#555' }}>Comisión Europea</span>
            </div>
            {item.reference && (
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>{item.reference}</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <CircleButton
              icon="bell"
              label="Seguir en Radar"
              title="Seguir en Radar · próximamente"
              disabled
              onClick={() => setRadarNote(true)}
            />
            {userId && (
              <CircleButton
                icon={saved ? 'bookmark-filled' : 'bookmark'}
                label={saved ? 'Quitar de guardados' : 'Guardar expediente'}
                active={saved}
                onClick={toggleSave}
              />
            )}
          </div>
        </div>

        {(item.topics || []).length > 0 && (
          <div style={{ display: 'flex', gap: 5, marginTop: 12, flexWrap: 'wrap' }}>
            {item.topics.map((t) => (
              <span
                key={t.code}
                style={{ fontSize: 10.5, background: '#EEEDFE', color: '#3C3489', padding: '3px 9px', borderRadius: 10 }}
              >
                {t.label}
              </span>
            ))}
          </div>
        )}

        {radarNote && (
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 12, paddingTop: 11, borderTop: '.5px solid #f0f0eb' }}>
            El seguimiento en Radar estará disponible próximamente.
          </div>
        )}
      </div>

      {abierta && (
        <div
          style={{
            background: '#EEEDFE',
            border: '.5px solid #CECBF6',
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3C3489' }}>Ventana abierta</div>
            <div style={{ fontSize: 11.5, color: '#534AB7', marginTop: 3 }}>
              Puedes presentar aportaciones hasta el {fechaCorta(item.feedback_end)}
              {dias != null && ` · ${dias === 0 ? 'cierra hoy' : `quedan ${dias} días`}`}
            </div>
          </div>
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              style={{
                background: '#6d5aef',
                color: '#fff',
                borderRadius: 7,
                padding: '8px 15px',
                fontSize: 12,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Participar ↗
            </a>
          )}
        </div>
      )}

      <div style={{ ...CARD, marginBottom: 12 }}>
        <div style={LABEL}>Recorrido</div>
        {recorrido.length === 0 ? (
          <div style={{ fontSize: 12, color: '#aaa' }}>No hay etapas registradas para este expediente.</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 1.5, background: '#e0dfd8' }}></div>
            {recorrido.map((s, i) => {
              const vigente = s.is_current;
              return (
                <div key={i} style={{ position: 'relative', marginBottom: i === recorrido.length - 1 ? 0 : 16 }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: -20,
                      top: 4,
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: vigente ? '#6d5aef' : '#d5d3c9',
                      border: '2px solid #faf9f5',
                    }}
                  ></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: vigente ? 600 : 400, color: vigente ? '#1a1a1a' : '#666' }}>
                        {stageLabel(s.stage)}
                      </div>
                      {s.feedback_status && s.feedback_status !== 'CLOSED' && (
                        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                          Aportaciones · {s.feedback_status === 'OPEN' ? 'abiertas' : s.feedback_status.toLowerCase()}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {vigente && (
                        <span
                          style={{
                            fontSize: 10.5,
                            background: '#EEEDFE',
                            color: '#3C3489',
                            padding: '3px 9px',
                            borderRadius: 12,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Etapa actual
                        </span>
                      )}
                      <div style={{ fontSize: 10.5, color: '#aaa', marginTop: vigente ? 4 : 0 }}>
                        {fechaCorta(s.start_date) || '—'}
                        {s.end_date ? ` – ${fechaCorta(s.end_date)}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ ...CARD, borderStyle: 'dashed' }}>
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <i className="ti ti-users" style={{ fontSize: 16, color: '#b0aea6', flexShrink: 0, marginTop: 1 }} aria-hidden="true"></i>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#666', marginBottom: 4 }}>
              Actores de este expediente
            </div>
            <div style={{ fontSize: 11.5, color: '#999', lineHeight: 1.6 }}>
              Aún no enlazamos las iniciativas de la Comisión con su tramitación en el Parlamento Europeo. Cuando lo
              hagamos, aquí verás la comisión competente y su ponente.
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos de la Comisión Europea — portal de participación pública. Verifica los plazos en el trámite original antes
        de presentar nada.
      </div>
    </div>
  );
}
