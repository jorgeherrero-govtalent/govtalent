// Créditos de contacto que cuesta cada acción (decisión de Jorge, 02-11-2026).
//
// 11-11-2026: «Buscar correo» tiene una sola tarifa, 6 créditos. El botón
// solo sale cuando GovTalent no tiene ningún correo que enseñar (ni
// publicado ni probable), así que siempre es una búsqueda fuera. Antes
// costaba 1 crédito si la persona estaba en el directorio.
// Sin dependencias: lo usan las rutas y los componentes del navegador.
// Todas se cobran solo si dan resultado.

export const CREDITOS_CORREO = 6; // buscar el correo de alguien que está en el directorio (misma tarifa que fuera)
export const CREDITOS_CORREO_FUERA = 6; // buscar el correo de alguien que no está en el directorio
export const CREDITOS_VERIFICAR = 3; // verificar un correo probable
export const CREDITOS_BUSCAR_FUERA = 10; // buscar fuera de GovTalent quién ocupa unos cargos

export const creditosTexto = (n) => `${n} ${n === 1 ? 'crédito' : 'créditos'}`;
