'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { planLabel, teamSeats, getEffectiveTier, esPlanTeams } from '@/lib/plan';

const BOTON = {
  background: '#6d5aef',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
};
const BOTON_SEC = {
  background: '#f5f4f1',
  color: '#57534e',
  border: 'none',
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 12.5,
  cursor: 'pointer',
};

const SIRVIENDO = new Set(['active', 'trialing', 'past_due']);

const BENEFICIOS = {
  recruiter: [
    'Ofertas y candidaturas ilimitadas',
    'Matching y scoring con IA',
    'Resumen de candidatos',
  ],
  teams: [
    'Todo lo de Recruiter y licencia Pro',
    'Proyectos y agenda compartidos',
    'Registro de actividad y actas automáticas',
    'Base de datos AGE y UE exportable',
  ],
};

// Etiquetas de rol. De momento son informativas: no restringen el acceso a
// ningún módulo, y eso se dice explícitamente en la interfaz para que nadie
// asigne 'Talento' creyendo que así cierra el acceso a asuntos públicos.
const ROLES = {
  admin: 'Administrador',
  editor: 'Miembro',
};

function fecha(valor) {
  if (!valor) return null;
  return new Date(valor).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function iniciales(nombre, email) {
  const base = (nombre || '').trim();
  if (base) {
    const partes = base.split(/\s+/);
    return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
  }
  return (email || '?').slice(0, 2).toUpperCase();
}

function Check({ children }) {
  return (
    <div style={{ fontSize: 12.5, color: '#3a3a36', marginBottom: 7, display: 'flex', gap: 7 }}>
      <i
        className="ti ti-check"
        style={{ color: '#1d6f5c', fontSize: 14, marginTop: 1, flexShrink: 0 }}
        aria-hidden="true"
      ></i>
      <span>{children}</span>
    </div>
  );
}

function TarjetaPlan({ nombre, precio, usuarios, beneficios, destacado, cta, onClick, ocupado }) {
  return (
    <div
      style={{
        border: destacado ? '1.5px solid #6d5aef' : '.5px solid #e6e4dd',
        borderRadius: 10,
        padding: 16,
        background: destacado ? '#fbfaff' : '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18' }}>{nombre}</span>
        {destacado && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              background: '#6d5aef',
              color: '#fff',
              borderRadius: 11,
              padding: '3px 9px',
            }}
          >
            MÁS COMPLETO
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: '#8b8780', marginBottom: 11 }}>
        {precio} · {usuarios}
      </div>
      <div style={{ flex: 1 }}>
        {beneficios.map((b) => (
          <Check key={b}>{b}</Check>
        ))}
      </div>
      <button
        type="button"
        style={{ ...(destacado ? BOTON : BOTON_SEC), width: '100%', marginTop: 14 }}
        disabled={ocupado}
        onClick={onClick}
      >
        {ocupado ? 'Abriendo el pago…' : cta}
      </button>
    </div>
  );
}

/**
 * Plan de la organización, con el equipo cuando es Teams.
 *
 * Solo el administrador ve los botones: quien no lo es puede consultar el
 * plan, pero no contratar ni gestionar la suscripción.
 */
export default function BloquePlanOrganizacion({ org, esAdmin }) {
  const supabase = createClient();
  const [miembros, setMiembros] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const esTeams = esPlanTeams(org);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      if (!org?.id) return;
      const { data } = await supabase
        .from('organization_members')
        .select('user_id, role, users(first_name, last_name, email)')
        .eq('organization_id', org.id);
      if (!cancelado) setMiembros(data || []);
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id]);

  const tier = getEffectiveTier(org);
  const dePago = tier !== 'free' && SIRVIENDO.has(org?.plan_status || 'active');
  const impagado = org?.plan_status === 'past_due';
  const cancelaAlFinal = !!org?.cancel_at_period_end;
  const renovacion = fecha(org?.plan_renews_at);
  const plazas = teamSeats(org);
  const usados = miembros?.length ?? null;
  const sinPlazas = usados !== null && usados >= plazas;

  // Una cortesía concedida a mano no tiene cliente en Stripe, así que no hay
  // suscripción que gestionar. Mejor no enseñar un botón que dará error.
  const tieneSuscripcion = !!org?.stripe_customer_id;
  const puedeContratar = esAdmin && !!org?.claimed && !!org?.verified;

  async function abrirPortal() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: org.id }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data?.error || 'No hemos podido abrir la gestión de la suscripción');
    } catch {
      toast.error('No hemos podido conectar. Inténtalo de nuevo.');
    }
    setOcupado(false);
  }

  async function contratar(plan) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, organizationId: org.id }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data?.error || 'No hemos podido iniciar el pago');
    } catch {
      toast.error('No hemos podido conectar. Inténtalo de nuevo.');
    }
    setOcupado(false);
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 14 }}>
        PLAN DE LA ORGANIZACIÓN
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: dePago ? 4 : 14 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{planLabel(org)}</span>
        <span style={{ fontSize: 12.5, color: '#a8a49c' }}>
          {usados === null
            ? `${plazas} ${plazas === 1 ? 'usuario' : 'usuarios'}`
            : `${usados} de ${plazas} ${plazas === 1 ? 'usuario' : 'usuarios'}`}
        </span>
      </div>

      {/* --- Plan de pago activo ---------------------------------------- */}
      {dePago && (
        <>
          {impagado ? (
            <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '0 0 16px' }}>
              No hemos podido cobrar la última renovación. Revisa el método de pago para evitar la
              interrupción del servicio.
            </p>
          ) : cancelaAlFinal ? (
            <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '0 0 16px' }}>
              La suscripción está cancelada y no se renovará.
              {renovacion && ` La organización mantiene el acceso hasta el ${renovacion}.`}
            </p>
          ) : (
            <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '0 0 16px' }}>
              Suscripción anual activa.
              {renovacion && ` Se renueva el ${renovacion}.`}
            </p>
          )}

          {esAdmin && tieneSuscripcion && (
            <button type="button" style={BOTON} disabled={ocupado} onClick={abrirPortal}>
              {ocupado ? 'Abriendo…' : 'Gestionar suscripción'}
            </button>
          )}

          {esAdmin && !tieneSuscripcion && (
            <p style={{ fontSize: 11.5, color: '#a8a49c', margin: 0, lineHeight: 1.55 }}>
              Este plan está concedido directamente y no tiene suscripción asociada.
            </p>
          )}

          {/* Salto de Recruiter a Teams */}
          {tier === 'recruiter' && puedeContratar && (
            <div style={{ borderTop: '.5px solid #f2f0ec', marginTop: 18, paddingTop: 14 }}>
              <div style={{ maxWidth: 320 }}>
                <TarjetaPlan
                  nombre="Teams"
                  precio="429 € / año"
                  usuarios="hasta 4 usuarios"
                  beneficios={BENEFICIOS.teams}
                  destacado
                  cta="Elegir Teams"
                  ocupado={ocupado}
                  onClick={() => contratar('teams')}
                />
              </div>
            </div>
          )}

          {/* Equipo, solo en Teams */}
          {esTeams && (
            <div style={{ borderTop: '.5px solid #f2f0ec', marginTop: 18, paddingTop: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18' }}>Equipo</span>
                <span style={{ fontSize: 12, color: '#a8a49c' }}>
                  {usados === null
                    ? ''
                    : sinPlazas
                      ? 'Sin plazas libres'
                      : `${plazas - usados} ${plazas - usados === 1 ? 'plaza libre' : 'plazas libres'}`}
                </span>
              </div>

              {(miembros || []).map((m, i) => {
                const p = m.users || {};
                const nombre = `${p.first_name || ''} ${p.last_name || ''}`.trim();
                return (
                  <div
                    key={m.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderTop: i === 0 ? 'none' : '.5px solid #f7f6f3',
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: m.role === 'admin' ? '#f0eefe' : '#e8f4f0',
                        color: m.role === 'admin' ? '#3c3489' : '#0f6e56',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {iniciales(nombre, p.email)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#1a1a18' }}>{nombre || p.email}</div>
                      {nombre && (
                        <div style={{ fontSize: 11.5, color: '#a8a49c' }}>{p.email}</div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11.5,
                        background: '#f5f4f1',
                        color: '#57534e',
                        borderRadius: 6,
                        padding: '5px 10px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ROLES[m.role] || m.role}
                    </span>
                  </div>
                );
              })}

              <p style={{ fontSize: 11.5, color: '#a8a49c', margin: '12px 0 0', lineHeight: 1.55 }}>
                Por ahora los roles son informativos: todos los miembros acceden a todos los
                módulos.
              </p>

              {sinPlazas && (
                <p style={{ fontSize: 12.5, color: '#8b8780', margin: '10px 0 0', lineHeight: 1.6 }}>
                  ¿Necesitáis más de {plazas} personas? Escríbenos a{' '}
                  <a href="mailto:hola@govtalent.app" style={{ color: '#1d6f5c' }}>
                    hola@govtalent.app
                  </a>
                  .
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* --- Free -------------------------------------------------------- */}
      {!dePago && (
        <>
          {!puedeContratar && esAdmin && (
            <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '0 0 14px' }}>
              Para contratar un plan, la organización tiene que estar reclamada y verificada.
            </p>
          )}

          {!esAdmin && (
            <p style={{ fontSize: 11.5, color: '#a8a49c', margin: 0, lineHeight: 1.55 }}>
              Solo un administrador de la organización puede contratar un plan.
            </p>
          )}

          {puedeContratar && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 14,
                borderTop: '.5px solid #f2f0ec',
                paddingTop: 14,
              }}
            >
              <TarjetaPlan
                nombre="Recruiter"
                precio="149 € / año"
                usuarios="1 usuario"
                beneficios={BENEFICIOS.recruiter}
                cta="Elegir Recruiter"
                ocupado={ocupado}
                onClick={() => contratar('recruiter')}
              />
              <TarjetaPlan
                nombre="Teams"
                precio="429 € / año"
                usuarios="hasta 4 usuarios"
                beneficios={BENEFICIOS.teams}
                destacado
                cta="Elegir Teams"
                ocupado={ocupado}
                onClick={() => contratar('teams')}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
