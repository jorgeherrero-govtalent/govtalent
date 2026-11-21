-- =====================================================================
-- 142. Fotos oficiales de los gobiernos autonómicos (21-11-2026)
--
-- Las imágenes de la página oficial del Consejo de Gobierno de cada
-- comunidad, con el texto que las acompaña (alt, antes y después). Las
-- guarda /api/sync/fotos-gobiernos-ccaa (lib/ccaa/fotosGobierno.js) y
-- la ficha de cada gobierno las empareja con el presidente y los
-- consejeros. Se guarda la URL que publica cada gobierno, no la imagen.
--
-- RLS activada y sin políticas: solo se lee desde el servidor (cliente
-- de administración), como fuentes_personas.
-- =====================================================================

create table if not exists public.ccaa_gobierno_fotos (
  id bigserial primary key,
  gobierno text not null,          -- slug de lib/ccaa/gobiernos.js
  foto_url text not null,
  alt text,
  antes text,
  despues text,
  orden integer not null default 0,
  fuente_url text not null,
  leido_at timestamptz not null default now(),
  unique (gobierno, foto_url)
);

create index if not exists ccaa_gobierno_fotos_gobierno_idx on public.ccaa_gobierno_fotos (gobierno);

alter table public.ccaa_gobierno_fotos enable row level security;
