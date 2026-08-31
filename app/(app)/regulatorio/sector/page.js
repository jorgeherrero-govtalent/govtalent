'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import FollowButton from '@/components/FollowButton';
import { cifraPlazo } from '@/lib/plazos';

/**
 * Análisis por sector.
 *
 * Responde a "qué me afecta" para quien llega y no sigue nada todavía.
 * Describe su organización y la IA revisa qué asuntos abiertos le
 * importan, con el motivo de cada uno.
 *
 * El motivo es lo que da valor: sin él, es una lista de coincidencias de
 * texto que cualquiera podría sacar con un buscador.
 */

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };

const BOTON_ALERTA = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  background: '#6d5aef',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export default function SectorPage() {
  const supabase = createClient();

  const [perfil, setPerfil] = useState(undefined);
  const [descripcion, setDescripcion] = useState('');
  const [matches, setMatches] = useState([]);
  const [analizando, setAnalizando] = useState(false);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        if (!cancelled) setPerfil(null);
        return;
      }
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('sector_profiles').select('*').eq('user_id', auth.user.id).limit(1).maybeSingle(),
        supabase
          .from('sector_matches')
          .select('*')
          .eq('user_id', auth.user.id)
          .order('relevancia', { ascending: false })
          .order('plazo', { ascending: true, nullsFirst: false }),
      ]);
      if (cancelled) return;
      setPerfil(p || null);
      setDescripcion(p?.descripcion || '');
      setMatches(m || []);
      setEditando(!p);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function analizar() {
    if (descripcion.trim().length < 20) {
      toast.info('Describe tu organización con algo más de detalle.');
      return;
    }
    setAnalizando(true);
    try {
      const res = await fetch('/api/sector/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'No se ha podido completar el análisis');
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('sector_profiles').select('*').eq('user_id', auth.user.id).limit(1).maybeSingle(),
        supabase
          .from('sector_matches')
          .select('*')
          .eq('user_id', auth.user.id)
          .order('relevancia', { ascending: false })
          .order('plazo', { ascending: true, nullsFirst: false }),
      ]);
      setPerfil(p || null);
      setMatches(m || []);
      setEditando(false);
      toast(
        data.encontrados === 0
          ? 'No se ha encontrado nada abierto con esos criterios.'
          : `${data.encontrados} asuntos te afectan, de ${data.candidatos} revisados.`
      );
    } catch (e) {
      toast.error('No se ha podido completar el análisis');
    } finally {
      setAnalizando(false);
    }
  }

  async function crearAlerta() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !perfil) return;
    const { error } = await supabase.from('sector_alerts').insert({
      user_id: auth.user.id,
      nombre: (perfil.sectores || [])[0] || 'Mi sector',
      keywords: perfil.keywords || [],
      sectores: perfil.sectores || [],
      fuentes: ['congreso', 'boe', 'comision', 'parlamento'],
      frecuencia: 'semanal',
    });
    if (error) toast.error('No se ha podido crear la alerta');
    else toast('Te avisaremos cada semana de lo nuevo en tu sector.');
  }

  const conPlazo = useMemo(() => matches.filter((m) => m.plazo && diasHasta(m.plazo) >= 0), [matches]);
  const nuevos = useMemo(() => matches.filter((m) => !m.visto).length, [matches]);

  if (perfil === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 820 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 820 }}>
      <div style={{ fontSize: 11.5, color: '#a8a49c', marginBottom: 12 }}>
        <Link href="/regulatorio" style={{ color: '#a8a49c', textDecoration: 'none' }}>
          Regulatorio
        </Link>
        {' › '}
        <span style={{ color: '#8b8780' }}>Qué te afecta</span>
      </div>

      {(editando || !perfil) && (
        <div style={{ ...CARD, padding: 22, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <span
              style={{
                width: 32,
                height: 32,
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: '-.15px' }}>¿Qué te afecta?</div>
              <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.55, marginTop: 4 }}>
                Describe a qué se dedica tu organización y revisamos qué se está moviendo que pueda importarte.
              </div>
            </div>
          </div>

          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Somos una asociación de empresas de energías renovables. Nos interesan el autoconsumo, las subastas de renovables y la fiscalidad energética."
            rows={4}
            aria-label="Describe tu organización"
            style={{
              width: '100%',
              background: '#faf9f7',
              border: 'none',
              borderRadius: 9,
              padding: '14px 16px',
              fontSize: 13,
              lineHeight: 1.6,
              color: '#3f3d39',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit',
              marginBottom: 14,
            }}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={analizar}
              disabled={analizando}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: analizando ? '#b8b4ac' : '#6d5aef',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 500,
                cursor: analizando ? 'default' : 'pointer',
              }}
            >
              <i className={`ti ti-${analizando ? 'loader-2' : 'sparkles'}`} style={{ fontSize: 15 }}></i>
              {analizando ? 'Analizando…' : 'Analizar'}
            </button>
            <span style={{ fontSize: 11.5, color: '#a8a49c' }}>
              {analizando ? 'Puede tardar medio minuto' : 'Tarda unos segundos'}
            </span>
            {perfil && !analizando && (
              <button
                type="button"
                onClick={() => {
                  setDescripcion(perfil.descripcion);
                  setEditando(false);
                }}
                style={{ fontSize: 12.5, color: '#8b8780', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {perfil && !editando && (
        <>
          <div style={{ ...CARD, padding: 22, marginBottom: 14 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
                marginBottom: 6,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-.2px' }}>
                {matches.length === 0
                  ? 'No se ha encontrado nada'
                  : `${matches.length} ${matches.length === 1 ? 'asunto te afecta' : 'asuntos te afectan'}`}
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  style={{ fontSize: 12, color: '#8b8780', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Cambiar descripción
                </button>
                {/* Arriba y no al final: con veinte resultados nadie
                    llega al fondo de la lista. */}
                <button type="button" onClick={crearAlerta} style={BOTON_ALERTA}>
                  <i className="ti ti-bell" style={{ fontSize: 14 }}></i> Crear alerta
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.55 }}>
              {conPlazo.length > 0
                ? `${conPlazo.length} con plazo abierto. El más urgente cierra en ${Math.min(
                    ...conPlazo.map((m) => diasHasta(m.plazo))
                  )} días.`
                : 'Ninguno tiene plazo abierto ahora mismo.'}
              {nuevos > 0 && ` ${nuevos} ${nuevos === 1 ? 'es nuevo' : 'son nuevos'} desde tu último análisis.`}
            </div>

            {(perfil.keywords || []).length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 15 }}>
                {perfil.keywords.map((k) => (
                  <span
                    key={k}
                    style={{ fontSize: 11, color: '#57534e', background: '#f5f4f1', padding: '4px 10px', borderRadius: 13 }}
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>

          {matches.length > 0 && (
            <div style={{ ...CARD, padding: 22, marginBottom: 14 }}>
              {matches.map((m, i) => {
                const dias = diasHasta(m.plazo);
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      gap: 15,
                      padding: '14px 0',
                      borderTop: i === 0 ? 'none' : '1px solid #f2f0ec',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>
                      {dias !== null && dias >= 0 ? (
                        <>
                          {(() => {
                    const pl = cifraPlazo(dias);
                    return (
                      <>
                        <div style={{ fontSize: pl.tam, fontWeight: 500, color: '#1d6f5c', lineHeight: 1.15 }}>
                          {pl.cifra}
                        </div>
                        {pl.unidad && (
                          <div style={{ fontSize: 10.5, color: '#b8b4ac' }}>{pl.unidad}</div>
                        )}
                      </>
                    );
                  })()}
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: '#b8b4ac', paddingTop: 5 }}>{fechaCorta(m.created_at)}</div>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
                        <span
                          style={{ fontSize: 10, color: '#3C3489', background: '#f0eefe', padding: '3px 8px', borderRadius: 11 }}
                        >
                          {m.fuente}
                        </span>
                        {!m.visto && (
                          <span style={{ fontSize: 10, color: '#1d6f5c', background: '#e8f4f0', padding: '3px 8px', borderRadius: 11 }}>
                            Nuevo
                          </span>
                        )}
                      </div>
                      <Link
                        href={m.ruta || '#'}
                        style={{ fontSize: 13.5, lineHeight: 1.45, letterSpacing: '-.1px', color: '#1a1a18', textDecoration: 'none' }}
                      >
                        {m.titulo}
                      </Link>
                      {m.motivo && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: '#8b8780',
                            lineHeight: 1.5,
                            marginTop: 6,
                            paddingLeft: 11,
                            borderLeft: '2px solid #e8e6e0',
                          }}
                        >
                          {m.motivo}
                        </div>
                      )}
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <FollowButton kind={m.kind} refId={m.ref_id} label={m.titulo} variant="icon" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </>
      )}

      <div style={{ marginTop: 18, fontSize: 11, color: '#a8a49c', lineHeight: 1.6 }}>
        El análisis revisa los títulos de lo que está abierto, no el texto completo de cada norma. Conviene comprobar
        cada asunto antes de actuar.
      </div>
    </div>
  );
}
