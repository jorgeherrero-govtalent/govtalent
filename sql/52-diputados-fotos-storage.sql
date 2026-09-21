-- =====================================================================
-- 52-diputados-fotos-storage.sql
--
-- Las 350 fotos de diputados apuntan hoy a congreso.es. Si el portal
-- reorganiza rutas o cambia de legislatura, el directorio se queda con
-- 350 imágenes rotas. Este paso prepara la copia propia en Storage.
--
-- SE SIGUE LA CONVENCIÓN QUE YA USA `ec_commissioners`:
--   photo_source_url  de dónde salió (congreso.es)
--   photo_url         la que se sirve (Supabase Storage)
--
-- Así la ficha y el listado de diputados no cambian: siguen pintando
-- `photo_url` y dejan de depender de un tercero sin enterarse.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 0 — Comprobación (no modifica nada)
-- ---------------------------------------------------------------------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'deputies'
  and column_name in ('photo_url', 'photo_source_url');
-- Se espera ver solo `photo_url`.

select count(*) filter (where active and photo_url like 'https://www.congreso.es/%') as apuntando_a_congreso
from public.deputies;
-- Deberían ser 350.


-- ---------------------------------------------------------------------
-- PASO 1 — La columna de origen, con los valores de hoy
-- ---------------------------------------------------------------------

alter table public.deputies
  add column if not exists photo_source_url text;

comment on column public.deputies.photo_source_url is
  'URL original de la foto en congreso.es. La que se sirve es photo_url, que apunta a la copia en Storage.';

-- Lo que hoy hay en photo_url es la URL de congreso.es: pasa a ser el
-- origen. `where photo_source_url is null` hace la sentencia repetible.
update public.deputies
set photo_source_url = photo_url
where photo_url like 'https://www.congreso.es/%'
  and photo_source_url is null;


-- ---------------------------------------------------------------------
-- PASO 2 — El bucket
--
-- Público, como `ec-photos`: son fotos oficiales de cargos públicos, no
-- hay nada que proteger, y firmar una URL por cada una de las 350 en
-- cada carga del listado sería caro para nada.
--
-- Si prefieres crearlo desde el panel de Supabase (Storage → New
-- bucket → nombre `diputados-photos`, marcado como público), salta esta
-- sentencia: hace exactamente lo mismo.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('diputados-photos', 'diputados-photos', true)
on conflict (id) do update set public = true;


-- ---------------------------------------------------------------------
-- PASO 3 — Comprobación final
-- ---------------------------------------------------------------------

select
  count(*) filter (where active) as activos,
  count(*) filter (where active and photo_source_url is not null) as con_origen,
  count(*) filter (where active and photo_url like '%/storage/v1/object/public/%') as ya_en_storage
from public.deputies;

select id, public from storage.buckets where id = 'diputados-photos';
