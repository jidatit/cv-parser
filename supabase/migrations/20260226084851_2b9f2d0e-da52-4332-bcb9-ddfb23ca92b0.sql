DROP POLICY "Authenticated users can update jobs" ON public.jobs;

CREATE POLICY "Team members can update jobs"
  ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (is_team_member(auth.uid()));