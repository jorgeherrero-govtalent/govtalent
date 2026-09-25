'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { frasePlazo } from '@/lib/plazos';
import { limitesDe } from '@/lib/alarmas';
import TextoCreciente, { enviarConIntro } from '@/components/TextoCreciente';

/**
 * La tarjeta negra de la home: la consola de tus alarmas.
 *
 * Siempre en el mismo sitio y siempre en negro, para que el usuario
 * aprenda dónde vive el agente. Cambia de contenido según el caso:
 *
 *   Sin alarmas (Pro o Free)  la invitación: «¿Qué quieres que vigile por
 *                             ti?», la caja y cómo trabaja en tres pasos.
 *   Pro con alarmas           qué han encontrado, cada alarma con su
 *                             estado, y la caja para pedir otra.
 *   Free con su alarma        lo que ha encontrado esta semana y que llega
 *                             el lunes; en lugar de la caja, lo que añade
 *                             Pro. Es donde el límite se nota.
 *
 * Lo que se escribe en la caja no se procesa aquí: se guarda en la
 * pestaña y se abre /alarmas, que lo pide al agente con su panel de
 * progreso a la vista (AlarmasTab lee CLAVE_PEDIDO al cargar).
 *
 * Todas las cifras salen de la base de datos. Ninguna se inventa.
 */

const CLAVE_PEDIDO = 'govtalent.alarmas.pedido';
const MORADO = '#6d5aef';
const MORADO_C = '#8f7ff5';
const NEGRO = '#15140f';
const VERDE = '#1d6f5c';

// Las mismas que en la página de Alarmas: el mismo agente, las mismas ideas.
const IDEAS = ['Todo lo que afecte a mi sector', 'Los cambios de una ley concreta', 'Consultas públicas de un ministerio'];

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function haceCuanto(iso) {
  if (!iso) return null;
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (Number.isNaN(h)) return null;
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

function Rotulo({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, letterSpacing: '.4px', color: MORADO_C, fontWeight: 600 }}>
      <i className="ti ti-sparkles" style={{ fontSize: 14 }} aria-hidden="true"></i>
      {children}
    </div>
  );
}

/**
 * La caja del agente en negro: crece hacia abajo según se escribe, como
 * la de Claude (TextoCreciente), y debajo lleva las tres ideas para
 * empezar. Intro envía; Mayúsculas + Intro hace un salto de línea.
 */
function Caja({ placeholder, onEnviar, valor, setValor, cajaRef }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onEnviar();
        }}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: '#24231d', border: '1px solid #3a392f', borderRadius: 12, padding: '5px 5px 5px 14px' }}
      >
        <TextoCreciente
          ref={cajaRef}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={enviarConIntro(onEnviar)}
          rows={1}
          maxAltura={220}
          placeholder={placeholder}
          aria-label="Describe tu organización o lo que quieres vigilar"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13.5, lineHeight: 1.5, fontFamily: 'inherit', padding: '5px 0', margin: 0 }}
        />
        <button
          type="submit"
          aria-label="Crear alarma"
          style={{ width: 30, height: 30, border: 'none', borderRadius: 9, background: MORADO, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <i className="ti ti-arrow-up" style={{ fontSize: 16 }} aria-hidden="true"></i>
        </button>
      </form>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {IDEAS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setValor((v) => v || `${i}: `);
              cajaRef.current?.focus();
            }}
            style={{ fontSize: 11.5, color: '#d6d3cb', border: '1px solid #3a392f', background: 'transparent', borderRadius: 14, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ConsolaAlarmas() {
  const supabase = createClient();
  const router = useRouter();
  const cajaRef = useRef(null);
  const [cargado, setCargado] = useState(false);
  const [nivel, setNivel] = useState('free');
  const [alarmas, setAlarmas] = useState([]);
  const [matches, setMatches] = useState([]);
  const [valor, setValor] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        if (!cancelado) setCargado(true);
        return;
      }
      const [{ data: n, error: errN }, { data: al }, { data: m }] = await Promise.all([
        supabase.rpc('nivel_avisos'),
        supabase
          .from('sector_alerts')
          .select('id, nombre, activa, frecuencia, evaluada_at, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: true }),
        supabase
          .from('sector_alert_matches')
          .select('alert_id, kind, ref_id, plazo, visto, created_at')
          .eq('user_id', uid)
          .eq('descartado', false)
          .order('created_at', { ascending: false })
          .limit(300),
      ]);
      let niv = !errN && (n === 'pro' || n === 'free') ? n : null;
      if (!niv) {
        const { data: u } = await supabase.from('users').select('plan').eq('id', uid).maybeSingle();
        niv = u?.plan === 'pro' ? 'pro' : 'free';
      }
      if (cancelado) return;
      setNivel(niv);
      setAlarmas(al || []);
      setMatches(m || []);
      setCargado(true);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const esPro = nivel === 'pro';
  const activas = alarmas.filter((a) => a.activa);
  const limite = limitesDe(nivel).alarmas;

  const resumen = useMemo(() => {
    // Un asunto encontrado por dos alarmas cuenta una vez.
    const unicos = new Map();
    for (const m of matches) {
      const k = `${m.kind}:${m.ref_id}`;
      if (!unicos.has(k)) unicos.set(k, m);
    }
    const lista = [...unicos.values()];
    const abiertos = lista.map((m) => diasHasta(m.plazo)).filter((d) => d !== null && d >= 0).sort((a, b) => a - b);
    const semana = lista.filter((m) => Date.now() - new Date(m.created_at).getTime() < 7 * 86400000).length;
    const porAlarma = new Map();
    for (const a of alarmas) {
      const suyos = matches.filter((m) => m.alert_id === a.id);
      const nuevos = suyos.filter((m) => !m.visto).length;
      const dias = suyos.map((m) => diasHasta(m.plazo)).filter((d) => d !== null && d >= 0).sort((x, y) => x - y);
      porAlarma.set(a.id, { nuevos, primero: dias.length ? dias[0] : null, plazos: dias.length, semana: suyos.filter((m) => Date.now() - new Date(m.created_at).getTime() < 7 * 86400000).length });
    }
    return { abiertos, semana, porAlarma };
  }, [matches, alarmas]);

  function enviar() {
    const t = valor.trim();
    if (!t) {
      cajaRef.current?.focus();
      return;
    }
    try {
      window.sessionStorage.setItem(CLAVE_PEDIDO, t);
    } catch {}
    router.push('/alarmas');
  }

  // Compacta: la consola no debe empujar hacia abajo el resto de la home.
  const TARJETA = { background: NEGRO, borderRadius: 18, padding: '16px 22px' };

  if (!cargado) {
    return <div style={{ ...TARJETA, minHeight: 170 }} aria-busy="true"></div>;
  }

  // ------------------------------------------------------------------
  // Sin alarmas: la invitación
  // ------------------------------------------------------------------
  if (activas.length === 0) {
    const pasos = [
      ['Lee tu web o tu descripción', 'y entiende a qué os dedicáis'],
      ['Revisa cada día más de 1.000 asuntos', 'Congreso, UE, consultas públicas y BOE'],
      esPro
        ? ['Te avisa de lo que te afecta', 'y de los plazos a 30, 14, 7, 3 y 1 días']
        : ['Te lo resume cada lunes', 'con los días que quedan de cada plazo'],
    ];
    const pausadas = alarmas.length > 0;
    return (
      <section className="consola-alarmas" aria-label="Crear tu primera alarma" style={TARJETA}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
          <Rotulo>{esPro ? 'TUS ALARMAS' : 'TU ALARMA'}</Rotulo>
          <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.3, color: '#fff', fontWeight: 500, letterSpacing: '-.3px' }}>
            ¿Qué quieres que vigile por ti?
          </h2>
          <div style={{ fontSize: 13, color: '#a8a49c', lineHeight: 1.55 }}>
            {pausadas
              ? 'Tus alarmas están en pausa. Actívalas en Alarmas o cuéntame algo nuevo que vigilar.'
              : 'Cuéntame a qué se dedica tu organización y te aviso de lo que te afecta, antes de que cierre el plazo.'}
          </div>
          <Caja
            cajaRef={cajaRef}
            valor={valor}
            setValor={setValor}
            onEnviar={enviar}
            placeholder="Somos una asociación de renovables con proyectos en Castilla-La Mancha…"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 4 }}>Así trabaja</div>
          {pasos.map(([a, b], i) => (
            <div key={a} style={{ display: 'flex', gap: 12, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: 'rgba(143,127,245,.18)', color: '#cfc8fb', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {i + 1}
              </span>
              <div>
                <div style={{ fontSize: 13, color: '#fff' }}>{a}</div>
                <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 2 }}>{b}</div>
              </div>
            </div>
          ))}
          {!esPro && <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 8 }}>Tu plan incluye 1 alarma con resumen los lunes.</div>}
        </div>
        <style>{consolaCss}</style>
      </section>
    );
  }

  const revisada = alarmas.map((a) => a.evaluada_at).filter(Boolean).sort().pop();

  // ------------------------------------------------------------------
  // Free con su alarma
  // ------------------------------------------------------------------
  if (!esPro) {
    const a = activas[0];
    const r = resumen.porAlarma.get(a.id) || { semana: 0 };
    const n = resumen.semana;
    return (
      <section className="consola-alarmas" aria-label="Tu alarma" style={TARJETA}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
          <Rotulo>TU ALARMA ESTÁ VIGILANDO</Rotulo>
          <div style={{ fontSize: 17, lineHeight: 1.35, color: '#fff', fontWeight: 500, letterSpacing: '-.2px' }}>
            {n > 0
              ? `Esta semana he encontrado ${n} ${n === 1 ? 'asunto que te afecta' : 'asuntos que te afectan'}. Te lo resumo el lunes a las 8:00.`
              : 'Esta semana aún no he encontrado nada nuevo. Te escribo el lunes con el resumen.'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: MORADO_C, boxShadow: '0 0 0 3px rgba(143,127,245,.22)' }} />
            <span style={{ fontSize: 13, color: '#fff', flex: 1, minWidth: 0 }}>{a.nombre}</span>
            <span style={{ fontSize: 12, color: '#cfc8fb', whiteSpace: 'nowrap' }}>
              {r.semana > 0 ? `${r.semana} esta semana` : revisada ? `revisada ${haceCuanto(revisada)}` : 'vigilando'}
            </span>
          </div>
          <Link href="/alarmas" style={{ fontSize: 12.5, color: MORADO_C, textDecoration: 'none' }}>
            Ver lo que ha encontrado →
          </Link>
        </div>
        <div style={{ background: '#24231d', border: '1px solid #34332c', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff' }}>Con Pro, no esperes al lunes</div>
          {['Hasta 3 alarmas', 'Aviso el mismo día en que se abre un plazo', 'Recordatorios a 30, 14, 7, 3 y 1 días'].map((t) => (
            <div key={t} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#d6d3cb', lineHeight: 1.45 }}>
              <i className="ti ti-check" style={{ fontSize: 14, color: MORADO_C }} aria-hidden="true"></i>
              {t}
            </div>
          ))}
          <Link
            href="/precios"
            style={{ alignSelf: 'flex-start', marginTop: 4, background: VERDE, color: '#fff', borderRadius: 9, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}
          >
            Pasar a Pro
          </Link>
        </div>
        <style>{consolaCss}</style>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Pro con alarmas: la consola
  // ------------------------------------------------------------------
  const nAbiertos = resumen.abiertos.length;
  const titular =
    nAbiertos > 0
      ? `${nAbiertos} ${nAbiertos === 1 ? 'asunto abierto te afecta' : 'asuntos abiertos te afectan'}. El más urgente cierra ${frasePlazo(resumen.abiertos[0])}.`
      : 'Ahora mismo no hay plazos abiertos en lo tuyo. Sigo vigilando.';
  const enLimite = activas.length >= limite;

  return (
    <section className="consola-alarmas" aria-label="Tus alarmas" style={TARJETA}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
        <Rotulo>TUS ALARMAS ESTÁN VIGILANDO</Rotulo>
        <div style={{ fontSize: 17, lineHeight: 1.35, color: '#fff', fontWeight: 500, letterSpacing: '-.2px' }}>{titular}</div>
        {enLimite ? (
          <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.5 }}>
            Tienes {activas.length} de {limite} alarmas activas.{' '}
            <Link href="/alarmas" style={{ color: MORADO_C, textDecoration: 'none' }}>
              Gestionarlas
            </Link>
          </div>
        ) : (
          <Caja cajaRef={cajaRef} valor={valor} setValor={setValor} onEnviar={enviar} placeholder="¿Qué más quieres que vigile?" />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activas.slice(0, 3).map((a) => {
          const r = resumen.porAlarma.get(a.id) || {};
          const estado =
            r.nuevos > 0
              ? { t: `${r.nuevos} ${r.nuevos === 1 ? 'novedad' : 'novedades'}`, c: '#fff' }
              : r.primero !== null && r.primero !== undefined
                ? { t: `${r.plazos === 1 ? '1 plazo cierra' : `${r.plazos} plazos, el primero`} ${frasePlazo(r.primero)}`, c: '#cfc8fb' }
                : { t: 'Sin novedades', c: '#8b8780' };
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: MORADO_C, boxShadow: '0 0 0 3px rgba(143,127,245,.22)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#fff', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
              <span style={{ fontSize: 12, color: estado.c, whiteSpace: 'nowrap' }}>{estado.t}</span>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
          <Link href="/alarmas" style={{ fontSize: 12.5, color: MORADO_C, textDecoration: 'none' }}>
            Ver lo que han encontrado →
          </Link>
          {revisada && <span style={{ fontSize: 11.5, color: '#8b8780' }}>revisadas {haceCuanto(revisada)}</span>}
        </div>
      </div>
      <style>{consolaCss}</style>
    </section>
  );
}

const consolaCss = `
  .consola-alarmas { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 24px; align-items: start; }
  @media (max-width: 760px) { .consola-alarmas { grid-template-columns: 1fr; gap: 14px; } }
`;
