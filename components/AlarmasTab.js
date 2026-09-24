'use client';

import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import Interruptor from '@/components/Interruptor';
import UpgradeModal from '@/components/UpgradeModal';
import { FRECUENCIAS, limitesDe, mensajeError } from '@/lib/alarmas';

/**
 * Alarmas.
 *
 * Sustituye a «Gestión de mis avisos» y al análisis de sector: una alarma
 * es un agente al que le cuentas a qué se dedica tu organización o qué te
 * preocupa, y a partir de ahí vigila y te avisa de lo que te afecta.
 *
 * Tres vistas:
 *   lista     la caja para pedir una alarma nueva y las que ya tienes.
 *   borrador  lo que propone el agente: qué ha entendido, lo que ya está
 *             abierto y encaja, y cuándo te avisará. «Activar» la guarda.
 *   editar    una alarma existente, como unas instrucciones: el texto que
 *             escribiste y, al lado, cómo lo ha entendido. El texto manda;
 *             las etiquetas son su reflejo.
 *
 * Límites (lib/alarmas.js y, de verdad, el trigger de sql/59):
 *   Free 1 alarma, solo los lunes. Pro y Teams 3, con cualquier frecuencia.
 *
 * Morado en toda la pantalla: es el color de la funcionalidad.
 */

const MORADO = '#6d5aef';
const MORADO_S = '#f0eefe';
const MORADO_O = '#3c3489';
const TINTA = '#1a1a18';
const GRIS = '#8b8780';
const GRIS2 = '#a8a49c';
const LINEA = '#e6e4dc';
const LINEA2 = '#f0eee8';

const CARD = { background: '#fff', border: `1px solid ${LINEA}`, borderRadius: 16 };
const ETIQUETA = { fontSize: 10.5, letterSpacing: '.4px', textTransform: 'uppercase', color: GRIS2, fontWeight: 600 };

const IDEAS = [
  'Todo lo que afecte a mi sector',
  'Los cambios de una ley concreta',
  'Consultas públicas de un ministerio',
];

function haceCuanto(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = Math.floor((Date.now() - d.getTime()) / 3600000);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function etiquetaPlazo(iso) {
  const d = diasHasta(iso);
  if (d === null || d < 0) return null;
  if (d === 0) return 'cierra hoy';
  if (d === 1) return 'cierra mañana';
  return `quedan ${d} días`;
}

const FRASE_FRECUENCIA = { inmediato: 'Al momento', diario: 'Cada mañana', semanal: 'Los lunes' };

// ---------------------------------------------------------------------
// Piezas pequeñas
// ---------------------------------------------------------------------

function Chip({ texto, onQuitar }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        border: `1px solid ${LINEA}`,
        borderRadius: 14,
        padding: '4px 10px',
        background: '#fff',
        color: '#444',
      }}
    >
      {texto}
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ${texto}`}
          style={{ border: 'none', background: 'none', padding: 0, color: '#c2beb6', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </span>
  );
}

function AnadirChip({ onAnadir, placeholder = 'añadir' }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState('');
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        style={{ fontSize: 12, border: `1px dashed ${LINEA}`, borderRadius: 14, padding: '4px 10px', background: '#fff', color: GRIS, cursor: 'pointer' }}
      >
        + {placeholder}
      </button>
    );
  }
  const confirmar = () => {
    const v = valor.trim();
    if (v) onAnadir(v);
    setValor('');
    setAbierto(false);
  };
  return (
    <input
      autoFocus
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmar();
        }
        if (e.key === 'Escape') setAbierto(false);
      }}
      style={{ fontSize: 12, border: `1px solid ${MORADO}`, borderRadius: 14, padding: '4px 10px', outline: 'none', width: 170, fontFamily: 'inherit' }}
    />
  );
}

function GrupoChips({ titulo, valores = [], onCambiar, placeholder }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${LINEA2}` }}>
      <div style={{ ...ETIQUETA, marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {valores.map((v, i) => (
          <Chip key={`${v}-${i}`} texto={v} onQuitar={onCambiar ? () => onCambiar(valores.filter((_, k) => k !== i)) : null} />
        ))}
        {onCambiar && <AnadirChip placeholder={placeholder} onAnadir={(v) => onCambiar([...valores, v])} />}
        {!onCambiar && valores.length === 0 && <span style={{ fontSize: 12, color: GRIS2 }}>—</span>}
      </div>
    </div>
  );
}

function Frecuencias({ valor, onCambiar, esPro, onUpsell }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
      {FRECUENCIAS.map((f) => {
        const bloqueada = !esPro && f.id !== 'semanal';
        const on = valor === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => (bloqueada ? onUpsell() : onCambiar(f.id))}
            aria-pressed={on}
            style={{
              textAlign: 'left',
              border: `1px solid ${on ? MORADO : LINEA}`,
              boxShadow: on ? `0 0 0 1px ${MORADO}` : 'none',
              background: on ? '#fbfaff' : '#fff',
              borderRadius: 12,
              padding: '10px 12px',
              cursor: 'pointer',
              opacity: bloqueada ? 0.55 : 1,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 500, color: TINTA }}>
              {f.label}
              {bloqueada && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: '.3px',
                    color: MORADO_O,
                    background: MORADO_S,
                    borderRadius: 6,
                    padding: '2px 5px',
                    marginLeft: 6,
                  }}
                >
                  PRO
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: GRIS, marginTop: 3, lineHeight: 1.45 }}>{f.descripcion}</div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * «Recordarme los plazos»: cuando algo que encontró la alarma tiene plazo,
 * recordarlo 30, 14, 7, 3 y 1 días antes, y el mismo día. Es de pago: en
 * Free se ve bloqueado y abre la mejora.
 */
function RecordarPlazos({ valor, onCambiar, esPro, onUpsell }) {
  const on = esPro && valor !== false;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: TINTA }}>
          Recordarme los plazos
          {!esPro && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '.3px',
                color: MORADO_O,
                background: MORADO_S,
                borderRadius: 6,
                padding: '2px 5px',
                marginLeft: 6,
              }}
            >
              PRO
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: GRIS, marginTop: 3, lineHeight: 1.45 }}>
          Si algo de lo que encuentra tiene plazo, te lo recuerdo 30, 14, 7, 3 y 1 días antes de que cierre, y el mismo día.
        </div>
      </div>
      <Interruptor
        activo={on}
        onChange={() => (esPro ? onCambiar(!on) : onUpsell())}
        size="pequeno"
        etiqueta="Recordarme los plazos"
      />
    </div>
  );
}

function Boton({ children, onClick, tipo = 'secundario', disabled, style }) {
  const principal = tipo === 'principal';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12.5,
        fontWeight: 500,
        borderRadius: 10,
        padding: '8px 14px',
        border: `1px solid ${principal ? MORADO : LINEA}`,
        background: principal ? MORADO : '#fff',
        color: principal ? '#fff' : '#444',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Contador({ usadas, limite, esPro }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: GRIS }}>
      <span style={{ display: 'flex', gap: 4 }} aria-hidden="true">
        {Array.from({ length: limite }).map((_, i) => (
          <i key={i} style={{ width: 22, height: 5, borderRadius: 3, background: i < usadas ? MORADO : '#e2e0d8', display: 'block' }} />
        ))}
      </span>
      {usadas} de {limite}
      {!esPro && ' · Free'}
    </span>
  );
}

function Encaja({ items, onDescartar, vacio = 'Nada abierto encaja ahora mismo. Te avisaré cuando aparezca algo.' }) {
  if (!items || items.length === 0) {
    return <div style={{ fontSize: 12.5, color: GRIS, lineHeight: 1.55 }}>{vacio}</div>;
  }
  return (
    <div>
      {items.map((m, i) => {
        const plazo = etiquetaPlazo(m.plazo);
        return (
          <div
            key={`${m.kind}-${m.ref_id}`}
            style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : `1px solid ${LINEA2}`, alignItems: 'flex-start' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href={m.ruta || '/regulatorio'} style={{ fontSize: 13, color: TINTA, textDecoration: 'none', lineHeight: 1.45 }}>
                {m.titulo}
              </Link>
              {m.motivo && <div style={{ fontSize: 12, color: GRIS, marginTop: 3, lineHeight: 1.5 }}>{m.motivo}</div>}
              {m.fuente && <div style={{ fontSize: 11, color: GRIS2, marginTop: 3 }}>{m.fuente}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {plazo && <span style={{ fontSize: 11.5, color: MORADO_O, whiteSpace: 'nowrap' }}>{plazo}</span>}
              {onDescartar && (
                <button
                  type="button"
                  onClick={() => onDescartar(m)}
                  style={{ fontSize: 11.5, color: GRIS2, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  No me afecta
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Confirmar({ titulo, texto, accion, onConfirmar, onCancelar }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      onClick={(e) => e.target === e.currentTarget && onCancelar()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,24,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div role="dialog" aria-modal="true" style={{ background: '#fff', borderRadius: 16, padding: '22px 22px 18px', maxWidth: 420, width: '100%', position: 'relative' }}>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cerrar"
          style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'none', fontSize: 18, color: GRIS, cursor: 'pointer' }}
        >
          ×
        </button>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, paddingRight: 20 }}>{titulo}</div>
        <div style={{ fontSize: 13, color: GRIS, lineHeight: 1.55, marginBottom: 18 }}>{texto}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Boton onClick={onCancelar}>Cancelar</Boton>
          <Boton tipo="principal" onClick={onConfirmar}>
            {accion}
          </Boton>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------
// Caja de texto que crece al escribir
//
// Como la de Claude: empieza con unas pocas líneas y se alarga con el
// texto hasta un tope; a partir de ahí, barra de desplazamiento. Se mide
// con scrollHeight después de cada cambio: primero se pone la altura en
// auto para que también encoja al borrar.
// ---------------------------------------------------------------------

const useAlturaEfecto = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const TextoCreciente = forwardRef(function TextoCreciente({ value, maxAltura = 320, style, ...resto }, refExterno) {
  const propio = useRef(null);
  const ref = refExterno || propio;

  useAlturaEfecto(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const alto = Math.min(el.scrollHeight, maxAltura);
    el.style.height = `${alto}px`;
    el.style.overflowY = el.scrollHeight > maxAltura ? 'auto' : 'hidden';
  }, [value, maxAltura]);

  return <textarea ref={ref} value={value} style={{ ...style, resize: 'none', overflowY: 'hidden' }} {...resto} />;
});

// ---------------------------------------------------------------------
// El agente trabajando
//
// Lo que se ve mientras el agente prepara la alarma. Viene del análisis
// de sector, que contaba en directo lo que hacía, y ese era su encanto:
// es la primera vez que mucha gente ve trabajar a GovTalent, y una rueda
// girando durante medio minuto es donde se pierde al usuario.
//
// Todo lo que se enseña sale del flujo de la ruta: qué web se lee, qué
// término se busca, cuántos asuntos han salido. Ni un número inventado.
// ---------------------------------------------------------------------

function fraseDelPaso(p) {
  switch (p.fase) {
    case 'web':
      return p.dominio ? `Leyendo ${p.dominio}…` : 'Leyendo la web de tu organización…';
    case 'web_ok':
      return `He leído ${p.dominio}. Entendiendo a qué os dedicáis…`;
    case 'web_fallo':
      return `${p.dominio} no se deja leer. Tiro de lo que se sabe públicamente…`;
    case 'criterios':
      return 'Entendiendo a qué os dedicáis y qué normativa os toca…';
    case 'criterios_ok':
      return `${(p.keywords || []).length} términos de búsqueda. Empiezo a rastrear las fuentes…`;
    case 'buscando':
      return `Buscando «${p.termino}» (${p.hecho} de ${p.total})`;
    case 'candidatos':
      return `${p.n} asuntos abiertos encontrados. Ahora, cuáles os afectan…`;
    case 'evaluando':
      return `Leyendo ${p.n} asuntos uno a uno con la descripción de tu organización. Es el paso más lento.`;
    default:
      return 'Preparando la alarma…';
  }
}

function pasoActual(p) {
  if (['web', 'web_ok', 'web_fallo'].includes(p.fase)) return 0;
  if (['criterios'].includes(p.fase)) return 1;
  if (['criterios_ok', 'buscando'].includes(p.fase)) return 2;
  return 3; // candidatos, evaluando
}

function AgenteTrabajando({ p }) {
  const pasos = [
    ...(p.conWeb ? [{ id: 0, label: 'Leer la web' }] : []),
    { id: 1, label: 'Entender' },
    { id: 2, label: 'Buscar' },
    { id: 3, label: 'Evaluar' },
  ];
  const actual = pasoActual(p);
  const keywords = p.keywords || [];
  const buscadas = p.fase === 'buscando' ? Math.max(0, (p.hecho || 1) - 1) : ['candidatos', 'evaluando'].includes(p.fase) ? keywords.length : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ ...CARD, padding: '16px 18px', margin: '14px 0', boxShadow: '0 6px 24px rgba(109,90,239,.08)' }}
    >
      <style>{`
        @keyframes gt-latido { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.82); } }
        @keyframes gt-brillo { 0%, 100% { background: ${MORADO_S}; } 50% { background: #ddd6fd; } }
        @media (prefers-reduced-motion: reduce) { .gt-anim { animation: none !important; } }
      `}</style>

      {/* Los pasos, con el actual latiendo */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        {pasos.map((paso) => {
          const hecho = paso.id < actual;
          const ahora = paso.id === actual;
          return (
            <span key={paso.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: hecho || ahora ? MORADO_O : GRIS2 }}>
              {hecho ? (
                <span aria-hidden="true" style={{ color: MORADO, fontSize: 11 }}>✓</span>
              ) : (
                <span
                  className={ahora ? 'gt-anim' : undefined}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: ahora ? MORADO : '#dcd8ce',
                    animation: ahora ? 'gt-latido 1.1s ease-in-out infinite' : 'none',
                    display: 'inline-block',
                  }}
                />
              )}
              {paso.label}
            </span>
          );
        })}
      </div>

      {/* Lo que está haciendo ahora, con su número */}
      <div style={{ fontSize: 13.5, color: TINTA, lineHeight: 1.5, fontWeight: 500 }}>{fraseDelPaso(p)}</div>

      {p.fase !== 'web' && p.titulo && (
        <div style={{ fontSize: 12, color: GRIS, marginTop: 4 }}>
          {p.dominio}: «{p.titulo}»
        </div>
      )}

      {/* El nombre de la alarma, en cuanto lo tiene */}
      {p.nombre && (
        <div style={{ fontSize: 12, color: GRIS, marginTop: 8 }}>
          Alarma: <b style={{ color: TINTA, fontWeight: 500 }}>{p.nombre}</b>
          {(p.temas || []).length > 0 ? ` · ${p.temas.slice(0, 4).join(', ')}` : ''}
        </div>
      )}

      {/* Los términos: se van encendiendo según se buscan */}
      {keywords.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {keywords.map((k, i) => {
            const hecho = i < buscadas;
            const ahora = p.fase === 'buscando' && i === buscadas;
            return (
              <span
                key={`${k}-${i}`}
                className={ahora ? 'gt-anim' : undefined}
                style={{
                  fontSize: 11.5,
                  borderRadius: 14,
                  padding: '3px 10px',
                  border: `1px solid ${hecho || ahora ? MORADO : LINEA}`,
                  background: hecho ? MORADO : ahora ? MORADO_S : '#fff',
                  color: hecho ? '#fff' : ahora ? MORADO_O : GRIS,
                  animation: ahora ? 'gt-brillo 1s ease-in-out infinite' : 'none',
                  transition: 'background .25s ease, color .25s ease',
                }}
              >
                {k}
              </span>
            );
          })}
        </div>
      )}

      {/* El contador de lo encontrado */}
      {(p.fase === 'buscando' || p.fase === 'candidatos' || p.fase === 'evaluando') && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: MORADO, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {p.fase === 'buscando' ? p.encontrados || 0 : p.n || 0}
          </span>
          <span style={{ fontSize: 12, color: GRIS }}>
            {p.fase === 'evaluando' ? 'asuntos abiertos en revisión' : 'asuntos abiertos encontrados'}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// La pantalla
// ---------------------------------------------------------------------

const CLAVE_BORRADOR = 'govtalent.alarmas.borrador';

export default function AlarmasTab() {
  const supabase = createClient();

  const [cargado, setCargado] = useState(false);
  const [userId, setUserId] = useState(null);
  const [email, setEmail] = useState('');
  const [nivel, setNivel] = useState('free');
  const [alarmas, setAlarmas] = useState([]);
  const [encaja, setEncaja] = useState([]); // coincidencias de todas mis alarmas
  const [correos, setCorreos] = useState(true);

  const [vista, setVista] = useState('lista');
  const [texto, setTexto] = useState('');
  const [web, setWeb] = useState('');
  const [conWeb, setConWeb] = useState(false);
  const [trabajando, setTrabajando] = useState(null); // texto de lo que se está guardando
  const [progreso, setProgreso] = useState(null); // lo que está haciendo el agente, paso a paso
  const [borrador, setBorrador] = useState(null);
  const [editando, setEditando] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [upsell, setUpsell] = useState(false);
  const cajaRef = useRef(null);
  // Hasta que no se ha mirado si había algo guardado, no se escribe: si
  // no, el estado vacío del primer render borraría el borrador.
  const restaurado = useRef(false);

  const esPro = nivel === 'pro';
  const limites = limitesDe(nivel);
  const activas = useMemo(() => alarmas.filter((a) => a.activa), [alarmas]);
  const enLimite = activas.length >= limites.alarmas;

  // --- Carga -------------------------------------------------------------
  async function cargar() {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) {
      setCargado(true);
      return;
    }
    setUserId(uid);
    setEmail(auth.user.email || '');

    const [{ data: n, error: errN }, { data: al }, { data: m }, { data: p }] = await Promise.all([
      supabase.rpc('nivel_avisos'),
      supabase.from('sector_alerts').select('*').eq('user_id', uid).order('created_at', { ascending: true }),
      supabase
        .from('sector_alert_matches')
        .select('id, alert_id, kind, ref_id, titulo, motivo, relevancia, plazo, ruta, fuente, avisado_at, created_at, descartado, visto')
        .eq('user_id', uid)
        .eq('descartado', false)
        .order('relevancia', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('alert_preferences').select('email').eq('user_id', uid).limit(1).maybeSingle(),
    ]);

    let niv = !errN && (n === 'pro' || n === 'free') ? n : null;
    if (!niv) {
      const { data: u } = await supabase.from('users').select('plan').eq('id', uid).maybeSingle();
      niv = u?.plan === 'pro' ? 'pro' : 'free';
    }
    setNivel(niv);
    setAlarmas(al || []);
    setEncaja(m || []);
    setCorreos(p?.email !== false);
    if (!restaurado.current) {
      restaurado.current = true;
      restaurar(uid, al || []);
    }
    setCargado(true);

    // Entrar aquí cuenta como haberlas visto: es lo que usa Regulatorio
    // para decir cuántas hay «sin revisar».
    if ((m || []).some((x) => !x.visto)) {
      supabase.from('sector_alert_matches').update({ visto: true }).eq('user_id', uid).eq('visto', false).then(() => {});
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Borrador guardado en la pestaña -----------------------------------
  // Si el usuario abre una ley desde la propuesta y vuelve atrás, la
  // propuesta (o la edición a medias, o lo que estaba escribiendo) sigue
  // ahí. Vive en sessionStorage: solo en esta pestaña y hasta cerrarla.
  // Se borra al activar, guardar o cancelar.
  function restaurar(uid, lista) {
    let g = null;
    try {
      g = JSON.parse(window.sessionStorage.getItem(CLAVE_BORRADOR) || 'null');
    } catch {
      g = null;
    }
    if (!g || g.uid !== uid || Date.now() - (g.t || 0) > 12 * 3600000) return;
    if (g.texto) setTexto(g.texto);
    if (g.web) setWeb(g.web);
    if (g.conWeb) setConWeb(true);
    if (g.vista === 'borrador' && g.borrador) {
      setBorrador(g.borrador);
      setVista('borrador');
    } else if (g.vista === 'editar' && g.editando && lista.some((a) => a.id === g.editando.id)) {
      setEditando(g.editando);
      setVista('editar');
    }
  }

  useEffect(() => {
    if (!restaurado.current || !userId) return;
    try {
      const hayAlgo = (vista === 'borrador' && borrador) || (vista === 'editar' && editando) || texto.trim() || (conWeb && web.trim());
      if (!hayAlgo) {
        window.sessionStorage.removeItem(CLAVE_BORRADOR);
        return;
      }
      window.sessionStorage.setItem(
        CLAVE_BORRADOR,
        JSON.stringify({
          uid: userId,
          t: Date.now(),
          vista,
          borrador: vista === 'borrador' ? borrador : null,
          editando: vista === 'editar' ? editando : null,
          texto,
          web,
          conWeb,
        })
      );
    } catch {
      // Sin sessionStorage (modo privado, cuota llena) simplemente no se
      // recuerda: la pantalla funciona igual.
    }
  }, [userId, vista, borrador, editando, texto, web, conWeb]);

  const encajaDe = (alertId) => encaja.filter((m) => m.alert_id === alertId);
  const avisosMes = (alertId) =>
    encaja.filter((m) => m.alert_id === alertId && m.avisado_at && Date.now() - new Date(m.avisado_at).getTime() < 30 * 86400000).length;

  // --- Pedir una propuesta al agente ------------------------------------
  /**
   * Pide la propuesta al agente y va pintando lo que hace.
   *
   * La ruta responde con un flujo: una línea JSON por paso. Cada línea
   * actualiza `progreso`, que es lo que enseña el panel del agente
   * trabajando. Los errores previos al flujo (sin sesión, tope del mes)
   * siguen llegando como JSON normal con su código de estado.
   */
  async function pedirPropuesta({ textoPedido, webPedida, base }) {
    const hayWeb = !!webPedida || /(https?:\/\/|www\.|\.[a-z]{2,4}\b)/i.test(textoPedido || '');
    setProgreso({ fase: hayWeb ? 'web' : 'criterios', conWeb: hayWeb, dominio: null });
    try {
      const res = await fetch('/api/alarmas/proponer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoPedido, web: webPedida || '' }),
      });
      if (!res.ok || !res.body?.getReader) {
        const datos = await res.json().catch(() => ({}));
        if (datos?.limite && !esPro) setUpsell(true);
        toast.error(datos?.error || 'El agente no ha podido preparar la alarma.');
        return null;
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
          let ev;
          try {
            ev = JSON.parse(linea);
          } catch {
            continue;
          }
          if (ev.fase === 'fin') final = ev;
          else if (ev.fase === 'error') fallo = ev;
          // Se acumula: los términos y el dominio se siguen viendo en los
          // pasos siguientes, no desaparecen al cambiar de fase.
          else setProgreso((prev) => ({ ...(prev || {}), ...ev }));
        }
      }

      if (fallo || !final) {
        toast.error(
          fallo?.error
            ? `${fallo.error}${fallo.detalle ? ` (${fallo.detalle})` : ''}`
            : 'El agente se ha cortado antes de terminar. Inténtalo de nuevo.'
        );
        return null;
      }
      if (final.aviso_web) toast.info(final.aviso_web);
      return { ...final, base };
    } catch {
      toast.error('No se ha podido contactar con el agente.');
      return null;
    } finally {
      setProgreso(null);
    }
  }

  async function enviarCaja() {
    const t = texto.trim();
    const w = conWeb ? web.trim() : '';
    // Una dirección pegada en la caja vale aunque sea corta
    // (iberdrolaespana.com): el servidor la reconoce y la lee como web.
    const pareceWeb = /(https?:\/\/|www\.|\.[a-z]{2,4}\b)/i.test(t);
    if (t.length < 20 && !w && !pareceWeb) {
      toast.info('Cuéntame algo más: a qué se dedica tu organización o qué te preocupa.');
      return;
    }
    if (enLimite) {
      if (!esPro) setUpsell(true);
      else toast.info('Tienes 3 alarmas activas. Desactiva una para crear otra.');
      return;
    }
    const r = await pedirPropuesta({ textoPedido: t, webPedida: w });
    if (!r) return;
    setBorrador({
      pedido: t || w,
      nombre: r.propuesta.nombre,
      descripcion: r.propuesta.descripcion,
      criterios: r.propuesta.criterios,
      keywords: r.propuesta.keywords,
      sectores: r.propuesta.sectores,
      encaja: r.encaja || [],
      revisados: r.revisados || 0,
      frecuencia: esPro ? 'inmediato' : 'semanal',
      recordar_plazos: true,
      restantes: r.propuestas_restantes,
    });
    setVista('borrador');
  }

  // --- Guardar -------------------------------------------------------------
  async function guardar(payload) {
    const res = await fetch('/api/alarmas/guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(datos?.error || 'No se ha podido guardar la alarma.');
      if (!esPro && String(datos?.error || '').includes('máximo')) setUpsell(true);
      return null;
    }
    return datos.alarma;
  }

  async function activarBorrador() {
    const b = borrador;
    setTrabajando('Activando la alarma…');
    const guardada = await guardar({
      nombre: b.nombre,
      descripcion: b.descripcion,
      criterios: b.criterios,
      keywords: b.keywords,
      sectores: b.sectores,
      frecuencia: b.frecuencia,
      recordar_plazos: b.recordar_plazos !== false,
      activa: true,
      encaja: b.encaja,
    });
    setTrabajando(null);
    if (!guardada) return;
    toast(
      b.frecuencia === 'semanal'
        ? 'Alarma activada. Te escribiré los lunes con lo que encuentre.'
        : 'Alarma activada. Te avisaré en cuanto encuentre algo.'
    );
    setBorrador(null);
    setTexto('');
    setWeb('');
    setConWeb(false);
    setVista('lista');
    cargar();
  }

  // --- Activar, desactivar, borrar ----------------------------------------
  async function alternar(a) {
    if (!a.activa && enLimite) {
      if (!esPro) setUpsell(true);
      else toast.info('Tienes 3 alarmas activas. Desactiva una para activar esta.');
      return;
    }
    const activa = !a.activa;
    setAlarmas((prev) => prev.map((x) => (x.id === a.id ? { ...x, activa } : x)));
    const { error } = await supabase.from('sector_alerts').update({ activa }).eq('id', a.id);
    if (error) {
      setAlarmas((prev) => prev.map((x) => (x.id === a.id ? { ...x, activa: a.activa } : x)));
      toast.error(mensajeError(error));
      return;
    }
    toast.info(activa ? 'Alarma activada' : 'Alarma en pausa. No te avisará hasta que la actives.');
  }

  async function borrar(a) {
    setConfirmando(null);
    const { error } = await supabase.from('sector_alerts').delete().eq('id', a.id);
    if (error) {
      toast.error('No se ha podido eliminar');
      return;
    }
    setAlarmas((prev) => prev.filter((x) => x.id !== a.id));
    setEncaja((prev) => prev.filter((m) => m.alert_id !== a.id));
    setEditando(null);
    setVista('lista');
    toast.info('Alarma eliminada');
  }

  async function descartar(m) {
    setEncaja((prev) => prev.filter((x) => x.id !== m.id));
    if (!m.id) return;
    const { error } = await supabase
      .from('sector_alert_matches')
      .update({ descartado: true, descartado_at: new Date().toISOString() })
      .eq('id', m.id);
    if (error) toast.error('No se ha podido guardar');
    else toast.info('Anotado. No volverá a salir en esta alarma.');
  }

  async function cambiarCorreos() {
    const nuevo = !correos;
    setCorreos(nuevo);
    const { error } = await supabase
      .from('alert_preferences')
      .upsert({ user_id: userId, email: nuevo, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) {
      setCorreos(!nuevo);
      toast.error('No se ha podido guardar');
      return;
    }
    toast.info(nuevo ? 'Volverás a recibir los correos de tus alarmas.' : 'No recibirás correos. Lo que encuentren tus alarmas seguirá aquí.');
  }

  // --- Edición ---------------------------------------------------------------
  function abrirEdicion(a) {
    setEditando({
      id: a.id,
      nombre: a.nombre,
      descripcion: a.descripcion || '',
      descripcionOriginal: a.descripcion || '',
      criterios: a.criterios || {},
      keywords: a.keywords || [],
      sectores: a.sectores || [],
      frecuencia: esPro ? a.frecuencia || 'semanal' : 'semanal',
      recordar_plazos: a.recordar_plazos !== false,
      activa: a.activa,
      pausada_por_plan: a.pausada_por_plan,
    });
    setVista('editar');
  }

  async function guardarEdicion() {
    const e = editando;
    let criterios = e.criterios;
    let keywords = e.keywords;
    let sectores = e.sectores;
    let nuevasEncaja = [];

    // Si ha cambiado el texto, el agente lo vuelve a entender. Si solo han
    // cambiado el nombre o la frecuencia, no hace falta gastar IA.
    if (e.descripcion.trim() !== e.descripcionOriginal.trim()) {
      const r = await pedirPropuesta({ textoPedido: e.descripcion.trim() });
      if (!r) return;
      criterios = r.propuesta.criterios;
      keywords = r.propuesta.keywords;
      sectores = r.propuesta.sectores;
      nuevasEncaja = r.encaja || [];
    }

    setTrabajando('Guardando…');
    const guardada = await guardar({
      id: e.id,
      nombre: e.nombre,
      descripcion: e.descripcion.trim(),
      criterios,
      keywords,
      sectores,
      frecuencia: e.frecuencia,
      recordar_plazos: e.recordar_plazos !== false,
      activa: e.activa,
      encaja: nuevasEncaja,
    });
    setTrabajando(null);
    if (!guardada) return;
    toast('Alarma actualizada');
    setEditando(null);
    setVista('lista');
    cargar();
  }

  // --- Render ------------------------------------------------------------------
  if (!cargado) return <div className="spinner"></div>;

  if (!userId) {
    return (
      <div className="card">
        <div className="empty-state">
          <i className="ti ti-bell"></i>
          Inicia sesión para crear tus alarmas.
        </div>
      </div>
    );
  }

  const modalUpsell = upsell && (
    <UpgradeModal
      title="Más alarmas y avisos al momento"
      message="Con Pro tienes hasta 3 alarmas, te avisamos el mismo día en que se abre un plazo y te recordamos cuándo cierra."
      onClose={() => setUpsell(false)}
    />
  );

  const agentePanel = progreso && <AgenteTrabajando p={progreso} />;

  const trabajandoAviso = agentePanel || (trabajando && (
    <div
      role="status"
      style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: MORADO_O, background: MORADO_S, borderRadius: 12, padding: '10px 14px', margin: '12px 0' }}
    >
      <span className="spinner" style={{ width: 14, height: 14, margin: 0 }}></span>
      {trabajando}
    </div>
  ));

  // ============================ BORRADOR ============================
  if (vista === 'borrador' && borrador) {
    const b = borrador;
    const setB = (cambios) => setBorrador((prev) => ({ ...prev, ...cambios }));
    const setC = (campo, valor) => setBorrador((prev) => ({ ...prev, criterios: { ...prev.criterios, [campo]: valor } }));
    const conPlazo = b.encaja.filter((m) => etiquetaPlazo(m.plazo)).length;
    return (
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {modalUpsell}
        <div style={{ background: '#ebe9e2', borderRadius: 16, padding: '11px 15px', fontSize: 13.5, lineHeight: 1.6, marginLeft: 'auto', maxWidth: '88%', marginBottom: 18, whiteSpace: 'pre-wrap' }}>
          {b.pedido}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: '#2b2a26', marginBottom: 12 }}>
          <span
            aria-hidden="true"
            style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: 7, background: MORADO_S, color: MORADO, alignItems: 'center', justifyContent: 'center', fontSize: 12, marginBottom: 8 }}
          >
            ✦
          </span>
          <div>
            Te propongo esta alarma.{' '}
            {b.encaja.length > 0
              ? `He revisado ${b.revisados} asuntos abiertos y ${b.encaja.length === 1 ? 'uno encaja' : `${b.encaja.length} encajan`}${
                  conPlazo > 0 ? `; ${conPlazo === 1 ? 'uno tiene' : `${conPlazo} tienen`} plazo abierto` : ''
                }.`
              : 'Ahora mismo no hay nada abierto que encaje; te avisaré en cuanto aparezca.'}
          </div>
        </div>

        <div style={{ ...CARD, overflow: 'hidden', margin: '6px 0 14px' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${LINEA2}` }}>
            <input
              value={b.nombre}
              onChange={(e) => setB({ nombre: e.target.value })}
              aria-label="Nombre de la alarma"
              style={{ fontSize: 14.5, fontWeight: 500, border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit', color: TINTA, padding: 0 }}
            />
            {b.criterios.resumen && <div style={{ fontSize: 12.5, color: GRIS, marginTop: 4, lineHeight: 1.5 }}>{b.criterios.resumen}</div>}
          </div>
          <GrupoChips titulo="Temas" valores={b.criterios.temas} onCambiar={(v) => setC('temas', v)} placeholder="añadir tema" />
          <GrupoChips titulo="Normativa de referencia" valores={b.criterios.normativa} onCambiar={(v) => setC('normativa', v)} placeholder="añadir norma" />
          <GrupoChips titulo="Dónde" valores={b.criterios.territorios} onCambiar={(v) => setC('territorios', v)} placeholder="añadir territorio" />
          {(b.criterios.excluye || []).length > 0 && (
            <GrupoChips titulo="No te interesa" valores={b.criterios.excluye} onCambiar={(v) => setC('excluye', v)} placeholder="añadir" />
          )}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${LINEA2}` }}>
            <div style={{ ...ETIQUETA, marginBottom: 8 }}>Ya abierto ahora</div>
            <Encaja items={b.encaja.slice(0, 8)} onDescartar={(m) => setB({ encaja: b.encaja.filter((x) => x !== m) })} />
          </div>
          <div style={{ padding: '12px 16px' }}>
            <div style={{ ...ETIQUETA, marginBottom: 8 }}>Cuándo te aviso</div>
            <Frecuencias valor={b.frecuencia} onCambiar={(f) => setB({ frecuencia: f })} esPro={esPro} onUpsell={() => setUpsell(true)} />
            {b.frecuencia === 'inmediato' && (
              <div style={{ fontSize: 11.5, color: GRIS2, marginTop: 8, lineHeight: 1.5 }}>
                Reviso lo nuevo tres veces al día y te escribo en cuanto encuentro algo.
              </div>
            )}
            <div style={{ borderTop: `1px solid ${LINEA2}`, marginTop: 12, paddingTop: 12 }}>
              <RecordarPlazos valor={b.recordar_plazos} onCambiar={(v) => setB({ recordar_plazos: v })} esPro={esPro} onUpsell={() => setUpsell(true)} />
            </div>
          </div>
        </div>

        {trabajandoAviso}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Boton tipo="principal" onClick={activarBorrador} disabled={!!trabajando || !!progreso}>
            Activar alarma
          </Boton>
          <Boton
            onClick={() => {
              setTexto(b.pedido);
              setBorrador(null);
              setVista('lista');
              setTimeout(() => cajaRef.current?.focus(), 50);
            }}
            disabled={!!trabajando || !!progreso}
          >
            Ajustar con otra frase
          </Boton>
          <Boton
            onClick={() => {
              setBorrador(null);
              setVista('lista');
            }}
            disabled={!!trabajando || !!progreso}
          >
            Cancelar
          </Boton>
          <span style={{ fontSize: 12, color: GRIS, marginLeft: 'auto' }}>
            Usarás {activas.length + 1} de {limites.alarmas} {limites.alarmas === 1 ? 'alarma' : 'alarmas'}
          </span>
        </div>
      </div>
    );
  }

  // ============================ EDITAR ============================
  if (vista === 'editar' && editando) {
    const e = editando;
    const setE = (cambios) => setEditando((prev) => ({ ...prev, ...cambios }));
    const textoCambiado = e.descripcion.trim() !== e.descripcionOriginal.trim();
    const suyas = encajaDe(e.id);
    return (
      <div>
        {modalUpsell}
        {confirmando && (
          <Confirmar
            titulo={`¿Eliminar «${confirmando.nombre}»?`}
            texto="Dejará de vigilar y se borrará lo que ha encontrado. No se puede deshacer."
            accion="Eliminar"
            onConfirmar={() => borrar(confirmando)}
            onCancelar={() => setConfirmando(null)}
          />
        )}
        <button
          type="button"
          onClick={() => {
            setEditando(null);
            setVista('lista');
          }}
          style={{ fontSize: 12.5, color: GRIS, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 14 }}
        >
          ← Tus alarmas
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            value={e.nombre}
            onChange={(ev) => setE({ nombre: ev.target.value })}
            aria-label="Nombre de la alarma"
            style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.3px', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', color: TINTA, padding: 0, flex: 1, minWidth: 200 }}
          />
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: GRIS }}>
            {e.activa ? 'Vigilando' : e.pausada_por_plan ? 'En pausa por tu plan' : 'En pausa'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 230px', gap: 20, alignItems: 'start' }} className="alarma-edicion">
          <div>
            <div style={{ ...CARD, padding: '16px 18px' }}>
              <div style={{ ...ETIQUETA, marginBottom: 10 }}>Instrucciones</div>
              <TextoCreciente
                value={e.descripcion}
                onChange={(ev) => setE({ descripcion: ev.target.value })}
                rows={4}
                maxAltura={480}
                aria-label="Instrucciones de la alarma"
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, lineHeight: 1.7, fontFamily: 'inherit', color: '#2b2a26', padding: 0, background: 'transparent' }}
              />
              <div style={{ fontSize: 11.5, color: GRIS2, marginTop: 8, lineHeight: 1.5 }}>
                Escribe qué hace tu organización, qué quieres vigilar y qué no te interesa. Si cambias el texto, el agente lo vuelve a entender al guardar.
              </div>
            </div>

            <div style={{ ...CARD, padding: '14px 18px', marginTop: 12 }}>
              <div style={{ ...ETIQUETA, marginBottom: 10 }}>Cuándo te aviso</div>
              <Frecuencias valor={e.frecuencia} onCambiar={(f) => setE({ frecuencia: f })} esPro={esPro} onUpsell={() => setUpsell(true)} />
              <div style={{ borderTop: `1px solid ${LINEA2}`, marginTop: 12, paddingTop: 12 }}>
                <RecordarPlazos valor={e.recordar_plazos} onCambiar={(v) => setE({ recordar_plazos: v })} esPro={esPro} onUpsell={() => setUpsell(true)} />
              </div>
            </div>

            {trabajandoAviso}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Boton tipo="principal" onClick={guardarEdicion} disabled={!!trabajando || !!progreso}>
                {textoCambiado ? 'Guardar y volver a entender' : 'Guardar cambios'}
              </Boton>
              <Boton onClick={() => setConfirmando({ id: e.id, nombre: e.nombre })} disabled={!!trabajando || !!progreso}>
                Eliminar alarma
              </Boton>
            </div>

            <div style={{ ...CARD, padding: '14px 18px', marginTop: 16 }}>
              <div style={{ ...ETIQUETA, marginBottom: 10 }}>Lo que ha encontrado</div>
              <Encaja items={suyas.slice(0, 20)} onDescartar={descartar} vacio="Todavía no ha encontrado nada. Te avisaré en cuanto aparezca." />
            </div>
          </div>

          <div>
            <div style={{ ...ETIQUETA, marginBottom: 12 }}>Lo he entendido así</div>
            {[
              ['Temas', e.criterios.temas],
              ['Normativa', e.criterios.normativa],
              ['Dónde', e.criterios.territorios],
              ['Excluye', e.criterios.excluye],
            ]
              .filter(([, v]) => Array.isArray(v) && v.length > 0)
              .map(([t, v]) => (
                <div key={t} style={{ marginBottom: 16 }}>
                  <div style={{ ...ETIQUETA, marginBottom: 7 }}>{t}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {v.map((x) => (
                      <span key={x} style={{ fontSize: 11.5, border: `1px solid ${LINEA}`, borderRadius: 14, padding: '3px 9px', color: '#444' }}>
                        {x}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...ETIQUETA, marginBottom: 7 }}>Palabras que busca</div>
              <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6 }}>{(e.keywords || []).join(', ') || '—'}</div>
            </div>
            {textoCambiado && (
              <div style={{ fontSize: 12, color: MORADO_O, background: MORADO_S, borderRadius: 10, padding: '9px 11px', lineHeight: 1.5 }}>
                Has cambiado las instrucciones. Al guardar, el agente las volverá a entender.
              </div>
            )}
          </div>
        </div>
        <style>{`@media (max-width: 720px) { .alarma-edicion { grid-template-columns: 1fr !important; } }`}</style>
      </div>
    );
  }

  // ============================ LISTA ============================
  return (
    <div>
      {modalUpsell}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '6px 0 0' }}>
        {!enLimite ? (
          <>
            <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.4px', textAlign: 'center', margin: '4px 0 6px', textWrap: 'balance' }}>
              ¿Qué quieres que vigile?
            </h2>
            <p style={{ fontSize: 13, color: GRIS, textAlign: 'center', margin: '0 0 20px', lineHeight: 1.6 }}>
              Cuéntame a qué se dedica tu organización o qué te preocupa. Yo me encargo de buscar y de avisarte.
            </p>
            <div style={{ ...CARD, borderRadius: 20, padding: '16px 18px 12px', boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 10px 30px rgba(26,26,24,.05)' }}>
              <TextoCreciente
                ref={cajaRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  // Como en Claude: Intro envía y Mayúsculas + Intro hace
                  // un salto de línea. Mientras se compone un acento o una
                  // ñ con el teclado (isComposing) no se envía nada.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (!trabajando && !progreso) enviarCaja();
                  }
                }}
                rows={2}
                maxAltura={320}
                placeholder="Por ejemplo: somos una empresa de centros de datos con proyectos en Aragón y Madrid; nos preocupa el acceso a la red eléctrica…"
                aria-label="Describe tu organización o lo que quieres vigilar"
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14.5, lineHeight: 1.6, fontFamily: 'inherit', color: TINTA, padding: 0, background: 'transparent', minHeight: 48 }}
              />
              {conWeb && (
                <input
                  value={web}
                  onChange={(e) => setWeb(e.target.value)}
                  placeholder="https://www.tuorganizacion.es"
                  aria-label="Web de tu organización"
                  style={{ width: '100%', border: `1px solid ${LINEA}`, borderRadius: 10, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', margin: '6px 0 4px', outline: 'none' }}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setConWeb((v) => !v)}
                  style={{ fontSize: 11.5, color: GRIS, border: `1px solid ${LINEA}`, borderRadius: 14, padding: '4px 10px', background: '#fff', cursor: 'pointer' }}
                >
                  {conWeb ? 'Quitar la web' : '+ Pegar la web de tu organización'}
                </button>
                <button
                  type="button"
                  onClick={enviarCaja}
                  disabled={!!trabajando || !!progreso}
                  aria-label="Preparar alarma"
                  style={{ width: 32, height: 32, borderRadius: 10, background: MORADO, color: '#fff', border: 'none', cursor: trabajando || progreso ? 'default' : 'pointer', fontSize: 15, flexShrink: 0, opacity: trabajando || progreso ? 0.6 : 1 }}
                >
                  ↑
                </button>
              </div>
            </div>
            {trabajandoAviso}
            {!trabajando && !progreso && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 }}>
                {IDEAS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setTexto((t) => (t ? t : `${i}: `));
                      cajaRef.current?.focus();
                    }}
                    style={{ fontSize: 12.5, color: '#57534e', background: '#fff', border: `1px solid ${LINEA}`, borderRadius: 16, padding: '6px 12px', cursor: 'pointer' }}
                  >
                    {i}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : !esPro ? (
          <div style={{ border: '1px dashed #d8d5cc', borderRadius: 16, padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(255,255,255,.5)' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: MORADO_S, color: MORADO, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              ✦
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Con Pro, hasta 3 alarmas y avisos al momento</div>
              <div style={{ fontSize: 12.5, color: GRIS, lineHeight: 1.55, marginTop: 3 }}>
                Entérate el mismo día en que se abre un plazo, no el lunes siguiente.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Link href="/precios" style={{ fontSize: 12.5, fontWeight: 500, borderRadius: 10, padding: '8px 14px', background: MORADO, color: '#fff', textDecoration: 'none' }}>
                  Pasar a Pro
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: GRIS, textAlign: 'center', padding: '6px 0', lineHeight: 1.6 }}>
            Tienes las 3 alarmas activas de tu plan. Para crear otra, pon una en pausa.
          </div>
        )}

        {alarmas.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '32px 0 12px' }}>
              <span style={{ fontSize: 12, color: GRIS }}>{alarmas.length === 1 ? 'Tu alarma' : 'Tus alarmas'}</span>
              <Contador usadas={activas.length} limite={limites.alarmas} esPro={esPro} />
            </div>
            {alarmas.map((a) => {
              const n = avisosMes(a.id);
              const abiertas = encajaDe(a.id).filter((m) => etiquetaPlazo(m.plazo)).length;
              const freq = esPro ? a.frecuencia : 'semanal';
              return (
                <div key={a.id} style={{ ...CARD, padding: '16px 18px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        marginTop: 7,
                        flexShrink: 0,
                        background: a.activa ? MORADO : '#c9c6bd',
                        boxShadow: `0 0 0 4px ${a.activa ? MORADO_S : '#efede7'}`,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => abrirEdicion(a)}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <div style={{ fontSize: 14.5, fontWeight: 500, color: TINTA }}>{a.nombre}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: '#3a3935', marginTop: 4 }}>
                        {a.criterios?.resumen || a.descripcion}
                      </div>
                      <div style={{ fontSize: 11.5, color: GRIS2, marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {a.activa ? (
                          <span>
                            <b style={{ color: MORADO, fontWeight: 500 }}>Vigilando</b>
                            {a.evaluada_at ? ` · revisada ${haceCuanto(a.evaluada_at)}` : ''}
                          </span>
                        ) : (
                          <span>{a.pausada_por_plan ? 'En pausa: tu plan permite una alarma activa' : 'En pausa'}</span>
                        )}
                        <span>{n > 0 ? `${n} ${n === 1 ? 'aviso' : 'avisos'} este mes` : 'Sin avisos este mes'}</span>
                        {abiertas > 0 && <span style={{ color: MORADO_O }}>{abiertas} con plazo abierto</span>}
                        <span>{FRASE_FRECUENCIA[freq] || 'Los lunes'}</span>
                      </div>
                    </button>
                    <Interruptor activo={a.activa} onChange={() => alternar(a)} size="pequeno" etiqueta={`Alarma ${a.nombre}`} />
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div style={{ fontSize: 11.5, color: '#b8b4ac', lineHeight: 1.6, marginTop: 22, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            {correos
              ? `Los avisos van a ${email}. Lo que encuentren tus alarmas también se ve al entrar.`
              : 'Correos desactivados. Lo que encuentren tus alarmas seguirá apareciendo aquí.'}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: GRIS }}>
            Recibir correos
            <Interruptor activo={correos} onChange={cambiarCorreos} size="pequeno" etiqueta="Recibir correos de las alarmas" />
          </span>
        </div>
      </div>
    </div>
  );
}
