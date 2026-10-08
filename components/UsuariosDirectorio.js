'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { euros } from '@/lib/precios';

/**
 * «Usuarios con acceso» del Directorio, en Mi cuenta (maqueta A,
 * 08-10-2026). El titular escribe un correo, ve lo que se cobra ahora
 * (prorrateado hasta la renovación de su Directorio) y confirma. Quitar
 * a alguien no devuelve nada: deja de cobrarse en la renovación.
 */

const MORADO = '#6d5aef';
const GRIS = '#8b8780';
const LINEA = '.5px solid #f2f0ec';

const iniciales = (t) =>
  String(t || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

const fechaLarga = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

const dinero = (v) => `${Number(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function Fila({ ini, titulo, sub, derecha }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: LINEA, flexWrap: 'wrap' }}>
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: '#faf9f5',
          border: '.5px solid #e0dfd8',
          display: 'grid',
          placeItems: 'center',
          fontSize: 10.5,
          color: GRIS,
          fontWeight: 600,
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {ini}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{titulo}</b>
        <span style={{ fontSize: 11.5, color: '#a8a49c', overflowWrap: 'anywhere' }}>{sub}</span>
      </span>
      {derecha}
    </div>
  );
}

const PILL = { fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' };

export default function UsuariosDirectorio() {
  const [datos, setDatos] = useState(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [presupuesto, setPresupuesto] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [quitando, setQuitando] = useState(null);

  async function cargar() {
    const res = await fetch('/api/directorio/usuarios', { cache: 'no-store' });
    if (res.ok) setDatos(await res.json());
    else setDatos(false);
  }
  useEffect(() => {
    cargar();
  }, []);

  async function preparar(e) {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      const res = await fetch('/api/directorio/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, previsualizar: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'No se ha podido preparar');
      setPresupuesto(j);
    } catch (err) {
      setError(err.message);
    }
    setOcupado(false);
  }

  async function confirmar() {
    setOcupado(true);
    setError('');
    try {
      const res = await fetch('/api/directorio/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: presupuesto.email }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'No se ha podido dar el acceso');
      setDatos((d) => ({ ...d, accesos: j.accesos }));
      setPresupuesto(null);
      setEmail('');
    } catch (err) {
      setError(err.message);
      setPresupuesto(null);
    }
    setOcupado(false);
  }

  async function quitar(correo) {
    setOcupado(true);
    setError('');
    try {
      const res = await fetch('/api/directorio/usuarios', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: correo }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'No se ha podido quitar');
      setDatos((d) => ({ ...d, accesos: j.accesos }));
      setQuitando(null);
    } catch (err) {
      setError(err.message);
    }
    setOcupado(false);
  }

  if (!datos) return null;
  const precio = datos.precio_extra;

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Usuarios con acceso</div>
        <p style={{ fontSize: 12.5, color: GRIS, lineHeight: 1.55, margin: '3px 0 0' }}>
          Tu suscripción incluye 1 usuario. Cada usuario adicional cuesta {euros(precio)} al año. Los créditos de contacto del
          mes se comparten entre todos.
        </p>
      </div>
      <div>
        <Fila
          ini={iniciales(datos.titular.nombre || datos.titular.email)}
          titulo={datos.titular.nombre || datos.titular.email}
          sub={datos.titular.email}
          derecha={<span style={{ ...PILL, background: '#f1effe', color: '#3d2fb3' }}>Titular</span>}
        />
        {datos.accesos.map((a) => (
          <Fila
            key={a.email}
            ini={iniciales(a.nombre || a.email)}
            titulo={a.nombre || a.email}
            sub={a.con_cuenta ? a.email : `${a.email} · aún sin cuenta en GovTalent`}
            derecha={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <span style={{ ...PILL, background: '#faf9f5', color: GRIS, border: '.5px solid #e0dfd8' }}>
                  {datos.con_cobro ? `${euros(precio)} / año` : 'Sin cargo'}
                </span>
                <button
                  type="button"
                  onClick={() => setQuitando(a.email)}
                  style={{ fontSize: 12, color: GRIS, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                >
                  Quitar
                </button>
              </span>
            }
          />
        ))}
      </div>
      <form onSubmit={preparar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          id="directorio-nuevo-usuario"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Correo de la persona"
          aria-label="Correo de la persona"
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            fontFamily: 'inherit',
            fontSize: 13,
            border: '.5px solid #e0dfd8',
            borderRadius: 8,
            padding: '8px 10px',
            background: '#fafaf7',
          }}
        />
        <button
          type="submit"
          disabled={ocupado || !email.trim()}
          style={{ background: MORADO, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Añadir usuario
        </button>
      </form>
      <p style={{ fontSize: 12, color: GRIS, lineHeight: 1.55, margin: 0 }}>
        Si aún no tiene cuenta en GovTalent, tendrá acceso en cuanto se registre con ese correo.
      </p>
      {error && <p style={{ fontSize: 12.5, color: '#3a3a3d', margin: 0 }}>{error}</p>}

      {presupuesto &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && !ocupado && setPresupuesto(null)}>
            <div className="modal-box" role="dialog" aria-modal="true" aria-label="Confirmar usuario" style={{ maxWidth: 440 }}>
              <div className="modal-head">
                <h2 style={{ fontSize: 16 }}>Añadir a {presupuesto.email}</h2>
                <button type="button" className="modal-x" onClick={() => !ocupado && setPresupuesto(null)} aria-label="Cerrar">
                  <i className="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              {presupuesto.con_cobro ? (
                <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12.5 }}>
                  {[
                    ['Usuario adicional del Directorio', `${euros(presupuesto.anual)} / año`],
                    [`Hoy, hasta la renovación del ${fechaLarga(presupuesto.renueva)}`, dinero(presupuesto.importe_ahora)],
                  ].map(([a, b]) => (
                    <div key={a} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: LINEA }}>
                      <span>{a}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{b}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: LINEA, fontWeight: 700, fontSize: 13.5 }}>
                    <span>Se cobra ahora</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dinero(presupuesto.importe_ahora)} + IVA</span>
                  </div>
                  <p style={{ fontSize: 12, color: GRIS, lineHeight: 1.55, margin: '4px 0 0' }}>
                    Se cobra con el método de pago de tu Directorio. Desde la renovación pagarás {euros(presupuesto.anual)} más al año
                    por este usuario.
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: GRIS, lineHeight: 1.55, margin: 0 }}>
                  Tu Directorio está activado sin suscripción de pago, así que este usuario no tiene cargo.
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={ocupado}
                  style={{ background: MORADO, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {ocupado ? 'Dando acceso…' : 'Confirmar y dar acceso'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {quitando &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && !ocupado && setQuitando(null)}>
            <div className="modal-box" role="dialog" aria-modal="true" aria-label="Quitar acceso" style={{ maxWidth: 420 }}>
              <div className="modal-head">
                <h2 style={{ fontSize: 16 }}>Quitar el acceso a {quitando}</h2>
                <button type="button" className="modal-x" onClick={() => !ocupado && setQuitando(null)} aria-label="Cerrar">
                  <i className="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <p style={{ fontSize: 12.5, color: GRIS, lineHeight: 1.55, margin: 0 }}>
                Dejará de ver los contactos del Directorio ahora mismo. Lo ya pagado por este usuario no se devuelve; dejará de
                cobrarse en la renovación.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => quitar(quitando)}
                  disabled={ocupado}
                  style={{ background: '#1a1a18', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {ocupado ? 'Quitando…' : 'Quitar acceso'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
