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
  'Buscar personas en el directorio, sin sus datos de contacto',
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
    reconoce: ['claude', 'anthropic'],
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
        texto: 'Pulsa el botón de añadir y elige «Añadir conector personalizado».',
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
    reconoce: ['chatgpt', 'openai'],
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

/** A qué asistente con guía corresponde una conexión, por su nombre. */
export function asistenteDe(nombreCliente) {
  const n = String(nombreCliente || '').toLowerCase();
  return ASISTENTES.find((a) => a.reconoce.some((r) => n.includes(r))) || null;
}
