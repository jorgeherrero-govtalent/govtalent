-- 138: logos de patronales y asociaciones sectoriales (19-11-2026).
--
-- Ya aplicado en producción. Se documenta aquí.
--
-- El logo sale de la web de cada organización: la edge function
-- logos-directorio (supabase/functions/logos-directorio) busca el
-- apple-touch-icon o el icono declarado de 48 px o más (nunca SVG), lo sube al
-- bucket público directorio-logos como <id>.<ext> y rellena logo_url.
-- Sin imagen usable deja logo_origen = 'sin_logo' y la pantalla enseña las
-- iniciales en un círculo gris (maqueta C).
--
-- Revisión manual: los iconos genéricos (WordPress) y los repetidos en
-- dominios distintos quedan con logo_url nulo y logo_origen 'generico' o
-- 'descartado', para que la función no vuelva a intentarlos.

alter table public.directorio_entidades
  add column if not exists logo_url    text,
  add column if not exists logo_origen text,
  add column if not exists logo_hash   text,
  add column if not exists logo_fecha  timestamptz;

insert into storage.buckets (id, name, public)
values ('directorio-logos', 'directorio-logos', true)
on conflict (id) do nothing;

-- Volver a intentar las que no tenían logo (por ejemplo, tras cambiar la web):
--   update public.directorio_entidades
--      set logo_origen = null
--    where categoria = 'patronal' and logo_origen = 'sin_logo';
-- y llamar a la función: POST /functions/v1/logos-directorio {"limite":40}

-- Logos repetidos en dominios distintos (iconos de plantilla):
--   select logo_hash, count(*), string_agg(organizacion, ' | ')
--     from public.directorio_entidades
--    where logo_hash is not null
--    group by 1 having count(*) > 1;
