// Panel lateral de la extensión de GovTalent (maqueta A, 12-11-2026).
//
// Pregunta a la pestaña activa qué perfil hay abierto (linkedin.js) y a
// GovTalent si esa persona está en el directorio (/api/extension/persona).
// Va con la sesión de GovTalent del navegador: si no hay, lo dice.
//
// Todo se pinta con nodos y textContent, nunca con HTML montado a mano:
// los nombres vienen de una página ajena.

const WEB = 'https://govtalent.app';
const CREDITOS_CORREO = 6; // mismo valor que lib/costesCreditos.js

const raiz = document.getElementById('raiz');
const elCreditos = document.getElementById('creditos');

let turno = 0; // para descartar respuestas de un perfil que ya no está abierto
let estado = { perfil: null, datos: null };

/* ---------- Utilidades ---------- */

function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'onclick') el.addEventListener('click', v);
    else if (k === 'onsubmit') el.addEventListener('submit', v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    el.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

const TRAZOS = {
  correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h1M4 12h1M4 18h1"/>',
  abrir: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  ia: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
};
function icono(nombre, color = '#57534e', lado = 15) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', lado);
  svg.setAttribute('height', lado);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  // Trazos fijos, escritos aquí: no hay nada de fuera.
  svg.innerHTML = TRAZOS[nombre] || '';
  return svg;
}

const miles = (n) => Number(n || 0).toLocaleString('es-ES');
const creditosTexto = (n) => `${miles(n)} ${Number(n) === 1 ? 'crédito' : 'créditos'}`;
const iniciales = (n) =>
  String(n || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

function avatar(nombre, foto, mini = false) {
  if (foto && /^https:\/\//.test(foto)) {
    const img = h('img', { class: `avatar${mini ? ' mini' : ''}`, src: foto, alt: '' });
    img.addEventListener('error', () => img.replaceWith(avatar(nombre, null, mini)));
    return img;
  }
  return h('span', { class: `avatar${mini ? ' mini' : ''}`, 'aria-hidden': 'true' }, iniciales(nombre));
}

function pintar(...nodos) {
  raiz.replaceChildren(...nodos.flat().filter(Boolean));
}

function ponerCreditos(saldo) {
  elCreditos.textContent = saldo && saldo.disponibles != null ? creditosTexto(saldo.disponibles) : '';
}

/** Llama a GovTalent con la sesión del navegador. Lanza { sinSesion } si no hay. */
async function api(ruta, cuerpo, metodo = cuerpo ? 'POST' : 'GET') {
  let res;
  try {
    res = await fetch(WEB + ruta, {
      method: metodo,
      credentials: 'include',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw { mensaje: 'No se pudo conectar con GovTalent.' };
  }
  const tipo = res.headers.get('content-type') || '';
  // Sin sesión, GovTalent lleva a /login: llega una página, no datos.
  if (res.status === 401 || res.redirected || !tipo.includes('application/json')) throw { sinSesion: true };
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw { mensaje: json.error || 'No se pudo completar.', json, estado: res.status };
  return json;
}

async function pestanaActiva() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function leerPerfil() {
  const tab = await pestanaActiva();
  if (!tab?.id || !/^https:\/\/www\.linkedin\.com\//.test(tab.url || '')) return { fuera: true };
  try {
    return (await chrome.tabs.sendMessage(tab.id, { tipo: 'gt-leer-perfil' })) || { perfil: false };
  } catch {
    // La pestaña se abrió antes de instalar la extensión: hay que recargarla.
    return { recargar: true };
  }
}

/* ---------- Pantallas ---------- */

function aviso(titulo, texto, boton) {
  return h('section', { class: 'tarjeta pila' }, h('b', {}, titulo), texto ? h('span', { class: 'gris' }, texto) : null, boton || null);
}

function pantallaSinSesion() {
  ponerCreditos(null);
  pintar(
    aviso(
      'Inicia sesión en GovTalent',
      'La extensión usa tu sesión de GovTalent en este navegador.',
      h('a', { class: 'boton negro', href: `${WEB}/login`, target: '_blank', rel: 'noopener' }, 'Iniciar sesión'),
    ),
  );
}

function cabeceraPersona({ nombre, cargo, organizacion, foto, etiqueta }) {
  return h(
    'section',
    { class: 'tarjeta' },
    h(
      'div',
      { class: 'persona' },
      avatar(nombre, foto),
      h(
        'div',
        { class: 'persona-datos' },
        h('span', { class: 'nombre' }, nombre),
        cargo ? h('span', { class: 'cargo' }, cargo) : null,
        organizacion ? h('span', { class: 'org' }, organizacion) : null,
        etiqueta ? h('span', { class: 'etq' }, etiqueta) : null,
      ),
    ),
  );
}

function filaCorreo(email, nota) {
  const copiar = h('button', { type: 'button', class: 'icono-boton', 'aria-label': 'Copiar correo', title: 'Copiar correo' }, icono('copiar'));
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(email);
      copiar.setAttribute('title', 'Copiado');
    } catch {}
  });
  return h('div', { class: 'dato' }, icono('correo'), h('span', {}, email, nota ? h('span', { class: 'etq ia', style: 'margin:0 0 0 6px' }, nota) : null), copiar);
}

function bloqueBuscarCorreo({ nombre, institucion, id, saldo, alEncontrar }) {
  const caja = h('section', { class: 'tarjeta' });
  const pie = h('span', { class: 'gris centro' }, saldo?.disponibles != null ? `Te quedan ${creditosTexto(saldo.disponibles)} este mes` : '');

  function inicio(error) {
    const boton = h('button', { type: 'button', class: 'boton morado' }, 'Buscar correo');
    boton.addEventListener('click', buscar);
    caja.replaceChildren(
      h('div', { class: 'ia-titulo' }, icono('ia', '#6d5aef', 16), 'Buscar su correo'),
      h('p', { class: 'ia-texto' }, error || 'Lo buscamos en fuentes oficiales y lo comprobamos en el servidor de su organización.'),
      h('div', { class: 'ia-pie' }, h('span', { class: 'coste' }, `${creditosTexto(CREDITOS_CORREO)}, solo si lo encontramos`), boton),
    );
  }

  async function buscar() {
    caja.replaceChildren(
      h('div', { class: 'ia-titulo' }, h('span', { class: 'girando', role: 'status', 'aria-label': 'Buscando' }), 'Buscando su correo…'),
      h('p', { class: 'ia-texto', style: 'margin-bottom:0' }, 'Puede tardar hasta un minuto. No cierres el panel.'),
    );
    try {
      const j = await api('/api/contactos/enriquecer', id ? { id } : { persona: { nombre, institucion } });
      if (j.saldo) {
        ponerCreditos(j.saldo);
        pie.textContent = `Te quedan ${creditosTexto(j.saldo.disponibles)} este mes`;
      }
      const email = j.resultado?.email || j.probable?.email || j.respaldo?.email || null;
      if (!email) {
        inicio('No hemos encontrado su correo. No se ha descontado ningún crédito.');
        return;
      }
      const nota = j.resultado?.email
        ? j.resultado.calidad === 'probable' ? 'Probable' : null
        : j.probable?.email ? (j.probable.verificado ? null : 'Probable') : 'Unidad';
      caja.replaceChildren(
        h('span', { class: 'titulillo' }, 'Contacto'),
        filaCorreo(email, nota),
        h('span', { class: 'gris', style: 'display:block;margin-top:8px' }, j.cobrado ? `Se han descontado ${creditosTexto(CREDITOS_CORREO)}.` : 'Sin coste.'),
      );
      if (alEncontrar) alEncontrar(j);
    } catch (e) {
      if (e.sinSesion) return pantallaSinSesion();
      if (e.json?.sinCreditos) {
        caja.replaceChildren(
          h('div', { class: 'ia-titulo' }, 'No te quedan créditos suficientes'),
          h('p', { class: 'ia-texto' }, `Buscar un correo cuesta ${creditosTexto(CREDITOS_CORREO)}.`),
          h('a', { class: 'boton negro', href: `${WEB}/account`, target: '_blank', rel: 'noopener' }, 'Comprar créditos'),
        );
        return;
      }
      inicio(e.mensaje || 'No se pudo completar la búsqueda. No se ha descontado ningún crédito.');
    }
  }

  inicio();
  return [caja, pie];
}

/** «Añadir a lista»: elegir una lista existente o crear una. */
function bloqueLista(personaId, nombre, alCerrar) {
  const caja = h('section', { class: 'tarjeta pila' }, h('span', { class: 'gris' }, 'Cargando tus listas…'));

  async function cargar() {
    try {
      const j = await api('/api/contactos/listas');
      const listas = j.listas || [];
      const sel = h('select', { 'aria-label': 'Lista' }, h('option', { value: '' }, 'Nueva lista'), listas.map((l) => h('option', { value: l.id }, l.nombre)));
      const nombreNueva = h('input', { type: 'text', value: nombre, maxlength: '120', 'aria-label': 'Nombre de la lista nueva' });
      const campoNueva = h('label', { class: 'campo' }, 'Nombre de la lista', nombreNueva);
      sel.addEventListener('change', () => (campoNueva.style.display = sel.value ? 'none' : ''));
      const guardar = h('button', { type: 'submit', class: 'boton negro' }, 'Añadir');
      const cancelar = h('button', { type: 'button', class: 'boton' }, 'Cancelar');
      cancelar.addEventListener('click', alCerrar);
      const error = h('span', { class: 'gris' });
      const form = h(
        'form',
        { class: 'pila' },
        h('b', {}, 'Añadir a lista'),
        h('label', { class: 'campo' }, 'Lista', sel),
        campoNueva,
        error,
        h('div', { class: 'acciones' }, cancelar, guardar),
      );
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        guardar.disabled = true;
        error.textContent = '';
        try {
          let listaId = sel.value;
          if (listaId) await api(`/api/contactos/listas/${listaId}/miembros`, { ids: [personaId] });
          else {
            const n = nombreNueva.value.trim();
            if (!n) throw { mensaje: 'Ponle un nombre a la lista.' };
            listaId = (await api('/api/contactos/listas', { nombre: n, ids: [personaId] })).id;
          }
          caja.replaceChildren(
            h('b', {}, 'Añadido a la lista'),
            h('a', { class: 'boton', href: `${WEB}/contactos/listas/${listaId}`, target: '_blank', rel: 'noopener' }, icono('abrir'), 'Ver la lista'),
          );
        } catch (err) {
          if (err.sinSesion) return pantallaSinSesion();
          error.textContent = err.mensaje || 'No se pudo añadir.';
          guardar.disabled = false;
        }
      });
      caja.replaceChildren(form);
    } catch (e) {
      if (e.sinSesion) return pantallaSinSesion();
      caja.replaceChildren(h('span', { class: 'gris' }, e.mensaje || 'No se pudieron cargar tus listas.'), h('button', { type: 'button', class: 'boton', onclick: alCerrar }, 'Cerrar'));
    }
  }
  cargar();
  return caja;
}

/** Guarda en el directorio la foto del perfil de quien ya está en GovTalent. */
async function guardarFoto(perfil, p) {
  // Solo la foto de perfil de verdad: la silueta gris de LinkedIn no vale.
  if (!p.guardar_foto || !/^https:\/\/media\.licdn\.com\/.*profile-displayphoto/.test(perfil.foto || '')) return;
  try {
    const img = await fetch(perfil.foto);
    if (!img.ok) return;
    const blob = await img.blob();
    if (!blob.type.startsWith('image/') || blob.size > 1024 * 1024) return;
    const form = new FormData();
    form.append('persona_id', p.id);
    form.append('origen_url', perfil.url || '');
    form.append('foto', blob, 'foto');
    await fetch(`${WEB}/api/extension/foto`, { method: 'POST', credentials: 'include', body: form });
  } catch {}
}

function pantallaEncontrada(perfil, d) {
  const p = d.persona;
  guardarFoto(perfil, p);
  const hueco = h('div');
  const botonLista = h('button', { type: 'button', class: 'boton negro' }, icono('lista', '#fff'), 'Añadir a lista');
  botonLista.addEventListener('click', () => {
    if (!d.directorio) return window.open(`${WEB}/precios`, '_blank', 'noopener');
    hueco.replaceChildren(bloqueLista(p.id, p.nombre, () => hueco.replaceChildren()));
  });
  const ficha = h('a', { class: 'boton', href: `${WEB}/instituciones/directorio?b=${encodeURIComponent(p.nombre)}`, target: '_blank', rel: 'noopener' }, icono('abrir'), 'Ver ficha');

  let contacto;
  if (!d.directorio) {
    // Sin el Directorio: el correo, velado, lleva a los planes.
    contacto = h(
      'section',
      { class: 'tarjeta' },
      h('span', { class: 'titulillo' }, 'Contacto'),
      h('div', { class: 'dato' }, icono('correo'), h('span', { class: 'velado', 'aria-hidden': 'true' }, 'nombre.apellido@organizacion.es')),
      h('a', { class: 'boton', style: 'margin-top:10px', href: `${WEB}/precios`, target: '_blank', rel: 'noopener' }, 'Ver planes'),
    );
  } else {
    const email = p.email || p.probable?.email || p.email_unidad;
    const nota = p.email ? null : p.probable?.email ? (p.probable.verificado ? null : 'Probable') : p.email_unidad ? 'Unidad' : null;
    if (email) {
      contacto = h(
        'section',
        { class: 'tarjeta' },
        h('span', { class: 'titulillo' }, 'Contacto'),
        filaCorreo(email, nota),
        p.telefono ? h('div', { class: 'dato' }, icono('telefono'), h('span', {}, p.telefono)) : null,
      );
    } else {
      // Ningún correo que enseñar: se busca fuera, a 6 créditos.
      contacto = bloqueBuscarCorreo({ nombre: p.nombre, institucion: p.institucion, id: p.id, saldo: d.saldo });
    }
  }

  const otros = d.total_organizacion - 1;
  const organizacion =
    d.colegas?.length > 0
      ? h(
          'section',
          { class: 'tarjeta' },
          h('span', { class: 'titulillo' }, `En su organización (${miles(d.total_organizacion)})`),
          d.colegas.map((c) => h('div', { class: 'fila' }, avatar(c.nombre, null, true), h('span', {}, h('b', {}, c.nombre), h('small', {}, c.cargo || '')))),
          otros > d.colegas.length
            ? h('a', { class: 'gris', style: 'display:block;margin-top:8px', href: `${WEB}/instituciones/directorio?b=${encodeURIComponent(p.institucion)}`, target: '_blank', rel: 'noopener' }, `Ver las ${miles(d.total_organizacion)} personas`)
            : null,
        )
      : null;

  pintar(
    cabeceraPersona({ nombre: p.nombre, cargo: p.cargo, organizacion: p.institucion, foto: p.foto_url || perfil.foto, etiqueta: 'En GovTalent' }),
    contacto,
    h('div', { class: 'acciones' }, botonLista, ficha),
    hueco,
    organizacion,
  );
}

function pantallaNoEsta(perfil, d) {
  const hueco = h('div');
  let buscar;
  if (!d.directorio) {
    buscar = aviso('Buscar su correo', 'Disponible con suscripción.', h('a', { class: 'boton', href: `${WEB}/precios`, target: '_blank', rel: 'noopener' }, 'Ver planes'));
  } else if (!perfil.empresa) {
    // Sin organización no se puede buscar: se pide.
    const campo = h('input', { type: 'text', placeholder: 'Su organización', maxlength: '160' });
    const form = h('form', { class: 'tarjeta pila' }, h('b', {}, 'Buscar su correo'), h('label', { class: 'campo' }, 'Organización', campo), h('button', { type: 'submit', class: 'boton negro' }, 'Continuar'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (campo.value.trim().length < 2) return;
      perfil.empresa = campo.value.trim();
      pantallaNoEsta(perfil, d);
    });
    buscar = form;
  } else {
    buscar = bloqueBuscarCorreo({
      nombre: perfil.nombre,
      institucion: perfil.empresa,
      saldo: d.saldo,
      alEncontrar: (j) => {
        // Al encontrarlo se da de alta en el directorio: ya se puede guardar en una lista.
        if (!j.persona_id || String(j.persona_id).startsWith('libre:')) return;
        const boton = h('button', { type: 'button', class: 'boton negro' }, icono('lista', '#fff'), 'Añadir a lista');
        boton.addEventListener('click', () => hueco.replaceChildren(bloqueLista(j.persona_id, perfil.nombre, () => hueco.replaceChildren(boton))));
        hueco.replaceChildren(boton);
      },
    });
  }

  const candidatas =
    d.candidatas?.length > 0
      ? h(
          'section',
          { class: 'tarjeta' },
          h('span', { class: 'titulillo' }, 'Con ese nombre en GovTalent'),
          d.candidatas.map((c) => h('div', { class: 'fila' }, avatar(c.nombre, null, true), h('span', {}, h('b', {}, c.nombre), h('small', {}, [c.cargo, c.institucion].filter(Boolean).join(', '))))),
        )
      : null;

  pintar(
    cabeceraPersona({ nombre: perfil.nombre, cargo: perfil.titular, organizacion: perfil.empresa, foto: perfil.foto, etiqueta: 'No está en GovTalent' }),
    candidatas,
    buscar,
    hueco,
  );
}

/* ---------- Arranque ---------- */

async function actualizar() {
  const n = ++turno;
  pintar(h('section', { class: 'tarjeta' }, h('span', { class: 'gris' }, 'Cargando…')));

  const perfil = await leerPerfil();
  if (n !== turno) return;
  if (perfil.fuera || perfil.perfil === false) {
    // Fuera de un perfil: al menos se comprueba la sesión y se enseña el saldo.
    try {
      const d = await api('/api/extension/persona', { nombre: '' });
      if (n !== turno) return;
      ponerCreditos(d.saldo);
      pintar(aviso('Abre un perfil de LinkedIn', 'Con un perfil abierto, aquí verás si esa persona está en GovTalent, su cargo y su correo.'));
    } catch (e) {
      if (n !== turno) return;
      if (e.sinSesion) return pantallaSinSesion();
      pintar(aviso('No se pudo conectar', e.mensaje || ''));
    }
    return;
  }
  if (perfil.recargar) {
    pintar(aviso('Recarga esta pestaña', 'La página se abrió antes de instalar la extensión. Recárgala y vuelve a abrir el panel.'));
    return;
  }
  if (!perfil.nombre) {
    pintar(aviso('No hemos podido leer este perfil', 'LinkedIn ha cambiado algo en la página. Recárgala; si sigue igual, avísanos.'));
    return;
  }

  try {
    const d = await api('/api/extension/persona', { nombre: perfil.nombre, organizacion: perfil.empresa || perfil.titular || '' });
    if (n !== turno) return;
    estado = { perfil, datos: d };
    ponerCreditos(d.saldo);
    if (d.persona) pantallaEncontrada(perfil, d);
    else pantallaNoEsta(perfil, d);
  } catch (e) {
    if (n !== turno) return;
    if (e.sinSesion) return pantallaSinSesion();
    pintar(aviso('No se pudo consultar GovTalent', e.mensaje || ''));
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.tipo === 'gt-cambio-de-pagina') setTimeout(actualizar, 900); // LinkedIn tarda en pintar el perfil nuevo
});
chrome.tabs.onActivated.addListener(() => actualizar());
chrome.tabs.onUpdated.addListener((_id, cambio, tab) => {
  if (cambio.status === 'complete' && tab.active) actualizar();
});

actualizar();
