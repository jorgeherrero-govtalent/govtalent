-- 44-urls-profundas-tanda2.sql
-- Segunda tanda de correccion de URL: Vivienda, Ciencia, Igualdad,
-- Presidencia (area de Presidencia), Politica Territorial y Defensa.
--
-- Mismo patron que la tanda 1: la URL registrada era la pagina de
-- presentacion que obliga a tener la Orden PRE/1590/2016, y el listado
-- real cuelga de ella. Cada pagina se abrio y se comprobo el 18/09/2026.
--
-- Donde hay dos listados, la fila existente se reapunta al de audiencia
-- (que es el tipo con el que estaba dada de alta, asi conserva su
-- historico) y se crea una nueva para consulta previa.
--
-- ultima_captura a null para que entren las primeras en la cola.
-- ultimo_hash a null porque el que hay es el de la pagina vieja.
--
-- Dos avisos sobre lo que se registra aqui:
--
--   Ciencia solo publica listados filtrados por estado. Se registran los
--   de "abiertas" porque son los que dan el dato vigente, pero eso
--   significa que nunca mostraran un tramite cerrado y por tanto
--   marcaran sin_tramites cuando no haya nada abierto. Es el mismo falso
--   positivo que ya tiene Trabajo, no un fallo de la fuente.
--
--   Vivienda publica su enlace de consulta previa con una busqueda
--   precargada (texto_busqueda=vivienda+alquiler+casa+suelo+arquitectura)
--   que filtraria resultados por palabra. Se vacia ese parametro y se
--   deja solo el filtro de tipo de tramite.


-- =====================================================================
-- PASO 0 — COMPROBACION PREVIA (solo lectura)
-- =====================================================================

select id, ministerio, tipo, modo, activo, url, ultima_captura,
       left(ultimo_error, 80) as nota
from consulta_fuentes
where url in (
  'https://www.mivau.gob.es/el-ministerio/participacion-publica',
  'https://www.ciencia.gob.es/Servicios/Participacion-publica.html',
  'https://www.igualdad.gob.es/servicios/participacion/',
  'https://www.mpr.gob.es/servicios/participacion/Paginas/area-presidencia.aspx',
  'https://mptmd.gob.es/portal/ministerio/participacion_proyectos',
  'https://www.defensa.gob.es/participacion/index.html',
  'https://expinterweb.mites.gob.es/participa/',
  'https://www.interior.gob.es/opencms/es/servicios-al-ciudadano/participacion-ciudadana/participacion-publica-en-proyectos-normativos/'
)
order by ministerio;


-- =====================================================================
-- PASO 1 — REAPUNTAR LAS FILAS EXISTENTES AL LISTADO DE AUDIENCIA
-- =====================================================================

-- Vivienda
update consulta_fuentes
set url = 'https://www.mivau.gob.es/el-ministerio/buscador-participacion-publica?texto_busqueda=&field_rango_normativo_info_pub=All&field_tipo_de_participacion=435&field_fech_cier_aport_info_pub%5Bdate%5D=',
    ultima_captura = null, ultimo_hash = null, ultimo_error = null, intentos_fallidos = 0
where url = 'https://www.mivau.gob.es/el-ministerio/participacion-publica';

-- Ciencia
update consulta_fuentes
set url = 'https://www.ciencia.gob.es/Buscador-especifico.html?tipoDocumento=convocatoria&convocatoriaEstado=e16e47b1-4252-4541-94a0-2ef4bd98f31b&convocatoriaTipo=audiencia',
    ultima_captura = null, ultimo_hash = null, ultimo_error = null, intentos_fallidos = 0
where url = 'https://www.ciencia.gob.es/Servicios/Participacion-publica.html';

-- Igualdad
update consulta_fuentes
set url = 'https://www.igualdad.gob.es/index.php/servicios/participacion/audienciapublica/',
    ultima_captura = null, ultimo_hash = null, ultimo_error = null, intentos_fallidos = 0
where url = 'https://www.igualdad.gob.es/servicios/participacion/';

-- Presidencia, area de Presidencia. La fila de consulta previa ya estaba
-- bien apuntada y no se toca; la de mjusticia tampoco.
update consulta_fuentes
set url = 'https://www.mpr.gob.es/servicios/participacion/audienciapublica/Paginas/index.aspx',
    ultima_captura = null, ultimo_hash = null, ultimo_error = null, intentos_fallidos = 0
where url = 'https://www.mpr.gob.es/servicios/participacion/Paginas/area-presidencia.aspx';

-- Politica Territorial
update consulta_fuentes
set url = 'https://mptmd.gob.es/portal/ministerio/participacion_proyectos/audiencia_informacion/proyectos',
    ultima_captura = null, ultimo_hash = null, ultimo_error = null, intentos_fallidos = 0
where url = 'https://mptmd.gob.es/portal/ministerio/participacion_proyectos';

-- Defensa
update consulta_fuentes
set url = 'https://www.defensa.gob.es/participacion/audienciaslistado/index.html',
    ultima_captura = null, ultimo_hash = null, ultimo_error = null, intentos_fallidos = 0
where url = 'https://www.defensa.gob.es/participacion/index.html';


-- =====================================================================
-- PASO 2 — ALTA DE LA FILA DE CONSULTA PREVIA DE CADA UNO
-- Presidencia no entra: su fila de consulta previa ya existe.
-- =====================================================================

insert into consulta_fuentes (ministerio, tipo, modo, url, prioridad) values

  ('Ministerio de Vivienda y Agenda Urbana', 'consulta_previa', 'listado',
   'https://www.mivau.gob.es/el-ministerio/buscador-participacion-publica?texto_busqueda=&field_fech_cier_aport_info_pub=&field_tipo_de_participacion=434&field_rango_normativo_info_pub=All', 10),

  ('Ministerio de Ciencia, Innovación y Universidades', 'consulta_previa', 'listado',
   'https://www.ciencia.gob.es/Buscador-especifico.html?tipoDocumento=convocatoria&convocatoriaEstado=e16e47b1-4252-4541-94a0-2ef4bd98f31b&convocatoriaTipo=consulta', 10),

  ('Ministerio de Igualdad', 'consulta_previa', 'listado',
   'https://www.igualdad.gob.es/index.php/servicios/participacion/consultapublica/', 20),

  ('Ministerio de Política Territorial y Memoria Democrática', 'consulta_previa', 'listado',
   'https://mptmd.gob.es/portal/ministerio/participacion_proyectos/consulta_previa/proyectos', 20),

  ('Ministerio de Defensa', 'consulta_previa', 'listado',
   'https://www.defensa.gob.es/participacion/consultaslistado/index.html', 20)

on conflict (url) do nothing;


-- =====================================================================
-- PASO 3 — LIMPIEZA PENDIENTE
--
-- Trabajo: la raiz de /participa/ es la portada de la que cuelgan los
-- dos listados filtrados (ids 5 y 17), que ya funcionan. Leerla ademas
-- es una llamada al modelo diaria sobre informacion duplicada.
--
-- Interior: HTTP 403 en todo el sitio, no solo en una ruta. Cinco
-- intentos entre las dos filas registradas. Se apaga para que deje de
-- ocupar hueco en la cola; la decision sobre los bloqueados sigue
-- pendiente y la fila se conserva.
-- =====================================================================

update consulta_fuentes
set activo = false,
    ultimo_error = 'Redundante: la raíz de /participa/ ya se cubre con los listados filtrados (44)'
where url = 'https://expinterweb.mites.gob.es/participa/'
  and activo;

update consulta_fuentes
set activo = false,
    ultimo_error = 'HTTP 403 en todo el sitio, no solo en esta ruta (44)'
where ministerio = 'Ministerio del Interior'
  and activo;


-- =====================================================================
-- PASO 4 — COMPROBACION
-- =====================================================================

-- 4.1 Como han quedado los seis de esta tanda.
-- select id, ministerio, tipo, url, ultima_captura
-- from consulta_fuentes
-- where ministerio in ('Ministerio de Vivienda y Agenda Urbana',
--                      'Ministerio de Ciencia, Innovación y Universidades',
--                      'Ministerio de Igualdad',
--                      'Ministerio de la Presidencia, Justicia y Relaciones con las Cortes',
--                      'Ministerio de Política Territorial y Memoria Democrática',
--                      'Ministerio de Defensa')
-- order by ministerio, tipo;

-- 4.2 Cobertura total de fuentes activas.
-- select count(*) as fuentes_activas,
--        count(distinct ministerio) as ministerios,
--        count(*) filter (where ultima_captura is null) as en_cola
-- from consulta_fuentes where activo;

-- 4.3 Las cinco filas de Agricultura con su URL, para identificar las
--     dos que vienen marcando sin_tramites y decidir si se apagan.
--     Solo lectura: la baja se hace despues, con las URL delante.
-- select id, tipo, modo, url, left(ultimo_error, 120) as nota
-- from consulta_fuentes
-- where ministerio = 'Ministerio de Agricultura, Pesca y Alimentación'
-- order by id;
