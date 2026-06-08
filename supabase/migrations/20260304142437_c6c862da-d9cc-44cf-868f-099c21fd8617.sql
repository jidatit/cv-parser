
CREATE TABLE public.external_search_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress_message TEXT,
  results JSONB DEFAULT '[]'::jsonb,
  search_params JSONB DEFAULT '{}'::jsonb,
  stats JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.external_search_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view external search jobs"
  ON public.external_search_jobs FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team members can insert external search jobs"
  ON public.external_search_jobs FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team members can update external search jobs"
  ON public.external_search_jobs FOR UPDATE
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team members can delete external search jobs"
  ON public.external_search_jobs FOR DELETE
  USING (is_team_member(auth.uid()));

CREATE INDEX idx_external_search_jobs_candidate ON public.external_search_jobs(candidate_id);
CREATE INDEX idx_external_search_jobs_status ON public.external_search_jobs(status);
