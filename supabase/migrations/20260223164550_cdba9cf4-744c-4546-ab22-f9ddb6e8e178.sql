
-- Phase 1a: Extend jobs table with A/B testing columns
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS public_title_a text,
  ADD COLUMN IF NOT EXISTS public_summary_a text,
  ADD COLUMN IF NOT EXISTS framework_a text,
  ADD COLUMN IF NOT EXISTS public_title_b text,
  ADD COLUMN IF NOT EXISTS public_summary_b text,
  ADD COLUMN IF NOT EXISTS framework_b text,
  ADD COLUMN IF NOT EXISTS active_variant text NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS auto_optimize boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS winner_variant text,
  ADD COLUMN IF NOT EXISTS seo_slug text,
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS public_description_b text,
  ADD COLUMN IF NOT EXISTS public_responsibilities_b text,
  ADD COLUMN IF NOT EXISTS public_requirements_b text,
  ADD COLUMN IF NOT EXISTS public_benefits_b text;

-- Create unique index on seo_slug (allowing nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_seo_slug ON public.jobs (seo_slug) WHERE seo_slug IS NOT NULL;

-- Phase 1c: Data migration - populate new fields from existing data
UPDATE public.jobs SET public_title_a = public_title WHERE public_title IS NOT NULL AND public_title_a IS NULL;
UPDATE public.jobs SET public_title_b = public_title_variant_b WHERE public_title_variant_b IS NOT NULL AND public_title_b IS NULL;
UPDATE public.jobs SET active_variant = UPPER(active_title_variant) WHERE active_title_variant IS NOT NULL;

-- Phase 1b: Create job_analytics table
CREATE TABLE IF NOT EXISTS public.job_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  variant_shown text NOT NULL,
  event_type text NOT NULL,
  device_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_analytics ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can insert (for public tracking via edge function with service role)
CREATE POLICY "Anyone can insert job analytics"
  ON public.job_analytics FOR INSERT
  WITH CHECK (true);

-- RLS: Only team members can read
CREATE POLICY "Team members can view job analytics"
  ON public.job_analytics FOR SELECT
  USING (public.is_team_member(auth.uid()));

-- No UPDATE or DELETE allowed

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_job_analytics_job_id ON public.job_analytics (job_id);
CREATE INDEX IF NOT EXISTS idx_job_analytics_created_at ON public.job_analytics (created_at);
