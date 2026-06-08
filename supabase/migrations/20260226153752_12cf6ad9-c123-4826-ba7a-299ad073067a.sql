
-- Add status and imported_job_ids to market_radar_scans
ALTER TABLE public.market_radar_scans 
  ADD COLUMN status text NOT NULL DEFAULT 'completed',
  ADD COLUMN imported_job_ids jsonb DEFAULT '[]'::jsonb;

-- Allow UPDATE on market_radar_scans for service role (edge function uses service_role_key)
-- Also allow team members to update for polling
CREATE POLICY "Team members can update radar scans"
  ON public.market_radar_scans
  FOR UPDATE
  USING (is_team_member(auth.uid()));
