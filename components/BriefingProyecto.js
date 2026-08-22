'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import ActorAvatar from '@/components/ActorAvatar';
import { enZonaDePrioridad, posicionLabel, relacionLabel } from '@/lib/proyectos';

/**
 * El briefing del proyecto, actor por actor.
 *
 * POR QUÉ POR ACTOR Y NO UN DOCUMENTO ÚNICO: lo que le dices a un
 * ministerio no es lo que le dices a una patronal. Un briefing de
 * asuntos públicos se prepara frente a cada interlocutor, y esa es la
 * unidad con la que se trabaja al preparar una reunión.
 *
 * ORDEN: primero los de la zona de prioridad —deciden y no sabes de qué
 * lado están—, después el resto. La lista dice sola por dónde empezar.
 *
 * Dos campos separados a propósito: SU posición y NUESTROS argumentos.
 * Con un solo campo la gente los mezcla; separados, obliga a escribir la
 * postura ajena antes que la propia, que es el orden correcto.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const ETIQUETA = { fontSize: 11, color: '#888', letterSpacing: '.3px' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export default function BriefingProyecto({ projectId, userId }) {
  const supabase = createClient();
  const [actores, setActores] = useState([]);
  const [notas, setNotas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState('');
  const [nota, setNota] = useState({});

  const cargar = useCallback(async () => {
    const [{ data: acts }, { data: ns }] = await Promise.all([
      supabase
        .from('project_actors')
        .select('id, kind, ref_id, nombre, descripcion, posicion, influencia, relacion, posicion_texto, argumentos, posicion_fuente, posicion_fecha')
        .eq('project_id', projectId)
        .order('created_at'),
      supabase
        .from('project_notes')
        .select('id, actor_id, cuerpo, created_at')
        .eq('project_id', projectId)
        .not('actor_id', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    const lista = acts || [];
    // Los decisivos con posición sin definir, primero.
    lista.sort((a, b) => {
      const pa = enZonaDePrioridad(a) ? 0 : 1;
      const pb = enZonaDePrioridad(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (b.influencia ?? 50) - (a.influencia ?? 50);
    });

    const porActor = {};
    for (const n of ns || []) (porActor[n.actor_id] ||= []).push(n);

    setActores(lista);
    setNotas(porActor);
    setCargando(false);
  }, [supabase, projectId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(id, campo, valor) {
    const actual = actores.find((a) => a.id === id);
    const v = valor.trim() || null;
    if (!actual || v === (actual[campo] || null)) return;

    setActores((prev) => prev.map((a) => (a.id === id ? { ...a, [campo]: v } : a)));
    setEstado('Guardando…');
    const { error } = await supabase.from('project_actors').update({ [campo]: v }).eq('id', id);
    setEstado(error ? 'Error al guardar' : 'Guardado');
    if (error) toast('No se ha podido guardar');
    setTimeout(() => setEstado(''), 1600);
  }

  async function anadirNota(actorId) {
    const cuerpo = (nota[actorId] || '').trim();
    if (!cuerpo) return;
    const { data, error } = await supabase
      .from('project_notes')
      .insert({ project_id: projectId, actor_id: actorId, author_id: userId, cuerpo })
      .select('id, actor_id, cuerpo, created_at')
      .single();
    if (error) {
      toast('No se ha podido guardar la nota');
      return;
    }
    setNotas((prev) => ({ ...prev, [actorId]: [data, ...(prev[actorId] || [])] }));
    setNota((prev) => ({ ...prev, [actorId]: '' }));
  }

  if (cargando) return <div className="spinner"></div>;

  if (actores.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.65, maxWidth: 470 }}>
        El briefing se construye sobre los actores del mapa. Añade a quien decide y a quien influye, y
        aquí podrás anotar su posición y los argumentos que vas a usar con cada uno.
      </div>
    );
  }

  const campo = {
    width: '100%',
    padding: '9px 11px',
    border: `.5px solid ${BORDE}`,
    borderRadius: 9,
    fontSize: 12.5,
    lineHeight: 1.65,
    outline: 'none',
    fontFamily: 'inherit',
    background: '#fafaf7',
    resize: 'vertical',
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ minHeight: 16, marginBottom: 10, fontSize: 11, color: '#a8a49c' }}>{estado}</div>

      {actores.map((a) => {
        const prioritario = enZonaDePrioridad(a);
        const misNotas = notas[a.id] || [];
        return (
          <div
            key={a.id}
            style={{
              background: '#fff',
              border: `.5px solid ${prioritario ? '#d8d3f5' : BORDE}`,
              borderRadius: 10,
              padding: '16px 18px',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
              <ActorAvatar actor={a} size={34} fondo={prioritario ? '#eeedfe' : '#f0f0eb'} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.nombre}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                  {a.descripcion ? `${a.descripcion} · ` : ''}
                  {posicionLabel(a.posicion)} · {relacionLabel(a.relacion).toLowerCase()}
                </div>
              </div>
              {prioritario && (
                <span
                  style={{
                    fontSize: 10.5,
                    background: '#eeedfe',
                    color: '#3c3489',
                    padding: '3px 9px',
                    borderRadius: 12,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  Prioridad
                </span>
              )}
            </div>

            <div style={{ ...ETIQUETA, marginBottom: 6 }}>SU POSICIÓN</div>
            <textarea
              defaultValue={a.posicion_texto || ''}
              rows={2}
              placeholder="Qué defiende, con qué condiciones, qué ha dicho en público"
              onBlur={(e) => guardar(a.id, 'posicion_texto', e.target.value)}
              style={{ ...campo, marginBottom: 8 }}
            />

            {/* La fuente convierte el briefing en referencia y no en
                impresión: quien lo lea sabe de dónde sale. */}
            <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                defaultValue={a.posicion_fuente || ''}
                placeholder="De dónde sale (comparecencia, alegación, prensa…)"
                onBlur={(e) => guardar(a.id, 'posicion_fuente', e.target.value)}
                style={{ ...campo, flex: 1, minWidth: 180, padding: '7px 11px', fontSize: 12 }}
              />
              <input
                type="date"
                defaultValue={a.posicion_fecha || ''}
                onBlur={(e) => guardar(a.id, 'posicion_fecha', e.target.value)}
                style={{ ...campo, width: 'auto', padding: '7px 10px', fontSize: 12 }}
              />
            </div>

            <div style={{ ...ETIQUETA, marginBottom: 6 }}>NUESTROS ARGUMENTOS</div>
            <textarea
              defaultValue={a.argumentos || ''}
              rows={2}
              placeholder="Qué le vas a decir a este interlocutor en concreto"
              onBlur={(e) => guardar(a.id, 'argumentos', e.target.value)}
              style={{ ...campo, marginBottom: 14 }}
            />

            <div style={{ borderTop: `.5px solid ${BORDE}`, paddingTop: 12 }}>
              <div style={{ ...ETIQUETA, marginBottom: 9 }}>NOTAS SOBRE ESTE ACTOR</div>

              {misNotas.slice(0, 3).map((n) => (
                <div key={n.id} style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#f0f0eb',
                      color: '#a8a49c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <i className="ti ti-note" style={{ fontSize: 11 }}></i>
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#555', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                      {n.cuerpo}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>{fechaCorta(n.created_at)}</div>
                  </div>
                </div>
              ))}

              {misNotas.length > 3 && (
                <div style={{ fontSize: 11, color: '#888', marginBottom: 9 }}>
                  y {misNotas.length - 3} notas más
                </div>
              )}

              <input
                value={nota[a.id] || ''}
                onChange={(e) => setNota((prev) => ({ ...prev, [a.id]: e.target.value }))}
                onBlur={() => anadirNota(a.id)}
                onKeyDown={(e) => e.key === 'Enter' && anadirNota(a.id)}
                placeholder="Añade una nota sobre este actor"
                style={{ ...campo, padding: '8px 11px', fontSize: 12 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
