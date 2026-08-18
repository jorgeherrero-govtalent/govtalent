'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import RadiografiaModal from '@/components/RadiografiaModal';

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

  const [resumen, setResumen] = useState(null);
  const [plazos, setPlazos] = useState([]);
  const [novedades, setNovedades] = useState([]);
  const [cifras, setCifras] = useState({ leyes: null, procedimientos: null, expedientes: null });
  const [nombre, setNombre] = useState('');
  const [showRadiografia, setShowRadiografia] = useState(false);

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
      const [{ data: es }, { data: eu }, { data: nov }, l, p, x] = await Promise.all([
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
      setCifras({ leyes: l.count ?? null, procedimientos: p.count ?? null, expedientes: x.count ?? null });
    })();
  }, []);

  const vacantes = resumen?.vacantes_recomendadas || [];
  const perfil = resumen?.perfil || {};

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '26px 20px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>
          Hola{nombre ? `, ${nombre}` : ''}
        </h1>
        <p style={{ fontSize: 12.5, color: '#8b8780', margin: '5px 0 0' }}>
          Tu espacio de trabajo en asuntos públicos.
        </p>
      </div>

      {/* Las novedades primero cuando las hay: es lo que hace volver.
          Si no sigue nada, este bloque no aparece y mandan los plazos. */}
      {novedades.length > 0 && (
        <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 10 }}
          >
            <div style={TITULO}>
              {novedades.length} {novedades.length === 1 ? 'novedad' : 'novedades'} en lo que sigues
            </div>
            <Link href="/seguimiento" style={ENLACE}>
              Ver todo
            </Link>
          </div>
          {novedades.map((n) => (
            <div key={n.event_id} style={{ display: 'flex', gap: 13, padding: '10px 0', alignItems: 'baseline' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6d5aef', flexShrink: 0 }}></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                  {n.title} <span style={{ color: '#8b8780' }}>{(n.detail || '').toLowerCase()}</span>
                </div>
                <div style={{ fontSize: 11, color: '#b8b4ac', marginTop: 3 }}>{haceCuanto(n.occurred_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 10 }}>
          <div style={TITULO}>Plazos abiertos</div>
          <Link href="/regulatorio" style={ENLACE}>
            Ver Regulatorio
          </Link>
        </div>
        <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 15 }}>Ordenados por lo que cierra antes.</div>

        {plazos.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#a8a49c', padding: '8px 0' }}>Cargando…</div>
        ) : (
          plazos.map((p) => (
            <Link
              key={p.id}
              href={p.ruta}
              style={{
                display: 'flex',
                gap: 14,
                padding: '12px 0',
                borderTop: '.5px solid #f2f0ec',
                alignItems: 'flex-start',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ flexShrink: 0, width: 46, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 500, color: '#6d5aef', lineHeight: 1.1 }}>{p.dias}</div>
                <div style={{ fontSize: 10, color: '#a8a49c' }}>{p.dias === 1 ? 'día' : 'días'}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, letterSpacing: '-.1px' }}>{p.title}</div>
                <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 4 }}>{p.fuente}</div>
              </div>
              <i className="ti ti-chevron-right" style={{ color: '#d6d2ca', fontSize: 15, flexShrink: 0, marginTop: 4 }}></i>
            </Link>
          ))
        )}
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
          {/* Sin esta nota, un mes sin novedades españolas parecería que
              los datos están sin actualizar. */}
          <div style={{ fontSize: 10.5, color: '#b8b4ac', paddingTop: 11, lineHeight: 1.5 }}>
            El Congreso reanuda su actividad ordinaria en septiembre.
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

          {/* Carrera va aquí y no en su propio bloque: son accesos, no
              una sección que merezca competir con lo demás. */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              paddingTop: 14,
              marginTop: 11,
              borderTop: '.5px solid #f2f0ec',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setShowRadiografia(true)}
              style={{ fontSize: 12, color: '#1d6f5c', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Radiografía profesional
            </button>
            <Link href="/profile" style={{ fontSize: 12, color: '#8b8780', textDecoration: 'none' }}>
              Mi perfil
              {!perfil.completo && <span style={{ color: '#c2410c' }}> · incompleto</span>}
            </Link>
            <Link href="/jobs?saved=1" style={{ fontSize: 12, color: '#8b8780', textDecoration: 'none' }}>
              Ofertas guardadas
            </Link>
          </div>
        </div>
      )}

      {showRadiografia && <RadiografiaModal onClose={() => setShowRadiografia(false)} />}
    </div>
  );
}
