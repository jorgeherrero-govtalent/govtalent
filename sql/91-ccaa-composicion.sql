-- =====================================================================
-- 91 · Composición de los parlamentos autonómicos
--
-- Diputados, grupos parlamentarios, comisiones y cargos de cada
-- parlamento autonómico, con el mismo modelo para todos (la clave
-- `parlamento` es la de lib/parlamentosAutonomicos.js). Empieza la
-- Asamblea de Madrid (12-10-2026): datos abiertos de la Asamblea
-- (OcupacionesDiputadosAsambleaMadrid) y fichas de diputado.
--
-- Lectura pública (como deputies y parliamentary_groups); escritura solo
-- con service_role (el sync).
-- =====================================================================

CREATE TABLE IF NOT EXISTS ccaa_grupos (
  id            text PRIMARY KEY,               -- 'madrid:popular'
  parlamento    text NOT NULL,
  legislatura   text NOT NULL,
  nombre        text NOT NULL,                  -- 'Grupo Parlamentario Popular'
  sigla         text,                           -- 'PP'
  slug          text UNIQUE NOT NULL,           -- 'madrid-pp'
  n_diputados   integer NOT NULL DEFAULT 0,
  color         text,                           -- color oficial del grupo en la web del parlamento
  logo_url      text,
  fecha_constitucion date,
  id_fuente     text,                           -- id del grupo en la web del parlamento
  url           text,
  activo        boolean NOT NULL DEFAULT true,
  fuente        text,
  synced_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ccaa_diputados (
  id               text PRIMARY KEY,            -- 'madrid:2026' (id de la ficha) o 'madrid:n:<nombre>'
  parlamento       text NOT NULL,
  legislatura      text NOT NULL,
  nombre           text NOT NULL,               -- 'Alicia Torija López'
  apellidos_nombre text,                        -- 'Torija López, Alicia' (para ordenar)
  slug             text UNIQUE NOT NULL,        -- 'madrid-alicia-torija-lopez'
  grupo_id         text REFERENCES ccaa_grupos(id),
  sexo             text,                        -- 'M' / 'H', del cargo («Diputada» / «Diputado»)
  circunscripcion  text,
  foto_url         text,
  email            text,
  url_ficha        text,
  twitter          text,
  datos            jsonb,                       -- legislaturas, actividad parlamentaria (recuentos por tipo)
  id_fuente        text,                        -- id del diputado en la web del parlamento
  fecha_alta       date,
  activo           boolean NOT NULL DEFAULT true,
  fuente           text,
  fuente_fecha     timestamptz,
  ficha_leida_at   timestamptz,                 -- última lectura de la ficha (foto y correo)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ccaa_diputados_parl ON ccaa_diputados (parlamento, activo);

CREATE TABLE IF NOT EXISTS ccaa_comisiones (
  id          text PRIMARY KEY,                 -- 'madrid:comision-de-sanidad'
  parlamento  text NOT NULL,
  legislatura text NOT NULL,
  nombre      text NOT NULL,
  tipo        text,                             -- 'permanente', 'legislativa', 'investigacion', 'organo' (Mesa, Junta, Diputación Permanente)
  slug        text UNIQUE NOT NULL,
  url         text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Cargos: pertenencia a un órgano (comisión, Mesa, Junta de Portavoces,
-- Diputación Permanente) o a un grupo (portavoz, técnico del grupo).
-- `diputado_id` es null para el personal de los grupos.
CREATE TABLE IF NOT EXISTS ccaa_cargos (
  id           bigserial PRIMARY KEY,
  parlamento   text NOT NULL,
  legislatura  text NOT NULL,
  nombre       text NOT NULL,
  diputado_id  text REFERENCES ccaa_diputados(id) ON DELETE CASCADE,
  grupo_id     text REFERENCES ccaa_grupos(id),
  comision_id  text REFERENCES ccaa_comisiones(id) ON DELETE CASCADE,
  organo       text,                            -- texto del órgano tal como lo da la fuente, si lo da
  cargo        text NOT NULL,                   -- tal como lo da la fuente ('Portavoz Adjunta')
  cargo_norm   text,                            -- 'presidencia', 'vicepresidencia', 'secretaria', 'portavoz', 'portavoz_adjunto', 'vocal', 'titular', 'suplente', 'tecnico', 'consejero', 'senador'
  fecha_inicio date,
  fecha_fin    date,
  activo       boolean NOT NULL DEFAULT true,
  fuente       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ccaa_cargos_dip ON ccaa_cargos (diputado_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ccaa_cargos_com ON ccaa_cargos (comision_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ccaa_cargos_parl ON ccaa_cargos (parlamento, activo);

ALTER TABLE ccaa_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccaa_diputados ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccaa_comisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccaa_cargos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ccaa_grupos_lectura ON ccaa_grupos;
CREATE POLICY ccaa_grupos_lectura ON ccaa_grupos FOR SELECT USING (true);
DROP POLICY IF EXISTS ccaa_diputados_lectura ON ccaa_diputados;
CREATE POLICY ccaa_diputados_lectura ON ccaa_diputados FOR SELECT USING (true);
DROP POLICY IF EXISTS ccaa_comisiones_lectura ON ccaa_comisiones;
CREATE POLICY ccaa_comisiones_lectura ON ccaa_comisiones FOR SELECT USING (true);
DROP POLICY IF EXISTS ccaa_cargos_lectura ON ccaa_cargos;
CREATE POLICY ccaa_cargos_lectura ON ccaa_cargos FOR SELECT USING (true);

-- El correo de los diputados es dato del Directorio (de pago): la columna
-- `email` se cierra a los roles del navegador desde el principio, como
-- sql/53 en `deputies`. Se lee con la clave de servicio desde
-- /api/parlamentos-autonomicos/diputados/contacto.
-- OJO AL AÑADIR COLUMNAS: repetir este bloque.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'ccaa_diputados' and column_name not in ('email');
  execute 'revoke select on public.ccaa_diputados from anon, authenticated';
  execute format('grant select (%s) on public.ccaa_diputados to anon, authenticated', cols);
end $$;
