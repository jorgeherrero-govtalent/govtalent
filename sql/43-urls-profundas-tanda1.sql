-- 43-urls-profundas-tanda1.sql
-- Primera tanda de correccion de URL: Hacienda, Economia y Derechos
-- Sociales. Las tres tenian registrada la pagina de presentacion que
-- obliga a tener la Orden PRE/1590/2016, no el listado de tramites.
--
-- Las tres siguen el mismo patron: el cartel enlaza a DOS listados, uno
-- por tramite. Por eso cada ministerio pasa de una fila a dos. Se
-- comprobo abriendo cada pagina el 13/09/2026.
--
-- La fila que ya existe se reapunta al listado de audiencia, que es el
-- tipo con el que estaba dada de alta, y se crea una nueva para consulta
-- previa. Asi no se pierde el historico de la fila existente.
--
-- Se pone ultima_captura a null para que entren las primeras en la cola,
-- y se limpia ultimo_hash porque el que hay pertenece a la pagina vieja.


-- =====================================================================
-- PASO 0 — COMPROBACION PREVIA (solo lectura)
-- =====================================================================

select id, ministerio, tipo, modo, prioridad, url, left(ultimo_error, 90) as nota
from consulta_fuentes
where url in (
  'https://www.hacienda.gob.es/es-ES/Normativa%20y%20doctrina/NormasEnTramitacion/Paginas/normasentramitacion.aspx',
  'https://portal.mineco.gob.es/es-es/ministerio/participacionpublica/Paginas/Participacion_publica_(presentacion).aspx',
  'https://www.dsca.gob.es/es/servicio-a-la-ciudadania/participacion-publica/proy-normativos'
)
order by ministerio;


-- =====================================================================
-- PASO 1 — REAPUNTAR LAS TRES FILAS EXISTENTES AL LISTADO DE AUDIENCIA
-- =====================================================================

update consulta_fuentes
set url = 'https://www.hacienda.gob.es/es-es/normativa%20y%20doctrina/normasentramitacion/paginas/audienciaabiertas.aspx',
    ultima_captura = null,
    ultimo_hash = null,
    ultimo_error = null,
    intentos_fallidos = 0
where url = 'https://www.hacienda.gob.es/es-ES/Normativa%20y%20doctrina/NormasEnTramitacion/Paginas/normasentramitacion.aspx';

update consulta_fuentes
set url = 'https://portal.mineco.gob.es/es-es/ministerio/participacionpublica/audienciapublica',
    ultima_captura = null,
    ultimo_hash = null,
    ultimo_error = null,
    intentos_fallidos = 0
where url = 'https://portal.mineco.gob.es/es-es/ministerio/participacionpublica/Paginas/Participacion_publica_(presentacion).aspx';

update consulta_fuentes
set url = 'https://www.dsca.gob.es/es/servicio-a-la-ciudadania/participacion-publica/proy-normativos/audiencias-publicas',
    ultima_captura = null,
    ultimo_hash = null,
    ultimo_error = null,
    intentos_fallidos = 0
where url = 'https://www.dsca.gob.es/es/servicio-a-la-ciudadania/participacion-publica/proy-normativos';


-- =====================================================================
-- PASO 2 — ALTA DE LA FILA DE CONSULTA PREVIA DE CADA UNO
-- =====================================================================

insert into consulta_fuentes (ministerio, tipo, modo, url, prioridad) values

  ('Ministerio de Hacienda', 'consulta_previa', 'listado',
   'https://www.hacienda.gob.es/es-es/normativa%20y%20doctrina/normasentramitacion/paginas/consultaabiertas.aspx', 10),

  ('Ministerio de Economía, Comercio y Empresa', 'consulta_previa', 'listado',
   'https://portal.mineco.gob.es/es-es/ministerio/participacionpublica/consultapublica', 10),

  ('Ministerio de Derechos Sociales, Consumo y Agenda 2030', 'consulta_previa', 'listado',
   'https://www.dsca.gob.es/es/servicio-a-la-ciudadania/participacion-publica/proy-normativos/consultas-publicas', 10)

on conflict (url) do nothing;


-- =====================================================================
-- PASO 3 — COMPROBACION
-- =====================================================================

-- select id, ministerio, tipo, url, ultima_captura
-- from consulta_fuentes
-- where ministerio in ('Ministerio de Hacienda',
--                      'Ministerio de Economía, Comercio y Empresa',
--                      'Ministerio de Derechos Sociales, Consumo y Agenda 2030')
-- order by ministerio, tipo;
