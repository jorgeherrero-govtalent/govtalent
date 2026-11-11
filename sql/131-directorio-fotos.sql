-- 131 · Fotos de las personas del directorio (12-11-2026)
--
-- La extensión de Chrome guarda la foto del perfil de LinkedIn de quien
-- ya está en el directorio. El directorio es una unión de nueve fuentes,
-- así que la foto no cuelga de una columna: va en una tabla aparte, por
-- el id de la persona en directorio_pro ('agenda:7230', …).
--
-- La imagen vive en el bucket público `directorio-fotos` (como
-- diputados-photos o cargos-photos); aquí queda de dónde salió y quién
-- la subió, para poder retirarla.

create table if not exists public.directorio_fotos (
  persona_id  text primary key,
  ruta        text not null,
  url         text not null,
  origen      text not null default 'linkedin',
  origen_url  text,
  subido_por  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.directorio_fotos enable row level security;
-- Sin políticas: solo se lee y se escribe desde el servidor (service_role).
revoke all on public.directorio_fotos from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('directorio-fotos', 'directorio-fotos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
