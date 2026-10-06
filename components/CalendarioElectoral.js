'use client';

/**
 * Franja del calendario electoral, arriba de Novedades.
 *
 * Plegada en una línea (próximo hito y días que faltan); al pulsarla se
 * despliega la línea de hitos con «Añadir a mi calendario» y «Ocultar».
 * Ocultar se guarda en usuario_marcas, así no vuelve a salir en otro
 * dispositivo. Desaparece sola el 30 de noviembre.
 *
 * El modal enseña los eventos que se van a añadir antes de que el
 * usuario elija su aplicación (maqueta B). Las tres opciones son una
 * suscripción al mismo calendario: si cambia una fecha, se actualiza.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import {
  ELECCIONES,
  HITOS,
  enlacesCalendario,
  fechaHito,
  fechaHitoLarga,
  situacionElectoral,
} from '@/lib/calendarioElectoral';

const MORADO = '#6d5aef';
const MORADO_S = '#f0eefe';
const MORADO_O = '#3c3489';
const GRIS = '#8b8780';
const LINEA = '#e6e4dc';
const TINTA = '#1a1a18';

const SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://govtalent.app';

export default function CalendarioElectoral() {
  const supabase = createClient();
  const situacion = useMemo(() => situacionElectoral(), []);
  // null mientras se comprueba: no se enseña nada hasta saberlo, para
  // que no aparezca y desaparezca a quien la ocultó.
  const [oculto, setOculto] = useState(null);
  const [userId, setUserId] = useState(null);
  const [abierta, setAbierta] = useState(false);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    if (!situacion) return;
    let vivo = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!vivo) return;
      if (!user) {
        setOculto(true);
        return;
      }
      setUserId(user.id);
      const { data } = await supabase
        .from('usuario_marcas')
        .select('clave')
        .eq('user_id', user.id)
        .eq('clave', ELECCIONES.claveOculto)
        .limit(1)
        .maybeSingle();
      if (vivo) setOculto(!!data);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!situacion || oculto !== false) return null;

  async function ocultar() {
    setOculto(true);
    const { error } = await supabase.from('usuario_marcas').insert({ user_id: userId, clave: ELECCIONES.claveOculto });
    // Si ya estaba (otra pestaña), la clave duplicada no es un fallo.
    if (error && error.code !== '23505') {
      setOculto(false);
      toast.error('No se ha podido ocultar. Inténtalo de nuevo.');
    }
  }

  const { proximo, estadoProximo, diasParaElecciones, hitos } = situacion;
  const nombre = proximo ? <b style={{ color: TINTA, fontWeight: 600 }}>{proximo.frase}</b> : null;

  let siguiente;
  if (diasParaElecciones === 0) siguiente = <>Hoy se vota</>;
  else if (proximo && estadoProximo === 'hoy') siguiente = <>Hoy: {nombre}</>;
  else if (proximo && estadoProximo === 'en_curso')
    siguiente = (
      <>
        Ahora: {nombre}, hasta {fechaHitoLarga({ ...proximo, inicio: proximo.fin })}
      </>
    );
  else if (proximo)
    siguiente = (
      <>
        Próximo: {nombre}, {fechaHitoLarga(proximo)}
      </>
    );

  return (
    <section
      aria-label="Calendario electoral"
      style={{ background: '#fff', border: `1px solid ${LINEA}`, borderRadius: 14, marginBottom: 16 }}
    >
      <style>{`
        .ce-cabecera { display: flex; align-items: center; gap: 14px; width: 100%; padding: 12px 16px; background: none; border: none; text-align: left; cursor: pointer; font-family: inherit; color: inherit; border-radius: 14px; }
        .ce-cabecera:focus-visible { outline: 2px solid ${MORADO}; outline-offset: 2px; }
        .ce-linea { display: flex; overflow-x: auto; padding: 4px 16px 14px; }
        .ce-hito { flex: 1 0 112px; display: flex; flex-direction: column; gap: 5px; position: relative; padding-right: 10px; }
        .ce-hito::before { content: ''; position: absolute; top: 5px; left: 12px; right: 0; height: 2px; background: ${LINEA}; }
        .ce-hito:last-child::before { display: none; }
        .ce-punto { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid ${MORADO}; position: relative; z-index: 1; }
        .ce-hito.pasado .ce-punto { background: ${MORADO}; }
        .ce-hito.pasado .ce-nombre { color: ${GRIS}; font-weight: 500; }
        @media (max-width: 560px) { .ce-dias { display: none; } }
      `}</style>

      <button type="button" className="ce-cabecera" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: MORADO_O, fontWeight: 600 }}>
            {ELECCIONES.nombre} · 29 de noviembre
          </span>
          {siguiente && <span style={{ fontSize: 12.5, color: GRIS, lineHeight: 1.45 }}>{siguiente}</span>}
        </span>
        {diasParaElecciones > 0 && (
          <span className="ce-dias" style={{ fontSize: 12, color: GRIS, whiteSpace: 'nowrap' }}>
            <b style={{ fontSize: 20, color: MORADO_O, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {diasParaElecciones}
            </b>{' '}
            {diasParaElecciones === 1 ? 'día' : 'días'}
          </span>
        )}
        <i
          className={`ti ti-chevron-${abierta ? 'up' : 'down'}`}
          style={{ fontSize: 16, color: GRIS, flexShrink: 0 }}
          aria-hidden="true"
        ></i>
      </button>

      {abierta && (
        <>
          <div className="ce-linea">
            {hitos.map((h) => (
              <div key={h.id} className={`ce-hito ${h.estado === 'pasado' ? 'pasado' : ''}`}>
                <span className="ce-punto"></span>
                <span style={{ fontSize: 11, color: GRIS, fontVariantNumeric: 'tabular-nums' }}>{fechaHito(h)}</span>
                <span className="ce-nombre" style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: TINTA }}>
                  {h.titulo}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 16px 14px' }}>
            <button type="button" onClick={() => setModal(true)} style={boton(true)}>
              <i className="ti ti-calendar-plus" style={{ fontSize: 14 }} aria-hidden="true"></i>
              Añadir a mi calendario
            </button>
            <button type="button" onClick={ocultar} style={boton(false)}>
              Ocultar
            </button>
          </div>
        </>
      )}

      {modal && <ModalCalendario onCerrar={() => setModal(false)} />}
    </section>
  );
}

function boton(principal) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12.5,
    fontWeight: 500,
    padding: '7px 13px',
    borderRadius: 9,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textDecoration: 'none',
    border: principal ? `1px solid ${MORADO}` : `1px solid ${LINEA}`,
    background: principal ? MORADO : '#fff',
    color: principal ? '#fff' : TINTA,
  };
}

function ModalCalendario({ onCerrar }) {
  const enlaces = enlacesCalendario(SITE_URL);

  useEffect(() => {
    const alPulsar = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,26,24,.35)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ce-modal-titulo"
        style={{ background: '#fff', borderRadius: 16, padding: '22px 22px 18px', maxWidth: 420, width: '100%', position: 'relative' }}
      >
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'none', fontSize: 18, color: GRIS, cursor: 'pointer' }}
        >
          ×
        </button>
        <div id="ce-modal-titulo" style={{ fontSize: 15, fontWeight: 600, paddingRight: 24 }}>
          Calendario de las elecciones
        </div>
        <div style={{ fontSize: 12.5, color: GRIS, marginTop: 3, marginBottom: 14 }}>Se añadirán estos eventos</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: '#faf9f5', borderRadius: 10, marginBottom: 16 }}>
          {HITOS.filter((h) => h.enCalendario).map((h) => (
            <div key={h.id} style={{ display: 'flex', gap: 12, fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ width: 72, flexShrink: 0, fontSize: 12, color: GRIS, fontVariantNumeric: 'tabular-nums' }}>
                {fechaHito(h)}
              </span>
              <span style={{ color: TINTA }}>{h.titulo}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={enlaces.google} target="_blank" rel="noopener noreferrer" style={boton(true)} onClick={onCerrar}>
            Google Calendar
          </a>
          <a href={enlaces.webcal} style={boton(false)} onClick={onCerrar}>
            Apple Calendar
          </a>
          <a href={enlaces.webcal} style={boton(false)} onClick={onCerrar}>
            Outlook
          </a>
        </div>

        <div style={{ fontSize: 12, color: GRIS, lineHeight: 1.55, marginTop: 14 }}>
          Se actualiza solo si cambia una fecha.{' '}
          <a href={enlaces.https} download style={{ color: MORADO, textDecoration: 'none' }}>
            Descargar .ics
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
