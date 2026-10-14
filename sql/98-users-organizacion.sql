-- 98 · Organización declarada en el onboarding (14-10-2026)
--
-- El onboarding nuevo (una sola pantalla, «Cuéntanos sobre ti») pide la
-- organización en la que trabaja la persona y su tipo. Son datos que
-- declara el propio usuario: no enlazan todavía con `organizations` ni con
-- el directorio.
--
-- Las columnas heredan los permisos de tabla de `users` (authenticated
-- tiene UPDATE a nivel de tabla), así que el usuario puede guardarlas con
-- la misma política con la que ya guarda nombre y puesto.

alter table public.users
  add column if not exists organizacion_nombre text,
  add column if not exists organizacion_tipo text;

alter table public.users
  drop constraint if exists users_organizacion_tipo_check;

alter table public.users
  add constraint users_organizacion_tipo_check
  check (
    organizacion_tipo is null
    or organizacion_tipo in (
      'consultora',
      'empresa',
      'asociacion_sectorial',
      'despacho',
      'institucion_publica',
      'tercer_sector'
    )
  );

comment on column public.users.organizacion_nombre is 'Organización en la que trabaja, declarada por el usuario en el onboarding.';
comment on column public.users.organizacion_tipo is 'Tipo de organización declarado en el onboarding: consultora, empresa, asociacion_sectorial, despacho, institucion_publica, tercer_sector.';
