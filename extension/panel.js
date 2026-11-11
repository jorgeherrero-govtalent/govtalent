// Panel lateral de la extensión de GovTalent (12-11-2026).
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
  cargo: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 13h18"/>',
  empresa: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M14 10h5a1 1 0 0 1 1 1v10"/><path d="M2 21h20"/><path d="M8 8h2M8 12h2M8 16h2"/>',
  lugar: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.800-7 11-7 11z"/><circle cx="12" cy="10" r="2.500"/>',
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
  const hay = saldo && saldo.disponibles != null;
  elCreditos.textContent = hay ? `Te quedan ${creditosTexto(saldo.disponibles)} este mes` : '';
  elCreditos.parentElement.style.display = hay ? '' : 'none';
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
  );
}

/** Una línea de «Información de contacto»: icono, etiqueta y valor. */
function linea(nombreIcono, etiqueta, valor) {
  return h('div', { class: 'linea' }, h('span', { class: 'linea-etq' }, icono(nombreIcono, '#8a867e', 16), etiqueta), h('div', { class: 'linea-valor' }, valor));
}

function valorCorreo(email, nota) {
  const copiar = h('button', { type: 'button', class: 'icono-boton', 'aria-label': 'Copiar correo', title: 'Copiar correo' }, icono('copiar'));
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(email);
      copiar.setAttribute('title', 'Copiado');
    } catch {}
  });
  return [h('span', { class: 'texto' }, email, nota ? h('span', { class: 'etq ia', style: 'margin:0 0 0 6px' }, nota) : null), copiar];
}

const sinDato = () => h('span', { class: 'vacio' }, 'No consta');

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

/**
 * La ficha del perfil abierto. Es la misma esté o no en GovTalent: si no
 * está (o no tiene correo), en la línea del correo sale «Buscar correo».
 */
function pantallaFicha(perfil, d) {
  const p = d.persona; // null si no está en GovTalent
  if (p) guardarFoto(perfil, p);

  let personaId = p?.id || null;
  const cargo = p?.cargo || perfil.titular || '';
  let empresa = p?.institucion || perfil.empresa || '';

  const celdaCorreo = h('div', { class: 'linea-valor' });
  const celdaEmpresa = h('div', { class: 'linea-valor' });
  const nota = h('p', { class: 'gris nota' });
  const hueco = h('div');
  const acciones = h('div', { class: 'acciones' });

  const pintarEmpresa = () => celdaEmpresa.replaceChildren(empresa ? h('span', { class: 'texto' }, empresa) : sinDato());

  function pintarAcciones() {
    const botones = [];
    if (personaId && !String(personaId).startsWith('libre:')) {
      const lista = h('button', { type: 'button', class: 'boton negro' }, icono('lista', '#fff'), 'Añadir a lista');
      lista.addEventListener('click', () => {
        if (!d.directorio) return window.open(`${WEB}/precios`, '_blank', 'noopener');
        hueco.replaceChildren(bloqueLista(personaId, p?.nombre || perfil.nombre, () => hueco.replaceChildren()));
      });
      botones.push(lista);
      botones.push(
        h('a', { class: 'boton', href: `${WEB}/instituciones/directorio?b=${encodeURIComponent(p?.nombre || perfil.nombre)}`, target: '_blank', rel: 'noopener' }, icono('abrir'), 'Ver ficha'),
      );
    }
    acciones.replaceChildren(...botones);
    acciones.style.display = botones.length ? '' : 'none';
  }

  function botonBuscar() {
    const b = h('button', { type: 'button', class: 'boton ia' }, icono('ia', '#6d5aef', 15), 'Buscar correo', h('span', { class: 'coste' }, creditosTexto(CREDITOS_CORREO)));
    b.addEventListener('click', buscar);
    return b;
  }

  async function buscar() {
    // Sin organización no se puede buscar a alguien de fuera: se pide.
    if (!p && !empresa) {
      const campo = h('input', { type: 'text', placeholder: 'Su organización', maxlength: '160' });
      const form = h('form', { class: 'tarjeta pila' }, h('label', { class: 'campo' }, '¿En qué organización trabaja?', campo), h('button', { type: 'submit', class: 'boton negro' }, 'Buscar correo'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (campo.value.trim().length < 2) return;
        empresa = campo.value.trim();
        pintarEmpresa();
        hueco.replaceChildren();
        buscar();
      });
      hueco.replaceChildren(form);
      campo.focus();
      return;
    }
    celdaCorreo.replaceChildren(h('span', { class: 'girando', role: 'status', 'aria-label': 'Buscando' }), h('span', { class: 'texto' }, 'Buscando…'));
    nota.textContent = 'Puede tardar hasta un minuto. No cierres el panel.';
    try {
      const j = await api('/api/contactos/enriquecer', p ? { id: p.id } : { persona: { nombre: perfil.nombre, institucion: empresa } });
      if (j.saldo) ponerCreditos(j.saldo);
      const email = j.resultado?.email || j.probable?.email || j.respaldo?.email || null;
      if (!email) {
        celdaCorreo.replaceChildren(botonBuscar());
        nota.textContent = 'No hemos encontrado su correo. No se ha descontado ningún crédito.';
        return;
      }
      const marca = j.resultado?.email
        ? j.resultado.calidad === 'probable' ? 'Probable' : null
        : j.probable?.email ? (j.probable.verificado ? null : 'Probable') : 'Unidad';
      celdaCorreo.replaceChildren(...valorCorreo(email, marca));
      nota.textContent = j.cobrado ? `Se han descontado ${creditosTexto(CREDITOS_CORREO)}.` : '';
      // Al encontrarlo se da de alta en el directorio: ya se puede guardar en una lista.
      if (j.persona_id) personaId = j.persona_id;
      pintarAcciones();
    } catch (e) {
      if (e.sinSesion) return pantallaSinSesion();
      celdaCorreo.replaceChildren(botonBuscar());
      if (e.json?.sinCreditos) {
        nota.replaceChildren('No te quedan créditos suficientes. ', h('a', { href: `${WEB}/account`, target: '_blank', rel: 'noopener' }, 'Comprar créditos'));
        return;
      }
      nota.textContent = e.mensaje || 'No se pudo completar la búsqueda. No se ha descontado ningún crédito.';
    }
  }

  // Correo: el que haya; sin el Directorio, velado; si no hay, se busca.
  let telefono = sinDato();
  if (!d.directorio) {
    const planes = h('a', { class: 'icono-boton', href: `${WEB}/precios`, target: '_blank', rel: 'noopener', 'aria-label': 'Ver planes para ver el correo', title: 'Ver planes' }, icono('correo'));
    celdaCorreo.replaceChildren(h('span', { class: 'texto velado', 'aria-hidden': 'true' }, 'nombre.apellido@organizacion.es'), planes);
  } else {
    const email = p?.email || p?.probable?.email || p?.email_unidad;
    const marca = !p || p.email ? null : p.probable?.email ? (p.probable.verificado ? null : 'Probable') : p.email_unidad ? 'Unidad' : null;
    if (email) celdaCorreo.replaceChildren(...valorCorreo(email, marca));
    else celdaCorreo.replaceChildren(botonBuscar());
    if (p?.telefono) telefono = h('span', { class: 'texto' }, p.telefono);
  }
  pintarEmpresa();

  const etq = (nombreIcono, texto) => h('span', { class: 'linea-etq' }, icono(nombreIcono, '#8a867e', 16), texto);
  const contacto = h(
    'section',
    { class: 'bloque' },
    h('h2', { class: 'titulo' }, 'Información de contacto'),
    h('div', { class: 'linea' }, etq('correo', 'Email'), celdaCorreo),
    nota,
    linea('telefono', 'Teléfono', telefono),
    linea('cargo', 'Cargo', cargo ? h('span', { class: 'texto' }, cargo) : sinDato()),
    h('div', { class: 'linea' }, etq('empresa', 'Empresa'), celdaEmpresa),
    linea('lugar', 'Ubicación', perfil.ubicacion ? h('span', { class: 'texto' }, perfil.ubicacion) : sinDato()),
  );

  const filaPersona = (c, detalle) => h('div', { class: 'fila' }, avatar(c.nombre, null, true), h('span', {}, h('b', {}, c.nombre), h('small', {}, detalle || '')));

  const organizacion =
    p && d.colegas?.length > 0
      ? h(
          'section',
          { class: 'bloque' },
          h('h2', { class: 'titulo' }, `En su organización (${miles(d.total_organizacion)})`),
          d.colegas.map((c) => filaPersona(c, c.cargo)),
          d.total_organizacion - 1 > d.colegas.length
            ? h('a', { class: 'gris', style: 'display:block;margin-top:10px', href: `${WEB}/instituciones/directorio?b=${encodeURIComponent(p.institucion)}`, target: '_blank', rel: 'noopener' }, `Ver las ${miles(d.total_organizacion)} personas`)
            : null,
        )
      : null;

  const candidatas =
    !p && d.candidatas?.length > 0
      ? h(
          'section',
          { class: 'bloque' },
          h('h2', { class: 'titulo' }, 'Con ese nombre en GovTalent'),
          d.candidatas.map((c) => filaPersona(c, [c.cargo, c.institucion].filter(Boolean).join(', '))),
        )
      : null;

  pintarAcciones();
  pintar(
    cabeceraPersona({
      nombre: p?.nombre || perfil.nombre,
      cargo,
      organizacion: empresa,
      foto: p?.foto_url || perfil.foto,
      etiqueta: p ? 'En GovTalent' : 'No está en GovTalent',
    }),
    acciones,
    hueco,
    contacto,
    candidatas,
    organizacion,
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
    const d = await api('/api/extension/persona', { nombre: perfil.nombre, organizacion: perfil.empresa || '', titular: perfil.titular || '' });
    if (n !== turno) return;
    estado = { perfil, datos: d };
    ponerCreditos(d.saldo);
    pantallaFicha(perfil, d);
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
