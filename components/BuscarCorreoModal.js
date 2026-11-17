'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { CREDITOS_CORREO, CREDITOS_CORREO_FUERA, creditosTexto } from '@/lib/costesCreditos';
import {
  ModalComprar,
  ModalGuardarLista,
  etiquetaEnriquecido,
  etiquetaProbable,
  estiloEtiquetaProbable,
  VerificarCorreo,
  TIPO_CONTACTO,
  AYUDA_PROBABLE,
  limpiarEmail,
  miles,
  Buscando,
  ESTILOS_CONTACTOS,
  avisarSaldo,
} from '@/components/ContactosUI';

/**
 * Buscar el correo de una persona que la fuente no trae (Directorio).
 *
 * Usa el mismo motor que «Enriquecer» en Contactos (/api/contactos/enriquecer):
 * Claude busca en fuentes oficiales y cita de dónde sale el dato. Cuesta
 * 6 créditos, esté o no en el directorio (11-11-2026), y solo se descuentan si lo encuentra; si alguien ya lo había
 * buscado, sale al momento y gratis (caché compartida, sql/76).
 *
 * Antes de buscar fuera, se mira dentro (17-11-2026): si el nombre escrito
 * coincide con alguien del directorio, se enseña esa persona con su correo
 * y no se cobra nada. Solo si el usuario dice que no es ninguna de ellas se
 * ofrece la búsqueda de 6 créditos.
 *
 * persona: { id (de directorio_pro), nombre, cargo }
 *       o, si no está en el directorio: { libre: true, nombre, institucion }
 * onResultado(resultado): cuando hay respuesta, para pintarla en la ficha.
 */

const BORDE = '#e0dfd8';
const GRIS = '#6b6b70';

export default function BuscarCorreoModal({ persona, onClose, onResultado }) {
  const [saldo, setSaldo] = useState(null);
  const [packs, setPacks] = useState([]);
  // mirando (¿está ya en el directorio?) | dentro | inicio | buscando | hecho | error
  const [fase, setFase] = useState(persona.libre ? 'mirando' : 'inicio');
  // Quienes coinciden dentro del directorio, y si el usuario los ha descartado.
  const [dentro, setDentro] = useState([]);
  const [descartados, setDescartados] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [cobrado, setCobrado] = useState(false);
  const [error, setError] = useState('');
  const [comprar, setComprar] = useState(false);

  // El saldo se ve en la tarjeta del plan del menú lateral.
  useEffect(() => {
    avisarSaldo(saldo);
  }, [saldo]);
  // Añadir a una lista lo encontrado (también a quien no está en el directorio).
  const [personaId, setPersonaId] = useState(persona.libre ? null : persona.id);
  const [aLista, setALista] = useState(false);
  const [listaHecha, setListaHecha] = useState(null);
  // Fuera del directorio (13-10-2026): el correo deducido, con «Verificar»;
  // el alta en el directorio y el contacto genérico de respaldo.
  const [probable, setProbable] = useState(null);
  const [alta, setAlta] = useState(null);
  const [respaldo, setRespaldo] = useState(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/creditos', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j) return;
        setSaldo(j.saldo || null);
        setPacks(j.packs || []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // Antes de ofrecer la búsqueda de pago: ¿está ya en el directorio?
  useEffect(() => {
    if (!persona.libre) return undefined;
    let vivo = true;
    fetch('/api/contactos/enriquecer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: { nombre: persona.nombre, institucion: persona.institucion }, soloDentro: true }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo) return;
        const lista = Array.isArray(j?.dentro) ? j.dentro : [];
        setDentro(lista);
        setFase((f) => (f === 'mirando' ? (lista.length ? 'dentro' : 'inicio') : f));
      })
      .catch(() => vivo && setFase((f) => (f === 'mirando' ? 'inicio' : f)));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscar() {
    setFase('buscando');
    setError('');
    try {
      const res = await fetch('/api/contactos/enriquecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          persona.libre
            ? { persona: { nombre: persona.nombre, institucion: persona.institucion }, ...(descartados ? { forzar: true } : {}) }
            : { id: persona.id }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (json.saldo) setSaldo(json.saldo);
      // El servidor la ha encontrado dentro: se enseña y no se cobra.
      if (res.ok && Array.isArray(json.dentro) && json.dentro.length) {
        setDentro(json.dentro);
        setFase('dentro');
        return;
      }
      if (json.sinCreditos) {
        // Sin créditos suficientes: la compra, sin dejar un error.
        setFase('inicio');
        setComprar(true);
        return;
      }
      if (!res.ok) {
        setError(json.error || 'No se pudo completar la búsqueda. No se ha descontado ningún crédito.');
        setFase('error');
        return;
      }
      setResultado(json.resultado);
      if (json.persona_id) setPersonaId(json.persona_id);
      setProbable(json.probable || null);
      setAlta(json.alta ? { cargo: json.cargo, institucion: json.institucion } : null);
      setRespaldo(json.respaldo || null);
      setCobrado(!!json.cobrado);
      setFase('hecho');
      if (onResultado) onResultado(json.resultado);
    } catch {
      setError('No se pudo completar la búsqueda. No se ha descontado ningún crédito.');
      setFase('error');
    }
  }

  if (typeof document === 'undefined') return null;

  if (comprar) {
    return createPortal(<ModalComprar packs={packs} onClose={() => setComprar(false)} />, document.body);
  }
  if (aLista && personaId) {
    return createPortal(
      <>
        <style>{ESTILOS_CONTACTOS}</style>
        <ModalGuardarLista
          modo="seleccion"
          cuantos={1}
          ids={[personaId]}
          consulta={persona.nombre}
          onClose={() => setALista(false)}
          onHecho={(listaId) => {
            setListaHecha(listaId);
            setALista(false);
          }}
        />
      </>,
      document.body
    );
  }

  const coste = persona.libre ? CREDITOS_CORREO_FUERA : CREDITOS_CORREO;
  const disponibles = saldo?.disponibles ?? null;
  const sinCreditos = disponibles !== null && disponibles < coste;
  const email = probable?.email || (resultado?.estado === 'encontrado' ? limpiarEmail(resultado.email) : null);
  const buscando = fase === 'buscando';
  const mirando = fase === 'mirando';
  const enDentro = fase === 'dentro';

  return createPortal(
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && !buscando && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="buscar-correo-titulo" style={{ maxWidth: 460 }}>
        <div className="modal-head" style={{ borderBottom: 'none', paddingBottom: 6, marginBottom: 6 }}>
          <h2 id="buscar-correo-titulo" style={{ fontSize: 17 }}>
            Buscar correo
          </h2>
          <button type="button" className="modal-x" onClick={() => !buscando && onClose()} aria-label="Cerrar">
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <div style={{ fontSize: 13, color: '#1a1a18', fontWeight: 600 }}>{persona.nombre}</div>
        {persona.cargo || persona.libre ? (
          <div style={{ fontSize: 12, color: GRIS, marginTop: 2 }}>{persona.libre ? persona.institucion : persona.cargo}</div>
        ) : null}

        {enDentro ? (
          <>
            <p style={{ fontSize: 13, color: '#555', margin: '14px 0 0', lineHeight: 1.6 }}>
              {dentro.length === 1 ? 'Ya está en GovTalent.' : `Hay ${dentro.length} personas en GovTalent que coinciden.`} No se ha descontado ningún crédito.
            </p>
            <div style={{ marginTop: 12, border: `.5px solid ${BORDE}`, borderRadius: 10 }}>
              {dentro.map((d, i) => {
                const correo = d.email || d.probable?.email || null;
                return (
                  <div key={d.id} style={{ padding: '12px 14px', borderTop: i ? `.5px solid ${BORDE}` : 'none', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ fontSize: 13, color: '#1a1a18', fontWeight: 600 }}>{d.nombre}</div>
                      <div style={{ fontSize: 12, color: GRIS, lineHeight: 1.45 }}>{[d.cargo, d.institucion].filter(Boolean).join(', ')}</div>
                      {correo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                          <i className="ti ti-mail" style={{ fontSize: 15, color: '#6d5aef' }} aria-hidden="true"></i>
                          <a href={`mailto:${correo}`} style={{ fontSize: 13, color: '#1a1a18', textDecoration: 'none', fontWeight: 600, overflowWrap: 'anywhere' }}>
                            {correo}
                          </a>
                          {!d.email && d.probable ? (
                            <span style={{ fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: '1px 7px', ...estiloEtiquetaProbable(d.probable) }}>
                              {etiquetaProbable(d.probable)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn-g"
                      onClick={() => {
                        setPersonaId(d.id);
                        setALista(true);
                      }}
                      title="Añadir a una lista"
                      aria-label={`Añadir a ${d.nombre} a una lista`}
                      style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 8px', flexShrink: 0 }}
                    >
                      <i className="ti ti-list-check" aria-hidden="true"></i>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : fase === 'hecho' ? (
          <div style={{ marginTop: 16, border: `.5px solid ${BORDE}`, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {email ? (
              <>
                {email ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <i className="ti ti-mail" style={{ fontSize: 15, color: '#6d5aef' }} aria-hidden="true"></i>
                    <a href={`mailto:${email}`} style={{ fontSize: 13.5, color: '#1a1a18', textDecoration: 'none', fontWeight: 600, overflowWrap: 'anywhere' }}>
                      {email}
                    </a>
                    <span style={{ fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: '1px 7px', ...(probable ? estiloEtiquetaProbable(probable) : { color: '#3d2fb3', background: '#efedfd' }) }}>
                      {probable ? etiquetaProbable(probable) : etiquetaEnriquecido(resultado)}
                    </span>
                  </div>
                ) : null}
                {probable ? (
                  <>
                    <div>
                      <VerificarCorreo
                        id={(alta || !persona.libre) && personaId ? personaId : null}
                        persona={(alta || !persona.libre) && personaId ? null : { nombre: persona.nombre, institucion: persona.institucion, dominio: probable.dominio }}
                        p={probable}
                        onCambio={setProbable}
                        onSaldo={setSaldo}
                        onSinCreditos={() => setComprar(true)}
                      />
                    </div>
                  </>
                ) : null}
                {respaldo?.email ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
                    <a href={`mailto:${respaldo.email}`} style={{ color: '#1a1a18', textDecoration: 'none', overflowWrap: 'anywhere' }}>
                      {respaldo.email}
                    </a>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: '#3a3a3d', background: '#f1f1f3', borderRadius: 999, padding: '1px 7px' }}>
                      {TIPO_CONTACTO[respaldo.tipo] || 'Contacto'}
                    </span>
                  </div>
                ) : null}
                {alta ? (
                  <div style={{ fontSize: 12, color: '#3d2fb3', background: '#efedfd', borderRadius: 8, padding: '7px 9px', lineHeight: 1.45 }}>
                    No estaba en GovTalent. Lo hemos añadido al directorio: {alta.cargo}, {alta.institucion}.
                  </div>
                ) : null}
                {resultado.telefono ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#444' }}>
                    <i className="ti ti-phone" style={{ fontSize: 15, color: '#6d5aef' }} aria-hidden="true"></i>
                    {resultado.telefono}
                  </div>
                ) : null}
                {resultado.calidad === 'probable' && !probable ? <div style={{ fontSize: 12, color: GRIS }}>{AYUDA_PROBABLE}</div> : null}
                {resultado.tipo !== 'personal' ? (
                  <div style={{ fontSize: 12, color: GRIS }}>No hemos encontrado su correo nominativo; este es el contacto publicado.</div>
                ) : null}
                <div style={{ fontSize: 11.5, color: GRIS }}>
                  {cobrado
                    ? `${coste === 1 ? 'Se ha descontado' : 'Se han descontado'} ${creditosTexto(coste)}.`
                    : probable && !persona.libre
                      ? 'No tiene un correo publicado: este es el más probable. No se ha descontado ningún crédito.'
                      : 'Tu equipo ya lo tenía: sin coste.'}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#3a3a3d', lineHeight: 1.55 }}>
                No hemos encontrado su correo. No se ha descontado ningún crédito.
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#555', margin: '14px 0 0', lineHeight: 1.6 }}>
            {mirando
              ? 'Comprobando si ya está en GovTalent…'
              : `Buscamos su correo y lo comprobamos. Cuesta ${creditosTexto(coste)} y solo se ${coste === 1 ? 'descuenta' : 'descuentan'} si lo encontramos.`}
          </p>
        )}

        {fase === 'error' ? <p style={{ fontSize: 12.5, color: '#3a3a3d', margin: '12px 0 0' }}>{error}</p> : null}

        {enDentro ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {listaHecha ? (
              <Link href={`/contactos/listas/${listaHecha}`} style={{ fontSize: 12.5, color: '#5443d6', textDecoration: 'none' }}>
                Añadido a la lista. Ver lista →
              </Link>
            ) : (
              <button
                type="button"
                className="btn-g"
                onClick={() => {
                  setDescartados(true);
                  setFase('inicio');
                }}
              >
                {dentro.length === 1 ? 'No es esta persona' : 'No es ninguna de ellas'}
              </button>
            )}
            <button type="button" className="btn-ai-o" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : fase !== 'hecho' ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: GRIS }}>
              {disponibles === null ? '' : sinCreditos ? (disponibles > 0 ? `Te quedan ${miles(disponibles)}: no llegan` : 'No te quedan créditos') : `Te quedan ${miles(disponibles)} ${disponibles === 1 ? 'crédito' : 'créditos'}`}
            </span>
            <button type="button" className="btn-ai" onClick={sinCreditos ? () => setComprar(true) : buscar} disabled={buscando || mirando} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {buscando ? (
                  'Buscando…'
                ) : (
                  <>
                    <i className="ti ti-search" aria-hidden="true"></i> Buscar correo ({creditosTexto(coste)})
                  </>
                )}
              </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {email && personaId ? (
              listaHecha ? (
                <Link href={`/contactos/listas/${listaHecha}`} style={{ fontSize: 12.5, color: '#5443d6', textDecoration: 'none', marginRight: 'auto' }}>
                  Añadido a la lista. Ver lista →
                </Link>
              ) : (
                <button type="button" className="btn-ai-o" onClick={() => setALista(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-list-check" aria-hidden="true"></i> Añadir a una lista
                </button>
              )
            ) : null}
            <button type="button" className={email && personaId && !listaHecha ? 'btn-g' : 'btn-ai-o'} onClick={onClose}>
              Cerrar
            </button>
          </div>
        )}
        {buscando ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <style>{ESTILOS_CONTACTOS}</style>
            <Buscando />
            <span style={{ fontSize: 11.5, color: GRIS }}>Puede tardar hasta un minuto.</span>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
