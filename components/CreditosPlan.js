'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { creditosIncluidos, CREDITOS_POR_ALARMA, miles } from '@/lib/precios';
import { ModalComprar } from '@/components/ContactosUI';

/**
 * Configuración, pestaña Plan: los créditos disponibles, sumados, con el
 * desglose por bolsa y la compra (maqueta B, 31-10-2026).
 *
 * Dos bolsas distintas:
 * - Alarmas: los del plan de Vigilancia. Cada alarma activa reserva
 *   CREDITOS_POR_ALARMA al mes (el mismo cálculo que la tarjeta del plan
 *   del menú lateral, en app/(app)/layout.js). Aún no se pueden comprar:
 *   «Ver planes» hasta que exista el cobro.
 * - Contactos: los del Directorio (/api/creditos), con su compra.
 */

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const MORADO = '#6d5aef';
const MORADO_CLARO = '#b9b0f7';
const GRIS = '#6b6b70';
const BORDE = '#ececef';
const TH = { textAlign: 'left', fontSize: 12, color: GRIS, fontWeight: 500, padding: '10px 16px', borderBottom: `1px solid ${BORDE}`, background: '#fafaf8' };
const TD = { padding: '12px 16px', borderBottom: '1px solid #f2f2ef', fontSize: 13.5 };
const BOTON_FILA = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid #dcdbd4',
  background: '#fff',
  color: '#1a1a18',
  borderRadius: 9,
  padding: '6px 12px',
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textDecoration: 'none',
  boxShadow: '0 1px 2px rgba(26,26,24,.06)',
  whiteSpace: 'nowrap',
};

export default function CreditosPlan({ user }) {
  const [alarmas, setAlarmas] = useState(null); // { total, usados } o null
  const [contacto, setContacto] = useState(null); // saldo de /api/creditos o null
  const [packs, setPacks] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [comprar, setComprar] = useState(false);
  // Al volver del pago (?compra=ok): aviso y relectura del saldo, que el
  // webhook suma unos segundos después.
  const [avisoCompra, setAvisoCompra] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('compra') !== 'ok') return;
    setAvisoCompra(true);
    const releer = () =>
      fetch('/api/creditos', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.directorio && j.saldo && setContacto(j.saldo))
        .catch(() => {});
    const t1 = setTimeout(releer, 3000);
    const t2 = setTimeout(releer, 8000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const supabase = createClient();
      const [{ data: nivel }, { count: activas }, creditosRes] = await Promise.all([
        supabase.rpc('nivel_avisos'),
        supabase.from('sector_alerts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('activa', true),
        fetch('/api/creditos', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (!vivo) return;
      if (nivel === 'pro') {
        const usuarios = Number(user?.plan_usuarios) || 1;
        setAlarmas({ total: creditosIncluidos(usuarios), usados: (activas || 0) * CREDITOS_POR_ALARMA });
      }
      if (creditosRes?.directorio && creditosRes.saldo) {
        setContacto(creditosRes.saldo);
        setPacks(creditosRes.packs || []);
      }
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [user?.id, user?.plan_usuarios]);

  if (cargando || (!alarmas && !contacto)) return null;

  const alarmasDisp = alarmas ? Math.max(0, alarmas.total - alarmas.usados) : 0;
  const contactoMes = contacto ? Number(contacto.mensuales) || 0 : 0;
  const contactoMesDisp = contacto ? Number(contacto.mensuales_disponibles) || 0 : 0;
  const contactoComprados = contacto ? Number(contacto.comprados) || 0 : 0;
  const contactoDisp = contacto ? Number(contacto.disponibles) || 0 : 0;

  const disponibles = alarmasDisp + contactoDisp;
  const usados = (alarmas?.usados || 0) + (contacto ? Number(contacto.mensuales_usados) || 0 : 0);
  const total = (alarmas?.total || 0) + contactoMes + contactoComprados;
  const pct = (n) => (total > 0 ? `${Math.min(100, (n / total) * 100)}%` : '0%');

  return (
    <div style={{ ...CARD, padding: 22, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12.5, color: GRIS }}>Créditos disponibles</div>
          <div style={{ fontSize: 30, fontWeight: 600, marginTop: 6 }}>{miles(disponibles)}</div>
        </div>
        {contacto && (
          <button type="button" className="btn-ai" onClick={() => setComprar(true)}>
            Añadir créditos
          </button>
        )}
      </div>

      {avisoCompra && (
        <div style={{ fontSize: 13, background: '#faf9ff', border: '1px solid #e6e2fb', borderRadius: 10, padding: '10px 12px', color: '#3a3a3d' }}>
          Hemos recibido tu compra. Los créditos se suman en unos segundos.
        </div>
      )}

      <div style={{ height: 10, borderRadius: 999, background: '#f0efe9', overflow: 'hidden', display: 'flex' }} aria-hidden="true">
        {alarmas && <div style={{ width: pct(alarmasDisp), background: MORADO }}></div>}
        {contacto && <div style={{ width: pct(contactoDisp), background: MORADO_CLARO }}></div>}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: '#3a3a3d' }}>
        {alarmas && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: MORADO }}></span>Alarmas: {miles(alarmasDisp)}
          </span>
        )}
        {contacto && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: MORADO_CLARO }}></span>Contactos: {miles(contactoDisp)}
          </span>
        )}
        <span style={{ color: GRIS }}>Usados este mes: {miles(usados)}</span>
      </div>

      <div style={{ border: `1px solid ${BORDE}`, borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr>
              <th style={TH}>Bolsa</th>
              <th style={TH}>Del mes</th>
              <th style={TH}>Comprados</th>
              <th style={TH}>Disponibles</th>
              <th style={TH}>En qué se gastan</th>
              <th style={TH}></th>
            </tr>
          </thead>
          <tbody>
            {alarmas && (
              <tr>
                <td style={{ ...TD, fontWeight: 500 }}>Alarmas</td>
                <td style={TD}>
                  {miles(alarmasDisp)} de {miles(alarmas.total)}
                </td>
                <td style={TD}>0</td>
                <td style={{ ...TD, fontWeight: 600 }}>{miles(alarmasDisp)}</td>
                <td style={{ ...TD, color: GRIS }}>{CREDITOS_POR_ALARMA} por alarma activa al mes</td>
                <td style={{ ...TD, textAlign: 'right' }}>
                  <a href="/precios" style={BOTON_FILA}>
                    Ver planes
                  </a>
                </td>
              </tr>
            )}
            {contacto && (
              <tr>
                <td style={{ ...TD, fontWeight: 500 }}>Contactos</td>
                <td style={TD}>
                  {miles(contactoMesDisp)} de {miles(contactoMes)}
                </td>
                <td style={TD}>{miles(contactoComprados)}</td>
                <td style={{ ...TD, fontWeight: 600 }}>{miles(contactoDisp)}</td>
                <td style={{ ...TD, color: GRIS }}>1 por correo encontrado o verificado</td>
                <td style={{ ...TD, textAlign: 'right' }}>
                  <button type="button" style={BOTON_FILA} onClick={() => setComprar(true)}>
                    Comprar
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {comprar && <ModalComprar packs={packs} volver="plan" onClose={() => setComprar(false)} />}
    </div>
  );
}
