// ¿Puede este usuario ver los contactos (correo, teléfono y web de cargos,
// unidades, diputados y asesores, y la Base de datos)?
//
// Desde octubre de 2026 los contactos son del Directorio, que se contrata
// aparte del plan de vigilancia. La regla vive en SQL, en
// public.tiene_directorio_de (sql/73): Directorio propio activo, o miembro
// de una organización con Teams activo, que lo incluía.
//
// Se usa en el servidor. En el navegador, useDirectorio solo decide qué se
// pinta; lo que protege el dato es que no llegue si no hay derecho.
export async function puedeVerContactos(admin, userId) {
  if (!userId) return false;
  const { data, error } = await admin.rpc('tiene_directorio_de', { p_user: userId });
  if (error) {
    console.error('[accesoContactos]', error.message);
    return false;
  }
  return data === true;
}
