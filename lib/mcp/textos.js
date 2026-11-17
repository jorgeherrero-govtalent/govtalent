// =====================================================================
// MCP — textos que comparten la pantalla de permiso y Configuración
// lib/mcp/textos.js
//
// Qué podrá hacer un asistente conectado, dicho igual en los dos sitios
// donde el usuario lo lee: al dar el permiso (/oauth/consent) y en la
// pestaña «Asistentes de IA» de Configuración.
//
// Tiene que coincidir con lo que de verdad hacen las herramientas
// (lib/mcp/servidor.js). Si se añade una acción, se añade aquí.
//
// Sin dependencias de servidor: lo importan componentes de cliente.
// =====================================================================

export const DIRECCION_MCP = 'https://govtalent.app/api/mcp';

export const PODRA = [
  'Consultar la normativa y los plazos de GovTalent',
  'Ver tus alarmas, novedades, seguimientos y tareas',
  'Crear alarmas, tareas y proyectos cuando se lo pidas',
  'Buscar cargos institucionales y crear tus propias listas',
];

export const EJEMPLOS = [
  'Resume lo que han detectado mis alarmas esta semana.',
  '¿Qué consultas públicas sobre energía cierran este mes?',
  'Crea una tarea para preparar alegaciones antes del plazo.',
];

// Los asistentes con guía propia. Los demás (Cursor, Copilot…) se
// conectan con la misma dirección y aparecen igualmente en Conexiones.
export const ASISTENTES = [
  {
    id: 'claude',
    nombre: 'Claude',
    inicial: 'C',
    logo: '/asistentes/claude.png',
    reconoce: ['claude', 'anthropic'],
    dominios: ['claude.ai', 'claude.com'],
    abrir: { texto: 'Abrir Claude', url: 'https://claude.ai/customize/connectors' },
    pasos: [
      {
        titulo: 'Ve a la configuración de Claude',
        texto: 'En Claude, entra en Personalizar y abre Conectores. En un plan Team o Enterprise, puede que tenga que añadirlo el propietario de tu organización.',
        dibujo: 'ajustes',
        resaltado: 'Conectores',
      },
      {
        titulo: 'Añade un conector personalizado',
        texto: 'Pulsa «Añadir» y elige «Añadir conector personalizado».',
        dibujo: 'anadir',
        resaltado: 'Añadir conector personalizado',
      },
      {
        titulo: 'Añade la dirección de GovTalent',
        texto: 'Llámalo GovTalent, copia esta dirección y pégala en el campo de la URL.',
        dibujo: 'direccion',
        conDireccion: true,
      },
      {
        titulo: 'Conecta y permite el acceso',
        texto: 'Claude abre GovTalent en el navegador. Inicia sesión y pulsa «Permitir». No hay que copiar ninguna clave.',
        dibujo: 'permiso',
      },
      {
        titulo: 'Abre el chat y empieza a usarlo',
        texto: 'Activa GovTalent en el chat de Claude y pídele lo que necesites.',
        dibujo: 'chat',
      },
    ],
  },
  {
    id: 'chatgpt',
    nombre: 'ChatGPT',
    inicial: 'G',
    logo: '/asistentes/chatgpt.png',
    reconoce: ['chatgpt', 'openai'],
    dominios: ['chatgpt.com'],
    // ChatGPT llama «complementos» (plugins) a los conectores, y un
    // servidor MCP propio se añade desde su página de Complementos, no
    // desde Ajustes (documentación de OpenAI, «Add custom MCP server»,
    // noviembre de 2026). Los nombres en castellano de los botones están
    // sin confirmar con una cuenta real: por eso van con el original.
    abrir: { texto: 'Abrir Complementos de ChatGPT', url: 'https://chatgpt.com/plugins' },
    pasos: [
      {
        titulo: 'Abre Complementos en ChatGPT',
        texto: 'Entra en ChatGPT desde el navegador y abre Complementos (Plugins) en el menú lateral. Es la página del catálogo, no la de Ajustes.',
        dibujo: 'ajustes',
      },
      {
        titulo: 'Añade un servidor MCP personalizado',
        texto: 'Pulsa el botón + de arriba y elige «Añadir servidor MCP personalizado» (Add custom MCP server). Si no aparece, activa antes el modo desarrollador en Ajustes, Seguridad e inicio de sesión.',
        dibujo: 'anadir',
      },
      {
        titulo: 'Añade la dirección de GovTalent',
        texto: 'Llámalo GovTalent y pega esta dirección en «URL del servidor». Acepta el aviso de riesgo y pulsa «Crear como complemento» (Create as a plugin).',
        dibujo: 'direccion',
        conDireccion: true,
      },
      {
        titulo: 'Instálalo y permite el acceso',
        texto: 'En la pestaña Personal de Complementos, instala GovTalent. ChatGPT abre GovTalent en el navegador: inicia sesión y pulsa «Permitir». No hay que copiar ninguna clave.',
        dibujo: 'permiso',
      },
      {
        titulo: 'Abre el chat y empieza a usarlo',
        texto: 'En un chat nuevo, elige GovTalent en el menú + del cuadro de texto y pídele lo que necesites.',
        dibujo: 'chat',
      },
    ],
  },
];

// ---------------------------------------------------------------------
// Aplicaciones a las que se puede dar acceso
// ---------------------------------------------------------------------
//
// El registro de aplicaciones es abierto (Supabase, «Allow Dynamic OAuth
// Apps»): es lo que deja que Claude o ChatGPT se den de alta solos cuando
// el usuario pega la dirección. El precio es que cualquiera puede
// registrar una aplicación y llamarla «Claude».
//
// Lo que no se puede falsear es la DIRECCIÓN DE VUELTA: ahí manda
// Supabase el permiso, y un atacante solo lo recibe si esa dirección es
// suya. Por eso GovTalent solo deja dar acceso cuando la vuelta es:
//   - un dominio de esta lista (los asistentes comprobados), o
//   - el propio ordenador del usuario (localhost), que es como se
//     conectan Claude Code, Cursor o VS Code: el permiso no sale de su
//     máquina.
// Cualquier otra se rechaza en la pantalla de permiso (/oauth/consent) y,
// por si acaso, también en el servidor (lib/mcp/sesion.js).
//
// Para admitir un asistente nuevo, se añade aquí su dominio.
export const DOMINIOS_VERIFICADOS = ['claude.ai', 'claude.com', 'chatgpt.com'];

const LOCALES = ['localhost', '127.0.0.1', '[::1]'];

/**
 * ¿Se puede dar acceso a una aplicación que vuelve a esta dirección?
 * Devuelve { ok, tipo: 'verificada' | 'local' | 'desconocida', dominio }.
 */
export function vueltaPermitida(uri) {
  let u;
  try {
    u = new URL(String(uri || ''));
  } catch {
    return { ok: false, tipo: 'desconocida', dominio: null };
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'https:' && DOMINIOS_VERIFICADOS.some((d) => host === d || host.endsWith(`.${d}`))) {
    return { ok: true, tipo: 'verificada', dominio: host };
  }
  if ((u.protocol === 'http:' || u.protocol === 'https:') && LOCALES.includes(host)) {
    return { ok: true, tipo: 'local', dominio: host };
  }
  return { ok: false, tipo: 'desconocida', dominio: host || u.protocol.replace(':', '') };
}

/**
 * A qué asistente pertenece una dirección de vuelta, por su DOMINIO (no
 * por el nombre, que cualquiera puede poner). Sirve para enseñar su
 * logotipo en la pantalla de permiso solo cuando de verdad es él.
 */
export function asistenteDeLaVuelta(uri) {
  const v = vueltaPermitida(uri);
  if (v.tipo !== 'verificada') return null;
  return ASISTENTES.find((a) => a.dominios.some((d) => v.dominio === d || v.dominio.endsWith(`.${d}`))) || null;
}

/** A qué asistente con guía corresponde una conexión, por su nombre. */
export function asistenteDe(nombreCliente) {
  const n = String(nombreCliente || '').toLowerCase();
  return ASISTENTES.find((a) => a.reconoce.some((r) => n.includes(r))) || null;
}
