'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import ActorAvatar, { esOrganizacion } from '@/components/ActorAvatar';
import {
  RELACIONES,
  TIPOS_ENLACE,
  enZonaDePrioridad,
  limiteActores,
  posicionLabel,
  puedeAnadirActor,
  relacionLabel,
  resumenMapa,
  tieneSeguimiento,
  urlDeEnlace,
} from '@/lib/proyectos';

/**
 * El mapa de actores de un proyecto.
 *
 * Una matriz de influencia por posición: arriba quien decide, a la
 * derecha quien está contigo. La zona pintada arriba en el centro es la
 * pregunta que el mapa contesta de un vistazo — quién decide y aún no
 * sabes de qué lado está.
 *
 * Las coordenadas se guardan como 0-100 y se persisten al soltar, no
 * mientras se arrastra: sería una escritura por cada píxel.
 */

const BORDE = '#e0dfd8';
const MORADO = '#6d5aef';

// El chip tenía el ancho en porcentaje del lienzo — hasta el 44 % —, así
// que con nombres de razón social cuatro chips llenaban una fila y el
// mapa se volvía ilegible. Ahora el ancho es fijo y el nombre se recorta.
const CHIP = {
  1: { w: 34, h: 34 },
  2: { w: 168, h: 38 },
  3: { w: 214, h: 48 },
};
// Aire mínimo entre dos chips para que se lean como dos.
const SEPARACION = 6;
// El lienzo crece con el número de actores en vez de quedarse en 380
// pase lo que pase: con veinte no cabían y con cinco sobraba la mitad.
const ALTOS = [
  [8, 380],
  [16, 460],
  [Infinity, 560],
];

function medidasChip(t) {
  return CHIP[t] || CHIP[2];
}

export function altoLienzo(n) {
  for (const [hasta, alto] of ALTOS) if (n <= hasta) return alto;
  return 560;
}

/**
 * El nombre que se pinta en el chip.
 *
 * El directorio guarda razones sociales completas y en un chip no caben:
 * «ASOCIACIÓN DE EMPRESAS CON GRAN CONSUMO DE ENERGÍA (AEGE)» recortada
 * por CSS se queda en «ASOCIACIÓN DE EMPR…», que no identifica a nadie.
 * El acrónimo del final o lo que va antes del guion sí. El nombre entero
 * sigue estando en el title y en la ficha.
 */
export function nombreCorto(nombre) {
  const n = String(nombre || '').trim();
  if (n.length <= 26) return n;
  const acronimo = n.match(/\(([^)]{2,10})\)\s*$/);
  if (acronimo) return acronimo[1];
  const antesDelGuion = n.split(/\s+[-–·]\s+/)[0];
  if (antesDelGuion.length >= 3 && antesDelGuion.length < n.length) return antesDelGuion;
  return n;
}

/**
 * El encuadre del eje vertical.
 *
 * Casi todos los actores de un proyecto real se concentran en una franja
 * de influencia —en uno de ejemplo, entre 40 y 95—, así que la mitad de
 * abajo del lienzo quedaba vacía mientras la de arriba se saturaba. El
 * eje se encuadra al rango que se usa, nunca por debajo de 60 puntos
 * (comprimirlo más exagera diferencias que no existen) y siempre dentro
 * de 0-100, para que los extremos se sigan pudiendo alcanzar arrastrando.
 */
export function marcoDe(lista) {
  if (!lista || lista.length === 0) return { lo: 0, hi: 100 };
  let lo = 100;
  let hi = 0;
  for (const a of lista) {
    const v = Number(a.influencia);
    const n = Number.isFinite(v) ? v : 50;
    if (n < lo) lo = n;
    if (n > hi) hi = n;
  }
  const span = Math.min(100, Math.max(60, hi - lo + 20));
  let bajo = Math.round((lo + hi) / 2 - span / 2);
  bajo = Math.max(0, Math.min(100 - span, bajo));
  return { lo: bajo, hi: bajo + span };
}

// De influencia (0-100) a porcentaje desde arriba, dentro del marco.
export function topPorcentaje(influencia, marco) {
  const span = Math.max(1, marco.hi - marco.lo);
  const v = Number.isFinite(Number(influencia)) ? Number(influencia) : 50;
  return Math.min(100, Math.max(0, ((marco.hi - v) / span) * 100));
}

/**
 * Reparte los chips para que no se pisen.
 *
 * Empuja cada pareja que se solapa por el lado que menos cuesta y luego
 * tira suave de cada uno hacia su sitio real, así que el resultado se
 * queda lo más cerca posible del dato. El que se está arrastrando no se
 * mueve nunca: si se apartara del cursor, el gesto parecería roto.
 *
 * Devuelve un Map por id con la posición pintada (x, y), la real
 * (x0, y0) y si hubo que apartarlo, que es lo que dibuja el hilo.
 */
export function repartir(lista, marco, W, H, fijoId) {
  const span = Math.max(1, marco.hi - marco.lo);
  const nodos = lista.map((a) => {
    const m = medidasChip(a.tamano || 2);
    const pos = Number.isFinite(Number(a.posicion)) ? Number(a.posicion) : 50;
    const inf = Number.isFinite(Number(a.influencia)) ? Number(a.influencia) : 50;
    const x0 = (pos / 100) * W;
    const y0 = ((marco.hi - inf) / span) * H;
    return { id: a.id, w: m.w, h: m.h, x0, y0, x: x0, y: y0, fijo: a.id === fijoId };
  });

  // 26 arriba deja libre el rótulo de la zona de prioridad.
  const dentroX = (n) => Math.max(n.w / 2 + 3, Math.min(W - n.w / 2 - 3, n.x));
  const dentroY = (n) => Math.max(n.h / 2 + 26, Math.min(H - n.h / 2 - 6, n.y));

  for (let paso = 0; paso < 160; paso++) {
    let choque = false;
    for (let i = 0; i < nodos.length; i++) {
      for (let j = i + 1; j < nodos.length; j++) {
        const A = nodos[i];
        const B = nodos[j];
        const sx = (A.w + B.w) / 2 + SEPARACION;
        const sy = (A.h + B.h) / 2 + SEPARACION;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const px = sx - Math.abs(dx);
        const py = sy - Math.abs(dy);
        if (px <= 0 || py <= 0) continue;
        choque = true;
        const pesoA = A.fijo ? 0 : B.fijo ? 1 : 0.5;
        const pesoB = B.fijo ? 0 : A.fijo ? 1 : 0.5;
        if (py / sy < px / sx) {
          const d = (dy >= 0 ? 1 : -1) * py;
          A.y -= d * pesoA;
          B.y += d * pesoB;
        } else {
          const d = (dx >= 0 ? 1 : -1) * px;
          A.x -= d * pesoA;
          B.x += d * pesoB;
        }
      }
    }
    for (const n of nodos) {
      if (!n.fijo) {
        n.x += (n.x0 - n.x) * 0.06;
        n.y += (n.y0 - n.y) * 0.06;
      }
      n.x = dentroX(n);
      n.y = dentroY(n);
    }
    if (!choque) break;
  }

  const salida = new Map();
  for (const n of nodos) {
    const dx = n.x0 - n.x;
    const dy = n.y0 - n.y;
    const lejos = Math.sqrt(dx * dx + dy * dy);
    salida.set(n.id, {
      x: n.x,
      y: n.y,
      x0: n.x0,
      y0: n.y0,
      largo: lejos,
      angulo: (Math.atan2(dy, dx) * 180) / Math.PI,
      desviado: lejos > 12,
    });
  }
  return salida;
}

export default function MapaActores({ projectId, abrirBuscador, onCerrarBuscador }) {
  const supabase = createClient();
  const lienzo = useRef(null);

  const [actores, setActores] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null); // actor de la ficha lateral
  const [buscador, setBuscador] = useState(false);
  // Tamaño de etiqueta global, no por chip: en un mapa de stakeholders
  // el tamaño se lee como importancia, y la importancia ya es el eje
  // vertical. Dos cosas diciendo lo mismo podrían contradecirse.

  // Se guarda cuál se arrastra y si llegó a moverse: un clic limpio abre
  // la ficha, un arrastre no debe abrirla al soltar.
  const arrastre = useRef({ id: null, movido: false });
  const deshacerActor = useRef(null);
  // Redimensionar: se guarda desde qué tamaño se partía y el punto de
  // origen, para convertir el arrastre en uno de los tres pasos.
  const medida = useRef({ id: null, x0: 0, base: 2 });
  const [midiendoId, setMidiendoId] = useState(null);
  // Qué chip se está arrastrando. En un ref no serviría: el reparto se
  // calcula al pintar y necesita reaccionar.
  const [arrastrandoId, setArrastrandoId] = useState(null);
  // El reparto trabaja en píxeles, así que hace falta el ancho real.
  const [ancho, setAncho] = useState(0);
  const [marco, setMarco] = useState({ lo: 0, hi: 100 });
  // En un teléfono el plano no cabe y arrastrar choca con el gesto de
  // deslizar la página: se cambia por una lista agrupada. Se mira con
  // matchMedia y no con CSS porque hay que dejar de montar el lienzo,
  // no solo esconderlo.
  const [esMovil, setEsMovil] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const aplicar = () => setEsMovil(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);
  const [hayDeshacer, setHayDeshacer] = useState(false);

  useEffect(() => {
    const el = lienzo.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const medir = () => setAncho(el.getBoundingClientRect().width);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [esMovil]);

  // El encuadre no se recalcula mientras se arrastra: el eje se movería
  // bajo el cursor y el chip no iría donde se suelta.
  useEffect(() => {
    if (arrastrandoId) return;
    const m = marcoDe(actores);
    setMarco((prev) => (prev.lo === m.lo && prev.hi === m.hi ? prev : m));
  }, [actores, arrastrandoId]);

  const alto = altoLienzo(actores.length);
  // El reparto se rehace también al arrastrar, para que los demás se
  // aparten en vivo; el que se arrastra va como fijo y no se mueve.
  const disposicion = useMemo(
    () =>
      ancho > 0 && actores.length > 0
        ? repartir(actores, marco, ancho, alto, arrastrandoId)
        : null,
    [actores, marco, ancho, alto, arrastrandoId]
  );
  // La línea de influencia 50 dentro del marco: de ella cuelgan la banda
  // de prioridad y la horizontal de puntos.
  const lineaMedia = topPorcentaje(50, marco);

  const cargar = useCallback(async () => {
    const [{ data: acts }, { data: cats }] = await Promise.all([
      supabase
        .from('project_actors')
        .select('*, project_actor_links(id, tipo, valor, orden)')
        .eq('project_id', projectId)
        .order('created_at'),
      supabase.from('project_actor_categories').select('*').order('orden'),
    ]);
    setActores(acts || []);
    setCategorias(cats || []);
    setCargando(false);
  }, [supabase, projectId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Los botones "+ Actor" y "+ Asunto" de la cabecera del proyecto
  // abren el buscador de la sección que corresponde.
  useEffect(() => {
    if (abrirBuscador) setBuscador(true);
  }, [abrirBuscador]);

  // --- Arrastre ---------------------------------------------------------

  function alPulsar(e, actor) {
    e.preventDefault();
    arrastre.current = { id: actor.id, movido: false };
    setArrastrandoId(actor.id);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function alMover(e) {
    const { id } = arrastre.current;
    if (!id || !lienzo.current) return;
    arrastre.current.movido = true;

    const r = lienzo.current.getBoundingClientRect();
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    // El eje vertical va al revés: arriba es más influencia. Y va sobre
    // el marco encuadrado, no sobre 0-100, o el chip no iría al cursor.
    const span = Math.max(1, marco.hi - marco.lo);
    const y = Math.round(
      Math.min(100, Math.max(0, marco.hi - ((e.clientY - r.top) / r.height) * span))
    );

    setActores((prev) => prev.map((a) => (a.id === id ? { ...a, posicion: x, influencia: y } : a)));
  }

  async function alSoltar(e, actor) {
    const { id, movido } = arrastre.current;
    arrastre.current = { id: null, movido: false };
    setArrastrandoId(null);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!id) return;

    if (!movido) {
      setAbierto(actores.find((a) => a.id === id) || actor);
      return;
    }

    const actual = actores.find((a) => a.id === id);
    if (!actual) return;
    const { error } = await supabase
      .from('project_actors')
      .update({ posicion: actual.posicion, influencia: actual.influencia })
      .eq('id', id);
    if (error) toast('No se ha podido guardar la posición');
  }

  // --- Tamaño del chip ---------------------------------------------------

  function medirDesde(e, actor) {
    e.preventDefault();
    e.stopPropagation();
    medida.current = { id: actor.id, x0: e.clientX, base: actor.tamano || 2 };
    setMidiendoId(actor.id);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function midiendo(e) {
    const { id, x0, base } = medida.current;
    if (!id) return;
    e.stopPropagation();
    // 26px de arrastre por paso: bastante para no cambiar sin querer,
    // poco para que se note que responde.
    const pasos = Math.round((e.clientX - x0) / 26);
    const nuevo = Math.min(3, Math.max(1, base + pasos));
    setActores((prev) => prev.map((a) => (a.id === id ? { ...a, tamano: nuevo } : a)));
  }

  async function medido(e) {
    const { id } = medida.current;
    medida.current = { id: null, x0: 0, base: 2 };
    setMidiendoId(null);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!id) return;
    e.stopPropagation();
    const actual = actores.find((a) => a.id === id);
    if (!actual) return;
    const { error } = await supabase.from('project_actors').update({ tamano: actual.tamano }).eq('id', id);
    if (error) toast('No se ha podido guardar el tamaño');
  }

  // --- Guardar cambios de la ficha --------------------------------------

  async function actualizar(id, cambios) {
    setActores((prev) => prev.map((a) => (a.id === id ? { ...a, ...cambios } : a)));
    setAbierto((a) => (a && a.id === id ? { ...a, ...cambios } : a));
    const { error } = await supabase.from('project_actors').update(cambios).eq('id', id);
    if (error) toast('No se ha podido guardar');
  }

  // Sin confirmación: se quita y se ofrece deshacer unos segundos. Se
  // guarda la fila entera para poder reinsertarla con su posición.
  async function quitar(id) {
    const actor = actores.find((a) => a.id === id);
    if (!actor) return;
    setActores((prev) => prev.filter((a) => a.id !== id));
    setAbierto(null);

    const { error } = await supabase.from('project_actors').delete().eq('id', id);
    if (error) {
      setActores((prev) => [...prev, actor]);
      toast('No se ha podido quitar del mapa');
      return;
    }
    deshacerActor.current = actor;
    setHayDeshacer(true);
    toast('Actor quitado del mapa');
  }

  async function restaurarActor() {
    const a = deshacerActor.current;
    if (!a) return;
    deshacerActor.current = null;
    setHayDeshacer(false);
    const { error } = await supabase.from('project_actors').insert({
      project_id: projectId,
      kind: a.kind,
      ref_id: a.ref_id,
      es_propio: a.es_propio,
      nombre: a.nombre,
      descripcion: a.descripcion,
      imagen: a.imagen,
      category_id: a.category_id,
      posicion: a.posicion,
      influencia: a.influencia,
      relacion: a.relacion,
      posicion_texto: a.posicion_texto,
      argumentos: a.argumentos,
    });
    if (error) {
      toast('No se ha podido recuperar el actor');
      return;
    }
    cargar();
  }

  if (cargando) return <div className="spinner"></div>;


  const resumen = resumenMapa(actores);

  // Los actores agrupados, para la lista del móvil. El orden importa:
  // primero los que deciden y no sabes de qué lado están, que es la
  // pregunta que el mapa contesta de un vistazo.
  const grupos = [
    { titulo: 'Zona de prioridad', destacado: true, actores: actores.filter(enZonaDePrioridad) },
    {
      titulo: 'A favor',
      actores: actores.filter((a) => !enZonaDePrioridad(a) && posicionLabel(a.posicion) === 'A favor'),
    },
    {
      titulo: 'Neutral',
      actores: actores.filter((a) => !enZonaDePrioridad(a) && posicionLabel(a.posicion) === 'Neutral'),
    },
    {
      titulo: 'En contra',
      actores: actores.filter((a) => !enZonaDePrioridad(a) && posicionLabel(a.posicion) === 'En contra'),
    },
  ].filter((g) => g.actores.length > 0);

  return (
    <div>
      <style>{`
        .gt-chip:hover .gt-tirador { opacity: 1 !important; }
      `}</style>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        {/* El estado se dice con texto y peso tipográfico, nunca con
            color, como el resto de contadores de la aplicación. */}
        <div style={{ fontSize: 12, color: '#888' }}>
          {resumen.total === 0 ? (
            'Todavía no hay actores en el mapa.'
          ) : resumen.prioridadSinContactar > 0 ? (
            <>
              <span style={{ color: '#1a1a18', fontWeight: 600 }}>
                {resumen.prioridadSinContactar} {resumen.prioridadSinContactar === 1 ? 'decisivo' : 'decisivos'}
              </span>{' '}
              sin posición definida y sin contactar · {resumen.total} en el mapa
            </>
          ) : (
            `${resumen.total} en el mapa · ${resumen.sinContactar} sin contactar`
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          
          <button
            className="btn-ai-o"
            onClick={() => setBuscador(true)}
            disabled={!puedeAnadirActor(actores.length)}
          >
            <i className="ti ti-plus"></i> Añadir actor
          </button>
        </div>
      </div>

      {/* El lienzo. La zona pintada arriba al centro es alta influencia y
          posición indefinida: donde se decide el asunto. */}
      {esMovil ? (
        <div>
          {grupos.map((g) => (
            <div key={g.titulo} style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '.3px',
                  color: g.destacado ? MORADO : '#888',
                  marginBottom: 8,
                }}
              >
                {g.titulo.toUpperCase()} · {g.actores.length}
              </div>

              {g.actores.map((a, i) => {
                const iniciada = a.relacion !== 'sin_contactar';
                return (
                  <button
                    key={a.id}
                    onClick={() => setAbierto(a)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      borderTop: i === 0 ? 'none' : `.5px solid ${BORDE}`,
                      padding: '10px 0',
                    }}
                  >
                    <ActorAvatar actor={a} size={30} atenuado={!iniciada} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {a.nombre}
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: '#888', marginTop: 1 }}>
                        {[a.descripcion, relacionLabel(a.relacion).toLowerCase()].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#c4c0b8', flexShrink: 0 }}></i>
                  </button>
                );
              })}
            </div>
          ))}

          <div style={{ fontSize: 11.5, color: '#888', lineHeight: 1.6 }}>
            El mapa con los dos ejes se ve desde un ordenador.
          </div>
        </div>
      ) : (
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              color: '#888',
              letterSpacing: '.3px',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
            }}
          >
            INFLUENCIA
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            ref={lienzo}
            style={{
              position: 'relative',
              height: alto,
              background: '#f0f0eb',
              borderRadius: 10,
              overflow: 'hidden',
              touchAction: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                // El corte neutral de lib/proyectos es 40-60. La banda
                // iba de 33 a 74, así que pintaba como prioritarios a
                // actores que enZonaDePrioridad no considera tales.
                left: '40%',
                right: '40%',
                top: 0,
                bottom: `${100 - lineaMedia}%`,
                background: '#f0eefe',
              }}
            ></div>
            <div
              style={{
                position: 'absolute',
                left: '40%',
                top: 7,
                paddingLeft: 9,
                fontSize: 10.5,
                color: MORADO,
                letterSpacing: '.3px',
              }}
            >
              ZONA DE PRIORIDAD
            </div>

            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${lineaMedia}%`,
                borderTop: `.5px dashed #d5d3c9`,
              }}
            ></div>
            <div
              style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: `.5px dashed #d5d3c9` }}
            ></div>

            {/* Si un chip se ha tenido que apartar para no pisarse con
                otro, un hilo lo une a su punto real: la posición que se
                lee sigue siendo la que dice el dato, no la del dibujo. */}
            {disposicion &&
              actores.map((a) => {
                const p = disposicion.get(a.id);
                if (!p || !p.desviado) return null;
                return (
                  <div
                    key={`hilo-${a.id}`}
                    style={{
                      position: 'absolute',
                      left: Math.round(p.x),
                      top: Math.round(p.y),
                      width: Math.round(p.largo),
                      height: 0,
                      borderTop: '.5px solid #c9c5bc',
                      transformOrigin: '0 0',
                      transform: `rotate(${p.angulo.toFixed(1)}deg)`,
                      pointerEvents: 'none',
                    }}
                  ></div>
                );
              })}

            {actores.map((a) => {
              const iniciada = a.relacion !== 'sin_contactar';
              const org = esOrganizacion(a);
              const prioritario = enZonaDePrioridad(a);
              const t = a.tamano || 2;
              const med = medidasChip(t);
              const pos = disposicion ? disposicion.get(a.id) : null;
              return (
                <button
                  key={a.id}
                  className="gt-chip"
                  onPointerDown={(e) => alPulsar(e, a)}
                  onPointerMove={alMover}
                  onPointerUp={(e) => alSoltar(e, a)}
                  title={`${a.nombre} · ${posicionLabel(a.posicion)}`}
                  style={{
                    position: 'absolute',
                    left: pos ? `${Math.round(pos.x)}px` : `${a.posicion}%`,
                    top: pos ? `${Math.round(pos.y)}px` : `${topPorcentaje(a.influencia, marco)}%`,
                    transform: 'translate(-50%, -50%)',
                    width: med.w,
                    height: med.h,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    gap: t === 1 ? 0 : 8,
                    background: '#fff',
                    border: `${iniciada ? '.5px solid' : '.5px dashed'} ${
                      arrastre.current.id === a.id ? MORADO : '#b8b4ac'
                    }`,
                    // El radio del chip también distingue: personas
                    // redondas, organizaciones cuadradas.
                    borderRadius: org ? 10 : 24,
                    padding: t === 1 ? 4 : t === 3 ? '0 14px 0 6px' : '0 13px 0 5px',
                    whiteSpace: 'nowrap',
                    cursor: 'grab',
                    textAlign: 'left',
                    // El que se arrastra por encima de todo, y los de la
                    // zona de prioridad por encima del resto.
                    zIndex: arrastre.current.id === a.id ? 3 : prioritario ? 2 : 1,
                    boxShadow: iniciada ? '0 1px 3px rgba(0,0,0,.05)' : 'none',
                  }}
                >
                  <ActorAvatar
                    actor={a}
                    size={t === 1 ? 26 : t === 3 ? 36 : 30}
                    atenuado={!iniciada}
                    fondo={prioritario ? '#eeedfe' : '#f0f0eb'}
                  />
                  {t > 1 && (
                  <span style={{ minWidth: 0, overflow: 'hidden' }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: t === 3 ? 13 : 12,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        color: iniciada ? '#1a1a18' : '#555',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {nombreCorto(a.nombre)}
                    </span>
                    {/* La segunda línea sale del directorio, no la
                        escribe el usuario: es el cargo y la institución.
                        Solo en el tamaño grande: es lo primero que sobra
                        cuando el mapa se llena. */}
                    {t === 3 && a.descripcion && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10.5,
                          color: '#888',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {a.descripcion}
                      </span>
                    )}
                  </span>
                  )}

                  {/* Tirador para cambiar el tamaño. Aparece al pasar
                      por encima; si estuviera siempre visible el mapa se
                      llenaría de puntitos. */}
                  <span
                    onPointerDown={(e) => medirDesde(e, a)}
                    onPointerMove={midiendo}
                    onPointerUp={medido}
                    title="Arrastra para cambiar el tamaño"
                    className="gt-tirador"
                    style={{
                      position: 'absolute',
                      right: -5,
                      bottom: -5,
                      width: 13,
                      height: 13,
                      borderRadius: '50%',
                      background: '#fff',
                      border: `1px solid ${midiendoId === a.id ? MORADO : '#c4c0b8'}`,
                      cursor: 'ew-resize',
                      opacity: midiendoId === a.id ? 1 : 0,
                    }}
                  ></span>
                </button>
              );
            })}

            {actores.length === 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a8a49c',
                  gap: 8,
                  padding: 20,
                  textAlign: 'center',
                }}
              >
                <i className="ti ti-users" style={{ fontSize: 26 }}></i>
                <div style={{ fontSize: 12.5, maxWidth: 320, lineHeight: 1.6 }}>
                  Añade a quien decide, a quien influye y a quien te puede ayudar. Luego colócalos
                  arrastrando.
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 7,
              fontSize: 11,
              color: '#888',
              letterSpacing: '.3px',
            }}
          >
            <span>EN CONTRA</span>
            <span>POSICIÓN</span>
            <span>A FAVOR</span>
          </div>
        </div>
      </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
          borderTop: `.5px solid ${BORDE}`,
          marginTop: 14,
          paddingTop: 11,
          fontSize: 11.5,
          color: '#888',
        }}
      >
        <span>
          <span
            style={{ display: 'inline-block', width: 16, borderTop: '1px solid #b8b4ac', verticalAlign: 4, marginRight: 5 }}
          ></span>
          Relación iniciada
        </span>
        <span>
          <span
            style={{ display: 'inline-block', width: 16, borderTop: '1px dashed #b8b4ac', verticalAlign: 4, marginRight: 5 }}
          ></span>
          Sin contactar
        </span>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 14,
              borderTop: '.5px solid #c9c5bc',
              verticalAlign: 4,
              marginRight: 5,
            }}
          ></span>
          Hilo al punto exacto
        </span>
        {hayDeshacer ? (
          <button
            onClick={restaurarActor}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: MORADO, fontSize: 11.5, padding: 0 }}
          >
            Deshacer
          </button>
        ) : (
          <span style={{ marginLeft: 'auto' }}>Arrastra para recolocar</span>
        )}
      </div>

      {buscador && (
        <BuscadorActores
          projectId={projectId}
          categorias={categorias}
          yaEnMapa={actores}
          onClose={() => {
            setBuscador(false);
            onCerrarBuscador?.();
          }}
          onAdded={() => {
            setBuscador(false);
            onCerrarBuscador?.();
            cargar();
          }}
        />
      )}

      {abierto && (
        <FichaActor
          actor={abierto}
          categorias={categorias}
          onClose={() => setAbierto(null)}
          onChange={(cambios) => actualizar(abierto.id, cambios)}
          onDelete={() => quitar(abierto.id)}
          onLinks={cargar}
        />
      )}
    </div>
  );
}

function iniciales(nombre) {
  return (nombre || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

// Las diez clases de actor agrupadas en tres familias, que es como se
// buscan de verdad: o buscas a una persona, o a una organización, o a un
// órgano.
const FAMILIAS = {
  todos: { label: 'Todos', kinds: [] },
  personas: { label: 'Personas', kinds: ['diputado', 'eurodiputado', 'comisario', 'cargo', 'asesor'] },
  organizaciones: { label: 'Organizaciones', kinds: ['organizacion'] },
  organos: { label: 'Órganos', kinds: ['comision', 'comision-eu', 'grupo', 'direccion'] },
};

// =====================================================================
// Buscador: el directorio y los actores propios en la misma lista
// =====================================================================

function BuscadorActores({ projectId, categorias, yaEnMapa, onClose, onAdded }) {
  const supabase = createClient();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [categoria, setCategoria] = useState('');
  // Sin este filtro las organizaciones no aparecían nunca: el orden es
  // por tipo y con 2.100 cargos delante no llegaban al corte de doce.
  const [familia, setFamilia] = useState('todos');
  const [guardando, setGuardando] = useState(false);

  // Los que ya están, para no ofrecerlos otra vez.
  const puestos = new Set(yaEnMapa.filter((a) => !a.es_propio).map((a) => `${a.kind}|${a.ref_id}`));

  useEffect(() => {
    const t = setTimeout(async () => {
      const texto = q.trim();
      if (texto.length < 2) {
        setResultados([]);
        return;
      }
      setBuscando(true);
      let consulta = supabase
        .from('actor_search')
        .select('kind, ref_id, nombre, detalle, imagen, familia, orden_tipo')
        .ilike('nombre', `%${texto}%`);
      if (familia !== 'todos') consulta = consulta.in('kind', FAMILIAS[familia].kinds);
      const { data } = await consulta.order('orden_tipo').limit(14);
      setResultados((data || []).filter((r) => !puestos.has(`${r.kind}|${r.ref_id}`)));
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, familia, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function anadir(fila) {
    if (guardando) return;
    setGuardando(true);
    const { error } = await supabase.from('project_actors').insert({
      project_id: projectId,
      kind: fila.kind || null,
      ref_id: fila.ref_id || null,
      es_propio: !fila.kind,
      nombre: fila.nombre,
      descripcion: fila.detalle || null,
      // La foto o el logotipo viajan con el actor: si no, al añadirlo se
      // quedaban en el directorio y el chip salía con silueta.
      imagen: fila.imagen || null,
      category_id: categoria || null,
    });
    setGuardando(false);
    if (error) {
      toast('No se ha podido añadir al mapa');
      return;
    }
    onAdded();
  }

  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h2>Añadir actor al mapa</h2>
          <div className="modal-x" onClick={onClose}>
            <i className="ti ti-x"></i>
          </div>
        </div>

        <div className="field">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca un diputado, una comisión, una organización…"
          />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {Object.entries(FAMILIAS).map(([clave, cfg]) => (
            <button
              key={clave}
              onClick={() => setFamilia(clave)}
              style={{
                fontSize: 11.5,
                padding: '4px 11px',
                borderRadius: 20,
                border: familia === clave ? 'none' : `.5px solid ${BORDE}`,
                background: familia === clave ? MORADO : '#fff',
                color: familia === clave ? '#fff' : '#555',
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {q.trim().length >= 2 && (
          <>
            <div style={{ fontSize: 11, color: '#888', letterSpacing: '.3px', margin: '4px 0 6px' }}>
              EN EL DIRECTORIO
            </div>
            {buscando && <div style={{ fontSize: 12.5, color: '#999', padding: '8px 0' }}>Buscando…</div>}
            {!buscando && resultados.length === 0 && (
              <div style={{ fontSize: 12.5, color: '#999', padding: '8px 0' }}>
                Nadie con ese nombre en el directorio.
              </div>
            )}
            {resultados.map((r) => (
              <div
                key={`${r.kind}|${r.ref_id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 0',
                  borderBottom: `.5px solid ${BORDE}`,
                }}
              >
                <ActorAvatar actor={r} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>{r.nombre}</div>
                  {r.detalle && (
                    <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{r.detalle}</div>
                  )}
                </div>
                <button className="btn-g" onClick={() => anadir(r)} disabled={guardando}>
                  Añadir
                </button>
              </div>
            ))}

            {/* Crear a mano es una fila más al final, no otro camino: así
                el directorio se prueba primero sin obligar a elegir. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '13px 0',
                borderBottom: `.5px solid ${BORDE}`,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: `.5px dashed #b8b4ac`,
                  color: '#8b8780',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i className="ti ti-plus" style={{ fontSize: 14 }}></i>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5 }}>Crear «{q.trim()}» como actor propio</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                  Solo en tus proyectos, y sin avisos automáticos
                </div>
              </div>
              <button
                className="btn-g"
                onClick={() => anadir({ nombre: q.trim() })}
                disabled={guardando}
              >
                Crear
              </button>
            </div>
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: '#888', letterSpacing: '.3px', marginBottom: 8 }}>
            CATEGORÍA
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categorias.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoria(categoria === c.id ? '' : c.id)}
                style={{
                  fontSize: 11.5,
                  padding: '4px 11px',
                  borderRadius: 20,
                  border: categoria === c.id ? 'none' : `.5px solid ${BORDE}`,
                  background: categoria === c.id ? MORADO : '#fff',
                  color: categoria === c.id ? '#fff' : '#555',
                }}
              >
                {c.nombre}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 9, lineHeight: 1.6 }}>
            Se aplica a lo que añadas ahora. Puedes cambiarla después en la ficha del actor.
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Ficha del actor
// =====================================================================

function FichaActor({ actor, categorias, onClose, onChange, onDelete, onLinks }) {
  const supabase = createClient();
  const [nuevoTipo, setNuevoTipo] = useState('x');
  const [nuevoValor, setNuevoValor] = useState('');
  const enlaces = actor.project_actor_links || [];

  async function anadirEnlace() {
    const valor = nuevoValor.trim();
    if (!valor) return;
    const { error } = await supabase
      .from('project_actor_links')
      .insert({ actor_id: actor.id, tipo: nuevoTipo, valor });
    if (error) {
      toast('No se ha podido guardar el enlace');
      return;
    }
    setNuevoValor('');
    onLinks();
  }

  async function quitarEnlace(id) {
    await supabase.from('project_actor_links').delete().eq('id', id);
    onLinks();
  }

  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h2>{actor.nombre}</h2>
          <div className="modal-x" onClick={onClose}>
            <i className="ti ti-x"></i>
          </div>
        </div>

        {actor.descripcion && (
          <div style={{ fontSize: 12, color: '#888', marginTop: -6, marginBottom: 14 }}>
            {actor.descripcion}
          </div>
        )}

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', letterSpacing: '.3px', marginBottom: 6 }}>
              POSICIÓN
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                ['En contra', 20],
                ['Neutral', 50],
                ['A favor', 80],
              ].map(([texto, valor]) => {
                const activo = posicionLabel(actor.posicion) === texto;
                return (
                  <button
                    key={texto}
                    onClick={() => onChange({ posicion: valor })}
                    style={{
                      fontSize: 11.5,
                      padding: '4px 10px',
                      borderRadius: 20,
                      border: activo ? 'none' : `.5px solid ${BORDE}`,
                      background: activo ? MORADO : '#fff',
                      color: activo ? '#fff' : '#555',
                    }}
                  >
                    {texto}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#888', letterSpacing: '.3px', marginBottom: 6 }}>
              RELACIÓN
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {Object.entries(RELACIONES).map(([valor, cfg]) => {
                const activo = actor.relacion === valor;
                return (
                  <button
                    key={valor}
                    onClick={() => onChange({ relacion: valor })}
                    style={{
                      fontSize: 11.5,
                      padding: '4px 10px',
                      borderRadius: 20,
                      border: activo ? 'none' : `.5px solid ${BORDE}`,
                      background: activo ? MORADO : '#fff',
                      color: activo ? '#fff' : '#555',
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', letterSpacing: '.3px', marginBottom: 6 }}>
            CATEGORÍA
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categorias.map((c) => {
              const activo = actor.category_id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onChange({ category_id: activo ? null : c.id })}
                  style={{
                    fontSize: 11.5,
                    padding: '4px 11px',
                    borderRadius: 20,
                    border: activo ? 'none' : `.5px solid ${BORDE}`,
                    background: activo ? MORADO : '#fff',
                    color: activo ? '#fff' : '#555',
                  }}
                >
                  {c.nombre}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label htmlFor={`accion-${actor.id}`}>Próxima acción</label>
          <input
            id={`accion-${actor.id}`}
            defaultValue={actor.proxima_accion || ''}
            placeholder="Reunión técnica para presentar la posición"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (actor.proxima_accion || '')) onChange({ proxima_accion: v || null });
            }}
          />
        </div>

        {/* Tratamiento B: etiqueta en versalitas y el identificador en
            monoespaciada. Sin logos de marca. */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', letterSpacing: '.3px', marginBottom: 8 }}>
            SUS PERFILES
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
            {enlaces.map((l) => (
              <span
                key={l.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: 7,
                  border: `.5px solid ${BORDE}`,
                  borderRadius: 8,
                  padding: '5px 9px 5px 11px',
                }}
              >
                <span style={{ fontSize: 10.5, color: '#888', letterSpacing: '.3px' }}>
                  {(TIPOS_ENLACE[l.tipo]?.label || l.tipo).toUpperCase()}
                </span>
                <a
                  href={urlDeEnlace(l.tipo, l.valor)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: '#1a1a18' }}
                >
                  {l.valor}
                </a>
                <button
                  onClick={() => quitarEnlace(l.id)}
                  aria-label="Quitar enlace"
                  style={{ background: 'none', border: 'none', color: '#b8b4ac', padding: '0 0 0 2px' }}
                >
                  <i className="ti ti-x" style={{ fontSize: 12 }}></i>
                </button>
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select className="fsel" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)}>
              {Object.entries(TIPOS_ENLACE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <input
              value={nuevoValor}
              onChange={(e) => setNuevoValor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && anadirEnlace()}
              placeholder={TIPOS_ENLACE[nuevoTipo]?.placeholder}
              style={{
                flex: 1,
                minWidth: 150,
                padding: '7px 11px',
                border: `.5px solid ${BORDE}`,
                borderRadius: 8,
                fontSize: 12.5,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button className="btn-g" onClick={anadirEnlace} disabled={!nuevoValor.trim()}>
              Añadir
            </button>
          </div>
        </div>

        {!tieneSeguimiento(actor) && (
          <div style={{ fontSize: 11.5, color: '#999', lineHeight: 1.6, marginBottom: 14 }}>
            Es un actor propio, así que no recibirá avisos automáticos: no está enlazado con el
            directorio.
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            borderTop: `.5px solid ${BORDE}`,
            paddingTop: 13,
            opacity: 0.55,
          }}
        >
          <i className="ti ti-lock" style={{ fontSize: 15, color: '#8b8780' }}></i>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: '#555' }}>Registro de contactos con este actor</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
              Reuniones y gestiones del equipo, con trazabilidad para transparencia
            </div>
          </div>
          <span
            style={{
              fontSize: 11,
              border: `.5px solid #b8b4ac`,
              color: '#8b8780',
              padding: '3px 9px',
              borderRadius: 20,
              flexShrink: 0,
            }}
          >
            Teams
          </span>
        </div>

        <button
          onClick={onDelete}
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            fontSize: 12,
            marginTop: 14,
            padding: 0,
          }}
        >
          Quitar del mapa
        </button>
      </div>
    </div>
  );
}
