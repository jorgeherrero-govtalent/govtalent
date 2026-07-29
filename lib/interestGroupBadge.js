// La insignia de "grupo de interés registrado" solo debe mostrarse si están
// los tres datos completos: la casilla marcada, el número de inscripción y
// la fecha. Evita mostrarla con datos incompletos (ej. registros antiguos
// o importados antes de que este campo fuera obligatorio).
export function hasInterestGroupBadge(org) {
  return Boolean(org?.interest_group_registered && org?.interest_group_registry_number && org?.interest_group_registered_at);
}
