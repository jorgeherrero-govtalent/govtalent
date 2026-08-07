// Icono de "Transparencia": dos círculos translúcidos superpuestos, en los
// dos colores de marca (verde + morado). Sustituye al icono de línea de
// Tabler en los sitios donde se representa esta función — sidebar del panel
// de organización, ficha pública de organización.
export default function TransparencyIcon({ size = 20, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 90 90" style={{ flexShrink: 0, ...style }} aria-hidden="true">
      <circle cx="34" cy="45" r="26" fill="#1d6f5c" opacity="0.75" />
      <circle cx="56" cy="45" r="26" fill="#6d5aef" opacity="0.75" />
    </svg>
  );
}
