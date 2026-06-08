
DROP POLICY IF EXISTS "Authenticated users can view all jobs" ON public.jobs;

CREATE POLICY "Team members can view all jobs"
ON public.jobs
FOR SELECT
USING (is_team_member(auth.uid()));
