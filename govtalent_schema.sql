-- ============================================================================
-- GOVTALENT — ESQUEMA DE BASE DE DATOS (MVP)
-- PostgreSQL 14+
-- Alcance: usuarios, perfiles, organizaciones, empleos, solicitudes,
--          seguimiento, guardados, y eventos (v1.5 opcional).
-- Fuera de alcance en este esquema: Inteligencia Parlamentaria, Formación.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- EXTENSIONES
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- para búsqueda por similitud de texto
CREATE EXTENSION IF NOT EXISTS "citext";     -- email case-insensitive

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('candidate', 'org_admin', 'org_editor', 'platform_admin');

CREATE TYPE org_type AS ENUM (
  'empresa',
  'consultora_public_affairs',
  'tercer_sector_ong',
  'partido_politico',
  'institucion_publica',
  'think_tank_fundacion',
  'medios_comunicacion',
  'universidad_centro_educativo',
  'asociacion_profesional',
  'otro'
);

CREATE TYPE org_size_range AS ENUM (
  '1-10', '11-50', '50-200', '200-1000', '+1000'
);

CREATE TYPE job_modality AS ENUM ('presencial', 'hibrido', 'remoto');

CREATE TYPE employment_type AS ENUM (
  'jornada_completa', 'media_jornada', 'practicas', 'freelance', 'temporal'
);

CREATE TYPE job_status AS ENUM ('borrador', 'activa', 'pausada', 'cerrada');

CREATE TYPE application_status AS ENUM (
  'enviada', 'en_revision', 'entrevista', 'oferta', 'rechazada', 'retirada'
);

CREATE TYPE org_member_role AS ENUM ('admin', 'editor');

-- ----------------------------------------------------------------------------
-- FUNCIÓN AUXILIAR: actualizar updated_at automáticamente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USUARIOS
-- ============================================================================
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               CITEXT NOT NULL UNIQUE,
  password_hash       TEXT,                     -- NULL si usa OAuth (Google/Apple)
  auth_provider       TEXT NOT NULL DEFAULT 'email',  -- 'email' | 'google' | 'apple'
  role                user_role NOT NULL DEFAULT 'candidate',
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  professional_title  TEXT,                     -- ej. "Public Affairs Manager"
  location            TEXT,                     -- ciudad, país (texto libre en MVP)
  looking_for_job     BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url          TEXT,
  email_verified_at   TIMESTAMPTZ,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_location_trgm ON users USING gin (location gin_trgm_ops);

-- Áreas de trabajo del usuario (multi-selección: "Public Affairs", "Lobbying"...)
CREATE TABLE user_work_areas (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area        TEXT NOT NULL,
  PRIMARY KEY (user_id, area)
);

-- Áreas temáticas de interés (máx. 3 en el onboarding, pero no se fuerza en DB)
CREATE TABLE user_interest_areas (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area        TEXT NOT NULL,
  PRIMARY KEY (user_id, area)
);

-- ============================================================================
-- ORGANIZACIONES
-- ============================================================================
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,        -- para URLs públicas /empresas/burson-espana
  org_type        org_type NOT NULL,
  sector          TEXT,                        -- ej. "Energía", "Telecomunicaciones"
  size_range      org_size_range,
  location        TEXT,                        -- sede principal
  founded_year    SMALLINT,
  website_url     TEXT,
  linkedin_url    TEXT,
  logo_url        TEXT,
  cover_url       TEXT,
  bio             TEXT,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,   -- badge de verificación
  is_premium      BOOLEAN NOT NULL DEFAULT FALSE,   -- acceso a Inteligencia Parlamentaria (futuro)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_organizations_type ON organizations(org_type);
CREATE INDEX idx_organizations_sector ON organizations(sector);
CREATE INDEX idx_organizations_name_trgm ON organizations USING gin (name gin_trgm_ops);

-- Áreas de actividad de la organización (máx. 3 en el modal de creación)
CREATE TABLE organization_activity_areas (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  area             TEXT NOT NULL,
  PRIMARY KEY (organization_id, area)
);

-- Miembros/administradores de la página de organización
CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             org_member_role NOT NULL DEFAULT 'editor',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- Seguimiento de organizaciones por parte de candidatos
CREATE TABLE organization_follows (
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX idx_org_follows_org ON organization_follows(organization_id);

-- ============================================================================
-- PERFIL DE CANDIDATO
-- ============================================================================
CREATE TABLE candidate_profiles (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio                   TEXT,
  cv_url                TEXT,
  cv_uploaded_at         TIMESTAMPTZ,
  profile_completion_pct SMALLINT NOT NULL DEFAULT 0 CHECK (profile_completion_pct BETWEEN 0 AND 100),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_candidate_profiles_updated_at
  BEFORE UPDATE ON candidate_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE experiences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  organization_name TEXT NOT NULL,   -- texto libre; opcionalmente FK a organizations.id
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  location      TEXT,
  area_tag      TEXT,                -- ej. "Public Affairs", "Política UE"
  start_date    DATE NOT NULL,
  end_date      DATE,                -- NULL = actualidad
  description   TEXT,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_experiences_user ON experiences(user_id);

CREATE TABLE education (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  degree        TEXT NOT NULL,
  institution   TEXT NOT NULL,
  start_date    DATE,
  end_date      DATE,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_education_user ON education(user_id);

CREATE TABLE skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name    TEXT NOT NULL,
  UNIQUE (user_id, skill_name)
);

CREATE INDEX idx_skills_user ON skills(user_id);
CREATE INDEX idx_skills_name_trgm ON skills USING gin (skill_name gin_trgm_ops);

-- ============================================================================
-- EMPLEOS
-- ============================================================================
CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  area              TEXT NOT NULL,             -- ej. "Public Affairs", "Asuntos Europeos"
  location           TEXT NOT NULL,
  modality          job_modality NOT NULL,
  employment_type   employment_type NOT NULL,
  salary_min        INTEGER,
  salary_max        INTEGER,
  salary_currency   CHAR(3) DEFAULT 'EUR',
  description       TEXT NOT NULL,
  status            job_status NOT NULL DEFAULT 'activa',
  is_featured       BOOLEAN NOT NULL DEFAULT FALSE,   -- badge "★ Destacado"
  views_count        INTEGER NOT NULL DEFAULT 0,
  published_at       TIMESTAMPTZ,
  closes_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_salary_range CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
);

CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_jobs_org ON jobs(organization_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_area ON jobs(area);
CREATE INDEX idx_jobs_modality ON jobs(modality);
CREATE INDEX idx_jobs_location_trgm ON jobs USING gin (location gin_trgm_ops);
CREATE INDEX idx_jobs_title_trgm ON jobs USING gin (title gin_trgm_ops);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);

-- Requisitos y responsabilidades como filas (permite orden y edición granular)
CREATE TABLE job_requirements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE job_responsibilities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_job_requirements_job ON job_requirements(job_id);
CREATE INDEX idx_job_responsibilities_job ON job_responsibilities(job_id);

-- Etiquetas/tags de la oferta (ej. "Public Affairs", "Regulación")
CREATE TABLE job_tags (
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  PRIMARY KEY (job_id, tag)
);

CREATE INDEX idx_job_tags_tag ON job_tags(tag);

-- ============================================================================
-- SOLICITUDES DE EMPLEO
-- ============================================================================
CREATE TABLE job_applications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        application_status NOT NULL DEFAULT 'enviada',
  cover_note    TEXT,                     -- mensaje opcional del candidato
  cv_url_snapshot TEXT,                   -- copia del CV al momento de aplicar
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, candidate_id)            -- evita solicitudes duplicadas
);

CREATE TRIGGER trg_job_applications_updated_at
  BEFORE UPDATE ON job_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_applications_job ON job_applications(job_id);
CREATE INDEX idx_applications_candidate ON job_applications(candidate_id);
CREATE INDEX idx_applications_status ON job_applications(status);

-- Empleos guardados por el candidato
CREATE TABLE saved_jobs (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX idx_saved_jobs_job ON saved_jobs(job_id);

-- ============================================================================
-- EVENTOS (v1.5 — opcional, no depende de fuentes de datos externas)
-- ============================================================================
CREATE TABLE events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  location          TEXT,                     -- "Madrid" u "Online"
  event_date        DATE NOT NULL,
  start_time        TIME,
  end_time          TIME,
  cover_url         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_org ON events(organization_id);

CREATE TABLE event_registrations (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE saved_events (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

-- ============================================================================
-- VISTAS ÚTILES
-- ============================================================================

-- Ofertas activas con el nombre y logo de la organización (evita joins repetidos)
CREATE VIEW active_jobs_view AS
SELECT
  j.id, j.title, j.area, j.location, j.modality, j.employment_type,
  j.salary_min, j.salary_max, j.is_featured, j.views_count, j.created_at,
  o.id AS organization_id, o.name AS organization_name, o.logo_url AS organization_logo,
  (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = j.id) AS applications_count
FROM jobs j
JOIN organizations o ON o.id = j.organization_id
WHERE j.status = 'activa';

-- Porcentaje de aplicaciones por estado, útil para dashboard de organización
CREATE VIEW job_application_funnel_view AS
SELECT
  job_id,
  COUNT(*) FILTER (WHERE status = 'enviada')     AS enviadas,
  COUNT(*) FILTER (WHERE status = 'en_revision') AS en_revision,
  COUNT(*) FILTER (WHERE status = 'entrevista')  AS entrevista,
  COUNT(*) FILTER (WHERE status = 'oferta')      AS oferta,
  COUNT(*) FILTER (WHERE status = 'rechazada')   AS rechazada,
  COUNT(*)                                       AS total
FROM job_applications
GROUP BY job_id;

-- ============================================================================
-- NOTAS DE IMPLEMENTACIÓN
-- ============================================================================
-- 1. `organizations.slug` debe generarse en la app (slugify del nombre) y
--    verificarse único antes de insertar.
-- 2. `profile_completion_pct` se recalcula en la aplicación tras cada edición
--    de perfil (bio, avatar, CV, experiencia, educación, skills).
-- 3. Los ENUMs de áreas/tags (work_areas, interest_areas, activity_areas,
--    job_tags) se guardan como texto libre en el MVP para máxima flexibilidad;
--    si el catálogo se estabiliza, se puede migrar a tablas de referencia
--    (lookup tables) con FK para consistencia e i18n.
-- 4. Cuando se añada Inteligencia Parlamentaria (v2), se recomienda un
--    esquema separado (`parliamentary` schema) con sus propias tablas de
--    iniciativas, diputados, grupos parlamentarios y alertas — desacoplado
--    de este núcleo para no acoplar releases.
-- 5. Cuando se añada Formación (v2), igual: tablas `training_programs`,
--    `training_institutions`, posiblemente reutilizando `organizations`
--    para instituciones educativas vía org_type = 'universidad_centro_educativo'.
-- ============================================================================
