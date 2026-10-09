// Lo que ve el usuario de un contacto enriquecido (contactos_enriquecidos).
//
// Decisión de Jorge (09-10-2026): no se enseña el enlace de la fuente. Se
// guarda en la base de datos para revisarlo nosotros, pero no sale de la API.
//
// `calidad` resume cómo de seguro es un correo personal:
//   'verificado' → comprobado en su servidor de correo o publicado en una
//                  fuente oficial;
//   'probable'   → sigue el patrón confirmado de su organismo, pero su
//                  servidor acepta cualquier dirección y no se puede
//                  comprobar (gencat.cat, por ejemplo).
// Para los correos del cargo, la unidad o la institución vale el tipo.

export function calidadDe(f) {
  if (!f?.email || f.tipo !== 'personal') return null;
  return f.verificado === true ? 'verificado' : 'probable';
}

export function enriquecidoPublico(f) {
  if (!f) return f;
  const { fuente_url, notas, coste_usd, creado_por, ...resto } = f;
  return { ...resto, calidad: calidadDe(f) };
}
