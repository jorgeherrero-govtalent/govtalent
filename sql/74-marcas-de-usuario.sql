-- =====================================================================
-- 74 · Marcas de usuario: avisos ocultados, decisiones y correos únicos
--
-- Una fila por (usuario, clave). Sirve para lo que antes no tenía dónde
-- guardarse fuera del navegador:
--
--   oculto:calendario-29n     el usuario ha ocultado la franja del
--                             calendario electoral en Novedades
--   resuelto:caducadas-xv     ya ha decidido qué hacer con las leyes que
--                             seguía y caducaron con la disolución
--   correo:caducadas-xv       ya se le ha enviado el correo de caducadas
--
-- Con localStorage la franja volvía a salir en otro dispositivo, y un
-- correo único necesita constancia de que ya se mandó.
--
-- Cada usuario lee, crea y borra sus marcas. Las de correo las escribe el
-- servidor (service role), que salta el RLS.
-- =====================================================================

-- Paso 0 (solo lectura): comprobar que la tabla no existe ya.
-- select to_regclass('public.usuario_marcas');

create table if not exists public.usuario_marcas (
  user_id uuid not null references auth.users(id) on delete cascade,
  clave text not null check (length(clave) between 3 and 80),
  created_at timestamptz not null default now(),
  primary key (user_id, clave)
);

alter table public.usuario_marcas enable row level security;

drop policy if exists "marcas: leer las propias" on public.usuario_marcas;
create policy "marcas: leer las propias" on public.usuario_marcas
  for select to authenticated using (user_id = auth.uid());

-- Desde el navegador solo se crean marcas de interfaz, nunca las de
-- correo: esas son constancia de un envío y solo las pone el servidor.
drop policy if exists "marcas: crear las propias" on public.usuario_marcas;
create policy "marcas: crear las propias" on public.usuario_marcas
  for insert to authenticated
  with check (user_id = auth.uid() and clave not like 'correo:%');

drop policy if exists "marcas: borrar las propias" on public.usuario_marcas;
create policy "marcas: borrar las propias" on public.usuario_marcas
  for delete to authenticated
  using (user_id = auth.uid() and clave not like 'correo:%');

grant select, insert, delete on public.usuario_marcas to authenticated;
grant all on public.usuario_marcas to service_role;
