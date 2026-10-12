// =====================================================================
// Parlamentos autonómicos con composición cargada (sql/91): nombre, alias
// y enlaces. Sin dependencias de cliente, para usarlo también en las rutas
// del servidor (el listado de Comunidades autónomas).
// =====================================================================

export const PARLAMENTOS_UI = {
  madrid: {
    nombre: 'Asamblea de Madrid',
    // Como la llama el directorio de Comunidades autónomas (Agenda de la Comunicación).
    alias: ['Asamblea de la Comunidad de Madrid'],
    // Su ficha en Comunidades autónomas (directorio_entidades.id): gabinete,
    // prensa y contacto institucional.
    fichaComunidad: 297,
    ccaa: 'Comunidad de Madrid',
    legislatura: 'XIII',
    dominio: '@asambleamadrid.es',
    fuente: 'la Asamblea de Madrid',
    web: 'https://www.asambleamadrid.es/composicion/diputados',
    fichaGrupo: (id) => `https://www.asambleamadrid.es/composicion/grupos-parlamentarios/ficha-del-grupo?grupoParlamentario=${id}`,
  },
};

/** Clave del parlamento por su nombre o alias ('Asamblea de la Comunidad de Madrid' → 'madrid'). */
export function parlamentoPorNombre(nombre) {
  const n = String(nombre || '').trim().toLowerCase();
  return Object.entries(PARLAMENTOS_UI).find(([, c]) => [c.nombre, ...(c.alias || [])].some((x) => x.toLowerCase() === n))?.[0] || null;
}
