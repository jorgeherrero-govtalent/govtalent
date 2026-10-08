// Correos revelados por equipo (sql/88). Solo servidor.
//
// La caché de correos encontrados es compartida, pero cada equipo (su bolsa
// de créditos) paga 1 crédito la primera vez que ve un correo. Lo que no ha
// pagado no se le enseña: ve el botón «Buscar correo» y, al pulsarlo, sale
// al momento por 1 crédito.

export async function bolsaDe(admin, userId) {
  const { data, error } = await admin.rpc('creditos_bolsa_id', { p_user: userId });
  if (error) throw new Error(error.message);
  return data;
}

/** De estos ids, los que el equipo del usuario ya tiene pagados. */
export async function reveladosDe(admin, userId, ids) {
  const set = new Set();
  const lista = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!lista.length) return set;
  const bolsa = await bolsaDe(admin, userId);
  for (let i = 0; i < lista.length; i += 500) {
    const { data } = await admin
      .from('contactos_revelados')
      .select('persona_id')
      .eq('bolsa_id', bolsa)
      .in('persona_id', lista.slice(i, i + 500));
    for (const r of data || []) set.add(r.persona_id);
  }
  return set;
}

export async function revelar(admin, userId, personaId) {
  const bolsa = await bolsaDe(admin, userId);
  await admin.from('contactos_revelados').upsert({ bolsa_id: bolsa, persona_id: personaId }, { onConflict: 'bolsa_id,persona_id', ignoreDuplicates: true });
}
