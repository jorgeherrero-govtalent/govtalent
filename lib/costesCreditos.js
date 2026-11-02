// Créditos de contacto que cuesta cada acción (decisión de Jorge, 02-11-2026).
// Sin dependencias: lo usan las rutas y los componentes del navegador.
// Todas se cobran solo si dan resultado.

export const CREDITOS_CORREO = 1; // buscar el correo de alguien que está en el directorio
export const CREDITOS_CORREO_FUERA = 6; // buscar el correo de alguien que no está en el directorio
export const CREDITOS_VERIFICAR = 3; // verificar un correo probable
export const CREDITOS_BUSCAR_FUERA = 10; // buscar fuera de GovTalent quién ocupa unos cargos

export const creditosTexto = (n) => `${n} ${n === 1 ? 'crédito' : 'créditos'}`;
