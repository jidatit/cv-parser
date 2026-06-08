CREATE TABLE public.dismissed_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, candidate_id)
);

ALTER TABLE public.dismissed_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view dismissed suggestions"
  ON public.dismissed_suggestions FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team members can insert dismissed suggestions"
  ON public.dismissed_suggestions FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team members can delete dismissed suggestions"
  ON public.dismissed_suggestions FOR DELETE
  USING (is_team_member(auth.uid()));