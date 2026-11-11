// Lee del perfil de LinkedIn que el usuario tiene abierto lo que ya está en
// pantalla: nombre, titular, empresa y la dirección de la foto. Solo cuando
// el panel lo pide; no recorre otras páginas ni guarda nada.
//
// LinkedIn cambia su HTML a menudo: cada dato tiene varios caminos y, si
// ninguno sirve, se devuelve vacío y el panel deja escribirlo a mano.

(() => {
  const limpio = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  function nombre() {
    const h1 = document.querySelector('main h1') || document.querySelector('h1');
    const t = limpio(h1?.textContent);
    if (t) return t;
    // «Nombre Apellido | LinkedIn» o «(3) Nombre Apellido | LinkedIn»
    return limpio(document.title.replace(/^\(\d+\)\s*/, '').split('|')[0]);
  }

  function titular() {
    const el = document.querySelector('main .text-body-medium.break-words') || document.querySelector('main .text-body-medium');
    return limpio(el?.textContent);
  }

  function empresa(t) {
    const boton = document.querySelector(
      'main [aria-label^="Empresa actual"], main [aria-label^="Current company"], main button[aria-label*="Empresa actual"], main button[aria-label*="Current company"]',
    );
    const deBoton = limpio(boton?.textContent);
    if (deBoton) return deBoton;
    // «Directora General en Multinacionales con España» / «… at Company»
    const m = String(t || '').match(/\s(?:en|at|@)\s+(.+)$/i);
    return m ? limpio(m[1].split(/[|·,]/)[0]) : '';
  }

  function foto(n) {
    const candidatas = [
      'main img.pv-top-card-profile-picture__image--show',
      'main img.pv-top-card-profile-picture__image',
      'main button[aria-label*="foto"] img',
      'main button[aria-label*="photo"] img',
    ];
    for (const sel of candidatas) {
      const src = document.querySelector(sel)?.src;
      if (src && /^https:\/\//.test(src)) return src;
    }
    const porNombre = [...document.querySelectorAll('main img')].find((i) => n && limpio(i.alt).includes(n.split(' ')[0]) && i.width >= 100);
    return porNombre?.src || '';
  }

  function leer() {
    if (!/^\/in\/[^/]+/.test(location.pathname)) return { perfil: false, url: location.href };
    const n = nombre();
    const t = titular();
    return { perfil: true, url: location.origin + location.pathname, nombre: n, titular: t, empresa: empresa(t), foto: foto(n) };
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
