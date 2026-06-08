
-- Phase 1: Create applications table
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  candidate_name text NOT NULL,
  candidate_email text NOT NULL,
  candidate_phone text,
  cv_url text,
  cover_letter text,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  variant_shown text,
  status text NOT NULL DEFAULT 'neu',
  source text DEFAULT 'website',
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_applications_status ON public.applications(status);
CREATE INDEX idx_applications_job_id ON public.applications(job_id);
CREATE INDEX idx_applications_created_at ON public.applications(created_at DESC);

-- Enable RLS
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- RLS: Public INSERT (via Edge Function with service role, but also allow anon for external submissions)
CREATE POLICY "Anyone can insert applications"
  ON public.applications FOR INSERT
  WITH CHECK (true);

-- RLS: Team members can SELECT
CREATE POLICY "Team members can view applications"
  ON public.applications FOR SELECT
  USING (is_team_member(auth.uid()));

-- RLS: Team members can UPDATE
CREATE POLICY "Team members can update applications"
  ON public.applications FOR UPDATE
  USING (is_team_member(auth.uid()));

-- RLS: Only admins can DELETE
CREATE POLICY "Admins can delete applications"
  ON public.applications FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Storage bucket for application documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('application-documents', 'application-documents', false);

-- Storage RLS: Team members can read
CREATE POLICY "Team members can read application documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'application-documents' AND is_team_member(auth.uid()));

-- Storage RLS: Anyone can upload (via edge function)
CREATE POLICY "Anyone can upload application documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'application-documents');
