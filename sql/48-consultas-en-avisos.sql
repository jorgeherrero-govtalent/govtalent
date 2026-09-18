-- =====================================================================
-- 48 — LAS CONSULTAS PÚBLICAS, EN LOS AVISOS
--
-- Acompaña al cambio de código que añade el tipo `consulta` al motor de
-- detección de cambios y a los dos correos de alerta.
--
-- Dos cosas, ninguna destructiva:
--   1. Las reglas de aviso del nuevo tipo en `change_rules`. Sin ellas
--      el motor detecta el cambio y lo descarta: la regla es lo que
--      convierte un cambio en un evento.
--   2. Añadir la fuente 'consultas' a las alertas de sector que ya
--      existen. Las nuevas ya nacen con ella; las de antes se quedarían
--      sin consultas para siempre.
--
-- PASO 0 PRIMERO. Se ejecuta entero y se mira el resultado antes de
-- tocar nada.
-- =====================================================================


-- =====================================================================
-- PASO 0 — COMPROBACIÓN (solo lectura)
-- =====================================================================

-- 0.1 Las columnas de change_rules son las que el motor espera
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'change_rules'
order by ordinal_position;

-- 0.2 Qué reglas hay hoy, y si alguna es ya de consultas
select kind, field, event_type, template, active
from change_rules
order by kind, field;

-- 0.3 De qué tipo es sector_alerts.fuentes. Si NO dice ARRAY, el
--     paso 2 de abajo no vale y hay que adaptarlo.
select column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public' and table_name = 'sector_alerts' and column_name = 'fuentes';

-- 0.4 Cuántas alertas se van a tocar
select count(*) filter (where not ('consultas' = any(fuentes))) as les_falta,
       count(*)                                                as total
from sector_alerts;

-- 0.5 Que la vista que va a leer el motor trae lo que tiene que traer
select count(*)                                              as total,
       count(*) filter (where fecha_fin >= current_date)      as con_plazo_vivo,
       count(*) filter (where url_documento is not null)      as con_documento
from consultas_estado;


-- =====================================================================
-- PASO 1 — LAS REGLAS DE AVISO
--
-- Dos campos, y solo dos. Coinciden exactamente con la huella que
-- guarda el motor (`fecha_fin` y `documento`) y con lo que el botón de
-- seguir promete al usuario: prometer más sería mentir.
--
-- El estado (abierta/urgente/cerrada) NO tiene regla a propósito: se
-- calcula desde fecha_fin, así que cruzaría a 'urgente' la misma noche
-- en que ya suena el aviso de plazo de siete días.
-- =====================================================================

insert into change_rules (kind, field, event_type, template, active)
select * from (values
  ('consulta', 'fecha_fin',  'plazo_modificado',    'El plazo de aportaciones pasa de {antes} a {ahora}', true),
  ('consulta', 'documento',  'documento_publicado', 'Ya está disponible el documento sometido a consulta', true)
) as v(kind, field, event_type, template, active)
where not exists (
  select 1 from change_rules r where r.kind = v.kind and r.field = v.field
);


-- =====================================================================
-- PASO 2 — LAS ALERTAS DE SECTOR YA CREADAS
--
-- Solo si el paso 0.3 ha dicho ARRAY.
-- =====================================================================

update sector_alerts
set fuentes = array_append(fuentes, 'consultas')
where fuentes is not null
  and not ('consultas' = any(fuentes));


-- =====================================================================
-- PASO 3 — COMPROBACIÓN FINAL
-- =====================================================================

select kind, field, event_type, active
from change_rules
where kind = 'consulta';

select count(*) filter (where 'consultas' = any(fuentes)) as con_consultas,
       count(*)                                           as total
from sector_alerts;

-- Después de esto, la primera noche solo GUARDA la huella de las 53
-- consultas: sin huella previa no se avisa, que es lo que evita un
-- correo con todo lo que ya existía. Los avisos empiezan la segunda.
--
-- Para no esperar, en seco y sin escribir:
--   /api/sync/detectar-cambios?key=<DEBUG_KEY>&tipo=consulta&dry=1
