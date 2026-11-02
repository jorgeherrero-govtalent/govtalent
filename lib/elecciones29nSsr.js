// Pinta en el servidor el explorador del 29N con el mismo código que usa el
// navegador (lib/elecciones29nExplorador.js) sobre un DOM de linkedom.
// Así el HTML que reciben Google, los asistentes de IA y las vistas previas
// de redes ya trae el titular, las cifras, los candidatos y la provincia
// inicial, sin depender de JavaScript. En el navegador se vuelve a pintar
// igual y queda interactivo.
import { parseHTML } from 'linkedom';
import { iniciar } from '@/lib/elecciones29nExplorador';
import { ESQUELETO } from '@/lib/elecciones29nEsqueleto';

export function htmlInicial(datos) {
  try {
    const { document } = parseHTML('<!doctype html><html><body><div class="e29"></div></body></html>');
    const raiz = document.querySelector('.e29');
    raiz.innerHTML = ESQUELETO;
    // El explorador ordena los arrays que recibe: se le pasa una copia.
    iniciar(raiz, { ...datos, d: [...datos.d], nu: [...datos.nu] });
    // linkedom no cierra los elementos vacíos del SVG (<circle ...>): el
    // navegador los anidaría y el hemiciclo saldría como un solo punto.
    return raiz.innerHTML
      .replace(/<\/(circle|path|rect|line)>/g, '')
      .replace(/<(circle|path|rect|line)(\s[^>]*?)?\/?>/g, '<$1$2/>');
  } catch (e) {
    console.error('elecciones29n: no se pudo pintar en el servidor', e);
    return ESQUELETO;
  }
}
