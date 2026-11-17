// =====================================================================
// MCP — el catálogo de herramientas
// lib/mcp/servidor.js
//
// Qué ve un asistente (Claude, ChatGPT…) cuando se conecta a GovTalent:
// el nombre de cada herramienta, para qué sirve y qué datos pide. Las
// descripciones van dirigidas al asistente, no al usuario: son las que
// le dicen cuándo usar cada una, así que se cuidan como un texto más.
//
// Las herramientas están ESCRITAS A MANO y son pocas, a propósito. Un
// catálogo generado desde la base de datos abriría el directorio entero;
// aquí cada una devuelve lo justo y remite a GovTalent para el resto.
//
// Lo que hace cada una está en lib/mcp/consultas.js (leer) y
// lib/mcp/acciones.js (hacer). Aquí solo se declaran y se envuelven con
// lo común: quién llama, el tope de uso y los errores.
// =====================================================================

import { z } from 'zod';
import { contextoDe } from '@/lib/mcp/sesion';
import { comprobarYApuntar } from '@/lib/mcp/cuota';
import * as consultas from '@/lib/mcp/consultas';
import * as acciones from '@/lib/mcp/acciones';

export const INSTRUCCIONES = `GovTalent es una plataforma española de asuntos públicos: vigila la normativa de España, la Unión Europea y las comunidades autónomas, y tiene el directorio de las instituciones y de quién ocupa cada cargo.

Cómo usar estas herramientas:
- Los datos salen de GovTalent. Si una herramienta no devuelve algo, dilo así; no lo completes de memoria ni lo inventes.
- Cada resultado trae su enlace a GovTalent (url). Inclúyelo siempre en tu respuesta: el detalle se consulta allí.
- Las herramientas de normativa identifican cada asunto con dos datos, "tipo" e "id". Úsalos tal cual para ficha_norma, seguir_norma, crear_tarea y crear_proyecto.
- El directorio da nombre, cargo, unidad e institución. Los correos y teléfonos no se facilitan por aquí: remite a la ficha en GovTalent. Si el usuario quiere guardar a varias personas, crea una lista (crear_lista, anadir_a_lista) en vez de volcar el listado en la conversación: la lista y sus contactos se trabajan en GovTalent.
- Al preparar el mapa de actores de un proyecto, no te quedes en las personas: busca también las organizaciones, los grupos parlamentarios y las comisiones que intervienen (buscar_organizaciones) y propónselos al usuario. Añade cada actor con el nombre tal cual lo da GovTalent: así queda enlazado a su ficha y sale con su foto.
- Antes de crear o cambiar algo (una alarma, una tarea, un proyecto, un seguimiento, una lista), confirma con el usuario qué vas a hacer.
- Si una acción no está incluida en el plan del usuario, la herramienta lo dice y devuelve el enlace a los planes. No insistas.
- Responde en el idioma del usuario. Las fechas vienen en formato ISO.`;

const FUENTE = z
  .enum(['congreso', 'boe', 'union_europea', 'consultas_publicas', 'parlamentos_autonomicos', 'boletines_autonomicos', 'consejo_de_ministros'])
  .describe('Limita la búsqueda a una fuente.');

const TIPO = z.string().min(2).max(40).describe('El "tipo" del asunto, tal como lo devuelve buscar_normativa (por ejemplo: ley, boe, consulta, expediente).');
const ID = z.string().min(1).max(200).describe('El "id" del asunto, tal como lo devuelve buscar_normativa.');

const SECTORES = [
  'Agricultura', 'Cultura y ocio', 'Derecho Administrativo', 'Educación y enseñanza', 'Energía', 'Función Pública',
  'Ganadería y animales', 'Industria', 'Medio ambiente', 'Organización de la Administración', 'Relaciones internacionales',
  'Seguridad Social', 'Seguridad y Defensa', 'Sistema financiero', 'Sistema tributario', 'Tecnología e investigación',
  'Telecomunicaciones', 'Trabajo y empleo', 'Transportes y tráfico', 'Unión Europea', 'Vivienda y urbanismo',
];

const LEER = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const HACER = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const respuesta = (obj, esError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(obj) }],
  ...(esError ? { isError: true } : {}),
});

/**
 * Declara una herramienta. `grupo` decide qué tope de uso se le aplica:
 * 'consulta', 'directorio' o 'escritura'.
 */
function herramienta(server, nombre, { titulo, descripcion, entrada, grupo, anotaciones }, fn) {
  server.registerTool(
    nombre,
    {
      title: titulo,
      description: descripcion,
      inputSchema: entrada || z.object({}),
      annotations: { title: titulo, ...anotaciones },
    },
    async (args, ctx) => {
      try {
        const s = await contextoDe(ctx?.http?.authInfo);
        const cuota = await comprobarYApuntar(s, nombre, grupo);
        if (!cuota.ok) return respuesta({ error: cuota.motivo }, true);
        return respuesta(await fn(s, args || {}));
      } catch (e) {
        console.error(`[mcp] ${nombre}:`, e?.message || e);
        const sinSesion = String(e?.message || '') === 'SIN_SESION';
        return respuesta(
          { error: sinSesion ? 'La conexión con GovTalent ha caducado. Vuelve a conectarla desde tu asistente.' : 'GovTalent no ha podido responder ahora mismo. Inténtalo de nuevo en unos minutos.' },
          true
        );
      }
    }
  );
}

export function registrarHerramientas(server) {
  // ------------------------------------------------------------------
  // Cuenta
  // ------------------------------------------------------------------
  herramienta(
    server,
    'mi_cuenta',
    {
      titulo: 'Mi cuenta de GovTalent',
      descripcion:
        'Quién es el usuario conectado, qué plan tiene, cuántas alarmas puede tener y qué acciones incluye su plan. Úsala al empezar o cuando una acción se rechace por plan.',
      grupo: 'consulta',
      anotaciones: LEER,
    },
    (s) => consultas.miCuenta(s)
  );

  // ------------------------------------------------------------------
  // Normativa
  // ------------------------------------------------------------------
  herramienta(
    server,
    'buscar_normativa',
    {
      titulo: 'Buscar normativa',
      descripcion:
        'Busca en la normativa que vigila GovTalent: iniciativas del Congreso, BOE, Unión Europea (Comisión y Parlamento), consultas públicas, parlamentos y boletines autonómicos y acuerdos del Consejo de Ministros. Busca por las palabras del TÍTULO oficial, así que usa los términos que usaría la administración ("autoconsumo", "envases", "inteligencia artificial"). Devuelve como mucho 10 resultados, cada uno con su tipo, id, estado, plazo y enlace.',
      entrada: z.object({
        consulta: z.string().min(3).max(200).describe('Palabras del título, en español. De una a cinco.'),
        fuente: FUENTE.optional(),
        solo_activos: z.boolean().optional().describe('true para ver solo lo que sigue en tramitación, con plazo abierto o en vigor.'),
        limite: z.number().int().min(1).max(10).optional(),
      }),
      grupo: 'consulta',
      anotaciones: LEER,
    },
    consultas.buscarNormativa
  );

  herramienta(
    server,
    'ficha_norma',
    {
      titulo: 'Ficha de una norma',
      descripcion:
        'El estado de un asunto concreto: fase o situación, fecha, plazo y días que quedan, trámites si es una ley autonómica, si el usuario la sigue y qué han dicho sus alarmas sobre ella (por qué le afecta). Úsala para resumir una norma o preparar una nota. El texto completo está en GovTalent.',
      entrada: z.object({ tipo: TIPO, id: ID }),
      grupo: 'consulta',
      anotaciones: LEER,
    },
    consultas.fichaNorma
  );

  herramienta(
    server,
    'plazos_abiertos',
    {
      titulo: 'Plazos abiertos',
      descripcion:
        'Lo que tiene un plazo que vence pronto: consultas públicas, enmiendas, audiencias e informaciones públicas. Ordenado por lo que cierra antes. Se puede acotar por palabras del título y por fuente.',
      entrada: z.object({
        consulta: z.string().max(200).optional().describe('Palabras del título para acotar. Opcional.'),
        fuente: FUENTE.optional(),
        dias: z.number().int().min(1).max(180).optional().describe('Hasta cuántos días vista. Por defecto, 30.'),
        limite: z.number().int().min(1).max(15).optional(),
      }),
      grupo: 'consulta',
      anotaciones: LEER,
    },
    consultas.plazosAbiertos
  );

  herramienta(
    server,
    'consejo_de_ministros',
    {
      titulo: 'Consejo de Ministros',
      descripcion:
        'Los acuerdos del último Consejo de Ministros (o del último celebrado hasta una fecha), por ministerio y tipo de norma, con el enlace a cada uno y si ya ha salido en el BOE.',
      entrada: z.object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('AAAA-MM-DD. Si se indica, el último Consejo celebrado hasta ese día.'),
      }),
      grupo: 'consulta',
      anotaciones: LEER,
    },
    consultas.consejoDeMinistros
  );

  // ------------------------------------------------------------------
  // Lo del usuario
  // ------------------------------------------------------------------
  herramienta(
    server,
    'mis_novedades',
    {
      titulo: 'Mis novedades',
      descripcion:
        'Lo que han detectado las alarmas del usuario: cada asunto con el motivo por el que le afecta, su relevancia (3 = de lleno, 2 = relevante, 1 = contexto) y su plazo. Es la herramienta para "qué ha pasado esta semana que me afecte" o para preparar un resumen para un cliente. Por defecto, los últimos 7 días.',
      entrada: z.object({
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('AAAA-MM-DD. Por defecto, hace 7 días.'),
        alarma_id: z.string().uuid().optional().describe('Para ver solo lo de una alarma (id de mis_alarmas).'),
        limite: z.number().int().min(1).max(25).optional(),
      }),
      grupo: 'consulta',
      anotaciones: LEER,
    },
    consultas.misNovedades
  );

  herramienta(
    server,
    'mis_alarmas',
    {
      titulo: 'Mis alarmas',
      descripcion: 'Las alarmas del usuario: qué vigila cada una, sus temas, su frecuencia de aviso y si está activa.',
      grupo: 'consulta',
      anotaciones: LEER,
    },
    (s) => consultas.misAlarmas(s)
  );

  herramienta(
    server,
    'mis_seguimientos',
    {
      titulo: 'Mis seguimientos',
      descripcion: 'Las normas y asuntos que el usuario sigue, con su estado, el último cambio y las novedades sin ver.',
      entrada: z.object({ limite: z.number().int().min(1).max(30).optional() }),
      grupo: 'consulta',
      anotaciones: LEER,
    },
    consultas.misSeguimientos
  );

  herramienta(
    server,
    'mis_tareas',
    {
      titulo: 'Mis tareas',
      descripcion: 'Las tareas del usuario en GovTalent, por defecto las pendientes, ordenadas por vencimiento.',
      entrada: z.object({
        estado: z.enum(['pendiente', 'completada']).optional(),
        limite: z.number().int().min(1).max(30).optional(),
      }),
      grupo: 'consulta',
      anotaciones: LEER,
    },
    consultas.misTareas
  );

  herramienta(
    server,
    'mis_proyectos',
    {
      titulo: 'Mis proyectos',
      descripcion: 'Los proyectos del usuario y las normas que lleva cada uno.',
      grupo: 'consulta',
      anotaciones: LEER,
    },
    (s) => consultas.misProyectos(s)
  );

  // ------------------------------------------------------------------
  // Directorio
  // ------------------------------------------------------------------
  herramienta(
    server,
    'buscar_en_directorio',
    {
      titulo: 'Buscar en el directorio',
      descripcion:
        'Busca personas en el directorio institucional de GovTalent por nombre, cargo, unidad o institución: Gobierno y ministerios, organismos, Congreso, Senado, parlamentos autonómicos, instituciones de la UE, patronales y asociaciones. Sirve para saber quién ocupa un cargo o dónde está alguien. Devuelve como mucho 10 personas con su id, nombre, cargo, unidad, institución y enlace. NO devuelve correos ni teléfonos: se consultan en GovTalent. Para guardar a las personas encontradas, usa crear_lista con sus id.',
      entrada: z.object({
        consulta: z.string().min(3).max(160).describe('Nombre, cargo, unidad o institución. Por ejemplo: "secretario de estado de energía" o "CNMC presidenta".'),
        solo_titulares: z.boolean().optional().describe('true para ver solo a quien está al frente de cada unidad.'),
      }),
      grupo: 'directorio',
      anotaciones: LEER,
    },
    consultas.buscarEnDirectorio
  );

  herramienta(
    server,
    'buscar_organizaciones',
    {
      titulo: 'Buscar organizaciones y órganos',
      descripcion:
        'Busca por nombre lo que no son personas: organizaciones (patronales, empresas, asociaciones, sindicatos, colegios profesionales), grupos parlamentarios, comisiones del Congreso y del Parlamento Europeo, direcciones generales de la Comisión Europea y ministerios y organismos. Sirve para completar el mapa de actores de un proyecto con las organizaciones interesadas en una norma. Devuelve como mucho 10, con su nombre, tipo y sector o ámbito. Busca por una o dos palabras del nombre o por sus siglas (por ejemplo: "promotores", "CEOE", "vivienda").',
      entrada: z.object({
        consulta: z.string().min(2).max(160).describe('Una o dos palabras del nombre, o sus siglas.'),
      }),
      grupo: 'directorio',
      anotaciones: LEER,
    },
    consultas.buscarOrganizaciones
  );

  herramienta(
    server,
    'anadir_actor_a_proyecto',
    {
      titulo: 'Añadir un actor a un proyecto',
      descripcion:
        'Añade un actor (stakeholder) al mapa de un proyecto de GovTalent, con su briefing: qué cargo ocupa, por qué importa y cómo abordarlo. Vale para personas (localízalas con buscar_en_directorio) y para organizaciones, grupos parlamentarios, comisiones y ministerios (buscar_organizaciones). GovTalent enlaza al actor con su ficha por el nombre, y así sale con su foto o su logotipo: escribe el nombre tal cual lo devuelven esas búsquedas. La respuesta indica si ha quedado enlazado; si no, díselo al usuario. Una llamada por actor.',
      entrada: z.object({
        proyecto_id: z.string().uuid().describe('El id del proyecto (de crear_proyecto o mis_proyectos).'),
        nombre: z.string().min(2).max(160).describe('Nombre y apellidos completos de la persona, o el nombre de la organización, el grupo o la comisión, tal cual salen en GovTalent.'),
        cargo: z.string().max(300).optional().describe('Cargo e institución, como salen en GovTalent.'),
        por_que_importa: z.string().max(2000).optional().describe('Su papel en este asunto y su posición conocida. Solo lo que se sepa: si no se conoce su posición, dilo.'),
        como_abordarlo: z.string().max(2000).optional().describe('Argumentos y forma de acercarse a este actor.'),
        posicion: z.number().min(0).max(100).optional().describe('De 0 (en contra de lo que quiere el usuario) a 100 (a favor). 50 si no se sabe.'),
        influencia: z.number().min(0).max(100).optional().describe('De 0 a 100, su peso en la decisión. 50 si no se sabe.'),
      }),
      grupo: 'escritura',
      anotaciones: HACER,
    },
    acciones.anadirActorAProyecto
  );

  herramienta(
    server,
    'mis_listas',
    {
      titulo: 'Mis listas de contactos',
      descripcion: 'Las listas de contactos del usuario en GovTalent (y las de su organización), con su enlace. Requiere el Directorio.',
      grupo: 'consulta',
      anotaciones: LEER,
    },
    (s) => consultas.misListas(s)
  );

  herramienta(
    server,
    'crear_lista',
    {
      titulo: 'Crear una lista de contactos',
      descripcion:
        'Crea una lista de contactos en GovTalent con personas del directorio (por ejemplo, "Interlocutores de energía en el Gobierno"). Las personas se indican con el id que devuelve buscar_en_directorio, hasta 50 por llamada. La lista se abre y se trabaja en GovTalent, donde están los correos. Requiere el Directorio.',
      entrada: z.object({
        nombre: z.string().min(2).max(120),
        personas: z.array(z.string().min(1).max(200)).max(50).optional().describe('Los id de buscar_en_directorio. Se puede crear vacía y añadir después.'),
      }),
      grupo: 'escritura',
      anotaciones: HACER,
    },
    acciones.crearLista
  );

  herramienta(
    server,
    'anadir_a_lista',
    {
      titulo: 'Añadir personas a una lista',
      descripcion: 'Añade personas del directorio a una lista de contactos que ya existe. Hasta 50 por llamada. Requiere el Directorio.',
      entrada: z.object({
        lista_id: z.string().uuid().describe('El id de la lista (de mis_listas o de crear_lista).'),
        personas: z.array(z.string().min(1).max(200)).min(1).max(50).describe('Los id de buscar_en_directorio.'),
      }),
      grupo: 'escritura',
      anotaciones: { ...HACER, idempotentHint: true },
    },
    acciones.anadirALista
  );

  // ------------------------------------------------------------------
  // Acciones
  // ------------------------------------------------------------------
  herramienta(
    server,
    'crear_alarma',
    {
      titulo: 'Crear una alarma',
      descripcion:
        'Crea una alarma: un vigilante que avisa al usuario de la normativa que afecta a su organización o a su cliente. Antes de llamarla, entiende a qué se dedica la organización y qué le preocupa, y confirma con el usuario lo que vas a vigilar. El plan Free permite una alarma, con resumen los lunes; si no cabe otra, la herramienta lo dice.',
      entrada: z.object({
        nombre: z.string().min(2).max(60).describe('De 2 a 5 palabras que identifiquen la alarma. Sin "Alarma de…".'),
        descripcion: z.string().min(20).max(3000).describe('A qué se dedica la organización y qué le preocupa, con sus palabras. Es lo que lee el agente que evalúa cada novedad.'),
        resumen: z.string().min(10).max(400).describe('UNA frase que diga qué se vigila. Ejemplo: "Normativa sobre centros de datos, acceso a la red eléctrica y eficiencia energética, en España y la UE."'),
        temas: z.array(z.string().max(60)).min(1).max(8).describe('De 3 a 6 temas legibles, en minúscula.'),
        palabras_clave: z
          .array(z.string().min(3).max(60))
          .min(3)
          .max(15)
          .describe('De 8 a 15 términos en español y en minúscula que aparecerían en el TÍTULO de una norma, una consulta o un expediente. Con sinónimos y como los escribe la administración ("autoconsumo" sí, "sostenibilidad" no). Sin nombres de empresas.'),
        normativa: z.array(z.string().max(120)).max(8).optional().describe('Leyes o normas vigentes que regulan la actividad, con su nombre oficial abreviado ("Ley 24/2013, del Sector Eléctrico"). Solo si es seguro que existen; si no, vacío.'),
        territorios: z.array(z.string().max(60)).max(10).optional().describe('"España", "Unión Europea" y las comunidades autónomas que interesen. Por defecto, España y Unión Europea.'),
        excluye: z.array(z.string().max(120)).max(8).optional().describe('Lo que el usuario dice expresamente que no le interesa.'),
        sectores: z.array(z.enum(SECTORES)).max(6).optional().describe('Los que apliquen de la lista cerrada de materias del BOE.'),
        frecuencia: z.enum(['inmediato', 'diario', 'semanal']).optional().describe('Al momento, cada mañana o los lunes. En Free siempre es semanal.'),
      }),
      grupo: 'escritura',
      anotaciones: HACER,
    },
    acciones.crearAlarma
  );

  herramienta(
    server,
    'cambiar_alarma',
    {
      titulo: 'Pausar, activar o ajustar una alarma',
      descripcion: 'Pausa o activa una alarma del usuario, o cambia su nombre o su frecuencia de aviso. Para cambiar lo que vigila, hay que hacerlo en GovTalent.',
      entrada: z.object({
        id: z.string().uuid().describe('El id de la alarma (de mis_alarmas).'),
        activa: z.boolean().optional().describe('false la pausa; true la activa.'),
        frecuencia: z.enum(['inmediato', 'diario', 'semanal']).optional(),
        nombre: z.string().min(2).max(60).optional(),
      }),
      grupo: 'escritura',
      anotaciones: { ...HACER, idempotentHint: true },
    },
    acciones.cambiarAlarma
  );

  herramienta(
    server,
    'seguir_norma',
    {
      titulo: 'Seguir una norma',
      descripcion: 'Añade una norma o asunto a los seguimientos del usuario: GovTalent le avisará de sus cambios y plazos. Requiere suscripción.',
      entrada: z.object({ tipo: z.enum(acciones.TIPOS_SEGUIBLES).describe('El "tipo" del asunto, de buscar_normativa.'), id: ID }),
      grupo: 'escritura',
      anotaciones: { ...HACER, idempotentHint: true },
    },
    acciones.seguirNorma
  );

  herramienta(
    server,
    'dejar_de_seguir',
    {
      titulo: 'Dejar de seguir una norma',
      descripcion: 'Quita una norma o asunto de los seguimientos del usuario. Confírmalo con él antes.',
      entrada: z.object({ tipo: TIPO, id: ID }),
      grupo: 'escritura',
      anotaciones: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    acciones.dejarDeSeguir
  );

  herramienta(
    server,
    'crear_tarea',
    {
      titulo: 'Crear una tarea',
      descripcion: 'Crea una tarea en el gestor de tareas de GovTalent del usuario, opcionalmente vinculada a una norma (por ejemplo: "Preparar alegaciones" con vencimiento el día del plazo).',
      entrada: z.object({
        titulo: z.string().min(1).max(300),
        tipo: z.enum(['llamada', 'email', 'reunion', 'enmienda', 'seguimiento', 'otra']).optional().describe('"enmienda" vale también para alegaciones.'),
        prioridad: z.enum(['alta', 'media', 'baja']).optional(),
        vence: z.string().max(40).optional().describe('AAAA-MM-DD, o fecha y hora en ISO.'),
        notas: z.string().max(5000).optional(),
        norma: z.object({ tipo: TIPO, id: ID }).optional().describe('La norma a la que se vincula, con el tipo y el id de buscar_normativa.'),
      }),
      grupo: 'escritura',
      anotaciones: HACER,
    },
    acciones.crearTarea
  );

  herramienta(
    server,
    'completar_tarea',
    {
      titulo: 'Completar una tarea',
      descripcion: 'Marca como completada una tarea del usuario.',
      entrada: z.object({ id: z.string().uuid().describe('El id de la tarea (de mis_tareas).') }),
      grupo: 'escritura',
      anotaciones: { ...HACER, idempotentHint: true },
    },
    acciones.completarTarea
  );

  herramienta(
    server,
    'crear_proyecto',
    {
      titulo: 'Crear un proyecto a partir de una norma',
      descripcion:
        'Abre un proyecto de asuntos públicos en GovTalent a partir de una norma que ya está en la plataforma. Sin norma no hay proyecto: localízala antes con buscar_normativa. El proyecto nace con la norma dentro; los actores y las acciones se trabajan en GovTalent. El plan Free permite un proyecto.',
      entrada: z.object({
        norma: z.object({ tipo: TIPO, id: ID }),
        nombre: z.string().min(2).max(120).optional().describe('Si no se indica, el título de la norma.'),
        objetivo: z.string().max(1000).optional().describe('Qué quiere conseguir la organización con este proyecto, en una o dos frases.'),
      }),
      grupo: 'escritura',
      anotaciones: HACER,
    },
    acciones.crearProyecto
  );
}
