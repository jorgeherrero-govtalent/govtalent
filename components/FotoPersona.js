'use client';
import { useEffect, useState } from 'react';

// Fotos de las personas del directorio (sql/131). Se piden todas una vez
// por visita (son pocas) y se cruzan por id.

let memoria = null; // { fotos, cuando }
let pendiente = null;
const CADUCA_MS = 5 * 60 * 1000;

function pedir() {
  if (memoria && Date.now() - memoria.cuando < CADUCA_MS) return Promise.resolve(memoria.fotos);
  if (!pendiente) {
    pendiente = fetch('/api/directorio/fotos')
      .then((r) => (r.ok ? r.json() : { fotos: {} }))
      .then((d) => {
        memoria = { fotos: d.fotos || {}, cuando: Date.now() };
        return memoria.fotos;
      })
      .catch(() => ({}))
      .finally(() => {
        pendiente = null;
      });
  }
  return pendiente;
}

export function useFotos() {
  const [fotos, setFotos] = useState(memoria?.fotos || {});
  useEffect(() => {
    let vivo = true;
    pedir().then((f) => vivo && setFotos(f));
    return () => {
      vivo = false;
    };
  }, []);
  return fotos;
}

/** La foto de la persona si la hay; si no (o si no carga), lo que venga dentro: sus iniciales. */
export default function FotoPersona({ url, lado, children }) {
  const [rota, setRota] = useState(false);
  if (!url || rota) return children;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={lado}
      height={lado}
      loading="lazy"
      onError={() => setRota(true)}
      style={{ width: lado, height: lado, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#f0efe9' }}
    />
  );
}
