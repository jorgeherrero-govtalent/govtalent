'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import Interruptor from '@/components/Interruptor';

/**
 * Ajustes de avisos y gestión de alertas.
 *
 * Vive dentro de Seguimiento porque son las dos caras de lo mismo: qué
 * vigilo y cómo me lo cuentan. Separarlo en otra sección obligaría a
 * recordar dos sitios.
 *
 * Los dos correos —el diario y el resumen de los lunes— enlazan aquí
 * para darse de baja, así que esta pantalla también cumple lo que exige
 * la ley.
 */

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const LABEL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px' };

const FUENTES = [
  { id: 'congreso', label: 'Congreso' },
  { id: 'boe', label: 'BOE' },
  { id: 'comision', label: 'Comisión Europea' },
  { id: 'parlamento', label: 'Parlamento Europeo' },
];

function haceCuanto(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias < 1) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return 'hace más de un mes';
}

export default function AvisosTab() {
  const supabase = createClient();

  const [userId, setUserId] = useState(null);
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState({ diario: true, semanal: true });
  const [alertas, setAlertas] = useState([]);
  const [conteos, setConteos] = useState({});
  const [cargado, setCargado] = useState(false);
  const [editando, setEditando] = useState(null);
  // { tipo, nombre, alerta } — qué se confirma y sobre qué
  const [confirmando, setConfirmando] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        if (!cancelled) setCargado(true);
        return;
      }
      setUserId(uid);
      setEmail(auth.user.email || '');

      const [{ data: p }, { data: al }, { data: matches }] = await Promise.all([
        supabase.from('alert_preferences').select('*').eq('user_id', uid).limit(1).maybeSingle(),
        supabase.from('sector_alerts').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase
          .from('sector_alert_matches')
          .select('alert_id, avisado_at')
          .eq('user_id', uid)
          .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      ]);

      if (cancelled) return;
      // Sin preferencias guardadas, todo activo: quien no ha tocado nada
      // quiere enterarse.
      setPrefs({ diario: p?.diario ?? true, semanal: p?.semanal ?? true });
      setAlertas(al || []);

      // Cuántos avisos ha generado cada alerta: si una no salta nunca,
      // sus criterios son demasiado estrechos.
      const c = {};
      for (const m of matches || []) {
        if (!c[m.alert_id]) c[m.alert_id] = { n: 0, ultimo: null };
        c[m.alert_id].n += 1;
        if (m.avisado_at && (!c[m.alert_id].ultimo || m.avisado_at > c[m.alert_id].ultimo)) {
          c[m.alert_id].ultimo = m.avisado_at;
        }
      }
      setConteos(c);
      setCargado(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Solo al desactivar: dejar de recibir avisos tiene consecuencias y
  // conviene que sea deliberado. Activar no necesita confirmación.
  function pedirPref(campo, valor) {
    if (valor === false) {
      setConfirmando({ tipo: campo });
      return;
    }
    guardarPref(campo, valor);
  }

  async function guardarPref(campo, valor) {
    const nuevo = { ...prefs, [campo]: valor };
    setPrefs(nuevo);
    const { error } = await supabase.from('alert_preferences').upsert(
      {
        user_id: userId,
        diario: nuevo.diario,
        semanal: nuevo.semanal,
        email: nuevo.diario || nuevo.semanal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) {
      setPrefs(prefs);
      toast.error('No se ha podido guardar');
      return;
    }
    if (!nuevo.diario && !nuevo.semanal) {
      toast.info('No recibirás correos. Las novedades siguen visibles al entrar.');
    }
  }

  function pedirAlerta(a) {
    if (a.activa) {
      setConfirmando({ tipo: 'alerta', nombre: a.nombre, alerta: a });
      return;
    }
    alternarAlerta(a);
  }

  async function alternarAlerta(a) {
    const activa = !a.activa;
    setAlertas((prev) => prev.map((x) => (x.id === a.id ? { ...x, activa } : x)));
    const { error } = await supabase.from('sector_alerts').update({ activa }).eq('id', a.id);
    if (error) {
      setAlertas((prev) => prev.map((x) => (x.id === a.id ? { ...x, activa: !activa } : x)));
      toast.error('No se ha podido guardar');
    }
  }

  async function guardarAlerta(a) {
    // El editor manda _borrar desde su botón de eliminar: así el editor
    // no necesita conocer la función de borrado.
    if (a._borrar) {
      setConfirmando({ tipo: 'borrar', nombre: a.nombre, alerta: a });
      return;
    }

    const limpio = {
      nombre: (a.nombre || '').trim() || 'Sin nombre',
      keywords: (a.keywords || []).map((k) => k.trim()).filter(Boolean),
      fuentes: a.fuentes || [],
      activa: a.activa ?? true,
    };
    if (limpio.keywords.length === 0) {
      toast.info('Añade al menos una palabra clave.');
      return;
    }

    if (a.id) {
      const { error } = await supabase.from('sector_alerts').update(limpio).eq('id', a.id);
      if (error) return toast.error('No se ha podido guardar');
      setAlertas((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...limpio } : x)));
      toast('Alerta actualizada');
    } else {
      const { data, error } = await supabase
        .from('sector_alerts')
        .insert({ ...limpio, user_id: userId, frecuencia: 'diario' })
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) return toast.error('No se ha podido crear');
      setAlertas((prev) => [data, ...prev]);
      toast('Te avisaremos cuando aparezca algo que encaje.');
    }
    setEditando(null);
  }

  async function borrarAlerta(a) {
    setAlertas((prev) => prev.filter((x) => x.id !== a.id));
    const { error } = await supabase.from('sector_alerts').delete().eq('id', a.id);
    if (error) {
      setAlertas((prev) => [...prev, a]);
      toast.error('No se ha podido borrar');
      return;
    }
    setEditando(null);
    toast.info('Alerta eliminada');
  }

  if (!cargado) return <div className="spinner"></div>;

  if (!userId) {
    return (
      <div className="card">
        <div className="empty-state">
          <i className="ti ti-bell"></i>
          Inicia sesión para configurar tus avisos.
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
        <div style={{ ...LABEL, marginBottom: 16 }}>CUÁNDO TE ESCRIBIMOS</div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '11px 0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Cuando aparece algo de tu sector</div>
            <div style={{ fontSize: 12, color: '#8b8780', lineHeight: 1.55, marginTop: 3 }}>
              Un correo por la mañana si se ha publicado o movido algo que encaja con tus alertas. Si no hay nada, no
              escribimos.
            </div>
          </div>
          <Interruptor activo={prefs.diario} onChange={() => pedirPref('diario', !prefs.diario)} />
        </div>

        <div
          style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '11px 0', borderTop: '.5px solid #f2f0ec' }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Resumen de los lunes</div>
            <div style={{ fontSize: 12, color: '#8b8780', lineHeight: 1.55, marginTop: 3 }}>
              Lo que se ha movido en los asuntos que sigues durante la semana.
            </div>
          </div>
          <Interruptor activo={prefs.semanal} onChange={() => pedirPref('semanal', !prefs.semanal)} />
        </div>

        <div
          style={{
            fontSize: 11,
            color: '#b8b4ac',
            paddingTop: 14,
            marginTop: 8,
            borderTop: '.5px solid #f2f0ec',
            lineHeight: 1.55,
          }}
        >
          Los avisos van a {email}. Puedes desactivarlos todos y seguir viendo las novedades al entrar.
        </div>
      </div>

      <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 10, flexWrap: 'wrap' }}>
          <div style={LABEL}>TUS ALERTAS</div>
          {!editando && (
            <button
              type="button"
              onClick={() => setEditando({ nombre: '', keywords: [], fuentes: FUENTES.map((f) => f.id), activa: true })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#6d5aef',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                padding: '7px 13px',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: 13 }}></i> Nueva alerta
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#8b8780', marginBottom: 16 }}>
          Cada alerta vigila lo que se publica y te avisa de lo que encaja.
        </div>

        {editando && <Editor alerta={editando} onChange={setEditando} onGuardar={guardarAlerta} onCancelar={() => setEditando(null)} />}

        {alertas.length === 0 && !editando ? (
          <div style={{ fontSize: 12.5, color: '#8b8780', padding: '10px 0', borderTop: '.5px solid #f2f0ec', lineHeight: 1.6 }}>
            No tienes alertas todavía. Crea una o deja que la analicemos por ti desde tu sector.
          </div>
        ) : (
          alertas.map((a) => {
            const c = conteos[a.id];
            const enEdicion = editando?.id === a.id;
            if (enEdicion) return null;
            return (
              <div key={a.id} style={{ borderTop: '.5px solid #f2f0ec', padding: '15px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 11 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: a.activa ? '#1a1a18' : '#8b8780' }}>
                      {a.nombre}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#a8a49c', marginTop: 3 }}>
                      {!a.activa
                        ? 'Desactivada · sin avisos'
                        : c?.n > 0
                          ? `${c.n} ${c.n === 1 ? 'aviso' : 'avisos'} en el último mes${
                              c.ultimo ? ` · último ${haceCuanto(c.ultimo)}` : ''
                            }`
                          : 'Sin avisos en el último mes'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditando({ ...a })}
                    style={{ fontSize: 12, color: '#8b8780', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  >
                    Editar
                  </button>
                  <Interruptor activo={a.activa} onChange={() => pedirAlerta(a)} size="pequeno" />
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {(a.keywords || []).slice(0, 3).map((k) => (
                    <span
                      key={k}
                      style={{
                        fontSize: 11,
                        color: a.activa ? '#57534e' : '#a8a49c',
                        background: a.activa ? '#f5f4f1' : '#faf9f7',
                        padding: '4px 10px',
                        borderRadius: 13,
                      }}
                    >
                      {k}
                    </span>
                  ))}
                  {(a.keywords || []).length > 3 && (
                    <span style={{ fontSize: 11, color: '#a8a49c', padding: '4px 4px' }}>
                      y {a.keywords.length - 3} más
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {confirmando && (
        <ConfirmarBaja
          tipo={confirmando.tipo}
          nombre={confirmando.nombre}
          onConfirmar={() => {
            const c = confirmando;
            setConfirmando(null);
            if (c.tipo === 'alerta') alternarAlerta(c.alerta);
            else if (c.tipo === 'borrar') borrarAlerta(c.alerta);
            else guardarPref(c.tipo, false);
          }}
          onCancelar={() => setConfirmando(null)}
        />
      )}

      <div style={{ ...CARD, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 34,
              height: 34,
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
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>¿No sabes qué vigilar?</div>
            <div style={{ fontSize: 12, color: '#8b8780', marginTop: 3, lineHeight: 1.5 }}>
              Describe tu organización y proponemos los criterios por ti.
            </div>
          </div>
          <Link
            href="/regulatorio/sector"
            style={{ fontSize: 12.5, color: '#6d5aef', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Analizar mi sector →
          </Link>
        </div>
      </div>
    </>
  );
}

/**
 * Confirmación al desactivar los avisos.
 *
 * Dice qué se pierde exactamente, no un "¿estás seguro?" genérico: sin
 * eso el usuario no sabe qué está decidiendo.
 *
 * Lleva X arriba a la derecha además del clic fuera, como el resto de
 * modales de la plataforma.
 */
function ConfirmarBaja({ tipo, nombre, onConfirmar, onCancelar }) {
  const textos = {
    diario: {
      titulo: 'Dejar de recibir avisos diarios',
      cuerpo:
        'Ya no te escribiremos cuando se publique o se mueva algo que encaja con tus alertas. Seguirás viéndolo al entrar en la plataforma.',
      accion: 'Desactivar',
    },
    semanal: {
      titulo: 'Dejar de recibir el resumen de los lunes',
      cuerpo:
        'Ya no te escribiremos con lo que se ha movido en los asuntos que sigues. Seguirás viéndolo en Seguimiento.',
      accion: 'Desactivar',
    },
    alerta: {
      titulo: `Desactivar «${nombre}»`,
      cuerpo:
        'Dejará de vigilar lo que se publica. Los criterios se conservan y puedes volver a activarla cuando quieras.',
      accion: 'Desactivar',
    },
    // El borrado es lo único que no tiene vuelta atrás, y el texto lo
    // dice: sin eso alguien confunde desactivar con eliminar.
    borrar: {
      titulo: `Eliminar «${nombre}»`,
      cuerpo: 'Se perderán sus criterios y no podrás recuperarlos. Si solo quieres una pausa, desactívala en su lugar.',
      accion: 'Eliminar',
    },
  };
  const t = textos[tipo] || textos.diario;

  return (
    <div
      onClick={onCancelar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,26,24,.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 9998,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 22,
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 12px 40px rgba(0,0,0,.18)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'none',
            border: 'none',
            color: '#b8b4ac',
            cursor: 'pointer',
            padding: 4,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          <i className="ti ti-x"></i>
        </button>

        <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-.15px', marginBottom: 8, paddingRight: 24 }}>
          {t.titulo}
        </div>
        <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, marginBottom: 20 }}>{t.cuerpo}</div>

        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancelar}
            style={{
              fontSize: 12.5,
              color: '#57534e',
              background: '#f5f4f1',
              border: 'none',
              borderRadius: 8,
              padding: '9px 16px',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: '#fff',
              background: '#6d5aef',
              border: 'none',
              borderRadius: 8,
              padding: '9px 16px',
              cursor: 'pointer',
            }}
          >
            {t.accion}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * El editor de una alerta.
 *
 * Las palabras se añaden de una en una con Enter: pegar una lista
 * separada por comas también funciona, porque nadie recuerda el formato
 * esperado.
 */
function Editor({ alerta, onChange, onGuardar, onCancelar }) {
  const [texto, setTexto] = useState('');

  function anadir() {
    const nuevas = texto
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 3 && !(alerta.keywords || []).includes(t));
    if (nuevas.length === 0) return;
    onChange({ ...alerta, keywords: [...(alerta.keywords || []), ...nuevas] });
    setTexto('');
  }

  return (
    <div style={{ borderTop: '.5px solid #f2f0ec', paddingTop: 16, marginBottom: 4 }}>
      <input
        value={alerta.nombre}
        onChange={(e) => onChange({ ...alerta, nombre: e.target.value })}
        placeholder="Nombre de la alerta"
        aria-label="Nombre de la alerta"
        style={{
          width: '100%',
          background: '#faf9f7',
          border: 'none',
          borderRadius: 8,
          padding: '11px 14px',
          fontSize: 13,
          outline: 'none',
          marginBottom: 16,
          fontFamily: 'inherit',
        }}
      />

      <div style={{ ...LABEL, marginBottom: 9 }}>PALABRAS CLAVE</div>
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
          background: '#faf9f7',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 16,
        }}
      >
        {(alerta.keywords || []).map((k) => (
          <span
            key={k}
            style={{
              fontSize: 12,
              color: '#3C3489',
              background: '#f0eefe',
              padding: '5px 11px',
              borderRadius: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            {k}
            <button
              type="button"
              onClick={() => onChange({ ...alerta, keywords: alerta.keywords.filter((x) => x !== k) })}
              aria-label={`Quitar ${k}`}
              style={{ background: 'none', border: 'none', color: '#a99ff0', cursor: 'pointer', padding: 0, fontSize: 13 }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              anadir();
            }
          }}
          onBlur={anadir}
          placeholder="Añadir palabra…"
          aria-label="Añadir palabra clave"
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, flex: '1 1 120px', fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ ...LABEL, marginBottom: 9 }}>DÓNDE BUSCAR</div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 18 }}>
        {FUENTES.map((f) => {
          const activo = (alerta.fuentes || []).includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() =>
                onChange({
                  ...alerta,
                  fuentes: activo
                    ? alerta.fuentes.filter((x) => x !== f.id)
                    : [...(alerta.fuentes || []), f.id],
                })
              }
              style={{
                fontSize: 12,
                padding: '6px 13px',
                borderRadius: 16,
                cursor: 'pointer',
                background: activo ? '#f0eefe' : '#fff',
                border: `.5px solid ${activo ? '#6d5aef' : '#e0dfd8'}`,
                color: activo ? '#3C3489' : '#57534e',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onGuardar(alerta)}
          style={{
            background: '#6d5aef',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '9px 17px',
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {alerta.id ? 'Guardar' : 'Crear alerta'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          style={{ fontSize: 12.5, color: '#8b8780', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 6px' }}
        >
          Cancelar
        </button>
        {alerta.id && (
          <>
            <div style={{ flex: 1 }}></div>
            <button
              type="button"
              onClick={() => onGuardar({ ...alerta, _borrar: true })}
              style={{ fontSize: 12, color: '#b8b4ac', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 6px' }}
            >
              Eliminar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
