// =====================================================================
// La legislatura del Congreso, en un solo sitio.
//
// Las cargas del Congreso (diputados, sus fichas, comisiones e
// iniciativas) leen de aquí la legislatura vigente. El portal la escribe
// de tres maneras: en cifra (15) en el buscador de diputados, en romano
// (XV) en las fichas y comisiones, y «Leg.15» en los datos abiertos.
//
// CORTES DISUELTAS (06-10-2026, elecciones el 29-11-2026). Mientras
// `disuelta` tenga fecha, las cargas no dan error porque el Congreso ya
// no publique 350 diputados ni comisiones: se quedan en pausa y conservan
// lo que había (los diputados de la XV y la Diputación Permanente).
//
// CUANDO SE CONSTITUYAN LAS NUEVAS CORTES: cambiar a
//   { numero: '16', romana: 'XVI', anterior: 'XV', disuelta: null }
// y nada más. La carga de diputados da de baja a los de la XV que no
// repitan; los reelegidos conservan su ficha (se reconocen por el nombre).
// =====================================================================

export const LEGISLATURA = {
  numero: '15',
  romana: 'XV',
  // La legislatura anterior, para dar de baja a quien no repita.
  anterior: 'XIV',
  // Fecha de disolución de las Cortes (null en una legislatura en curso).
  disuelta: '2026-10-06',
};

export const CODIGO_DATOS_ABIERTOS = `Leg.${LEGISLATURA.numero}`;

export const AVISO_DISOLUCION = LEGISLATURA.disuelta
  ? `Cortes disueltas el ${LEGISLATURA.disuelta.split('-').reverse().join('/')}: el Congreso ya no publica la legislatura completa. Se conserva lo cargado hasta la constitución de las nuevas Cortes.`
  : null;
