'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { euros, HORQUILLAS, DIRECTORIO_ANUAL, horquillaPorUsuarios, miles } from '@/lib/precios';
import UsuariosDirectorio from '@/components/UsuariosDirectorio';

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const BOTON_FILA = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid #dcdbd4',
  background: '#fff',
  color: '#1a1a18',
  borderRadius: 9,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(26,26,24,.06)',
  whiteSpace: 'nowrap',
};

// Estados en los que la suscripción sigue dando servicio. `past_due` entra
// a propósito: Stripe está reintentando el cobro y cortar el acceso por una
// tarjeta caducada es la forma más rápida de perder a quien sí quería pagar.
const SIRVIENDO = new Set(['active', 'trialing', 'past_due']);

function fecha(valor) {
  if (!valor) return null;
  return new Date(valor).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Plan personal del usuario (GovTalent Pro).
 *
 * Contempla un caso que se da en la práctica y que despista mucho: quien
 * pertenece a una organización con Teams ya tiene Pro por la licencia
 * incluida. A esa persona no se le ofrece comprarlo otra vez.
 */
export default function BloquePlanCuenta({ user }) {
  // Acceso al Directorio como usuario adicional de otra persona (sql/85).
  const [accesoAdicional, setAccesoAdicional] = useState(false);
  useEffect(() => {
    createClient()
      .rpc('tiene_directorio')
      .then(({ data }) => setAccesoAdicional(data === true));
  }, []);

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
  const usuarios = Number(user?.plan_usuarios) || 1;

  // El Directorio va en su propia suscripción (sql/73). Teams lo incluía.
  const conDirectorio = ['active', 'past_due'].includes(user?.directorio_status) || !!orgConTeams || accesoAdicional;
  const directorioPropio = ['active', 'past_due'].includes(user?.directorio_status);
  const directorioRenueva = fecha(user?.directorio_renews_at);

  async function contratarDirectorio() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'directorio' }),
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

  const textoVigilancia = esPro
    ? impagado
      ? 'No hemos podido cobrar la última renovación. Revisa tu método de pago para evitar la interrupción del servicio.'
      : cancelaAlFinal
      ? `Cancelada, no se renovará.${renovacion ? ` Mantienes el acceso hasta el ${renovacion}.` : ''}`
      : `Activa${usuarios > 1 ? `, hasta ${usuarios} usuarios` : ''}, ${miles(horquillaPorUsuarios(usuarios).creditos)} créditos de alarmas al mes.${renovacion ? ` Se renueva el ${renovacion}.` : ''}`
    : orgConTeams
    ? `Incluida en el plan de ${orgConTeams.name}. La gestiona quien administre esa organización.`
    : `Desde ${euros(HORQUILLAS[0].mensual)} / mes. Alarmas al momento sobre el BOE, el Congreso, el Consejo de Ministros y más, avisos de plazo, Proyectos y Tareas.`;

  const textoDirectorio = directorioPropio
    ? user?.directorio_status === 'past_due'
      ? 'No hemos podido cobrar la última renovación. Revisa tu método de pago en Gestionar.'
      : user?.directorio_cancel_at_period_end
      ? `Cancelado, no se renovará.${directorioRenueva ? ` Mantienes el acceso hasta el ${directorioRenueva}.` : ''}`
      : `Activo, 25 créditos de contactos al mes.${directorioRenueva ? ` Se renueva el ${directorioRenueva}.` : ''}`
    : conDirectorio
    ? orgConTeams?.name
      ? `Incluido en el plan de ${orgConTeams.name}.`
      : 'Tienes acceso como usuario adicional del Directorio de otra persona.'
    : `${euros(DIRECTORIO_ANUAL)} / año. El correo y el teléfono de cargos, unidades, diputados y asesores, y la Base de datos con cerca de 27.000 contactos.`;

  return (
    <div style={{ ...CARD, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid #ececef' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Suscripciones</span>
        <a href="/precios" style={{ fontSize: 13, color: '#6d5aef', textDecoration: 'none', fontWeight: 500 }}>
          Ver planes
        </a>
      </div>

      {cargandoOrg ? (
        <div style={{ padding: '18px 22px', fontSize: 13, color: '#8b8780' }}>Cargando…</div>
      ) : (
        <>
          <FilaSuscripcion
            titulo="Vigilancia normativa"
            etiqueta={esPro && user?.is_founding_member ? 'Founding Member' : esPro || orgConTeams ? null : 'No contratada'}
            texto={textoVigilancia}
            accion={
              esPro ? (
                <button type="button" style={BOTON_FILA} disabled={ocupado} onClick={abrirPortal}>
                  {ocupado ? 'Abriendo…' : 'Gestionar'}
                </button>
              ) : orgConTeams ? null : (
                <a href="/precios" className="btn-ai" style={{ textDecoration: 'none' }}>
                  Contratar
                </a>
              )
            }
          />
          <FilaSuscripcion
            titulo="Directorio"
            etiqueta={conDirectorio ? null : 'No contratado'}
            texto={textoDirectorio}
            ultima
            accion={
              directorioPropio ? (
                <button type="button" style={BOTON_FILA} disabled={ocupado} onClick={abrirPortal}>
                  {ocupado ? 'Abriendo…' : 'Gestionar'}
                </button>
              ) : conDirectorio ? null : (
                <button type="button" className="btn-ai" disabled={ocupado} onClick={contratarDirectorio}>
                  {ocupado ? 'Abriendo el pago…' : 'Contratar'}
                </button>
              )
            }
          >
            {directorioPropio && <UsuariosDirectorio />}
          </FilaSuscripcion>
        </>
      )}
    </div>
  );
}

/** Una fila del bloque de suscripciones: nombre, estado y acción a la derecha. */
function FilaSuscripcion({ titulo, etiqueta, texto, accion, ultima = false, children }) {
  return (
    <div style={{ padding: '16px 22px', borderBottom: ultima ? 'none' : '1px solid #f2f2ef' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</b>
            {etiqueta && (
              <span style={{ fontSize: 11, background: '#f2f1ee', color: '#57534e', borderRadius: 20, padding: '2px 9px', fontWeight: 500 }}>
                {etiqueta}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: '#6b6b70', lineHeight: 1.55, marginTop: 3 }}>{texto}</div>
        </div>
        {accion}
      </div>
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}
