-- 33-organigrama.sql
-- Estructura del directorio ministerial por bandas jerarquicas.
-- Aditivo: crea una vista nueva. No modifica age_units.

-- =====================================================================
-- PASO 0 — VERIFICACION EN SOLO LECTURA
-- Debe devolver 0 filas antes de crear nada.
-- =====================================================================

-- select table_name from information_schema.views
-- where table_schema = 'public' and table_name = 'organigrama_age';


-- =====================================================================
-- PASO 1 — VISTA DE BANDAS
--
-- Por que categoria y no nivel: en age_units, direccion_general aparece
-- en los niveles 2, 3 y 4, y secretaria_general igual. `nivel` es la
-- profundidad del arbol DIR3, que cambia segun la rama (una DG dentro de
-- un organismo cuelga mas abajo que una DG de ministerio). La categoria
-- si es estable y es la que el usuario reconoce.
--
-- El arbol real se sigue recorriendo por superior_code; `banda` es solo
-- la agrupacion de presentacion.
-- =====================================================================

create or replace view organigrama_age as
select
  u.dir3_code,
  u.nombre,
  u.categoria,
  u.nivel                                 as nivel_dir3,
  u.superior_code,
  u.raiz_code,
  u.raiz_nombre,
  u.relevante,

  case u.categoria
    when 'ministerio'              then 'gobierno'
    when 'secretaria_estado'       then 'secretaria_estado'
    when 'subsecretaria'           then 'subsecretaria'
    when 'secretaria_general'      then 'secretaria_general'
    when 'direccion_general'       then 'direccion_general'
    when 'subdireccion_general'    then 'subdireccion_general'
    when 'gabinete'                then 'gabinete'
    when 'organismo_autonomo'      then 'organismo'
    when 'agencia_estatal'         then 'organismo'
    when 'entidad_derecho_publico' then 'organismo'
    when 'entidad_gestora'         then 'organismo'
    when 'sociedad_mercantil'      then 'sociedad'
    else 'otro'
  end                                     as banda,

  -- Orden de presentacion de las bandas en pantalla.
  case u.categoria
    when 'ministerio'              then 1
    when 'secretaria_estado'       then 2
    when 'subsecretaria'           then 3
    when 'secretaria_general'      then 4
    when 'direccion_general'       then 5
    when 'subdireccion_general'    then 6
    when 'gabinete'                then 7
    when 'organismo_autonomo'      then 8
    when 'agencia_estatal'         then 8
    when 'entidad_derecho_publico' then 8
    when 'entidad_gestora'         then 8
    when 'sociedad_mercantil'      then 9
    else 99
  end                                     as orden_banda,

  -- Que se muestra por defecto en el organigrama.
  --
  -- Fuera quedan 'unidad' (856 filas, cajon de sastre de DIR3: mesas de
  -- contratacion, registros, unidades de apoyo) y las sociedades no
  -- marcadas relevante. No se borran: siguen consultables desde la ficha
  -- de su unidad superior. Se excluyen de la vista apilada porque son lo
  -- que la hace ilegible.
  (
    u.categoria in (
      'ministerio', 'secretaria_estado', 'subsecretaria',
      'secretaria_general', 'direccion_general',
      'subdireccion_general', 'gabinete'
    )
    or (
      u.categoria in (
        'organismo_autonomo', 'agencia_estatal',
        'entidad_derecho_publico', 'entidad_gestora', 'sociedad_mercantil'
      )
      and u.relevante
    )
  )                                       as en_organigrama

from age_units u
where u.activo;


-- =====================================================================
-- PASO 2 — COMPROBACIONES
-- =====================================================================

-- 2.1 Cuanto entra en el organigrama, por banda.
--     Es el dato que decide si la vista apilada aguanta o hay que
--     romperla por ministerio.
-- select banda, orden_banda, count(*) as unidades
-- from organigrama_age
-- where en_organigrama
-- group by banda, orden_banda
-- order by orden_banda;

-- 2.2 Densidad por ministerio: cuantas unidades por banda tiene cada uno.
-- select raiz_nombre, banda, count(*)
-- from organigrama_age
-- where en_organigrama
-- group by raiz_nombre, banda
-- order by raiz_nombre, min(orden_banda);

-- 2.3 Que queda fuera. Revisar que no se cae nada importante.
-- select categoria, count(*) as unidades
-- from organigrama_age
-- where not en_organigrama
-- group by categoria
-- order by unidades desc;
