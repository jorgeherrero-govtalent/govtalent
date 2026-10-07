'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModalComprar, TIPO_CONTACTO, dominio, limpiarEmail, miles } from '@/components/ContactosUI';

/**
 * Buscar el correo de una persona que la fuente no trae (Directorio).
 *
 * Usa el mismo motor que «Enriquecer» en Contactos (/api/contactos/enriquecer):
 * Claude busca en fuentes oficiales y cita de dónde sale el dato. Cuesta
 * 1 crédito y solo se descuenta si lo encuentra; si alguien ya lo había
 * buscado, sale al momento y gratis (caché compartida, sql/76).
 *
 * persona: { id (de directorio_pro), nombre, cargo }
 * onResultado(resultado): cuando hay respuesta, para pintarla en la ficha.
 */

const BORDE = '#e0dfd8';
const GRIS = '#6b6b70';

export default function BuscarCorreoModal({ persona, onClose, onResultado }) {
  const [saldo, setSaldo] = useState(null);
  const [packs, setPacks] = useState([]);
  const [fase, setFase] = useState('inicio'); // inicio | buscando | hecho | error
  const [resultado, setResultado] = useState(null);
  const [cobrado, setCobrado] = useState(false);
  const [error, setError] = useState('');
  const [comprar, setComprar] = useState(false);

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

  async function buscar() {
    setFase('buscando');
    setError('');
    try {
      const res = await fetch('/api/contactos/enriquecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: persona.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.saldo) setSaldo(json.saldo);
      if (!res.ok) {
        setError(json.error || 'No se pudo completar la búsqueda. No se ha descontado ningún crédito.');
        setFase('error');
        return;
      }
      setResultado(json.resultado);
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

  const disponibles = saldo?.disponibles ?? null;
  const sinCreditos = disponibles !== null && disponibles < 1;
  const email = resultado?.estado === 'encontrado' ? limpiarEmail(resultado.email) : null;
  const buscando = fase === 'buscando';

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
        {persona.cargo ? <div style={{ fontSize: 12, color: GRIS, marginTop: 2 }}>{persona.cargo}</div> : null}

        {fase === 'hecho' ? (
          <div style={{ marginTop: 16, border: `.5px solid ${BORDE}`, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {email ? (
              <>
                {email ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <i className="ti ti-mail" style={{ fontSize: 15, color: '#6d5aef' }} aria-hidden="true"></i>
                    <a href={`mailto:${email}`} style={{ fontSize: 13.5, color: '#1a1a18', textDecoration: 'none', fontWeight: 600, overflowWrap: 'anywhere' }}>
                      {email}
                    </a>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: '#3d2fb3', background: '#efedfd', borderRadius: 999, padding: '1px 7px' }}>
                      {TIPO_CONTACTO[resultado.tipo] || 'Contacto'}
                    </span>
                  </div>
                ) : null}
                {resultado.telefono ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#444' }}>
                    <i className="ti ti-phone" style={{ fontSize: 15, color: '#6d5aef' }} aria-hidden="true"></i>
                    {resultado.telefono}
                  </div>
                ) : null}
                {resultado.fuente_url ? (
                  <div style={{ fontSize: 12, color: GRIS }}>
                    Según{' '}
                    <a href={resultado.fuente_url} target="_blank" rel="noopener noreferrer" style={{ color: '#5443d6', textDecoration: 'none' }}>
                      {dominio(resultado.fuente_url)} ↗
                    </a>
                    {resultado.verificado === false ? ' · sin verificar' : ''}
                  </div>
                ) : null}
                <div style={{ fontSize: 11.5, color: GRIS }}>{cobrado ? 'Se ha descontado 1 crédito.' : 'Ya lo habíamos encontrado antes: sin coste.'}</div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#3a3a3d', lineHeight: 1.55 }}>
                No hemos encontrado un correo publicado en fuentes oficiales. No se ha descontado ningún crédito.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#555', margin: '14px 0 0', lineHeight: 1.6 }}>
            Buscamos su correo en fuentes oficiales y te decimos de dónde sale. Cuesta 1 crédito y solo se descuenta si lo
            encontramos.
          </p>
        )}

        {fase === 'error' ? <p style={{ fontSize: 12.5, color: '#3a3a3d', margin: '12px 0 0' }}>{error}</p> : null}

        {fase !== 'hecho' ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: GRIS }}>
              {disponibles === null ? '' : sinCreditos ? 'No te quedan créditos' : `Te quedan ${miles(disponibles)} ${disponibles === 1 ? 'crédito' : 'créditos'}`}
            </span>
            {sinCreditos ? (
              <button type="button" className="btn-ai" onClick={() => setComprar(true)}>
                Comprar créditos
              </button>
            ) : (
              <button type="button" className="btn-ai" onClick={buscar} disabled={buscando} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {buscando ? (
                  'Buscando en fuentes oficiales…'
                ) : (
                  <>
                    <i className="ti ti-search" aria-hidden="true"></i> Buscar correo · 1 crédito
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn-ai-o" onClick={onClose}>
              Cerrar
            </button>
          </div>
        )}
        {buscando ? <div style={{ fontSize: 11.5, color: GRIS, marginTop: 8, textAlign: 'right' }}>Puede tardar hasta un minuto.</div> : null}
      </div>
    </div>,
    document.body
  );
}
