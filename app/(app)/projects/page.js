'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';
import MapaActores from '@/components/MapaActores';
import ActividadProyecto from '@/components/ActividadProyecto';
import AgendaProyecto from '@/components/AgendaProyecto';
import NotasProyecto from '@/components/NotasProyecto';
import AsuntosProyecto from '@/components/AsuntosProyecto';
import Desplegable from '@/components/Desplegable';
import BriefingProyecto from '@/components/BriefingProyecto';
import DocumentosProyecto from '@/components/DocumentosProyecto';
import AnclasProyecto from '@/components/AnclasProyecto';
import CambiarProyecto from '@/components/CambiarProyecto';
import ActorAvatar from '@/components/ActorAvatar';
import ProyectoDemo, { ResumenDemo } from '@/components/ProyectoDemo';
import { limiteProyectos, puedeCrearProyecto, tieneProyectos, upsellProyectos } from '@/lib/proyectos';

/**
 * Proyectos.
 *
 * Dos pantallas en una ruta:
 *   /projects           → el índice, con buscador y tarjetas
 *   /projects?p=<id>    → el proyecto abierto, con lateral para cambiar
 *
 * Va en la misma ruta y no en /projects/[id] para que cambiar de
 * proyecto no recargue la página, manteniendo la URL compartible.
 *
 * Free ve el proyecto de ejemplo y el modal de Pro; cualquier clic en la
 * zona de contenido lo abre.
 *
 * Patrones: la tarjeta con cifras es la de Regulatorio; el modal es
 * UpgradeModal. Morado #6d5aef (btn-ai) para todo lo de Pro.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const CARD = { background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 10 };
const ETIQUETA = { fontSize: 11, color: '#888', letterSpacing: '.3px' };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function haceCuanto(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 60) return 'hace un momento';
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

// Un proyecto arranca desde un ASUNTO, no desde una persona: quien
// decide es un actor del mapa, no el objeto del trabajo. Por eso el
// arranque solo ofrece los cinco tipos regulatorios y deja fuera
// diputados, comisarios, comisiones y grupos.
const TIPOS_ARRANQUE = {
  ley: ['Congreso · proyecto de ley', 'ti-file-text'],
  actividad: ['Congreso · actividad parlamentaria', 'ti-file-text'],
  expediente: ['Comisión Europea · expediente', 'ti-file-text'],
  procedimiento: ['Parlamento Europeo · procedimiento', 'ti-gavel'],
  boe: ['BOE', 'ti-news'],
};

const DEMO_LISTA = [
  { id: 'demo-1', name: 'Ley de gobernanza de la IA', objetivo: 'Congreso · fase de enmiendas' },
  { id: 'demo-2', name: 'Movilidad sostenible', objetivo: 'Trasposición · sin plazo abierto' },
];

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="sec">
          <div className="spinner"></div>
        </div>
      }
    >
      <Proyectos />
    </Suspense>
  );
}

function Proyectos() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const abiertoId = params.get('p');

  const [cargando, setCargando] = useState(true);
  const [user, setUser] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [datos, setDatos] = useState({});
  const [modalUpsell, setModalUpsell] = useState(false);
  const [modalCompartidos, setModalCompartidos] = useState(false);
  const [tieneOrganizacion, setTieneOrganizacion] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('recientes');
  const [arrastrando, setArrastrando] = useState(null);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [menu, setMenu] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(null);
  // Los botones de la cabecera abren el buscador de la sección que toca.
  const [atajo, setAtajo] = useState(null);
  // Vuelve a true al abrir cualquier proyecto: cerrarlo es un "ahora no".
  const [teams, setTeams] = useState(true);
  // Para el estado vacío: lo último que el usuario ha seguido. Tres,
  // no más: es una sugerencia para arrancar, no un directorio.
  const [seguidos, setSeguidos] = useState([]);
  const [clientes, setClientes] = useState([]);
  // Dos condiciones para que desaparezca: que ya haya alguna actividad
  // registrada, o que se cierre a mano. Lo segundo hace falta porque
  // quien no vaya a usar el registro nunca cumpliría la primera, y el
  // aviso se quedaría para siempre.
  const [avisoRegistro, setAvisoRegistro] = useState(false);

  const esPro = tieneProyectos(user);

  const cargar = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setCargando(false);
      return;
    }

    const { data: perfil } = await supabase.from('users').select('id, plan').eq('id', auth.user.id).single();
    setUser(perfil);

    // Solo para saber qué decir en el modal de compartidos: quien no
    // tiene organización no puede contratar Teams por su cuenta.
    const { count: nOrgs } = await supabase
      .from('organization_members')
      .select('organization_id', { count: 'exact', head: true })
      .eq('user_id', auth.user.id);
    setTieneOrganizacion((nOrgs || 0) > 0);

    if (perfil?.plan !== 'pro') {
      setCargando(false);
      setModalUpsell(true);
      return;
    }

    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, objetivo, orden, updated_at, client_id')
      .eq('user_id', auth.user.id)
      .eq('archived', false)
      .order('updated_at', { ascending: false });

    if (error) {
      toast('No se han podido cargar tus proyectos');
      setCargando(false);
      return;
    }

    const ids = (data || []).map((p) => p.id);
    const acc = {};
    for (const id of ids) acc[id] = { actores: 0, asuntos: 0, sinContactar: 0, novedades: 0, caras: [], todas: [] };

    // Consultas agregadas, no una por proyecto: con veinte proyectos
    // serían ochenta llamadas.
    if (ids.length) {
      const [{ data: items }, { data: actores }, { data: eventos }] = await Promise.all([
        supabase.from('project_items').select('project_id').in('project_id', ids),
        supabase
          .from('project_actors')
          // imagen faltaba: sin ella ActorAvatar cae siempre a la
          // silueta, aunque el directorio tenga la foto guardada.
          .select('project_id, relacion, nombre, kind, ref_id, imagen, es_propio')
          .in('project_id', ids)
          .order('created_at'),
        supabase.from('project_events').select('project_id, estado').in('project_id', ids),
      ]);
      for (const it of items || []) acc[it.project_id].asuntos += 1;
      for (const a of actores || []) {
        const d = acc[a.project_id];
        d.actores += 1;
        if (a.relacion === 'sin_contactar') d.sinContactar += 1;
        d.todas.push(a);
      }
      // Los que tienen foto primero: tres siluetas iguales no dicen de
      // qué va el proyecto, que es justo para lo que están las caras.
      for (const id of ids) {
        const d = acc[id];
        d.caras = [...d.todas].sort((a, b) => (b.imagen ? 1 : 0) - (a.imagen ? 1 : 0)).slice(0, 3);
        delete d.todas;
      }
      for (const e of eventos || []) if (e.estado === 'nuevo') acc[e.project_id].novedades += 1;
    }

    setDatos(acc);
    setProyectos(data || []);

    // head: solo interesa si existe alguna, no cuáles.
    const { count: registradas } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    let cerrado = false;
    try {
      cerrado = window.localStorage.getItem('gt_aviso_registro') === 'off';
    } catch {}
    setAvisoRegistro(!cerrado && (registradas ?? 0) === 0);

    // Solo hace falta si no hay ningún proyecto: es lo que se ofrece
    // en la pantalla vacía.
    if ((data || []).length === 0) {
      const { data: fs } = await supabase
        .from('follows')
        .select('kind, ref_id, label')
        .eq('user_id', auth.user.id)
        .in('kind', Object.keys(TIPOS_ARRANQUE))
        .order('created_at', { ascending: false })
        .limit(3);
      setSeguidos(fs || []);
    }

    // Los clientes de la organización. Solo los activos: los archivados
    // siguen en los proyectos antiguos pero no se ofrecen para nuevos.
    const { data: cls } = await supabase
      .from('clients')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre');
    setClientes(cls || []);

    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    window.addEventListener('click', cerrar);
    return () => window.removeEventListener('click', cerrar);
  }, [menu]);

  const lista = esPro ? proyectos : DEMO_LISTA;
  const abierto = lista.find((p) => p.id === abiertoId) || (!esPro ? DEMO_LISTA[0] : null);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let out = proyectos;
    if (q) out = out.filter((p) => `${p.name} ${p.objetivo || ''}`.toLowerCase().includes(q));
    if (orden === 'alfabetico') out = [...out].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    // El orden manual no compite con los otros dos: es una opción más, y
    // se selecciona sola en cuanto arrastras una tarjeta.
    if (orden === 'manual') out = [...out].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return out;
  }, [proyectos, busqueda, orden]);

  // Mismo patrón que en el perfil: se sustituye el fantasma del
  // navegador —una foto semitransparente de la tarjeta entera— por una
  // etiqueta limpia con el nombre.
  function alEmpezarArrastre(e, indice, nombre) {
    setArrastrando(indice);
    const pastilla = document.createElement('div');
    pastilla.textContent = nombre;
    pastilla.style.cssText =
      'position:fixed;top:-999px;left:-999px;background:#6d5aef;color:#fff;padding:7px 16px;' +
      'border-radius:20px;font-size:13px;font-weight:500;white-space:nowrap;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.25);';
    document.body.appendChild(pastilla);
    e.dataTransfer.setDragImage(pastilla, 16, 16);
    requestAnimationFrame(() => requestAnimationFrame(() => pastilla.remove()));
  }

  // Se renumera la lista entera y se guarda de una vez: con pocos
  // proyectos es más simple que intercambiar vecinos, y deja los huecos
  // de 10 en su sitio.
  async function soltarEn(destino) {
    const desde = arrastrando;
    setArrastrando(null);
    if (desde == null || desde === destino) return;

    const nueva = [...visibles];
    const [movido] = nueva.splice(desde, 1);
    nueva.splice(destino, 0, movido);

    const conOrden = nueva.map((p, i) => ({ ...p, orden: (i + 1) * 10 }));
    setProyectos((prev) =>
      prev.map((p) => conOrden.find((x) => x.id === p.id) || p)
    );
    setOrden('manual');

    const res = await Promise.all(
      conOrden.map((p) => supabase.from('projects').update({ orden: p.orden }).eq('id', p.id))
    );
    if (res.some((r) => r.error)) {
      toast('No se ha podido guardar el orden');
      cargar();
    }
  }

  function abrir(id) {
    router.replace(`/projects?p=${id}`, { scroll: false });
    setTeams(true);
  }


  async function crear() {
    const t = nombre.trim();
    if (!t) return;
    if (!puedeCrearProyecto(user, proyectos.length)) {
      toast(`Has llegado al máximo de ${limiteProyectos()} proyectos`);
      return;
    }
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, created_by: user.id, name: t })
      .select('id, name, description, objetivo, orden, updated_at, client_id')
      .single();
    if (error) {
      toast('No se ha podido crear el proyecto');
      return;
    }
    setProyectos((prev) => [data, ...prev]);
    setDatos((prev) => ({ ...prev, [data.id]: { actores: 0, asuntos: 0, sinContactar: 0, novedades: 0, caras: [] } }));
    setNombre('');
    setCreando(false);
    abrir(data.id);
  }

  // El proyecto nace con el asunto dentro, así que trae su histórico de
  // avisos y sus plazos sin que haya que añadir nada.
  async function crearDesde(f) {
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, created_by: user.id, name: f.label || 'Proyecto sin título' })
      .select('id, name, description, objetivo, orden, updated_at, client_id')
      .single();
    if (error) {
      toast('No se ha podido crear el proyecto');
      return;
    }
    const { error: e2 } = await supabase
      .from('project_items')
      .insert({ project_id: data.id, kind: f.kind, ref_id: f.ref_id, etiqueta: f.label });
    if (e2) toast('El proyecto se ha creado, pero el asunto no se ha añadido');

    setProyectos((prev) => [data, ...prev]);
    setDatos((prev) => ({
      ...prev,
      [data.id]: { actores: 0, asuntos: e2 ? 0 : 1, sinContactar: 0, novedades: 0, caras: [] },
    }));
    abrir(data.id);
  }

  function cerrarAviso() {
    setAvisoRegistro(false);
    try {
      window.localStorage.setItem('gt_aviso_registro', 'off');
    } catch {}
  }

  async function renombrar(id, texto) {
    const t = texto.trim();
    setRenombrando(null);
    if (!t) return;
    setProyectos((prev) => prev.map((p) => (p.id === id ? { ...p, name: t } : p)));
    const { error } = await supabase.from('projects').update({ name: t }).eq('id', id);
    if (error) toast('No se ha podido renombrar');
  }

  async function archivar(id) {
    setProyectos((prev) => prev.filter((p) => p.id !== id));
    if (abiertoId === id) router.replace('/projects', { scroll: false });
    const { error } = await supabase.from('projects').update({ archived: true }).eq('id', id);
    if (error) toast('No se ha podido archivar');
  }

  async function eliminar(id) {
    setConfirmarBorrado(null);
    setProyectos((prev) => prev.filter((p) => p.id !== id));
    if (abiertoId === id) router.replace('/projects', { scroll: false });
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) toast('No se ha podido eliminar');
  }

  // Por cuenta de quién se trabaja el proyecto. La actividad lo hereda,
  // así que se elige una vez aquí y no en cada registro.
  async function guardarCliente(id) {
    const valor = id || null;
    setAbierto((prev) => (prev ? { ...prev, client_id: valor } : prev));
    setProyectos((prev) => prev.map((p) => (p.id === abierto.id ? { ...p, client_id: valor } : p)));
    const { error } = await supabase.from('projects').update({ client_id: valor }).eq('id', abierto.id);
    if (error) toast('No se ha podido guardar el cliente');
  }

  async function guardarObjetivo(texto) {
    if (!abierto || !esPro) return;
    const v = texto.trim();
    if (v === (abierto.objetivo || '')) return;
    setProyectos((prev) => prev.map((p) => (p.id === abierto.id ? { ...p, objetivo: v || null } : p)));
    const { error } = await supabase.from('projects').update({ objetivo: v || null }).eq('id', abierto.id);
    if (error) toast('No se ha podido guardar el objetivo');
  }

  if (cargando) {
    return (
      <div className="sec">
        <div className="spinner"></div>
      </div>
    );
  }

  // =====================================================================
  // ÍNDICE
  // =====================================================================
  if (esPro && !abierto) {
    const conPlazo = proyectos.length > 0;
    return (
      <div className="sec" style={{ maxWidth: 1080 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Proyectos</h1>
            <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>
              {/* El mismo texto con proyectos y sin ellos: el contador no
                  explicaba de qué va el módulo, y las tarjetas ya están
                  ahí para contarse. */}
              Organiza, planifica y da seguimiento a tus proyectos.
            </div>
          </div>
          {!creando && (
            <button className="btn-ai" onClick={() => setCreando(true)}>
              <i className="ti ti-plus"></i> Nuevo proyecto
            </button>
          )}
        </div>

        {/* A ancho completo y encima del buscador: dentro de la fila de
            filtros estrecharía el campo de búsqueda, y ahí el texto no
            cabría sin apretujarse. */}
        {avisoRegistro && proyectos.length > 0 && (
          <div
            style={{
              ...CARD,
              padding: '13px 16px',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: '#f0eefe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-file-check" style={{ fontSize: 15, color: MORADO }}></i>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Registra tu actividad institucional</div>
              <div style={{ fontSize: 11.5, color: '#888', marginTop: 2, lineHeight: 1.5 }}>
                Cada reunión, entrega o comunicación con la Administración queda registrada con su acta, en
                cumplimiento de la nueva regulación de grupos de interés.
              </div>
            </div>
            <Link
              href="/organizations/admin/registro"
              style={{ fontSize: 11.5, color: MORADO, flexShrink: 0, whiteSpace: 'nowrap', textDecoration: 'none' }}
            >
              Cómo funciona
            </Link>
            <i
              className="ti ti-x"
              onClick={cerrarAviso}
              style={{ fontSize: 15, color: '#b8b4ac', flexShrink: 0, cursor: 'pointer' }}
            ></i>
          </div>
        )}

        {proyectos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div
              style={{
                flex: 1,
                minWidth: 200,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                ...CARD,
                padding: '9px 12px',
              }}
            >
              <i className="ti ti-search" style={{ fontSize: 15, color: '#a8a49c' }}></i>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre…"
                style={{ border: 'none', outline: 'none', fontSize: 12.5, fontFamily: 'inherit', flex: 1, background: 'none' }}
              />
            </div>
            {/* Con la etiqueta del plan y sin candado: ya usas ese
                distintivo en Configuración y en la cabecera de la
                organización, y además dice qué plan lo abre. Un candado
                solo dice "cerrado". */}
            <button
              type="button"
              onClick={() => setModalCompartidos(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                border: `.5px solid ${BORDE}`,
                borderRadius: 8,
                padding: '6px 10px',
                background: '#fff',
                fontSize: 12.5,
                color: '#555',
                whiteSpace: 'nowrap',
              }}
            >
              Compartidos
              <span
                style={{
                  fontSize: 10.5,
                  background: '#f0eefe',
                  color: '#3c3489',
                  borderRadius: 20,
                  padding: '2px 8px',
                }}
              >
                Teams
              </span>
            </button>

            <select className="fsel" value={orden} onChange={(e) => setOrden(e.target.value)}>
              <option value="recientes">Recientes</option>
              <option value="alfabetico">Por nombre</option>
              <option value="manual">Mi orden</option>
            </select>
          </div>
        )}

        {creando && (
          <div style={{ ...CARD, padding: 16, marginBottom: 12 }}>
            <input
              autoFocus
              value={nombre}
              maxLength={140}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') crear();
                if (e.key === 'Escape') {
                  setNombre('');
                  setCreando(false);
                }
              }}
              placeholder="Ley de gobernanza de la inteligencia artificial"
              style={{
                width: '100%',
                padding: '10px 13px',
                border: `1px solid ${MORADO}`,
                borderRadius: 9,
                fontSize: 13.5,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
              <button className="btn-ai" onClick={crear} disabled={!nombre.trim()}>
                Crear proyecto
              </button>
              <button
                className="btn-o"
                onClick={() => {
                  setNombre('');
                  setCreando(false);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Sin empty-state a propósito: esa clase agranda los botones y
            convierte el arranque en un cartel. */}
        {proyectos.length === 0 && !creando && seguidos.length > 0 && (
          <div style={{ ...CARD, padding: '18px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Empieza por un asunto que ya sigues</div>
            <div style={{ fontSize: 12.5, color: '#888', marginTop: 4, marginBottom: 14 }}>
              El proyecto nacerá con ese asunto dentro, con su histórico y sus plazos.
            </div>

            {seguidos.map((f, i) => {
              const [donde, icono] = TIPOS_ARRANQUE[f.kind] || ['Seguimiento', 'ti-bookmark'];
              return (
                <div
                  key={`${f.kind}-${f.ref_id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '10px 0',
                    borderTop: `.5px solid ${BORDE}`,
                    borderBottom: i === seguidos.length - 1 ? `.5px solid ${BORDE}` : 'none',
                  }}
                >
                  <i className={`ti ${icono}`} style={{ fontSize: 16, color: '#a8a49c', flexShrink: 0 }}></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.label || 'Sin título'}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{donde}</div>
                  </div>
                  <button className="btn-ai-o" onClick={() => crearDesde(f)} style={{ flexShrink: 0 }}>
                    Crear proyecto
                  </button>
                </div>
              );
            })}

            <div style={{ fontSize: 12, color: '#888', marginTop: 13 }}>
              O{' '}
              <button
                onClick={() => setCreando(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: MORADO, fontSize: 12 }}
              >
                empieza uno en blanco
              </button>
              .
            </div>
          </div>
        )}

        {/* Quien no sigue nada todavía no tiene de dónde partir: se le
            explica y se le deja escribir directamente. */}
        {proyectos.length === 0 && !creando && seguidos.length === 0 && (
          <div style={{ ...CARD, padding: '22px 24px' }}>
            <div style={{ maxWidth: 430 }}>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
                Monitoriza, planifica y gestiona desde el mismo lugar
              </div>
              <div style={{ fontSize: 12.5, color: '#888', marginTop: 7, lineHeight: 1.6 }}>
                Un proyecto reúne los asuntos que sigues, los actores a los que quieres llegar y lo que vas
                haciendo con cada uno. Dale nombre al que estés trabajando.
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 15, flexWrap: 'wrap' }}>
                <input
                  value={nombre}
                  maxLength={140}
                  onChange={(e) => setNombre(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && crear()}
                  placeholder="Ley de gobernanza de la inteligencia artificial"
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: '9px 12px',
                    border: `1px solid ${MORADO}`,
                    borderRadius: 9,
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button className="btn-ai" onClick={crear} disabled={!nombre.trim()}>
                  Crear
                </button>
              </div>
            </div>
          </div>
        )}

        {visibles.length === 0 && proyectos.length > 0 && (
          <div style={{ fontSize: 12.5, color: '#999', padding: '20px 0', textAlign: 'center' }}>
            Ningún proyecto coincide con «{busqueda}».
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 10 }}>
          {visibles.map((p, i) => {
            const d = datos[p.id] || { actores: 0, asuntos: 0, sinContactar: 0, novedades: 0, caras: [] };
            return (
              <div
                key={p.id}
                draggable={renombrando !== p.id}
                onDragStart={(e) => alEmpezarArrastre(e, i, p.name)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => soltarEn(i)}
                onDragEnd={() => setArrastrando(null)}
                style={{
                  ...CARD,
                  padding: '16px 18px',
                  position: 'relative',
                  cursor: 'grab',
                  opacity: arrastrando === i ? 0.4 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {renombrando === p.id ? (
                      <input
                        autoFocus
                        draggable={false}
                        onDragStart={(e) => e.stopPropagation()}
                        defaultValue={p.name}
                        maxLength={140}
                        onBlur={(e) => renombrar(p.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renombrar(p.id, e.target.value);
                          if (e.key === 'Escape') setRenombrando(null);
                        }}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          border: `1px solid ${MORADO}`,
                          borderRadius: 7,
                          fontSize: 14.5,
                          fontWeight: 600,
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => abrir(p.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          textAlign: 'left',
                          fontSize: 14.5,
                          fontWeight: 600,
                          lineHeight: 1.35,
                          width: '100%',
                          // Safari en iOS pinta de azul los botones sin
                          // color declarado. En escritorio heredaba el
                          // negro y por eso no se veía.
                          color: '#1a1a18',
                          fontFamily: 'inherit',
                        }}
                      >
                        {p.name}
                      </button>
                    )}
                    {(p.objetivo || p.description) && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: '#888',
                          marginTop: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.objetivo || p.description}
                      </div>
                    )}
                    {/* El cliente en la tarjeta: en una consultora con
                        veinte proyectos, saber de quién es cada uno sin
                        entrar es lo primero que se mira. */}
                    {p.client_id && (
                      <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 4 }}>
                        <i className="ti ti-briefcase" style={{ fontSize: 11, verticalAlign: -1, marginRight: 4 }}></i>
                        {clientes.find((c) => c.id === p.client_id)?.nombre || 'Cliente'}
                      </div>
                    )}
                  </div>

                  <button
                    // Sin esto, pulsar el menú dentro de una tarjeta
                    // arrastrable empieza a moverla.
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(menu === p.id ? null : p.id);
                    }}
                    aria-label="Opciones del proyecto"
                    style={{ background: 'none', border: 'none', color: '#a8a49c', padding: 2, flexShrink: 0 }}
                  >
                    <i className="ti ti-dots" style={{ fontSize: 17 }}></i>
                  </button>
                </div>

                {menu === p.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: 40,
                      ...CARD,
                      boxShadow: '0 4px 14px rgba(0,0,0,.09)',
                      padding: 5,
                      width: 155,
                      zIndex: 5,
                    }}
                  >
                    {[
                      ['Renombrar', () => { setMenu(null); setRenombrando(p.id); }],
                      ['Archivar', () => { setMenu(null); archivar(p.id); }],
                    ].map(([texto, accion]) => (
                      <button
                        key={texto}
                        onClick={accion}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          fontSize: 12,
                          padding: '7px 9px',
                          borderRadius: 6,
                          border: 'none',
                          background: 'none',
                          color: '#555',
                        }}
                      >
                        {texto}
                      </button>
                    ))}
                    <button
                      onClick={() => { setMenu(null); setConfirmarBorrado(p); }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        fontSize: 12,
                        padding: '8px 9px 7px',
                        borderRadius: 6,
                        border: 'none',
                        background: 'none',
                        color: '#555',
                        borderTop: `.5px solid ${BORDE}`,
                        marginTop: 3,
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                )}

                {/* Las caras dicen de qué va el proyecto más rápido que el
                    título: se reconoce por quién hay dentro. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '14px 0 12px', minHeight: 26 }}>
                  {d.caras.map((a, i) => (
                    <span key={i} style={{ marginRight: -10, border: '1.5px solid #fff', borderRadius: 8, display: 'inline-flex' }}>
                      <ActorAvatar actor={a} size={26} />
                    </span>
                  ))}
                  {d.actores > 3 && (
                    <span style={{ fontSize: 11.5, color: '#888', paddingLeft: 16 }}>y {d.actores - 3} más</span>
                  )}
                  {d.actores === 0 && <span style={{ fontSize: 11.5, color: '#a8a49c' }}>Sin actores todavía</span>}
                </div>

                <div style={{ display: 'flex', gap: 20, paddingTop: 12, borderTop: `.5px solid ${BORDE}` }}>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>{d.actores}</div>
                    <div style={{ fontSize: 10.5, color: '#888' }}>actores</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>{d.asuntos}</div>
                    <div style={{ fontSize: 10.5, color: '#888' }}>asuntos</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 600, color: d.novedades > 0 ? '#1a1a18' : '#a8a49c', lineHeight: 1.1 }}>
                      {d.novedades}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#888' }}>novedades</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right', alignSelf: 'flex-end' }}>
                    <div style={{ fontSize: 10.5, color: '#888' }}>{haceCuanto(p.updated_at)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {confirmarBorrado && (
          <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setConfirmarBorrado(null)}>
            <div className="modal-box" style={{ maxWidth: 420 }}>
              <div className="modal-head">
                <h2>Eliminar el proyecto</h2>
                <div className="modal-x" onClick={() => setConfirmarBorrado(null)}>
                  <i className="ti ti-x"></i>
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#555', lineHeight: 1.65 }}>
                Se borran «{confirmarBorrado.name}», su mapa de actores, sus notas y su agenda. Los asuntos
                que sigues no se ven afectados. No se puede deshacer.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn-o" onClick={() => setConfirmarBorrado(null)}>
                  Cancelar
                </button>
                <button className="btn-ai" onClick={() => eliminar(confirmarBorrado.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}

        {modalUpsell && <UpgradeModal {...upsellProyectos()} onClose={() => setModalUpsell(false)} />}

        {/* Quien no tiene organización no puede contratar Teams: lo
            contrata su empresa. Decirle "hazte Teams" sería mandarle a
            una puerta que no puede abrir. */}
        {modalCompartidos && (
          <UpgradeModal
            title="Los proyectos compartidos llegan con Teams"
            message={
              tieneOrganizacion
                ? 'Todo el equipo sobre el mismo asunto: un responsable por cada actor, menciones en las notas, registro de contactos con trazabilidad y agenda compartida.'
                : 'Todo el equipo sobre el mismo asunto: un responsable por cada actor, menciones en las notas y agenda compartida. Lo contrata tu organización, así que habla con quien la gestione en GovTalent.'
            }
            onClose={() => setModalCompartidos(false)}
          />
        )}
      </div>
    );
  }

  // =====================================================================
  // PROYECTO ABIERTO
  // =====================================================================
  const d = (esPro && abierto ? datos[abierto.id] : null) || {
    actores: 0,
    asuntos: 0,
    sinContactar: 0,
    novedades: 0,
    briefings: 0,
    acciones: 0,
  };

  // Una sola página que se recorre entera. El índice salta, no oculta:
  // por eso solo se listan secciones que existen de verdad.
  const secciones = esPro
    ? [
        // Asuntos ya no es sección propia: vive junto al objetivo, en
        // el resumen, y el recorrido completo se abre en un modal.
        { id: 'resumen', label: 'Resumen', cuenta: d.asuntos },
        { id: 'mapa', label: 'Mapa de actores', cuenta: d.actores },
        { id: 'briefing', label: 'Briefing', cuenta: d.briefings },
        // Una sola entrada para las dos tarjetas: están en la misma fila,
        // así que dos anclas llevarían al mismo sitio.
        { id: 'actividad', label: 'Agenda y registro', cuenta: d.acciones },
        // Una sola entrada: las dos secciones están en la misma fila,
        // así que dos anclas llevarían al mismo sitio.
        { id: 'documentos', label: 'Documentos y notas' },
      ]
    : [
        // Los ids tienen que existir en ProyectoDemo: AnclasProyecto
        // hace getElementById y se calla si no encuentra nada, así que
        // un id equivocado no da error, simplemente deja el ítem muerto.
        // Aquí ponía 'actividad', que en la demo no existe —son dos
        // tarjetas, 'registro' y 'agenda'— y por eso no se podía pinchar.
        { id: 'norma', label: 'La norma' },
        { id: 'mapa', label: 'Mapa de actores' },
        { id: 'notas', label: 'Objetivo y notas' },
        { id: 'briefing', label: 'Briefing' },
        // Registro va suelto y con distintivo: es lo único de la demo
        // que responde a una obligación legal, y es lo que queremos que
        // se mire.
        { id: 'registro', label: 'Registro', distintivo: 'NUEVO' },
        { id: 'agenda', label: 'Agenda' },
        { id: 'documentos', label: 'Documentos' },
      ];

  return (
    <div className="sec" style={{ maxWidth: 1180 }}>
      <style>{`
        .gt-proyecto { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,168px); gap: 26px; }
        @media (max-width: 900px) { .gt-proyecto { grid-template-columns: minmax(0,1fr); gap: 0; } }
      `}</style>

      {/* Cabecera: el título es el selector de proyecto, y las acciones
          a mano. Sin lateral izquierda — la columna se la queda el
          índice, que es lo que se usa constantemente. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {esPro ? (
            <CambiarProyecto
              proyectos={proyectos}
              actual={abierto}
              novedades={Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v.novedades]))}
              onElegir={abrir}
              onNuevo={() => {
                router.replace('/projects', { scroll: false });
                setCreando(true);
              }}
              onVerTodos={() => router.replace('/projects', { scroll: false })}
            />
          ) : (
            /* En Free el titular no es el nombre del proyecto de
               ejemplo —que suena a que el usuario ya tiene uno— sino lo
               que la pantalla enseña de verdad: cómo se trabaja aquí. */
            <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35 }}>
              {esPro ? abierto?.name : 'Tu espacio de trabajo para asuntos públicos'}
            </div>
          )}
          {/* En Free la cabecera leía los datos reales del usuario —cero
              y cero— mientras el cuerpo enseña los del ejemplo. Quien no
              supiera que es una demostración lo leía como un fallo. */}
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {esPro ? (
              <>
                {d.actores} {d.actores === 1 ? 'actor' : 'actores'} · {d.asuntos}{' '}
                {d.asuntos === 1 ? 'asunto' : 'asuntos'}
              </>
            ) : (
              'Un proyecto de ejemplo, con datos de muestra'
            )}
          </div>
        </div>

        {/* El aviso de Teams vive arriba a la derecha, donde no compite
            con nada. Se puede cerrar, pero vuelve al abrir un proyecto:
            no se guarda que lo cerraste porque no es una preferencia,
            es un "ahora no". */}
        {esPro && teams && (
          <div
            style={{
              ...CARD,
              background: '#fafaff',
              borderColor: '#d8d3f5',
              padding: '11px 13px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              maxWidth: 370,
              flexShrink: 0,
            }}
          >
            <i
              className="ti ti-users-group"
              style={{ fontSize: 17, color: MORADO, flexShrink: 0, marginTop: 1 }}
            ></i>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Trabaja con tu equipo</div>
              <div style={{ fontSize: 11.5, color: '#555', marginTop: 2, lineHeight: 1.5 }}>
                Responsables por actor, menciones, registro de contactos y agenda compartida.
              </div>
              {/* En pestaña nueva, como el resto de enlaces a precios: quien
                  está trabajando en un proyecto no debería perderlo por
                  consultar un plan. */}
              <a
                href="/precios?para=organizaciones"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11.5, color: MORADO, display: 'inline-block', marginTop: 6 }}
              >
                Ver Teams →
              </a>
            </div>
            <button
              onClick={() => setTeams(false)}
              aria-label="Cerrar"
              style={{ background: 'none', border: 'none', color: '#a8a49c', padding: 2, flexShrink: 0 }}
            >
              <i className="ti ti-x" style={{ fontSize: 14 }}></i>
            </button>
          </div>
        )}

        {!esPro && (
          <button className="btn-ai" onClick={() => setModalUpsell(true)}>
            <i className="ti ti-bolt"></i> Desbloquear
          </button>
        )}
      </div>

      <div className="gt-proyecto">
        <div
          style={{ minWidth: 0 }}
          onClick={esPro ? undefined : () => setModalUpsell(true)}
        >
          {!esPro && (
            <>
              {/* ProyectoDemo primero: dentro lleva la norma y el mapa,
                  que es lo que convence. ResumenDemo iba antes y los
                  empujaba por debajo del pliegue con seis tarjetas de
                  contexto. */}
              <ProyectoDemo />
              <div style={{ height: 14 }}></div>
              <ResumenDemo />
            </>
          )}

          {esPro && (
            <>
              <section id="resumen" style={{ scrollMarginTop: 72, marginBottom: 30 }}>
                {/* El objetivo y los asuntos, juntos: son las dos cosas
                    que contestan "de qué va esto" al abrir el proyecto. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...ETIQUETA, marginBottom: 7 }}>OBJETIVO</div>
                    <textarea
                      key={abierto.id}
                      defaultValue={abierto.objetivo || ''}
                      placeholder="Qué quieres conseguir con este asunto"
                      onBlur={(e) => guardarObjetivo(e.target.value)}
                      rows={4}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `.5px solid ${BORDE}`,
                        borderRadius: 9,
                        fontSize: 13,
                        lineHeight: 1.7,
                        outline: 'none',
                        fontFamily: 'inherit',
                        background: '#fafaf7',
                        resize: 'vertical',
                      }}
                    />

                    {/* Por cuenta de quién se trabaja. Solo aparece si la
                        cuenta tiene clientes cargados: para una empresa
                        que actúa por cuenta propia el campo sobra.

                        Va bajo el objetivo y no en la actividad porque el
                        cliente es del proyecto: se elige una vez y cada
                        registro lo hereda. */}
                    {clientes.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ ...ETIQUETA, marginBottom: 7 }}>POR CUENTA DE</div>
                        <Desplegable
                          value={abierto.client_id || ''}
                          onChange={(v) => guardarCliente(v || null)}
                          vacio="Por cuenta propia"
                          opciones={clientes.map((c) => ({ v: c.id, label: c.nombre }))}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <AsuntosProyecto
                      projectId={abierto.id}
                      userId={user.id}
                      abrirBuscador={atajo === 'asunto'}
                      onCerrarBuscador={() => setAtajo(null)}
                    />
                  </div>
                </div>

              </section>

              {/* El mapa es lo segundo que se mira y lo más propio del
                  producto, así que se destaca: tarjeta blanca con borde
                  frente al resto de secciones, que van sobre el fondo. */}
              <section
                id="mapa"
                style={{
                  scrollMarginTop: 72,
                  marginBottom: 30,
                  ...CARD,
                  padding: '18px 20px',
                }}
              >
                <div style={{ ...ETIQUETA, marginBottom: 12 }}>MAPA DE ACTORES</div>
                <MapaActores projectId={abierto.id} />
              </section>

              <section id="briefing" style={{ scrollMarginTop: 72, marginBottom: 30 }}>
                <div style={{ ...ETIQUETA, marginBottom: 12 }}>BRIEFING POR ACTOR</div>
                <BriefingProyecto projectId={abierto.id} userId={user.id} />
              </section>

              {/* Agenda y registro, una al lado de la otra pero separadas:
                  la agenda es el método de cada uno y es opcional; el
                  registro es la obligación del RDL 21/2026. Juntarlas en
                  pestañas obligaba a decidir en cuál mirar. */}
              <section
                id="actividad"
                style={{
                  scrollMarginTop: 72,
                  marginBottom: 30,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                <div style={{ ...CARD, padding: '16px 18px' }}>
                  <div style={{ ...ETIQUETA, marginBottom: 4 }}>AGENDA</div>
                  <p style={{ fontSize: 11.5, color: '#888', margin: '0 0 12px', lineHeight: 1.5 }}>
                    Anota lo que hay que hacer y cuándo.
                  </p>
                  <AgendaProyecto projectId={abierto.id} />
                </div>

                <div style={{ ...CARD, padding: '16px 18px' }}>
                  <div style={{ ...ETIQUETA, marginBottom: 4 }}>REGISTRO</div>
                  <p style={{ fontSize: 11.5, color: '#888', margin: '0 0 12px', lineHeight: 1.5 }}>
                    Registra tus actividades en conformidad con la ley.
                  </p>
                  <ActividadProyecto projectId={abierto.id} userId={user.id} />
                </div>
              </section>

              {/* Documentos y notas, una al lado de la otra: ninguna
                  de las dos necesita el ancho entero, y juntas se leen
                  como lo que son — el material del proyecto. */}
              <section
                id="documentos"
                style={{
                  scrollMarginTop: 72,
                  marginBottom: 10,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                <div style={{ ...CARD, padding: '16px 18px' }}>
                  <div style={{ ...ETIQUETA, marginBottom: 12 }}>DOCUMENTOS</div>
                  <DocumentosProyecto projectId={abierto.id} userId={user.id} />
                </div>

                <div style={{ ...CARD, padding: '16px 18px' }}>
                  <div style={{ ...ETIQUETA, marginBottom: 12 }}>NOTAS</div>
                  <NotasProyecto projectId={abierto.id} userId={user.id} />
                </div>
              </section>

            </>
          )}
        </div>

        <AnclasProyecto secciones={secciones} />
      </div>

      {modalUpsell && <UpgradeModal {...upsellProyectos()} onClose={() => setModalUpsell(false)} />}
    </div>
  );
}
