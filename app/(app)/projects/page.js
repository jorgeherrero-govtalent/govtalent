'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';
import {
  puedeCrearProyecto,
  limiteProyectos,
  proyectosVacioMensaje,
  tieneProyectos,
  upsellProyectos,
} from '@/lib/proyectos';

/**
 * Tus proyectos.
 *
 * Un proyecto es donde el seguimiento se convierte en trabajo: los
 * asuntos que vigilas, los actores a los que hay que llegar y lo que
 * has hecho ya con cada uno.
 *
 * Free ve la pantalla —con proyectos de muestra, no vacía— y el modal
 * de Pro encima. Enseñar una lista vacía y bloqueada no vende nada:
 * hay que ver de qué te estás perdiendo.
 */

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function haceCuanto(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 60) return 'hace un momento';
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

// Lo que ve quien no tiene Pro. Son ejemplos reconocibles del oficio,
// no "Proyecto 1": la pantalla tiene que explicar el producto sola.
const MUESTRA = [
  {
    id: 'demo-1',
    name: 'Reglamento de IA — implementación en España',
    objetivo: 'Que la supervisión no imponga auditoría previa a riesgo limitado.',
    n_asuntos: 4,
    n_actores: 14,
    sin_contactar: 6,
  },
  {
    id: 'demo-2',
    name: 'Paquete de movilidad sostenible',
    objetivo: 'Seguir la trasposición y llegar a las comunidades antes del reglamento.',
    n_asuntos: 7,
    n_actores: 9,
    sin_contactar: 2,
  },
];

export default function ProjectsPage() {
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  const [user, setUser] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [modalUpsell, setModalUpsell] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esPro = tieneProyectos(user);

  const cargar = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setCargando(false);
      return;
    }

    const { data: perfil } = await supabase
      .from('users')
      .select('id, plan')
      .eq('id', auth.user.id)
      .single();
    setUser(perfil);

    // Sin Pro no se consulta la tabla: RLS devolvería vacío igualmente y
    // sería una llamada para nada.
    if (perfil?.plan !== 'pro') {
      setCargando(false);
      setModalUpsell(true);
      return;
    }

    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, objetivo, archived, updated_at')
      .eq('user_id', auth.user.id)
      .eq('archived', false)
      .order('updated_at', { ascending: false });

    if (error) {
      toast('No se han podido cargar tus proyectos');
      setCargando(false);
      return;
    }

    const ids = (data || []).map((p) => p.id);
    let conteos = {};

    // Los contadores en dos consultas agregadas y no una por proyecto:
    // con veinte proyectos serían cuarenta llamadas.
    if (ids.length) {
      const [{ data: items }, { data: actores }] = await Promise.all([
        supabase.from('project_items').select('project_id').in('project_id', ids),
        supabase.from('project_actors').select('project_id, relacion').in('project_id', ids),
      ]);

      for (const id of ids) conteos[id] = { asuntos: 0, actores: 0, sinContactar: 0 };
      for (const it of items || []) conteos[it.project_id].asuntos += 1;
      for (const a of actores || []) {
        conteos[a.project_id].actores += 1;
        if (a.relacion === 'sin_contactar') conteos[a.project_id].sinContactar += 1;
      }
    }

    setProyectos(
      (data || []).map((p) => ({
        ...p,
        n_asuntos: conteos[p.id]?.asuntos || 0,
        n_actores: conteos[p.id]?.actores || 0,
        sin_contactar: conteos[p.id]?.sinContactar || 0,
      }))
    );
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crear() {
    const titulo = nombre.trim();
    if (!titulo || guardando) return;

    if (!puedeCrearProyecto(user, proyectos.length)) {
      toast(`Has llegado al máximo de ${limiteProyectos()} proyectos`);
      return;
    }

    setGuardando(true);
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name: titulo })
      .select('id')
      .single();
    setGuardando(false);

    if (error) {
      toast('No se ha podido crear el proyecto');
      return;
    }
    window.location.href = `/projects/${data.id}`;
  }

  if (cargando) {
    return (
      <div className="sec" style={{ maxWidth: 780 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const lista = esPro ? proyectos : MUESTRA;
  const vacio = esPro && proyectos.length === 0;

  return (
    <div className="sec" style={{ maxWidth: 780 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 22,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>Proyectos</h1>
          <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
            {esPro
              ? `${proyectos.length} ${proyectos.length === 1 ? 'proyecto activo' : 'proyectos activos'}`
              : 'Organiza tus asuntos públicos en un solo sitio'}
          </div>
        </div>

        {esPro && !vacio && !creando && (
          <button className="btn-p" onClick={() => setCreando(true)}>
            <i className="ti ti-plus"></i> Nuevo proyecto
          </button>
        )}
        {!esPro && (
          <button className="btn-p" onClick={() => setModalUpsell(true)}>
            <i className="ti ti-bolt"></i> Desbloquear con Pro
          </button>
        )}
      </div>

      {creando && (
        <div style={{ ...CARD, padding: 16, marginBottom: 16 }}>
          <label className="slbl" htmlFor="nuevo-proyecto">
            ¿Sobre qué asunto?
          </label>
          <input
            id="nuevo-proyecto"
            className="field"
            autoFocus
            value={nombre}
            maxLength={140}
            placeholder="Reglamento de IA — implementación en España"
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') crear();
              if (e.key === 'Escape') setCreando(false);
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-p" onClick={crear} disabled={!nombre.trim() || guardando}>
              {guardando ? 'Creando…' : 'Crear proyecto'}
            </button>
            <button
              className="btn-o"
              onClick={() => {
                setCreando(false);
                setNombre('');
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {vacio && !creando && (
        <div className="empty-state" style={{ ...CARD, padding: '38px 26px', textAlign: 'center' }}>
          <i className="ti ti-folder" style={{ fontSize: 30, color: '#c9c6bd' }}></i>
          <div style={{ fontSize: 15, fontWeight: 500, marginTop: 12 }}>Todavía no tienes proyectos</div>
          <p style={{ fontSize: 13, color: '#666', margin: '8px auto 20px', maxWidth: 400, lineHeight: 1.65 }}>
            {proyectosVacioMensaje()}
          </p>
          <button className="btn-p" onClick={() => setCreando(true)}>
            <i className="ti ti-plus"></i> Crear el primero
          </button>
        </div>
      )}

      {/* Para Free esto son ejemplos, así que no navegan a ningún sitio:
          un enlace que lleva a una página bloqueada es peor que no tener
          enlace. */}
      <div style={{ display: 'grid', gap: 10, opacity: esPro ? 1 : 0.75 }}>
        {lista.map((p) => {
          const contenido = (
            <>
              <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{p.name}</div>
              {(p.objetivo || p.description) && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: '#666',
                    marginTop: 4,
                    lineHeight: 1.55,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {p.objetivo || p.description}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  flexWrap: 'wrap',
                  marginTop: 12,
                  fontSize: 12,
                  color: '#888',
                }}
              >
                <span>
                  {p.n_asuntos} {p.n_asuntos === 1 ? 'asunto' : 'asuntos'}
                </span>
                <span>
                  {p.n_actores} {p.n_actores === 1 ? 'actor' : 'actores'}
                </span>
                {p.sin_contactar > 0 && (
                  <span style={{ color: '#a8792a' }}>{p.sin_contactar} sin contactar</span>
                )}
                {p.updated_at && <span style={{ marginLeft: 'auto' }}>{haceCuanto(p.updated_at)}</span>}
              </div>
            </>
          );

          return esPro ? (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="job-card-hover"
              style={{ ...CARD, padding: 16, textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              {contenido}
            </Link>
          ) : (
            <div key={p.id} style={{ ...CARD, padding: 16 }} aria-hidden="true">
              {contenido}
            </div>
          );
        })}
      </div>

      {!esPro && (
        <p style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 16 }}>
          Ejemplos de cómo se ve un proyecto en Pro.
        </p>
      )}

      {modalUpsell && <UpgradeModal {...upsellProyectos()} onClose={() => setModalUpsell(false)} />}
    </div>
  );
}
