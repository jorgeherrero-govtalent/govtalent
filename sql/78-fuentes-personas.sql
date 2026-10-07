-- =====================================================================
-- 78 · Fuentes cargadas en bloque (fase 5 de Buscar y enriquecer)
--
-- Personas de fuentes oficiales que se cargan de una vez desde un
-- documento, con su fuente y su fecha:
--   · Lista del Cuerpo Diplomático (MAEC, 30/09/2026): embajadas
--     extranjeras y organismos internacionales en España.
--   · Embajadores de España (web del MAEC, 07/10/2026).
--   · EU Whoiswho (sept.-oct. 2026): agencias y órganos de la UE, CESE,
--     Tribunal de Cuentas, BEI-FEI, Consejo Europeo, personal del
--     Parlamento Europeo y lo nuevo de la Comisión respecto a ec_people.
--
-- Se suman a directorio_pro (la vista de la Base de datos y del buscador
-- de Contactos) con ids «fuente:<id>». La vista se amplía con su propia
-- definición (pg_get_viewdef) para no perder nada de lo que ya tiene.
--
-- Recargar una fuente: borrar sus filas (where fuente = ...) e importar
-- de nuevo; fuente_clave evita duplicados dentro de una carga.
--
-- Paso 0 (solo lectura):
--   select pg_get_viewdef('directorio_pro'::regclass, true);
--   select to_regclass('public.fuentes_personas');
-- =====================================================================

create table if not exists public.fuentes_personas (
  id bigserial primary key,
  fuente text not null,
  fuente_fecha date,
  fuente_clave text not null unique,
  jurisdiccion text not null check (jurisdiccion in ('España', 'UE')),
  tipo_institucion text not null,
  pais text,
  institucion text,
  unidad text,
  categoria_unidad text,
  nombre text not null,
  cargo text,
  banda text,
  orden smallint,
  es_titular boolean not null default false,
  area text,
  email text,
  email_unidad text,
  telefono text,
  direccion_postal text,
  localidad text,
  provincia text,
  web text,
  extra jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  objecion boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists fuentes_personas_fuente_idx on public.fuentes_personas (fuente);
alter table public.fuentes_personas enable row level security;
grant all on public.fuentes_personas to service_role;
grant usage, select on sequence public.fuentes_personas_id_seq to service_role;

-- Ampliar directorio_pro con la rama de fuentes (solo si aún no la tiene).
do $$
declare
  v_def text := pg_get_viewdef('public.directorio_pro'::regclass, true);
begin
  if position('fuentes_personas' in v_def) > 0 then
    return;
  end if;
  v_def := regexp_replace(v_def, ';\s*$', '');
  execute 'create or replace view public.directorio_pro as ' || v_def || $rama$
UNION ALL
 SELECT 'fuente:'::text || f.id::text AS id,
    f.jurisdiccion,
    f.tipo_institucion,
    f.pais,
    f.institucion,
    f.unidad,
    f.categoria_unidad,
    f.nombre,
    f.cargo,
    f.cargo AS cargo_canonico,
    COALESCE(f.banda, 'tecnico'::text) AS banda,
    COALESCE(f.orden, 5::smallint) AS orden,
    f.es_titular,
    COALESCE(f.area, 'Otras áreas sectoriales'::text) AS area,
    f.email,
    f.email_unidad,
    f.telefono,
    f.direccion_postal,
    f.localidad,
    f.provincia,
    NULL::text AS slug,
    'fuente'::text AS origen,
    f.fuente,
    f.fuente_fecha::timestamp with time zone AS fuente_fecha,
    f.objecion,
    LEAST(100,
        CASE
            WHEN f.email IS NOT NULL THEN 50
            WHEN f.email_unidad IS NOT NULL THEN 20
            ELSE 0
        END +
        CASE
            WHEN f.telefono IS NOT NULL THEN 20
            ELSE 0
        END +
        CASE
            WHEN f.fuente_fecha > (now() - '6 mons'::interval) THEN 10
            ELSE 0
        END) AS contactabilidad
   FROM fuentes_personas f
  WHERE f.activo
$rama$;
end;
$$;

-- Los duplicados con ec_people (Comisión) y eu_meps (eurodiputados) se
-- quitan por correo en la ruta de carga, antes de importar.
