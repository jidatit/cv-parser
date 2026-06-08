
-- =============================================
-- Publikationsmanager: Neue Spalten auf jobs
-- =============================================
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS public_title text,
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS publication_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymization_level text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS seo_meta_title text,
  ADD COLUMN IF NOT EXISTS seo_meta_description text,
  ADD COLUMN IF NOT EXISTS seo_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS public_title_variant_b text,
  ADD COLUMN IF NOT EXISTS active_title_variant text NOT NULL DEFAULT 'a',
  ADD COLUMN IF NOT EXISTS publication_language text NOT NULL DEFAULT 'de',
  ADD COLUMN IF NOT EXISTS public_id text UNIQUE DEFAULT gen_random_uuid()::text;

-- =============================================
-- Neue Tabelle: publication_rules
-- =============================================
CREATE TABLE public.publication_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.publication_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view publication rules"
  ON public.publication_rules FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team members can insert publication rules"
  ON public.publication_rules FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team members can update publication rules"
  ON public.publication_rules FOR UPDATE
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team members can delete publication rules"
  ON public.publication_rules FOR DELETE
  USING (is_team_member(auth.uid()));

CREATE TRIGGER update_publication_rules_updated_at
  BEFORE UPDATE ON public.publication_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Neue Tabelle: publication_blacklist
-- =============================================
CREATE TABLE public.publication_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.publication_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view publication blacklist"
  ON public.publication_blacklist FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team members can insert publication blacklist"
  ON public.publication_blacklist FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team members can delete publication blacklist"
  ON public.publication_blacklist FOR DELETE
  USING (is_team_member(auth.uid()));

-- =============================================
-- Neue Tabelle: publication_analytics
-- =============================================
CREATE TABLE public.publication_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  clicks integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  variant text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, date, variant)
);

ALTER TABLE public.publication_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view publication analytics"
  ON public.publication_analytics FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Anyone can insert publication analytics"
  ON public.publication_analytics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update publication analytics"
  ON public.publication_analytics FOR UPDATE
  USING (true);

-- =============================================
-- Neue Tabelle: publication_audit_log
-- =============================================
CREATE TABLE public.publication_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.publication_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view publication audit log"
  ON public.publication_audit_log FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team members can insert publication audit log"
  ON public.publication_audit_log FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));
