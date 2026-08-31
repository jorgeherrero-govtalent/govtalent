'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getEffectiveTier, planLabel, PLANES, COMPARATIVA } from '@/lib/plan';

/**
 * El plan de la organización.
 *
 * DOS PIEZAS Y NO UNA. Arriba tres tarjetas con nombre, precio y botón:
 * sirven para elegir. Debajo la tabla comparativa: sirve para decidir.
 * Antes las tarjetas repetían las funciones y la tabla no existía, así
 * que se leía dos veces lo mismo y aun así faltaba la mitad.
 *
 * LOS DATOS SALEN DE lib/plan. La página no conoce ni precios ni
 * funciones; los pide a PLANES y COMPARATIVA. Cuando esta página tenía su
 * propia lista, se quedó diciendo "Plus" y "Pro" y prometiendo tres
 * funciones de las siete que anuncia /precios.
 *
 * SIN PERIODO DE PRUEBA. Se retiró el trial de la aplicación: aquí ya no
 * hay contador de días ni usos de IA restantes.
 */

const VERDE = '#1d6f5c';
const MORADO = '#6d5aef';
const GRIS = '#8b8780';
const BORDE = '#e0dfd8';

// Free en gris, Recruiter en verde y Teams en morado. El gris dice que
// Free no es una elección que se celebre, es el punto de partida.
const COLORES = {
  gris: { fuerte: GRIS, suave: '#f4f4f0', texto: '#5c5952' },
  verde: { fuerte: VERDE, suave: '#e8f4f0', texto: VERDE },
  morado: { fuerte: MORADO, suave: '#f0eefe', texto: '#3c3489' },
};

function Marca({ valor, color }) {
  if (valor === true) {
    return <i className="ti ti-check" style={{ fontSize: 14, color: color }}></i>;
  }
  if (valor === false) {
    return <span style={{ color: '#c9c7bd' }}>—</span>;
  }
  return <span style={{ color: '#666' }}>{valor}</span>;
}

export default function OrganizationPlanPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    setOrg(membership?.organizations || null);
    setLoading(false);
  }

  if (loading) return <div className="spinner"></div>;
  if (!org) return null;

  const actual = getEffectiveTier(org);

  const celda = {
    display: 'grid',
    gridTemplateColumns: '1.9fr .65fr .65fr .65fr',
    padding: '8px 16px',
    fontSize: 11.5,
    alignItems: 'center',
    borderBottom: `.5px solid #f2f0ec`,
  };

  return (
    // Sin maxWidth propio: el panel ya limita a 1080px, y ponerle 860
    // encima dejaba las tarjetas y las columnas apretadas contra el
    // borde izquierdo con media pantalla vacía a la derecha.
    <div className="sec">
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Plan</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Estás en {planLabel(org)}. Puedes cambiar cuando quieras.
      </p>

      {/* --- Las tres tarjetas --- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 10,
          marginBottom: 22,
        }}
      >
        {PLANES.map((p) => {
          const c = COLORES[p.color];
          const esActual = p.clave === actual;
          return (
            <div
              key={p.clave}
              style={{
                background: '#fff',
                border: esActual || p.distintivo ? `1px solid ${c.fuerte}` : `.5px solid ${BORDE}`,
                borderRadius: 11,
                padding: '15px 14px',
                position: 'relative',
              }}
            >
              {/* El distintivo del plan actual manda sobre el comercial:
                  saber dónde estás importa más que saber cuál se vende
                  mejor. */}
              {(esActual || p.distintivo) && (
                <span
                  style={{
                    position: 'absolute',
                    top: -8,
                    left: 14,
                    background: c.fuerte,
                    color: '#fff',
                    fontSize: 8.5,
                    fontWeight: 700,
                    letterSpacing: '.4px',
                    padding: '2px 8px',
                    borderRadius: 9,
                  }}
                >
                  {esActual ? 'TU PLAN' : p.distintivo}
                </span>
              )}

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{p.nombre}</div>
              <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.1 }}>
                {p.precio}
                <span style={{ fontSize: 10.5, fontWeight: 400, color: '#a8a49c' }}> {p.periodo}</span>
              </div>
              <div style={{ fontSize: 10, color: '#a8a49c', marginBottom: 12 }}>{p.usuarios}</div>

              {esActual ? (
                <div
                  style={{
                    fontSize: 11,
                    textAlign: 'center',
                    padding: 6,
                    borderRadius: 7,
                    background: '#f7f6f3',
                    color: '#a8a49c',
                  }}
                >
                  Plan actual
                </div>
              ) : (
                <Link
                  href="/precios?para=organizaciones"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block',
                    fontSize: 11,
                    textAlign: 'center',
                    padding: 6,
                    borderRadius: 7,
                    textDecoration: 'none',
                    background: p.color === 'morado' ? c.fuerte : 'transparent',
                    color: p.color === 'morado' ? '#fff' : c.texto,
                    border: p.color === 'morado' ? 'none' : `.5px solid ${c.fuerte}`,
                  }}
                >
                  Cambiar a {p.nombre}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* --- La comparativa --- */}
      <div style={{ background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 11, overflow: 'hidden' }}>
        <div
          style={{
            ...celda,
            padding: '11px 16px',
            background: '#faf9f6',
            fontSize: 9.5,
            letterSpacing: '.4px',
            color: '#a8a49c',
            borderBottom: `.5px solid ${BORDE}`,
          }}
        >
          <span>QUÉ INCLUYE CADA PLAN</span>
          {/* Cada plan con su color y en negrita, no solo el actual:
              así la columna que se está mirando se distingue de un
              vistazo al recorrer catorce filas. Free en gris porque es
              el punto de partida, no una opción que se venda. */}
          {PLANES.map((p) => (
            <span
              key={p.clave}
              style={{ textAlign: 'center', color: COLORES[p.color].texto, fontWeight: 700 }}
            >
              {p.nombre.toUpperCase()}
            </span>
          ))}
        </div>

        {COMPARATIVA.map((seccion) => (
          <div key={seccion.grupo}>
            {/* Catorce filas seguidas no se leen: los grupos dan sitios
                donde parar. */}
            <div style={{ padding: '12px 16px 5px', fontSize: 9.5, letterSpacing: '.4px', color: '#a8a49c' }}>
              {seccion.grupo.toUpperCase()}
            </div>
            {seccion.filas.map((f) => (
              <div key={f.nombre} style={celda}>
                <span>{f.nombre}</span>
                {/* La marca toma el color de su columna, así la de Teams
                    es morada y la de Recruiter verde. Con las tres del
                    mismo verde, las columnas se confundían al bajar. */}
                <span style={{ textAlign: 'center' }}>
                  <Marca valor={f.free} color={COLORES.gris.texto} />
                </span>
                <span style={{ textAlign: 'center' }}>
                  <Marca valor={f.plus} color={COLORES.verde.texto} />
                </span>
                <span style={{ textAlign: 'center' }}>
                  <Marca valor={f.pro} color={COLORES.morado.texto} />
                </span>
              </div>
            ))}
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '14px 16px',
            background: '#faf9f6',
          }}
        >
          <span style={{ fontSize: 11.5, color: '#a8a49c' }}>
            El cambio de plan se gestiona desde la página de precios.
          </span>
          <Link
            href="/precios?para=organizaciones"
            target="_blank"
            rel="noreferrer"
            className="btn-ai"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            Ver planes <i className="ti ti-arrow-up-right"></i>
          </Link>
        </div>
      </div>

      {org.is_founding_member && (
        <div style={{ fontSize: 12, color: '#888', marginTop: 12 }}>
          <i className="ti ti-star" style={{ color: MORADO, marginRight: 4 }}></i>
          Eres Founding Member: el primer año de Teams al 50 %.
        </div>
      )}
    </div>
  );
}
