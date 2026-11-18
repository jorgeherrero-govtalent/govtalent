// Búsquedas recomendadas: con filtros fijos (no pasan por la IA), así que
// siempre dan el mismo resultado. Comprobadas contra los datos el
// 07-10-2026 (la del Grupo Popular, el 18-11-2026); si cambia una fuente, revisar que sigan devolviendo gente.
export const IDEAS = [
  {
    // 18-11-2026: sustituye a «Embajadores y cuerpo diplomático en España».
    texto: 'Asistentes y asesores del Grupo Parlamentario Popular en el Congreso',
    resumen: 'Los asistentes y asesores del Grupo Parlamentario Popular en el Congreso de los Diputados.',
    filtros: { unidades: ['Grupo Parlamentario Popular en el Congreso'], cargos: ['asistente', 'asesor'] },
  },
  {
    // 18-11-2026. 85 cámaras y 159 personas ese día.
    texto: 'Presidentes y secretarios de las Cámaras de Comercio de España',
    resumen: 'Quien preside y quien ocupa la secretaría general de cada Cámara de Comercio.',
    filtros: { instituciones: ['Cámara de Comercio'], cargos: ['president', 'secretari'] },
  },
  {
    texto: 'Eurodiputados españoles y sus asistentes',
    resumen: 'Los 60 eurodiputados elegidos en España y los asistentes de sus equipos.',
    filtros: { jurisdiccion: 'UE', tipos: ['legislativo'], paises: ['ES'] },
  },
];
