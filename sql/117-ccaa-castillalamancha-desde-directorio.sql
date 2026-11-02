-- =====================================================================
-- 117. Cortes de Castilla-La Mancha: composición desde el directorio
--
-- La web de las Cortes (cortesclm.es) sirve toda la composición en
-- marcos que cargan /web2/paginas/, ruta que su robots.txt prohíbe. Hasta
-- que las Cortes den acceso, la composición sale del directorio público
-- que ya está en fuentes_personas (carga «excel-clm-15-10-2026»):
--   - 32 diputados con su circunscripción («Diputada … por Toledo») y,
--     casi todos, su correo @cortesclm.es;
--   - el grupo, del sufijo del correo (_gps Socialista, _gpp Popular,
--     _gpv Vox). Sin correo no hay grupo: se deja vacío, no se deduce;
--   - la Mesa (vicepresidencias y secretarías). La Presidencia no viene.
-- Sin comisiones ni fotos: no están en el directorio.
-- Se puede ejecutar más de una vez (upsert por id).
-- =====================================================================

-- Paso 0 (solo lectura): lo que se va a cargar.
-- select nombre, cargo, email, substring(email from '_(gp[a-z])@') sufijo
-- from fuentes_personas
-- where institucion = 'Cortes de Castilla-La Mancha' and cargo ~* '^diputad';

insert into public.ccaa_grupos (id, parlamento, legislatura, nombre, sigla, slug, n_diputados, activo, fuente, synced_at)
values
  ('castillalamancha:psoe', 'castillalamancha', 'XI', 'Grupo Parlamentario Socialista', 'PSOE', 'castillalamancha-psoe', 0, true, 'Directorio público (15/10/2026)', now()),
  ('castillalamancha:pp', 'castillalamancha', 'XI', 'Grupo Parlamentario Popular', 'PP', 'castillalamancha-pp', 0, true, 'Directorio público (15/10/2026)', now()),
  ('castillalamancha:vox', 'castillalamancha', 'XI', 'Grupo Parlamentario Vox', 'VOX', 'castillalamancha-vox', 0, true, 'Directorio público (15/10/2026)', now())
on conflict (id) do update set nombre = excluded.nombre, sigla = excluded.sigla, activo = true, synced_at = now()
;

with base as (
  select
    f.nombre,
    f.email,
    f.cargo,
    lower(regexp_replace(regexp_replace(unaccent(f.nombre), '[^A-Za-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) as clave,
    substring(f.cargo from 'por (.+)$') as circunscripcion,
    case when f.cargo ~* '^diputada' then 'M' else 'H' end as sexo,
    case substring(f.email from '_(gp[a-z])@')
      when 'gps' then 'castillalamancha:psoe'
      when 'gpp' then 'castillalamancha:pp'
      when 'gpv' then 'castillalamancha:vox'
    end as grupo_id
  from public.fuentes_personas f
  where f.institucion = 'Cortes de Castilla-La Mancha' and f.cargo ~* '^diputad'
)
insert into public.ccaa_diputados (id, parlamento, legislatura, nombre, apellidos_nombre, slug, grupo_id, sexo, circunscripcion, email, id_fuente, activo, fuente, fuente_fecha, updated_at)
select
  'castillalamancha:' || b.clave,
  'castillalamancha',
  'XI',
  b.nombre,
  -- Dos apellidos al final («García Saco, María del Rosario»).
  regexp_replace(b.nombre, '^(.*)\s(\S+\s\S+)$', '\2, \1'),
  'castillalamancha-' || b.clave,
  b.grupo_id,
  b.sexo,
  b.circunscripcion,
  b.email,
  b.clave,
  true,
  'Directorio público (15/10/2026)',
  '2026-10-15',
  now()
from base b
on conflict (id) do update set
  nombre = excluded.nombre, apellidos_nombre = excluded.apellidos_nombre, grupo_id = excluded.grupo_id,
  sexo = excluded.sexo, circunscripcion = excluded.circunscripcion, email = coalesce(excluded.email, ccaa_diputados.email),
  activo = true, updated_at = now();

-- Mesa (lo que trae el directorio).
insert into public.ccaa_comisiones (id, parlamento, legislatura, nombre, tipo, slug, url, activo)
values ('castillalamancha:mesa-de-las-cortes-de-castilla-la-mancha', 'castillalamancha', 'XI', 'Mesa de las Cortes de Castilla-La Mancha', 'organo',
        'castillalamancha-mesa-de-las-cortes-de-castilla-la-mancha', 'https://www.cortesclm.es/index.php/composicion', true)
on conflict (id) do update set nombre = excluded.nombre, activo = true;

delete from public.ccaa_cargos where parlamento = 'castillalamancha' and fuente = 'directorio';

insert into public.ccaa_cargos (parlamento, legislatura, nombre, diputado_id, grupo_id, comision_id, organo, cargo, cargo_norm, activo, fuente)
select 'castillalamancha', 'XI', d.nombre, d.id, d.grupo_id,
       'castillalamancha:mesa-de-las-cortes-de-castilla-la-mancha', 'Mesa de las Cortes de Castilla-La Mancha',
       regexp_replace(f.cargo, '\s+de las Cortes de Castilla-La Mancha$', ''),
       case when f.cargo ~* '^vicepresident' then 'vicepresidencia' when f.cargo ~* '^secretari' then 'secretaria' else 'otro' end,
       true, 'directorio'
from public.fuentes_personas f
join public.ccaa_diputados d on d.parlamento = 'castillalamancha' and d.nombre = f.nombre
where f.institucion = 'Cortes de Castilla-La Mancha'
  and f.cargo ~* '^(vicepresident|secretari)[a-z]* (primer|segund)[oa] de las Cortes de Castilla-La Mancha$';

-- Recuento de diputados por grupo.
update public.ccaa_grupos g set n_diputados = x.n
from (select grupo_id, count(*) n from public.ccaa_diputados where parlamento = 'castillalamancha' and activo group by 1) x
where g.id = x.grupo_id;
