'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Botón de contratación, usado tanto en las tarjetas de plan como en el
 * banner de Founding Member.
 *
 * La página de precios es un componente de servidor y es pública, así que el
 * botón tiene que resolver tres situaciones distintas:
 *
 *   - Sin sesión              -> al alta, arrastrando el plan elegido.
 *   - Con sesión, sin org     -> a crear la organización (Recruiter y Teams
 *                                solo los puede contratar un admin de una
 *                                organización reclamada y verificada).
 *   - Con sesión y con org    -> al checkout.
 *
 * Con `founding`, la ruta aplica el descuento de fundador que corresponda a
 * ese plan. El código no viaja desde aquí: lo decide el servidor.
 */
export default function BotonPlan({
  plan,
  cta,
  destacado = false,
  autenticado = false,
  organizationId = null,
  founding = false,
  variante = 'plan',
}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const esBanner = variante === 'banner';

  const estilo = esBanner
    ? {
        display: 'inline-block',
        background: '#fff',
        color: '#3d2f8f',
        fontWeight: 700,
        fontSize: 13.5,
        padding: '11px 22px',
        borderRadius: 999,
        border: 'none',
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        cursor: cargando ? 'default' : 'pointer',
        opacity: cargando ? 0.6 : 1,
        fontFamily: 'inherit',
      }
    : {
        display: 'block',
        width: '100%',
        marginTop: 18,
        fontSize: 13,
        fontWeight: 600,
        padding: '10px',
        borderRadius: 10,
        textAlign: 'center',
        textDecoration: 'none',
        cursor: cargando ? 'default' : 'pointer',
        opacity: cargando ? 0.6 : 1,
        background: destacado ? '#6d5aef' : 'transparent',
        color: destacado ? '#fff' : '#3d3a35',
        border: destacado ? 'none' : '.5px solid #e0dfd8',
        fontFamily: 'inherit',
      };

  const estiloError = esBanner
    ? { fontSize: 11.5, color: 'rgba(255,255,255,.85)', margin: '8px 0 0', lineHeight: 1.5 }
    : { fontSize: 11.5, color: '#77746e', margin: '8px 0 0', lineHeight: 1.5, textAlign: 'center' };

  // --- Free: sin acción -----------------------------------------------------
  if (plan === 'free') {
    return (
      <button type="button" className="btn-mov" style={estilo} disabled>
        {cta}
      </button>
    );
  }

  const esDeOrganizacion = plan === 'recruiter' || plan === 'teams';
  const sufijo = founding ? '&founding=1' : '';

  // --- Sin sesión: al alta, recordando qué plan quería ----------------------
  if (!autenticado) {
    return (
      <Link href={`/signup?plan=${plan}${sufijo}`} className="btn-mov" style={estilo}>
        {cta}
      </Link>
    );
  }

  // --- Con sesión pero sin organización -------------------------------------
  if (esDeOrganizacion && !organizationId) {
    return (
      <Link
        href={`/organizations/new?plan=${plan}${sufijo}`}
        className="btn-mov"
        style={estilo}
      >
        {cta}
      </Link>
    );
  }

  // --- Checkout -------------------------------------------------------------
  async function contratar() {
    if (cargando) return;
    setCargando(true);
    setError(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          organizationId: esDeOrganizacion ? organizationId : undefined,
          founding: founding || undefined,
        }),
      });
      const data = await res.json();

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      setError(data?.error || 'No hemos podido iniciar el pago. Inténtalo de nuevo.');
      setCargando(false);
    } catch {
      setError('No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.');
      setCargando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-mov"
        style={estilo}
        onClick={contratar}
        disabled={cargando}
      >
        {cargando ? 'Abriendo el pago…' : cta}
      </button>
      {error && <p style={estiloError}>{error}</p>}
    </>
  );
}
