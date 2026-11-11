// Lee del perfil de LinkedIn que el usuario tiene abierto lo que ya está en
// pantalla: nombre, titular, empresa, ubicación y la dirección de la foto. Solo cuando
// el panel lo pide; no recorre otras páginas ni guarda nada.
//
// LinkedIn cambia su HTML a menudo: cada dato tiene varios caminos y, si
// ninguno sirve, se devuelve vacío y el panel deja escribirlo a mano.

(() => {
  const limpio = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  // La tarjeta de arriba del perfil: la sección que contiene el nombre.
  function tarjeta() {
    const h1 = document.querySelector('main h1') || document.querySelector('h1');
    return h1?.closest('section') || h1?.closest('main') || document.body;
  }

  function nombre() {
    const h1 = document.querySelector('main h1') || document.querySelector('h1');
    const t = limpio(h1?.textContent);
    if (t) return t;
    // «Nombre Apellido | LinkedIn» o «(3) Nombre Apellido | LinkedIn»
    return limpio(document.title.replace(/^\(\d+\)\s*/, '').split('|')[0]);
  }

  // Textos sueltos de la tarjeta, en el orden en que se leen.
  function textos(raiz) {
    const fuera = new Set();
    const lista = [];
    const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = andar.nextNode(); n; n = andar.nextNode()) {
      const padre = n.parentElement;
      if (!padre || padre.closest('script, style, button, [aria-hidden="true"], .visually-hidden')) continue;
      const t = limpio(n.textContent);
      if (!t || fuera.has(t)) continue;
      fuera.add(t);
      lista.push({ t, el: padre });
    }
    return lista;
  }

  const RUIDO = /^(·|•|\d+º|\d+(st|nd|rd|th)|él|ella|he\/him|she\/her|they\/them|información de contacto|contact info|más de \d+.*|\d+\+? .*(contactos|connections|seguidores|followers).*)$/i;

  function titular(n, raiz) {
    const el = raiz.querySelector('.text-body-medium.break-words') || raiz.querySelector('.text-body-medium');
    const deClase = limpio(el?.textContent);
    if (deClase) return deClase;
    // Sin clases conocidas: el primer texto largo que sigue al nombre.
    const lista = textos(raiz);
    const i = lista.findIndex((x) => x.t === n || n.startsWith(x.t));
    for (const x of lista.slice(i + 1, i + 14)) {
      if (x.el.closest('h1, a')) continue;
      if (x.t.length < 8 || RUIDO.test(x.t) || n.includes(x.t)) continue;
      return x.t;
    }
    return '';
  }

  function ubicacion(raiz) {
    // Está pegada al enlace «Información de contacto».
    const enlace = [...raiz.querySelectorAll('a, button')].find((a) => /informaci[oó]n de contacto|contact info/i.test(a.textContent || ''));
    for (let caja = enlace?.parentElement, i = 0; caja && i < 4; caja = caja.parentElement, i++) {
      const t = limpio((caja.textContent || '').replace(/informaci[oó]n de contacto|contact info/gi, '')).replace(/^[·•\s]+|[·•\s]+$/g, '');
      if (t.length >= 3 && t.length <= 80) return t;
      if (t.length > 80) break;
    }
    return '';
  }

  function empresa(t, raiz) {
    const boton = raiz.querySelector('[aria-label^="Empresa actual"], [aria-label^="Current company"], [aria-label*="Empresa actual"], [aria-label*="Current company"]');
    const deBoton = limpio(boton?.textContent) || limpio((boton?.getAttribute('aria-label') || '').split(/[:.]/)[1]);
    if (deBoton) return deBoton;
    // El primer enlace a una página de empresa: en la tarjeta, o en «Experiencia».
    for (const zona of [raiz, document.querySelector('main') || document.body]) {
      for (const a of zona.querySelectorAll('a[href*="/company/"]')) {
        const texto = limpio(a.textContent).split(/\s[·•]\s/)[0];
        const alt = limpio(a.querySelector('img')?.alt).replace(/^(logotipo de|logo de|logo)\s+/i, '').replace(/\s+logo$/i, '');
        const v = texto && texto.length <= 80 ? texto : alt;
        if (v) return v;
      }
    }
    // «Directora General en Multinacionales con España» / «… at Company»
    const m = String(t || '').match(/\s(?:en|at|@)\s+(.+)$/i);
    return m ? limpio(m[1].split(/[|·,]/)[0]) : '';
  }

  function foto(raiz) {
    // La foto de perfil de verdad lleva «profile-displayphoto» en su dirección
    // (la silueta gris no). La del perfil es la de la tarjeta; si la tarjeta
    // no se reconoce, la más grande de la página.
    const esFoto = (i) => /^https:\/\/media\.licdn\.com\/.*profile-displayphoto/.test(i.currentSrc || i.src || '');
    const lado = (i) => Math.max(i.getBoundingClientRect().width, i.width || 0);
    const mayor = (lista) => lista.filter(esFoto).sort((a, b) => lado(b) - lado(a))[0];
    const img = mayor([...raiz.querySelectorAll('img')]) || mayor([...document.querySelectorAll('img')].filter((i) => !i.closest('header, nav, aside') && lado(i) >= 90));
    return img ? img.currentSrc || img.src : '';
  }

  function leer() {
    if (!/^\/in\/[^/]+/.test(location.pathname)) return { perfil: false, url: location.href };
    const raiz = tarjeta();
    const n = nombre();
    const t = titular(n, raiz);
    return { perfil: true, url: location.origin + location.pathname, nombre: n, titular: t, empresa: empresa(t, raiz), ubicacion: ubicacion(raiz), foto: foto(raiz) };
  }

  chrome.runtime.onMessage.addListener((msg, _quien, responder) => {
    if (msg?.tipo === 'gt-leer-perfil') responder(leer());
    return false;
  });

  // LinkedIn navega sin recargar: se avisa al panel cuando cambia la dirección.
  let ultima = location.href;
  setInterval(() => {
    if (location.href === ultima) return;
    ultima = location.href;
    chrome.runtime.sendMessage({ tipo: 'gt-cambio-de-pagina' }).catch(() => {});
  }, 800);
})();
