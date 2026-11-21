// =====================================================================
// AGENDAS DE LOS GOBIERNOS AUTONÓMICOS
// lib/agendaCcaa/index.js
//
// Las comunidades que se leen (decisión de Jorge, 21-11-2026: las cuatro
// más grandes de momento). Para añadir otra: su lector en este directorio
// y una entrada aquí. El sync es /api/sync/agenda-ccaa.
//
// Cada lector recibe { pedir, dias, conocidos } y devuelve
//   { actos, fechas, errores?, diagnostico? }
// donde `fechas` son los días que ha leído enteros: lo que se tenía de
// ese día y ya no aparece se marca «retirado». Una fecha puede venir con
// su página ({ fecha, agenda_url }) cuando la comunidad reparte un mismo
// día en varias páginas.
// =====================================================================

import { leerMadrid } from './madrid';
import { leerCataluna } from './cataluna';
import { leerAndalucia } from './andalucia';
import { leerValencia } from './valencia';

export { CCAA } from './comun';

export const LECTORES = {
  madrid: leerMadrid,
  cataluna: leerCataluna,
  andalucia: leerAndalucia,
  valenciana: leerValencia,
};

// Dominios a los que puede redirigir el enlace de un acto
// (app/(app)/institutions/agenda-ccaa/[id]).
export const DOMINIOS = ['www.comunidad.madrid', 'comunidad.madrid', 'govern.cat', 'www.juntadeandalucia.es', 'comunica.gva.es'];
