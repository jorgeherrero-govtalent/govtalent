// =====================================================================
// CORREOS DE FOUNDER
// lib/email/founder.js
//
// Texto sin logo ni botones: tiene que leerse como un correo escrito a
// mano. Se envían desde hola@govtalent.app con la firma de Gmail de esa
// cuenta, que añade el script de Apps Script. Por eso el texto termina en
// la despedida y no lleva nombre ni cargo.
// =====================================================================

function saludo(firstName) {
  const n = String(firstName || '').trim();
  return `Hola${n ? ` ${n}` : ''},`;
}

export function founderUserEmail({ firstName }) {
  return {
    subject: 'Gracias por unirte a GovTalent',
    text: [
      saludo(firstName),
      'Soy Jorge Herrero, fundador de GovTalent. Quería escribirte personalmente para darte las gracias por registrarte y contarte brevemente por qué nace este proyecto.',
      'Quienes trabajamos en asuntos públicos sabemos que gran parte de la información y las herramientas que necesitamos están dispersas entre decenas de fuentes, plataformas y documentos. Esto hace que nuestro trabajo sea más complejo y que entrar en el sector resulte más difícil de lo que debería.',
      'GovTalent nace para cambiarlo: queremos profesionalizar y democratizar el acceso a todas esas herramientas, reuniéndolas en un único espacio que facilite el trabajo de quienes ya forman parte del sector y abra nuevas oportunidades a quienes quieren incorporarse a él.',
      'Estamos construyendo GovTalent junto a las personas que lo utilizan. Por eso, me encantaría tener una breve videollamada contigo, conocerte y entender qué te gustaría conseguir o resolver con la plataforma.',
      'Si te apetece, responde directamente a este correo y buscamos un momento que nos venga bien.',
      'Un abrazo,',
    ].join('\n\n'),
  };
}

export function founderOrganizationEmail({ firstName, orgName }) {
  return {
    subject: `${orgName} en GovTalent`,
    text: [
      saludo(firstName),
      `Soy Jorge Herrero, fundador de GovTalent. He visto que has creado la página de ${orgName} y quería escribirte personalmente.`,
      'Si te resulta útil, te ayudo a dejarla lista: la verificación, la primera oferta o lo que necesite tu equipo. ¿Tienes 15 minutos esta semana o la próxima para una llamada?',
      'Un saludo,',
    ].join('\n\n'),
  };
}
