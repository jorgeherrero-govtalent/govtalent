'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const LABEL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 14 };
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
const SEPARADOR = { borderTop: '.5px solid #f2f0ec', marginTop: 18, paddingTop: 14 };

// Estados en los que la suscripción sigue dando servicio. `past_due` entra
// a propósito: Stripe está reintentando el cobro y cortar el acceso por una
// tarjeta caducada es la forma más rápida de perder a quien sí quería pagar.
const SIRVIENDO = new Set(['active', 'trialing', 'past_due']);

// Los verbos hacen el trabajo: Free consulta, Pro busca y sigue. La
// diferencia entre mirar y vigilar es lo que se está vendiendo aquí.
const BENEFICIOS_PRO = [
  ['Busca', ' en el directorio con filtros y ficha ampliada'],
  ['Sigue', ' proyectos y actores, con alertas ante cada actualización'],
  [null, 'Proyectos con diagrama y agenda'],
  [null, 'Registro de actividad y actas automáticas'],
];

function fecha(valor) {
  if (!valor) return null;
  return new Date(valor).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function Beneficio({ verbo, texto }) {
  return (
    <div style={{ fontSize: 13, color: '#3a3a36', marginBottom: 9, display: 'flex', gap: 8 }}>
      <i
        className="ti ti-check"
        style={{ color: '#1d6f5c', fontSize: 15, marginTop: 1, flexShrink: 0 }}
        aria-hidden="true"
      ></i>
      <span>
        {verbo && <strong style={{ fontWeight: 600 }}>{verbo}</strong>}
        {texto}
      </span>
    </div>
  );
}

/**
 * Plan personal del usuario (GovTalent Pro).
 *
 * Contempla un caso que se da en la práctica y que despista mucho: quien
 * pertenece a una organización con Teams ya tiene Pro por la licencia
 * incluida. A esa persona no se le ofrece comprarlo otra vez.
 */
export default function BloquePlanCuenta({ user }) {
  const supabase = createClient();
  const [orgConTeams, setOrgConTeams] = useState(null);
  const [cargandoOrg, setCargandoOrg] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      if (!user?.id) {
        setCargandoOrg(false);
        return;
      }
      const { data } = await supabase
        .from('organization_members')
        .select('organizations(id, name, slug, plan, plan_status)')
        .eq('user_id', user.id);

      if (cancelado) return;

      const conTeams = (data || [])
        .map((fila) => fila.organizations)
        .find(
          (org) => org && org.plan === 'teams' && SIRVIENDO.has(org.plan_status || 'active')
        );

      setOrgConTeams(conTeams || null);
      setCargandoOrg(false);
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const esPro = user?.plan === 'pro' && SIRVIENDO.has(user?.plan_status || 'active');
  const impagado = user?.plan_status === 'past_due';
  const cancelaAlFinal = !!user?.cancel_at_period_end;
  const renovacion = fecha(user?.plan_renews_at);

  async function abrirPortal() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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

  async function contratarPro() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
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
    <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
      <div style={LABEL}>TU PLAN</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: esPro ? 4 : 14 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{esPro ? 'GovTalent Pro' : 'Free'}</span>
        {esPro && user?.is_founding_member && (
          <span
            style={{
              fontSize: 10.5,
              background: '#f0eefe',
              color: '#3c3489',
              borderRadius: 20,
              padding: '2px 9px',
              fontWeight: 600,
            }}
          >
            Founding Member
          </span>
        )}
      </div>

      {/* --- Con Pro propio --------------------------------------------- */}
      {esPro && (
        <>
          {impagado ? (
            <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '0 0 16px' }}>
              No hemos podido cobrar la última renovación. Revisa tu método de pago para evitar la
              interrupción del servicio.
            </p>
          ) : cancelaAlFinal ? (
            <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '0 0 16px' }}>
              Tu suscripción está cancelada y no se renovará.
              {renovacion && ` Mantienes el acceso hasta el ${renovacion}.`}
            </p>
          ) : (
            <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '0 0 16px' }}>
              Suscripción anual activa.
              {renovacion && ` Se renueva el ${renovacion}.`}
            </p>
          )}

          <button type="button" style={BOTON} disabled={ocupado} onClick={abrirPortal}>
            {ocupado ? 'Abriendo…' : 'Gestionar suscripción'}
          </button>

          <div style={SEPARADOR}>
            <p style={{ fontSize: 13, color: '#3a3a36', lineHeight: 1.6, margin: '0 0 10px' }}>
              <strong style={{ fontWeight: 600 }}>Para equipos de hasta 4 personas</strong>, Teams
              incluye la licencia Pro para todos y añade la base de datos completa y exportable de
              la AGE y la UE.
            </p>
            <a
              href="/precios?para=organizaciones"
              style={{ ...BOTON_SEC, textDecoration: 'none', display: 'inline-block' }}
            >
              Ver Teams
            </a>
          </div>
        </>
      )}

      {/* --- Pro heredado de una organización con Teams ------------------ */}
      {!esPro && !cargandoOrg && orgConTeams && (
        <>
          <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '0 0 6px' }}>
            Tienes todas las funciones de GovTalent Pro incluidas en el plan Teams de{' '}
            <strong style={{ fontWeight: 600, color: '#3f3d39' }}>{orgConTeams.name}</strong>. No
            necesitas contratar nada.
          </p>
          <p style={{ fontSize: 11.5, color: '#a8a49c', margin: 0, lineHeight: 1.55 }}>
            La suscripción la gestiona quien administre esa organización.
          </p>
        </>
      )}

      {/* --- Free sin organización con Teams ---------------------------- */}
      {!esPro && !cargandoOrg && !orgConTeams && (
        <div style={{ borderTop: '.5px solid #f2f0ec', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 11 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18' }}>GovTalent Pro</span>
            <span style={{ fontSize: 12.5, color: '#8b8780' }}>59 € / año</span>
          </div>

          {BENEFICIOS_PRO.map(([verbo, texto]) => (
            <Beneficio key={texto} verbo={verbo} texto={texto} />
          ))}

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" style={BOTON} disabled={ocupado} onClick={contratarPro}>
              {ocupado ? 'Abriendo el pago…' : 'Empezar con Pro'}
            </button>
            <a href="/precios" style={{ ...BOTON_SEC, textDecoration: 'none', display: 'inline-block' }}>
              Ver los planes
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
