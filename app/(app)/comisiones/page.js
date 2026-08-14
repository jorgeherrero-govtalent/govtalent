-- =====================================================================
-- GovTalent — Vistas de comisiones del Congreso
--
-- Verificado en la carga: 30 comisiones, 1.496 miembros, 274 portavoces.
-- De los 178 que no enlazan con deputies, 134 son senadores (grupos con
-- código SGP*) y 44 letrados. Cuadra al detalle: todos los diputados
-- casan, y quienes no son diputados no podían casar.
--
-- Los senadores se marcan como tales para que la interfaz no los muestre
-- como un fallo de datos. Cuando exista el directorio del Senado, basta
-- añadir la columna del enlace.
-- =====================================================================

drop view if exists es_committees_directory cascade;
drop view if exists es_committee_people cascade;


-- ---------------------------------------------------------------------
-- 1. Miembros con su ficha resuelta
-- ---------------------------------------------------------------------
create view es_committee_people
with (security_invoker = on) as
select
  m.committee_id,
  c.slug            as committee_slug,
  c.name            as committee_name,
  m.nombre,
  m.cargo,
  -- Las variantes de un mismo cargo se unifican: la fuente devuelve
  -- "Letrada", "Letrado" y "Letrados" para lo mismo, y "Adscrita"
  -- junto a "Adscritos".
  case
    when m.cargo ilike 'letrad%'   then 'Letrados'
    when m.cargo ilike 'adscrit%'  then 'Adscritos'
    when m.cargo ilike 'vocal%'    then 'Vocales'
    else m.cargo
  end               as cargo_norm,
  m.orden_cargo,
  m.grupo,
  m.cod_parlamentario,
  m.deputy_id,
  d.slug            as deputy_slug,
  d.full_name       as deputy_name,
  d.photo_url,
  d.constituency,
  g.name            as grupo_nombre,
  -- Los grupos del Senado llevan código SGP*. Sin esta marca, un
  -- senador sin ficha parecería un enlace roto.
  (m.grupo like 'SGP%')                        as es_senador,
  (m.cargo ilike 'letrad%')                    as es_letrado,
  m.fecha_alta,
  m.fecha_baja
from es_committee_members m
join es_committees c on c.id = m.committee_id
left join deputies d on d.id = m.deputy_id
left join parliamentary_groups g on g.id = d.parliamentary_group_id;

grant select on es_committee_people to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Directorio de comisiones
-- ---------------------------------------------------------------------
create view es_committees_directory
with (security_invoker = on) as
select
  c.id,
  c.suborgano_id,
  c.slug,
  c.name,
  c.kind,
  c.legislature_code,
  c.fecha_constitucion,
  c.n_members,
  -- La mesa: quien preside y sus vicepresidencias
  (select p.nombre from es_committee_people p
    where p.committee_id = c.id and p.orden_cargo = 1 limit 1)      as presidente,
  (select p.deputy_slug from es_committee_people p
    where p.committee_id = c.id and p.orden_cargo = 1 limit 1)      as presidente_slug,
  (select p.grupo from es_committee_people p
    where p.committee_id = c.id and p.orden_cargo = 1 limit 1)      as presidente_grupo,
  -- Los portavoces: quien negocia por cada grupo. Es el dato que hace
  -- útil este módulo para asuntos públicos.
  (select count(*) from es_committee_people p
    where p.committee_id = c.id and p.orden_cargo = 4)              as n_portavoces,
  (select count(*) from es_committee_people p
    where p.committee_id = c.id and p.es_senador)                   as n_senadores,
  -- Cuántas iniciativas está tramitando ahora mismo. El cruce es por
  -- nombre porque es_initiatives guarda la comisión como texto.
  (select count(*) from es_initiatives i
    where i.comision = c.name and not i.is_closed)                  as n_iniciativas,
  (select count(*) from es_initiatives i
    where i.situacion = c.name and not i.is_closed)                 as n_en_esta_fase
from es_committees c;

grant select on es_committees_directory to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Comprobaciones
-- ---------------------------------------------------------------------

-- Reparto general
select count(*)                                   as comisiones,
       sum(n_members)                             as miembros,
       sum(n_portavoces)                          as portavoces,
       sum(n_senadores)                           as senadores,
       count(*) filter (where n_iniciativas > 0)  as con_iniciativas
from es_committees_directory;

-- Las comisiones con más carga legislativa ahora mismo
select name, n_members, n_portavoces, n_iniciativas, presidente, presidente_grupo
from es_committees_directory
where n_iniciativas > 0
order by n_iniciativas desc
limit 8;

-- Y los portavoces de una comisión concreta, que es la consulta que
-- hará un profesional: con quién hablo sobre sanidad.
select nombre, grupo, cargo_norm, es_senador
from es_committee_people
where committee_name ilike '%Sanidad%' and orden_cargo <= 4
order by orden_cargo, nombre;
