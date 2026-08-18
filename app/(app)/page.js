'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Home.
 *
 * Antes era una pantalla de empleabilidad: completar perfil, ofertas,
 * radiografía. Ahora responde a "qué es relevante para mí hoy" desde el
 * trabajo de asuntos públicos, con el empleo presente pero secundario.
 *
 * Los plazos mandan porque son lo único accionable: 178 ventanas
 * abiertas entre España y Europa, ordenadas por lo que cierra antes. El
 * resto —novedades, sector, empleo— acompaña.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function haceCuanto(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias < 1) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const TITULO = { fontSize: 14, fontWeight: 500, letterSpacing: '-.15px' };
const ENLACE = { fontSize: 12, color: '#8b8780', textDecoration: 'none' };

export default function Home() {
  const supabase = createClient();
  const router = useRouter();

  const [resumen, setResumen] = useState(null);
  const [plazos, setPlazos] = useState([]);
  const [novedades, setNovedades] = useState([]);
  const [cifras, setCifras] = useState({ leyes: null, procedimientos: null, expedientes: null, boe: null });
  const [nombre, setNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [tab, setTab] = useState('sector');
  const [sector, setSector] = useState([]);
  const [seguidos, setSeguidos] = useState([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    // El resumen de siempre: perfil, vacantes y organizaciones.
    fetch('/api/radar/summary')
      .then((r) => r.json())
      .then((d) => {
        setResumen(d);
        setNombre(d?.perfil?.nombre || '');
      })
      .catch(() => setResumen({}));

    (async () => {
      const [{ data: es }, { data: eu }, { data: nov }, l, p, x, b, { data: sec }, { data: sig }] = await Promise.all([
        // Los plazos españoles: leyes con enmiendas abiertas
        supabase
          .from('es_initiatives_directory')
          .select('num_expediente, slug, title, comision, plazo_enmiendas, dias_plazo')
          .not('dias_plazo', 'is', null)
          .eq('is_blocked', false)
          .order('dias_plazo', { ascending: true })
          .limit(6),
        // Y los europeos: consultas de la Comisión
        supabase
          .from('eu_initiatives_directory')
          .select('id, slug, title, act_type, feedback_end, dias_restantes')
          .eq('is_open', true)
          .not('dias_restantes', 'is', null)
          .order('dias_restantes', { ascending: true })
          .limit(6),
        // Las novedades de lo que sigue. Si no sigue nada, viene vacío.
        supabase
          .from('my_follow_events')
          .select('event_id, kind, title, detail, occurred_at, es_nueva')
          .eq('es_nueva', true)
          .order('occurred_at', { ascending: false })
          .limit(4),
        supabase.from('es_initiatives').select('num_expediente', { count: 'exact', head: true }).eq('is_closed', false),
        supabase.from('ep_procedures').select('process_id', { count: 'exact', head: true }).eq('is_closed', false),
        supabase.from('eu_initiatives_directory').select('id', { count: 'exact', head: true }).eq('is_open', true),
        // El BOE de esta semana: es lo único que se mueve a diario.
        supabase
          .from('boe_documents')
          .select('id', { count: 'exact', head: true })
          .gte('fecha_publicacion', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
        supabase
          .from('sector_matches')
          .select('*')
          .order('relevancia', { ascending: false })
          .order('plazo', { ascending: true, nullsFirst: false })
          .limit(20),
        supabase.from('my_follows').select('*').order('ultima_novedad', { ascending: false, nullsFirst: false }).limit(8),
      ]);

      // Se mezclan los dos orígenes y se ordenan por lo que cierra antes:
      // al usuario le da igual de qué institución venga.
      const todos = [
        ...(es || []).map((r) => ({
          id: `es-${r.num_expediente}`,
          dias: r.dias_plazo,
          title: r.title,
          fuente: ['Congreso', r.comision].filter(Boolean).join(' · '),
          ruta: `/congreso/${r.slug}`,
        })),
        ...(eu || []).map((r) => ({
          id: `eu-${r.id}`,
          dias: r.dias_restantes,
          title: r.title,
          fuente: ['Comisión Europea', r.act_type].filter(Boolean).join(' · '),
          ruta: `/initiatives/${r.slug}`,
        })),
      ].sort((a, b) => a.dias - b.dias);

      setPlazos(todos.slice(0, 5));
      setNovedades(nov || []);
      setCifras({
        leyes: l.count ?? null,
        procedimientos: p.count ?? null,
        expedientes: x.count ?? null,
        boe: b.count ?? null,
      });
      setSector(sec || []);
      setSeguidos(sig || []);
      // La pestaña que se abre depende de lo que tenga cada uno: sin
      // análisis, los plazos generales son lo único que puede ver.
      if ((sec || []).length === 0) setTab((nov || []).length > 0 ? 'seguimiento' : 'plazos');
      setCargado(true);
    })();
  }, []);

  // El titular dice lo más urgente que tenga cada uno, en una línea.
  const titular = useMemo(() => {
    if (!cargado) return 'Tu espacio de trabajo en asuntos públicos.';
    const conPlazo = sector.filter((m) => m.plazo && diasHasta(m.plazo) >= 0);
    if (conPlazo.length > 0) {
      const min = Math.min(...conPlazo.map((m) => diasHasta(m.plazo)));
      return `${conPlazo.length} ${
        conPlazo.length === 1 ? 'asunto de tu sector tiene' : 'asuntos de tu sector tienen'
      } plazo abierto. El más urgente cierra en ${min} ${min === 1 ? 'día' : 'días'}.`;
    }
    if (novedades.length > 0) {
      return `${novedades.length} ${
        novedades.length === 1 ? 'novedad' : 'novedades'
      } en lo que sigues desde tu última visita.`;
    }
    if (plazos.length > 0) {
      return `${plazos[0].dias} ${plazos[0].dias === 1 ? 'día' : 'días'} para el plazo más próximo.`;
    }
    return 'Tu espacio de trabajo en asuntos públicos.';
  }, [cargado, sector, novedades, plazos]);

  const vacantes = resumen?.vacantes_recomendadas || [];
  const perfil = resumen?.perfil || {};

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '26px 20px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>
          Hola{nombre ? `, ${nombre}` : ''}
        </h1>
        <p style={{ fontSize: 12.5, color: '#8b8780', margin: '5px 0 0', lineHeight: 1.55 }}>{titular}</p>
      </div>

      {/* Busca en las cinco fuentes a la vez, no solo en el Congreso. */}
      <div
        onKeyDown={(e) => {
          if (e.key === 'Enter' && busqueda.trim().length >= 3) {
            router.push(`/regulatorio/buscar?q=${encodeURIComponent(busqueda.trim())}`);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderRadius: 24,
          padding: '11px 18px',
          marginBottom: 16,
        }}
      >
        <i className="ti ti-search" style={{ color: '#a8a49c', fontSize: 15 }}></i>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar normativa, diputado, institución, oportunidad…"
          aria-label="Buscar"
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%' }}
        />
      </div>

      {/* Sin análisis de sector, la Home lo pide como acción principal:
          esa pestaña saldría vacía y la primera impresión sería peor. */}
      {cargado && sector.length === 0 && (
        <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: '#f0eefe',
                color: '#6d5aef',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-sparkles" style={{ fontSize: 16 }}></i>
            </span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.1px' }}>¿Qué te afecta a ti?</div>
              <div style={{ fontSize: 12, color: '#8b8780', marginTop: 3, lineHeight: 1.5 }}>
                Dinos a qué se dedica tu organización y revisamos cuál de los asuntos abiertos te importa.
              </div>
            </div>
            <Link
              href="/regulatorio/sector"
              style={{
                background: '#6d5aef',
                color: '#fff',
                borderRadius: 8,
                padding: '9px 16px',
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Analizar mi sector
            </Link>
          </div>
        </div>
      )}

      {/* Un solo bloque con pestañas en vez de tres compitiendo: así hay
          un único sitio donde mirar y el usuario elige. */}
      <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 2, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { id: 'sector', label: 'De tu sector', n: sector.length },
            { id: 'plazos', label: 'Todos los plazos', n: null },
            { id: 'seguimiento', label: 'Lo que sigues', n: seguidos.length },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '6px 12px',
                borderRadius: 7,
                fontSize: 12.5,
                cursor: 'pointer',
                border: 'none',
                background: tab === t.id ? '#f0eefe' : 'transparent',
                color: tab === t.id ? '#6d5aef' : '#8b8780',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
              {t.n > 0 ? ` (${t.n})` : ''}
            </button>
          ))}
        </div>

        {tab === 'sector' &&
          (sector.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#8b8780', padding: '10px 0', lineHeight: 1.6 }}>
              Todavía no has analizado tu sector.{' '}
              <Link href="/regulatorio/sector" style={{ color: '#6d5aef', textDecoration: 'none' }}>
                Hazlo ahora
              </Link>{' '}
              y verás aquí lo que te afecta.
            </div>
          ) : (
            <>
              {sector.slice(0, 5).map((m) => {
                const dias = diasHasta(m.plazo);
                return (
                  <Link
                    key={m.id}
                    href={m.ruta || '#'}
                    style={{
                      display: 'flex',
                      gap: 15,
                      padding: '12px 0',
                      borderTop: '.5px solid #f2f0ec',
                      alignItems: 'flex-start',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>
                      {dias !== null && dias >= 0 ? (
                        <>
                          <div style={{ fontSize: 19, fontWeight: 600, color: '#1d6f5c', lineHeight: 1 }}>{dias}</div>
                          <div style={{ fontSize: 10, color: '#b8b4ac' }}>{dias === 1 ? 'día' : 'días'}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: '#b8b4ac', paddingTop: 4 }}>{m.fuente?.slice(0, 8)}</div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: '#3C3489', background: '#f0eefe', padding: '3px 8px', borderRadius: 11 }}>
                          {m.fuente}
                        </span>
                        {!m.visto && (
                          <span style={{ fontSize: 10, color: '#1d6f5c', background: '#e8f4f0', padding: '3px 8px', borderRadius: 11 }}>
                            Nuevo
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.45, letterSpacing: '-.1px' }}>{m.titulo}</div>
                      {m.motivo && (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#8b8780',
                            lineHeight: 1.5,
                            marginTop: 5,
                            paddingLeft: 10,
                            borderLeft: '2px solid #e8e6e0',
                          }}
                        >
                          {m.motivo}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
              <Link href="/regulatorio/sector" style={{ ...ENLACE, display: 'inline-block', paddingTop: 14, color: '#6d5aef' }}>
                Ver los {sector.length} →
              </Link>
            </>
          ))}

        {tab === 'plazos' && (
          <>
            {plazos.map((p) => (
              <Link
                key={p.id}
                href={p.ruta}
                style={{
                  display: 'flex',
                  gap: 15,
                  padding: '12px 0',
                  borderTop: '.5px solid #f2f0ec',
                  alignItems: 'flex-start',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: 19, fontWeight: 600, color: '#6d5aef', lineHeight: 1 }}>{p.dias}</div>
                  <div style={{ fontSize: 10, color: '#b8b4ac' }}>{p.dias === 1 ? 'día' : 'días'}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.45, letterSpacing: '-.1px' }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 4 }}>{p.fuente}</div>
                </div>
              </Link>
            ))}
            <Link href="/regulatorio" style={{ ...ENLACE, display: 'inline-block', paddingTop: 14, color: '#6d5aef' }}>
              Ver Regulatorio →
            </Link>
          </>
        )}

        {tab === 'seguimiento' &&
          (seguidos.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#8b8780', padding: '10px 0', lineHeight: 1.6 }}>
              Aún no sigues nada. Pulsa <span style={{ color: '#6d5aef' }}>Seguir</span> en cualquier ley, comisión o
              diputado y sus novedades aparecerán aquí.
            </div>
          ) : (
            <>
              {novedades.length > 0
                ? novedades.slice(0, 4).map((n) => (
                    <div
                      key={n.event_id}
                      style={{ display: 'flex', gap: 13, padding: '11px 0', borderTop: '.5px solid #f2f0ec', alignItems: 'baseline' }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6d5aef', flexShrink: 0 }}></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                          {n.title} <span style={{ color: '#8b8780' }}>{(n.detail || '').toLowerCase()}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#b8b4ac', marginTop: 3 }}>{haceCuanto(n.occurred_at)}</div>
                      </div>
                    </div>
                  ))
                : seguidos.slice(0, 5).map((s2) => (
                    <Link
                      key={s2.id}
                      href={s2.ruta || '/seguimiento'}
                      style={{
                        display: 'flex',
                        gap: 13,
                        padding: '11px 0',
                        borderTop: '.5px solid #f2f0ec',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, lineHeight: 1.45 }}>{s2.label}</div>
                        <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 3 }}>{s2.estado || 'Sin novedades'}</div>
                      </div>
                    </Link>
                  ))}
              <Link href="/seguimiento" style={{ ...ENLACE, display: 'inline-block', paddingTop: 14, color: '#6d5aef' }}>
                Ver seguimiento →
              </Link>
            </>
          ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ ...TITULO, marginBottom: 14 }}>En tramitación</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ flex: 1, fontSize: 12.5, color: '#57534e' }}>Leyes en el Congreso</div>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{cifras.leyes ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ flex: 1, fontSize: 12.5, color: '#57534e' }}>Procedimientos del PE</div>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{cifras.procedimientos ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ flex: 1, fontSize: 12.5, color: '#57534e' }}>Consultas de la Comisión</div>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{cifras.expedientes ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ flex: 1, fontSize: 12.5, color: '#57534e' }}>Publicado en el BOE</div>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{cifras.boe ?? '—'}</span>
          </div>
          {/* Sin esta nota, un mes sin novedades españolas parecería que
              los datos están sin actualizar. */}
          <div style={{ fontSize: 10.5, color: '#b8b4ac', paddingTop: 11, lineHeight: 1.5 }}>
            El BOE, esta semana. El Congreso reanuda su actividad ordinaria en septiembre.
          </div>
        </div>

        {novedades.length === 0 && (
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ ...TITULO, marginBottom: 12 }}>Tu seguimiento</div>
            <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, marginBottom: 14 }}>
              Sigue una ley o una comisión y sus novedades aparecerán aquí.
            </div>
            <Link
              href="/congreso"
              style={{
                fontSize: 12.5,
                color: '#6d5aef',
                background: '#f0eefe',
                padding: '7px 13px',
                borderRadius: 7,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Explorar Regulatorio
            </Link>
          </div>
        )}
      </div>

      {vacantes.length > 0 && (
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 10 }}>
            <div style={TITULO}>Oportunidades para ti</div>
            <Link href="/jobs" style={ENLACE}>
              Ver empleos
            </Link>
          </div>

          {vacantes.slice(0, 3).map((v) => (
            <Link
              key={v.id}
              href={`/jobs?job=${v.id}`}
              style={{
                display: 'flex',
                gap: 12,
                padding: '10px 0',
                borderTop: '.5px solid #f2f0ec',
                alignItems: 'center',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 7,
                  background: '#f5f4f1',
                  flexShrink: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {v.organization_logo ? (
                  <img src={v.organization_logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <i className="ti ti-building" style={{ fontSize: 14, color: '#a8a49c' }}></i>
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{v.title}</div>
                <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 2 }}>
                  {[v.organization_name, v.location].filter(Boolean).join(' · ')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Fuera del bloque de empleo: si no hay vacantes recomendadas ese
          bloque no se pinta y el perfil quedaría escondido. El progreso
          sustituye al aviso en rojo: completar el perfil es una mejora,
          no un error. */}
      <div style={{ ...CARD, padding: '16px 20px', marginTop: 14 }}>
        {perfil.completo ? (
          <Link href="/profile" style={{ fontSize: 12, color: '#8b8780', textDecoration: 'none' }}>
            Ver mi perfil
          </Link>
        ) : (
          <Link
            href="/profile"
            style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#57534e' }}>Tu perfil está al {perfil.completion_pct ?? 0} %</span>
                <span style={{ fontSize: 11, color: '#a8a49c' }}>· mejora tus recomendaciones</span>
              </div>
              <div style={{ height: 3, background: '#f2f0ec', borderRadius: 2, overflow: 'hidden', maxWidth: 220 }}>
                <div style={{ width: `${perfil.completion_pct ?? 0}%`, height: '100%', background: '#1d6f5c' }}></div>
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#1d6f5c', whiteSpace: 'nowrap', flexShrink: 0 }}>Completar</span>
          </Link>
        )}
      </div>
    </div>
  );
}
