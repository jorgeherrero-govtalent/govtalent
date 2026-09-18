-- 46-transportes.sql
-- Transportes movio su participacion publica de /el-ministerio/ a
-- /ministerio/buen-gobierno/, y lo que teniamos registrado es la ruta
-- vieja. Eso explica la anomalia: la pagina respondia 200 pero ya no
-- traia tramites, asi que el sync la clasificaba como cartel.
--
-- El buscador nuevo filtra por tipo con field_participation_type:
--   669 = Consulta publica previa       (148 tramites, ninguno abierto hoy)
--   670 = Audiencia e informacion publica (216 tramites, 7 ABIERTOS hoy)
--
-- Comprobado abriendo las dos el 18/09/2026.
--
-- Dos limitaciones conocidas, anotadas para no redescubrirlas:
--
--   Pagina 10 resultados de cada vez. El sync solo vera esos 10. Como el
--   listado viene ordenado de mas reciente a mas antiguo, los abiertos
--   caen dentro; si algun dia hubiera mas de diez abiertos a la vez, los
--   ultimos se perderian. Hara falta paginar.
--
--   Ninguna de las dos declara "no hay tramites abiertos" cuando esta
--   vacia, solo etiqueta cada fila. Asi que cuando no haya nada abierto
--   marcaran sin_tramites siendo fuentes sanas. Es el mismo punto ciego
--   que Ciencia y Trabajo.


-- =====================================================================
-- PASO 0 — COMPROBACION PREVIA (solo lectura)
-- =====================================================================

select id, ministerio, tipo, modo, activo, url, left(ultimo_error, 80) as nota
from consulta_fuentes
where ministerio = 'Ministerio de Transportes y Movilidad Sostenible'
order by id;


-- =====================================================================
-- PASO 1 — REAPUNTAR LA FILA EXISTENTE AL BUSCADOR DE AUDIENCIA
-- Conserva su historico; es la que ya estaba dada de alta como audiencia.
-- =====================================================================

update consulta_fuentes
set url = 'https://www.transportes.gob.es/ministerio/buen-gobierno/participacion-publica/buscador?search_api_fulltext=&field_participation_type%5B670%5D=670',
    ultima_captura = null,
    ultimo_hash = null,
    ultimo_error = null,
    intentos_fallidos = 0
where url = 'https://www.transportes.gob.es/el-ministerio/participacion-publica';


-- =====================================================================
-- PASO 2 — ALTA DE LA DE CONSULTA PREVIA
-- =====================================================================

insert into consulta_fuentes (ministerio, tipo, modo, url, prioridad) values
  ('Ministerio de Transportes y Movilidad Sostenible', 'consulta_previa', 'listado',
   'https://www.transportes.gob.es/ministerio/buen-gobierno/participacion-publica/buscador?search_api_fulltext=&field_participation_type%5B669%5D=669', 5)
on conflict (url) do nothing;


-- =====================================================================
-- PASO 3 — COMPROBACION
-- =====================================================================

-- select id, tipo, url, ultima_captura, left(ultimo_error, 80) as nota
-- from consulta_fuentes
-- where ministerio = 'Ministerio de Transportes y Movilidad Sostenible'
-- order by id;
