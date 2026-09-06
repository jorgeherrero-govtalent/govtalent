'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import FollowButton from '@/components/FollowButton';

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

/**
 * Cómo se cuenta cada paso del análisis.
 *
 * Se nombra lo que está pasando de verdad, con su número: "buscando
 * autoconsumo (3 de 9)" da una sensación de avance que ninguna barra
 * animada consigue, y además es cierto.
 */
function fraseDelPaso(p) {
  if (!p) return 'Preparando el análisis…';
  switch (p.fase) {
    case 'criterios':
      return 'Leyendo tu descripción y extrayendo los términos de búsqueda…';
    case 'criterios_ok':
      return `${p.keywords.length} términos de búsqueda. Empezando a rastrear las fuentes…`;
    case 'buscando':
      return `Buscando “${p.termino}” (${p.hecho} de ${p.total})`;
    case 'truncado':
      return `Búsqueda detenida por tiempo tras ${p.buscados} de ${p.total} términos`;
    case 'candidatos':
      return `${p.n} asuntos encontrados. Evaluando cuáles te afectan…`;
    case 'evaluando':
      return `Evaluando ${p.n} asuntos uno a uno. Este paso es el más lento.`;
    case 'guardando':
      return `Guardando ${p.n} resultados…`;
    default:
      return 'Analizando…';
  }
}

const PASOS = ['criterios', 'buscando', 'evaluando', 'guardando'];

/** Pastilla de filtro por institución. */
function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      style={{
        fontSize: 12,
        borderRadius: 20,
        padding: '5px 12px',
        border: 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        background: activo ? '#f0eefe' : '#f4f4f0',
        color: activo ? '#3c3489' : '#57534e',
        transition: 'background .15s ease',
      }}
    >
      {children}
    </button>
  );
}

function Encabezado({ titulo, n }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '16px 0 4px' }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-.1px' }}>{titulo}</span>
      <span style={{ fontSize: 11.5, color: '#8b8780' }}>{n}</span>
      <span style={{ flex: 1, height: '.5px', background: '#f2f0ec' }}></span>
    </div>
  );
}

/**
 * Una fila de resultado.
 *
 * Las tres acciones —seguir, añadir a proyecto y descartar— van juntas a
 * la derecha y aparecen al pasar el ratón. Antes solo estaba la campana
 * y para añadir a un proyecto había que entrar en la ficha.
 */
function Resultado({ m, primero, onDescartar }) {
  const dias = diasHasta(m.plazo);
  const conPlazo = dias !== null && dias >= 0;

  return (
    <div
      className="fila-sector"
      style={{
        display: 'flex',
        gap: 15,
        padding: '15px 12px',
        margin: '0 -12px',
        borderRadius: 8,
        borderTop: primero ? 'none' : '.5px solid #f2f0ec',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ width: 72, flexShrink: 0 }}>
        {conPlazo ? (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: dias <= 1 ? '#6d5aef' : '#1a1a18', lineHeight: 1.2 }}>
              {dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : fechaCorta(m.plazo)}
            </div>
            <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 2 }}>
              {dias === 0 ? 'cierra hoy' : dias === 1 ? 'cierra mañana' : `en ${dias} días`}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#b8b4ac', paddingTop: 2 }}>{fechaCorta(m.created_at)}</div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: '#3C3489', background: '#f0eefe', padding: '3px 8px', borderRadius: 11 }}>
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

      <div className="acciones-sector" style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <FollowButton kind={m.kind} refId={m.ref_id} label={m.titulo} variant="icon" conIconoProyecto />
        <button
          type="button"
          onClick={() => onDescartar(m)}
          title="No me afecta"
          aria-label="Descartar: no me afecta"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 8px',
            borderRadius: 7,
            border: 'none',
            background: 'transparent',
            color: '#c4c0b8',
            cursor: 'pointer',
          }}
        >
          <i className="ti ti-x" style={{ fontSize: 15 }} aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}

/** En qué punto de los cuatro pasos estamos, para pintar la barra. */
function indiceDelPaso(p) {
  if (!p) return 0;
  if (p.fase === 'criterios') return 0;
  if (p.fase === 'criterios_ok' || p.fase === 'buscando' || p.fase === 'truncado') return 1;
  if (p.fase === 'candidatos' || p.fase === 'evaluando') return 2;
  if (p.fase === 'guardando') return 3;
  return 0;
}

export default function SectorPage() {
  const supabase = createClient();

  const [perfil, setPerfil] = useState(undefined);
  const [descripcion, setDescripcion] = useState('');
  const [matches, setMatches] = useState([]);
  const [analizando, setAnalizando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [filtro, setFiltro] = useState('todas');
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
          .eq('descartado', false)
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

  /**
   * Lanza el análisis y va leyendo el flujo de la ruta.
   *
   * La ruta responde en NDJSON: una línea JSON por paso. Se leen según
   * llegan y se pintan, en vez de esperar un minuto con la pantalla
   * quieta. El progreso que se enseña es el real —qué término se está
   * buscando, cuántos candidatos hay—, no una barra inventada.
   */
  async function analizar() {
    if (descripcion.trim().length < 20) {
      toast.info('Describe tu organización con algo más de detalle.');
      return;
    }
    setAnalizando(true);
    setProgreso({ fase: 'criterios' });

    try {
      const res = await fetch('/api/sector/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion }),
      });

      // Los errores previos al flujo (sin sesión, descripción corta)
      // siguen viniendo como JSON normal con su código de estado.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'No se ha podido completar el análisis');
        return;
      }

      const lector = res.body.getReader();
      const decoder = new TextDecoder();
      let resto = '';
      let final = null;
      let fallo = null;

      while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        resto += decoder.decode(value, { stream: true });

        // La última línea puede venir partida: se guarda para la vuelta
        // siguiente y solo se procesan las completas.
        const lineas = resto.split('\n');
        resto = lineas.pop();

        for (const linea of lineas) {
          if (!linea.trim()) continue;
          let evento;
          try {
            evento = JSON.parse(linea);
          } catch {
            continue;
          }
          if (evento.fase === 'fin') final = evento;
          else if (evento.fase === 'error') fallo = evento;
          else setProgreso(evento);
        }
      }

      if (fallo) {
        toast.error(fallo.error || 'No se ha podido completar el análisis');
        return;
      }
      if (!final) {
        toast.error('El análisis se ha cortado antes de terminar');
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('sector_profiles').select('*').eq('user_id', auth.user.id).limit(1).maybeSingle(),
        supabase
          .from('sector_matches')
          .select('*')
          .eq('user_id', auth.user.id)
          .eq('descartado', false)
          .order('relevancia', { ascending: false })
          .order('plazo', { ascending: true, nullsFirst: false }),
      ]);
      setPerfil(p || null);
      setMatches(m || []);
      setEditando(false);

      if (final.truncado) {
        toast.info('El análisis se ha detenido por tiempo: no se han buscado todos los términos.');
      }
      toast(
        final.encontrados === 0
          ? 'No se ha encontrado nada abierto con esos criterios.'
          : `${final.encontrados} asuntos te afectan, de ${final.candidatos} revisados.`
      );
    } catch (e) {
      toast.error('No se ha podido completar el análisis');
    } finally {
      setAnalizando(false);
      setProgreso(null);
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

  /** Cuántos hay de cada institución. Los contadores van en los filtros. */
  const porFuente = useMemo(() => {
    const c = {};
    for (const m of matches) c[m.fuente] = (c[m.fuente] || 0) + 1;
    return c;
  }, [matches]);

  const visibles = useMemo(
    () => (filtro === 'todas' ? matches : matches.filter((m) => m.fuente === filtro)),
    [matches, filtro]
  );

  /**
   * Lo que tiene plazo abierto va en su propio bloque y primero.
   *
   * Antes la lista iba ordenada por relevancia, así que una consulta que
   * cerraba mañana podía quedar la novena. Lo accionable no se puede
   * perder entre lo interesante.
   */
  const bloqueConPlazo = useMemo(
    () =>
      visibles
        .filter((m) => m.plazo && diasHasta(m.plazo) >= 0)
        .sort((a, b) => diasHasta(a.plazo) - diasHasta(b.plazo)),
    [visibles]
  );
  const bloqueSinPlazo = useMemo(
    () => visibles.filter((m) => !(m.plazo && diasHasta(m.plazo) >= 0)),
    [visibles]
  );

  /**
   * Descartar un asunto.
   *
   * Se quita de la lista al momento y se ofrece deshacer: descartar por
   * error sin salida sería peor que no tener el botón. La marca vive en
   * la base de datos, así que el siguiente análisis no lo resucita.
   */
  async function descartar(m) {
    setMatches((prev) => prev.filter((x) => x.id !== m.id));
    const { error } = await supabase
      .from('sector_matches')
      .update({ descartado: true, descartado_at: new Date().toISOString() })
      .eq('id', m.id);

    if (error) {
      setMatches((prev) => [...prev, m]);
      toast.error('No se ha podido descartar');
      return;
    }
    // La forma del aviso con acción es { label, onClick }, tal como la
    // espera components/Toast.js.
    toast('Descartado. No volverá a aparecer.', {
      action: { label: 'Deshacer', onClick: () => recuperar(m) },
    });
  }

  async function recuperar(m) {
    const { error } = await supabase
      .from('sector_matches')
      .update({ descartado: false, descartado_at: null })
      .eq('id', m.id);
    if (error) {
      toast.error('No se ha podido recuperar');
      return;
    }
    setMatches((prev) => [...prev, m]);
  }

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
                Describe a qué se dedica tu organización y localizamos la normativa abierta que le afecta.
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
              {analizando ? '' : 'Tarda alrededor de un minuto'}
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

          {/* El panel de espera.

              El análisis tarda cerca de un minuto y esta es, para mucha
              gente, la primera cosa que hace en la plataforma. Un botón
              gris y nada más durante un minuto es donde se pierde al
              usuario, así que se cuenta lo que está pasando: qué término
              se busca ahora, cuántos candidatos han salido, en qué paso
              va. Todo sale del flujo que emite la ruta, así que no hay
              ni un porcentaje inventado. */}
          {analizando && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '.5px solid #f2f0ec',
              }}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {PASOS.map((_, i) => {
                  const actual = indiceDelPaso(progreso);
                  return (
                    <span
                      key={i}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 3,
                        background: i < actual ? '#6d5aef' : i === actual ? '#b3a8f7' : '#f2f0ec',
                        transition: 'background .3s ease',
                      }}
                    ></span>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <i
                  className="ti ti-loader-2"
                  style={{ fontSize: 14, color: '#6d5aef', animation: 'gt-giro 1s linear infinite' }}
                ></i>
                <span style={{ fontSize: 12.5, color: '#57534e', lineHeight: 1.5 }}>
                  {fraseDelPaso(progreso)}
                </span>
              </div>

              {progreso?.fase === 'criterios_ok' && progreso.keywords?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {progreso.keywords.map((k) => (
                    <span
                      key={k}
                      style={{
                        fontSize: 11,
                        background: '#f4f4f0',
                        color: '#57534e',
                        borderRadius: 20,
                        padding: '3px 10px',
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
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
              {/* El plazo solo se menciona si lo hay: anunciar que no
                  queda ninguno no le sirve a nadie. */}
              {conPlazo.length > 0 && (
                <span style={{ color: '#6d5aef' }}>
                  {conPlazo.length} {conPlazo.length === 1 ? 'tiene' : 'tienen'} plazo abierto
                  {nuevos > 0 ? ' · ' : '. '}
                </span>
              )}
              {nuevos > 0 && `${nuevos} ${nuevos === 1 ? 'nuevo' : 'nuevos'} desde tu último análisis.`}
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

          {/* Filtros por institución, con su reparto a la vista.
              Los contadores se calculan sobre el total, no sobre lo
              filtrado: si no, al elegir uno los demás dirían cero. */}
          {matches.length > 0 && Object.keys(porFuente).length > 1 && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
              <Chip activo={filtro === 'todas'} onClick={() => setFiltro('todas')}>
                Todas · {matches.length}
              </Chip>
              {Object.entries(porFuente)
                .sort((a, b) => b[1] - a[1])
                .map(([fuente, n]) => (
                  <Chip key={fuente} activo={filtro === fuente} onClick={() => setFiltro(fuente)}>
                    {fuente} · {n}
                  </Chip>
                ))}
            </div>
          )}

          {bloqueConPlazo.length > 0 && (
            <div style={{ ...CARD, padding: '6px 22px', marginBottom: 14 }}>
              <Encabezado titulo="Con plazo abierto" n={bloqueConPlazo.length} />
              {bloqueConPlazo.map((m, i) => (
                <Resultado key={m.id} m={m} primero={i === 0} onDescartar={descartar} />
              ))}
            </div>
          )}

          {bloqueSinPlazo.length > 0 && (
            <div style={{ ...CARD, padding: '6px 22px', marginBottom: 14 }}>
              <Encabezado
                titulo={bloqueConPlazo.length > 0 ? 'Sin plazo, en seguimiento' : 'En seguimiento'}
                n={bloqueSinPlazo.length}
              />
              {bloqueSinPlazo.map((m, i) => (
                <Resultado key={m.id} m={m} primero={i === 0} onDescartar={descartar} />
              ))}
            </div>
          )}

          {visibles.length === 0 && matches.length > 0 && (
            <div style={{ ...CARD, padding: 22, marginBottom: 14, fontSize: 12.5, color: '#8b8780' }}>
              Ningún asunto de {filtro} entre tus resultados.{' '}
              <button
                type="button"
                onClick={() => setFiltro('todas')}
                style={{ color: '#6d5aef', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5 }}
              >
                Ver todos
              </button>
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
