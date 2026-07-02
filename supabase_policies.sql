-- ============================================================================
-- GOVTALENT — POLÍTICAS DE SEGURIDAD (RLS) Y AUTOMATISMOS
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de govtalent_schema.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensiones necesarias
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ----------------------------------------------------------------------------
-- 1. Vincular public.users con auth.users y crear el perfil automáticamente
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_auth'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT fk_users_auth FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, first_name, last_name, auth_provider)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
  );
  INSERT INTO public.candidate_profiles (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. Slug automático para organizaciones (para URLs públicas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION slugify(input TEXT)
RETURNS TEXT AS $$
  SELECT trim(both '-' from regexp_replace(lower(unaccent(input)), '[^a-z0-9]+', '-', 'g'));
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION set_organization_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INT := 0;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;
  base_slug := slugify(NEW.name);
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = final_slug AND id <> NEW.id) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizations_slug ON organizations;
CREATE TRIGGER trg_organizations_slug
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_organization_slug();

-- ============================================================================
-- 3. ACTIVAR RLS EN TODAS LAS TABLAS (idempotente si ya estaba activo)
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_work_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interest_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_activity_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_responsibilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. POLÍTICAS — USERS Y PERFIL DE CANDIDATO
-- ============================================================================
DROP POLICY IF EXISTS "users_select_authenticated" ON users;
CREATE POLICY "users_select_authenticated" ON users
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "candidate_profiles_select_authenticated" ON candidate_profiles;
CREATE POLICY "candidate_profiles_select_authenticated" ON candidate_profiles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "candidate_profiles_update_own" ON candidate_profiles;
CREATE POLICY "candidate_profiles_update_own" ON candidate_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "candidate_profiles_insert_own" ON candidate_profiles;
CREATE POLICY "candidate_profiles_insert_own" ON candidate_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "work_areas_select_authenticated" ON user_work_areas;
CREATE POLICY "work_areas_select_authenticated" ON user_work_areas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "work_areas_manage_own" ON user_work_areas;
CREATE POLICY "work_areas_manage_own" ON user_work_areas
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "interest_areas_select_authenticated" ON user_interest_areas;
CREATE POLICY "interest_areas_select_authenticated" ON user_interest_areas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "interest_areas_manage_own" ON user_interest_areas;
CREATE POLICY "interest_areas_manage_own" ON user_interest_areas
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "experiences_select_authenticated" ON experiences;
CREATE POLICY "experiences_select_authenticated" ON experiences
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "experiences_manage_own" ON experiences;
CREATE POLICY "experiences_manage_own" ON experiences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "education_select_authenticated" ON education;
CREATE POLICY "education_select_authenticated" ON education
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "education_manage_own" ON education;
CREATE POLICY "education_manage_own" ON education
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "skills_select_authenticated" ON skills;
CREATE POLICY "skills_select_authenticated" ON skills
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "skills_manage_own" ON skills;
CREATE POLICY "skills_manage_own" ON skills
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 5. POLÍTICAS — ORGANIZACIONES
-- ============================================================================
DROP POLICY IF EXISTS "organizations_select_authenticated" ON organizations;
CREATE POLICY "organizations_select_authenticated" ON organizations
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "organizations_insert_authenticated" ON organizations;
CREATE POLICY "organizations_insert_authenticated" ON organizations
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "organizations_update_members" ON organizations;
CREATE POLICY "organizations_update_members" ON organizations
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = organizations.id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "activity_areas_select_authenticated" ON organization_activity_areas;
CREATE POLICY "activity_areas_select_authenticated" ON organization_activity_areas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "activity_areas_manage_members" ON organization_activity_areas;
CREATE POLICY "activity_areas_manage_members" ON organization_activity_areas
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = organization_activity_areas.organization_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = organization_activity_areas.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "org_members_select" ON organization_members;
CREATE POLICY "org_members_select" ON organization_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT organization_id FROM organization_members m2 WHERE m2.user_id = auth.uid())
  );
-- Permite crear el primer admin (al crear la organización) o que un admin existente añada nuevos miembros
DROP POLICY IF EXISTS "org_members_insert" ON organization_members;
CREATE POLICY "org_members_insert" ON organization_members
  FOR INSERT TO authenticated WITH CHECK (
    (user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = organization_members.organization_id))
    OR EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = organization_members.organization_id AND m.user_id = auth.uid() AND m.role = 'admin')
  );
DROP POLICY IF EXISTS "org_members_delete_admin" ON organization_members;
CREATE POLICY "org_members_delete_admin" ON organization_members
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = organization_members.organization_id AND m.user_id = auth.uid() AND m.role = 'admin')
  );

DROP POLICY IF EXISTS "org_follows_select_own" ON organization_follows;
CREATE POLICY "org_follows_select_own" ON organization_follows
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "org_follows_manage_own" ON organization_follows;
CREATE POLICY "org_follows_manage_own" ON organization_follows
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 6. POLÍTICAS — EMPLEOS
-- ============================================================================
DROP POLICY IF EXISTS "jobs_select" ON jobs;
CREATE POLICY "jobs_select" ON jobs
  FOR SELECT TO authenticated USING (
    status = 'activa'
    OR organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "jobs_manage_members" ON jobs;
CREATE POLICY "jobs_manage_members" ON jobs
  FOR ALL TO authenticated USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "job_requirements_select" ON job_requirements;
CREATE POLICY "job_requirements_select" ON job_requirements
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "job_requirements_manage_members" ON job_requirements;
CREATE POLICY "job_requirements_manage_members" ON job_requirements
  FOR ALL TO authenticated USING (
    job_id IN (SELECT id FROM jobs WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  ) WITH CHECK (
    job_id IN (SELECT id FROM jobs WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "job_responsibilities_select" ON job_responsibilities;
CREATE POLICY "job_responsibilities_select" ON job_responsibilities
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "job_responsibilities_manage_members" ON job_responsibilities;
CREATE POLICY "job_responsibilities_manage_members" ON job_responsibilities
  FOR ALL TO authenticated USING (
    job_id IN (SELECT id FROM jobs WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  ) WITH CHECK (
    job_id IN (SELECT id FROM jobs WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "job_tags_select" ON job_tags;
CREATE POLICY "job_tags_select" ON job_tags
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "job_tags_manage_members" ON job_tags;
CREATE POLICY "job_tags_manage_members" ON job_tags
  FOR ALL TO authenticated USING (
    job_id IN (SELECT id FROM jobs WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  ) WITH CHECK (
    job_id IN (SELECT id FROM jobs WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "applications_select" ON job_applications;
CREATE POLICY "applications_select" ON job_applications
  FOR SELECT TO authenticated USING (
    candidate_id = auth.uid()
    OR job_id IN (SELECT id FROM jobs WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  );
DROP POLICY IF EXISTS "applications_insert_own" ON job_applications;
CREATE POLICY "applications_insert_own" ON job_applications
  FOR INSERT TO authenticated WITH CHECK (candidate_id = auth.uid());
DROP POLICY IF EXISTS "applications_update" ON job_applications;
CREATE POLICY "applications_update" ON job_applications
  FOR UPDATE TO authenticated USING (
    candidate_id = auth.uid()
    OR job_id IN (SELECT id FROM jobs WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  );
DROP POLICY IF EXISTS "applications_delete_own" ON job_applications;
CREATE POLICY "applications_delete_own" ON job_applications
  FOR DELETE TO authenticated USING (candidate_id = auth.uid());

DROP POLICY IF EXISTS "saved_jobs_manage_own" ON saved_jobs;
CREATE POLICY "saved_jobs_manage_own" ON saved_jobs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 7. POLÍTICAS — EVENTOS
-- ============================================================================
DROP POLICY IF EXISTS "events_select_authenticated" ON events;
CREATE POLICY "events_select_authenticated" ON events
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "events_manage_members" ON events;
CREATE POLICY "events_manage_members" ON events
  FOR ALL TO authenticated USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "event_registrations_manage_own" ON event_registrations;
CREATE POLICY "event_registrations_manage_own" ON event_registrations
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_events_manage_own" ON saved_events;
CREATE POLICY "saved_events_manage_own" ON saved_events
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- FIN
-- ============================================================================
