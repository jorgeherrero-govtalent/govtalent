"use client";

import { useState } from "react";

// Logo redondo de una organización (maqueta C, 19-11-2026): como las fotos
// de las personas. Sin logo, o si no carga, las iniciales en un círculo gris.
// Los logos salen de la web de cada organización (edge function
// logos-directorio, sql/138).

const VACIAS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "y",
  "e",
  "en",
  "para",
  "por",
  "a",
  "al",
  "asociación",
  "asociacion",
  "asoc.",
  "confederación",
  "confederacion",
  "federación",
  "federacion",
]);

export function inicialesOrg(nombre = "") {
  // Siglas entre paréntesis o tras un guion, si las hay: (ANDEMA) → AN
  const sig =
    nombre.match(/\(([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9&-]{1,9})\)/) ||
    nombre.match(/^([A-ZÁÉÍÓÚÑ]{2,8})\b/);
  if (sig)
    return sig[1]
      .replace(/[^A-Za-zÁÉÍÓÚÑ]/g, "")
      .slice(0, 2)
      .toUpperCase();
  const palabras = nombre
    .replace(/\(.*?\)/g, " ")
    .split(/[\s,.–-]+/)
    .filter((p) => p && !VACIAS.has(p.toLowerCase()));
  const ini = (palabras[0]?.[0] || "") + (palabras[1]?.[0] || "");
  return (ini || nombre.slice(0, 1)).toUpperCase();
}

export default function LogoOrg({ nombre, logo, tam = 30 }) {
  const [fallo, setFallo] = useState(false);
  const base = {
    width: tam,
    height: tam,
    borderRadius: "50%",
    flexShrink: 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  if (logo && !fallo) {
    return (
      <div
        style={{ ...base, background: "#fff", border: ".5px solid #e0dfd8" }}
      >
        <img
          src={logo}
          alt=""
          loading="lazy"
          onError={() => setFallo(true)}
          style={{ width: "78%", height: "78%", objectFit: "contain" }}
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        ...base,
        background: "#f5f4f1",
        color: "#6b6b70",
        fontSize: Math.round(tam * 0.36),
        fontWeight: 600,
        letterSpacing: ".3px",
      }}
    >
      {inicialesOrg(nombre)}
    </div>
  );
}
