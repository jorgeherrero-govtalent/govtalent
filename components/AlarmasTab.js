'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
// La pantalla
// ---------------------------------------------------------------------

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
  const [trabajando, setTrabajando] = useState(null); // texto de lo que está haciendo el agente
  const [borrador, setBorrador] = useState(null);
  const [editando, setEditando] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [upsell, setUpsell] = useState(false);
  const cajaRef = useRef(null);

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

  const encajaDe = (alertId) => encaja.filter((m) => m.alert_id === alertId);
  const avisosMes = (alertId) =>
    encaja.filter((m) => m.alert_id === alertId && m.avisado_at && Date.now() - new Date(m.avisado_at).getTime() < 30 * 86400000).length;

  // --- Pedir una propuesta al agente ------------------------------------
  async function pedirPropuesta({ textoPedido, webPedida, base }) {
    setTrabajando(webPedida ? 'Leyendo la web y preparando la alarma…' : 'Preparando la alarma…');
    try {
      const res = await fetch('/api/alarmas/proponer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoPedido, web: webPedida || '' }),
      });
      const datos = await res.json();
      if (!res.ok) {
        if (datos?.limite && !esPro) setUpsell(true);
        toast.error(datos?.error || 'El agente no ha podido preparar la alarma.');
        return null;
      }
      if (datos.aviso_web) toast.info(datos.aviso_web);
      return { ...datos, base };
    } catch {
      toast.error('No se ha podido contactar con el agente.');
      return null;
    } finally {
      setTrabajando(null);
    }
  }

  async function enviarCaja() {
    const t = texto.trim();
    const w = conWeb ? web.trim() : '';
    if (t.length < 20 && !w) {
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
      message="Con Pro tienes hasta 3 alarmas y te avisamos el mismo día en que se abre un plazo, no el lunes siguiente."
      onClose={() => setUpsell(false)}
    />
  );

  const trabajandoAviso = trabajando && (
    <div
      role="status"
      style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: MORADO_O, background: MORADO_S, borderRadius: 12, padding: '10px 14px', margin: '12px 0' }}
    >
      <span className="spinner" style={{ width: 14, height: 14, margin: 0 }}></span>
      {trabajando}
    </div>
  );

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
          </div>
        </div>

        {trabajandoAviso}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Boton tipo="principal" onClick={activarBorrador} disabled={!!trabajando}>
            Activar alarma
          </Boton>
          <Boton
            onClick={() => {
              setTexto(b.pedido);
              setBorrador(null);
              setVista('lista');
              setTimeout(() => cajaRef.current?.focus(), 50);
            }}
            disabled={!!trabajando}
          >
            Ajustar con otra frase
          </Boton>
          <Boton
            onClick={() => {
              setBorrador(null);
              setVista('lista');
            }}
            disabled={!!trabajando}
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
              <textarea
                value={e.descripcion}
                onChange={(ev) => setE({ descripcion: ev.target.value })}
                rows={7}
                aria-label="Instrucciones de la alarma"
                style={{ width: '100%', border: 'none', outline: 'none', resize: 'vertical', fontSize: 14, lineHeight: 1.7, fontFamily: 'inherit', color: '#2b2a26', padding: 0, background: 'transparent' }}
              />
              <div style={{ fontSize: 11.5, color: GRIS2, marginTop: 8, lineHeight: 1.5 }}>
                Escribe qué hace tu organización, qué quieres vigilar y qué no te interesa. Si cambias el texto, el agente lo vuelve a entender al guardar.
              </div>
            </div>

            <div style={{ ...CARD, padding: '14px 18px', marginTop: 12 }}>
              <div style={{ ...ETIQUETA, marginBottom: 10 }}>Cuándo te aviso</div>
              <Frecuencias valor={e.frecuencia} onCambiar={(f) => setE({ frecuencia: f })} esPro={esPro} onUpsell={() => setUpsell(true)} />
            </div>

            {trabajandoAviso}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Boton tipo="principal" onClick={guardarEdicion} disabled={!!trabajando}>
                {textoCambiado ? 'Guardar y volver a entender' : 'Guardar cambios'}
              </Boton>
              <Boton onClick={() => setConfirmando({ id: e.id, nombre: e.nombre })} disabled={!!trabajando}>
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
              <textarea
                ref={cajaRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviarCaja();
                }}
                rows={3}
                placeholder="Por ejemplo: somos una empresa de centros de datos con proyectos en Aragón y Madrid; nos preocupa el acceso a la red eléctrica…"
                aria-label="Describe tu organización o lo que quieres vigilar"
                style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontSize: 14.5, lineHeight: 1.6, fontFamily: 'inherit', color: TINTA, padding: 0, background: 'transparent' }}
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
                  disabled={!!trabajando}
                  aria-label="Preparar alarma"
                  style={{ width: 32, height: 32, borderRadius: 10, background: MORADO, color: '#fff', border: 'none', cursor: trabajando ? 'default' : 'pointer', fontSize: 15, flexShrink: 0, opacity: trabajando ? 0.6 : 1 }}
                >
                  ↑
                </button>
              </div>
            </div>
            {trabajandoAviso}
            {!trabajando && (
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
