'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Sondeo: 12 intentos cada 2 s ≈ 24 s. El webhook suele llegar en menos de
// uno, pero si Stripe reintenta puede tardar más.
const INTERVALO_MS = 2000;
const MAX_INTENTOS = 12;

function Contenido() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [estado, setEstado] = useState(sessionId ? 'activando' : 'sin-sesion');
  const [planLabel, setPlanLabel] = useState(null);

  useEffect(() => {
    if (!sessionId) return;

    let cancelado = false;
    let intentos = 0;

    async function comprobar() {
      if (cancelado) return;

      try {
        const res = await fetch(
          `/api/stripe/subscription-status?session_id=${encodeURIComponent(sessionId)}`
        );
        const data = await res.json();

        if (cancelado) return;

        if (data.planLabel) setPlanLabel(data.planLabel);

        if (data.ready) {
          setEstado('listo');
          return;
        }
      } catch {
        // Un fallo puntual de red no debe cortar el sondeo: reintentamos.
      }

      intentos += 1;
      if (intentos >= MAX_INTENTOS) {
        setEstado('demorado');
        return;
      }
      setTimeout(comprobar, INTERVALO_MS);
    }

    comprobar();
    return () => {
      cancelado = true;
    };
  }, [sessionId]);

  return (
    <main className="gracias-wrap">
      {estado === 'activando' && (
        <>
          <div className="gracias-spinner" aria-hidden="true" />
          <h1>Pago recibido</h1>
          <p className="gracias-texto">
            Estamos activando tu suscripción. Tarda unos segundos.
          </p>
        </>
      )}

      {estado === 'listo' && (
        <>
          <div className="gracias-check" aria-hidden="true">✓</div>
          <h1>Ya tienes {planLabel || 'tu plan'}</h1>
          <p className="gracias-texto">
            Tu suscripción está activa. Recibirás la factura por correo.
          </p>
          <Link href="/" className="gracias-boton">
            Empezar a usarlo
          </Link>
        </>
      )}

      {estado === 'demorado' && (
        <>
          <div className="gracias-check" aria-hidden="true">✓</div>
          <h1>Pago recibido</h1>
          <p className="gracias-texto">
            Tu pago se ha completado correctamente. La activación está tardando
            un poco más de lo normal, pero se completará sola en unos minutos.
            Si pasado ese tiempo no ves tu plan activo, escríbenos a{' '}
            <a href="mailto:hola@govtalent.app">hola@govtalent.app</a> y lo
            resolvemos.
          </p>
          <Link href="/" className="gracias-boton">
            Ir a GovTalent
          </Link>
        </>
      )}

      {estado === 'sin-sesion' && (
        <>
          <h1>No encontramos la suscripción</h1>
          <p className="gracias-texto">
            Falta la referencia del pago. Si acabas de suscribirte y crees que
            ha habido un error, escríbenos a{' '}
            <a href="mailto:hola@govtalent.app">hola@govtalent.app</a>.
          </p>
          <Link href="/precios" className="gracias-boton">
            Ver los planes
          </Link>
        </>
      )}

      <style jsx>{`
        .gracias-wrap {
          max-width: 520px;
          margin: 0 auto;
          padding: 96px 24px;
          text-align: center;
        }
        h1 {
          font-size: 28px;
          font-weight: 600;
          margin: 24px 0 12px;
        }
        .gracias-texto {
          font-size: 16px;
          line-height: 1.6;
          color: #555;
          margin: 0 auto 32px;
        }
        .gracias-texto a {
          color: #1d6f5c;
          text-decoration: underline;
        }
        .gracias-spinner {
          width: 40px;
          height: 40px;
          margin: 0 auto;
          border: 3px solid #e6e3f7;
          border-top-color: #6d5aef;
          border-radius: 50%;
          animation: gira 0.9s linear infinite;
        }
        @keyframes gira {
          to {
            transform: rotate(360deg);
          }
        }
        .gracias-check {
          width: 48px;
          height: 48px;
          margin: 0 auto;
          border-radius: 50%;
          background: #1d6f5c;
          color: #fff;
          font-size: 24px;
          line-height: 48px;
        }
        .gracias-boton {
          display: inline-block;
          padding: 12px 24px;
          border-radius: 8px;
          background: #1d6f5c;
          color: #fff;
          font-weight: 600;
          text-decoration: none;
        }
      `}</style>
    </main>
  );
}

export default function GraciasPage() {
  // useSearchParams exige un Suspense por encima o falla la validación de
  // build de Next 14.
  return (
    <Suspense fallback={null}>
      <Contenido />
    </Suspense>
  );
}
