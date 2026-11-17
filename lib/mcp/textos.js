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
    abrir: { texto: 'Abrir ChatGPT', url: 'https://chatgpt.com' },
    pasos: [
      {
        titulo: 'Activa el modo desarrollador',
        texto: 'En ChatGPT, abre Ajustes, entra en Aplicaciones y conectores y activa el modo desarrollador en Avanzado. Si no lo ves ahí, búscalo en Seguridad. Que esté disponible depende de tu plan de ChatGPT.',
        dibujo: 'ajustes',
        resaltado: 'Aplicaciones y conectores',
      },
      {
        titulo: 'Crea un conector',
        texto: 'Vuelve a Aplicaciones y conectores y pulsa «Crear».',
        dibujo: 'anadir',
        resaltado: 'Crear',
      },
      {
        titulo: 'Añade la dirección de GovTalent',
        texto: 'Llámalo GovTalent, copia esta dirección y pégala en el campo de la URL del servidor.',
        dibujo: 'direccion',
        conDireccion: true,
      },
      {
        titulo: 'Conecta y permite el acceso',
        texto: 'ChatGPT abre GovTalent en el navegador. Inicia sesión y pulsa «Permitir». No hay que copiar ninguna clave.',
        dibujo: 'permiso',
      },
      {
        titulo: 'Abre el chat y empieza a usarlo',
        texto: 'Activa GovTalent en el chat de ChatGPT y pídele lo que necesites.',
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
