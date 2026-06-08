
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  _user_id uuid,
  _filter_date timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'totalCandidates', (
      SELECT count(*) FROM candidates 
      WHERE user_id = _user_id AND created_at >= _filter_date
    ),
    'activeCandidates', (
      SELECT count(*) FROM candidates 
      WHERE user_id = _user_id AND created_at >= _filter_date AND status = 'Active'
    ),
    'totalJobs', (
      SELECT count(*) FROM jobs 
      WHERE user_id = _user_id AND created_at >= _filter_date
    ),
    'openJobs', (
      SELECT count(*) FROM jobs 
      WHERE user_id = _user_id AND created_at >= _filter_date AND status = 'Offen'
    ),
    'activeClients', (
      SELECT count(*) FROM clients 
      WHERE user_id = _user_id AND created_at >= _filter_date AND status = 'Offen'
    ),
    'totalMatches', (
      SELECT count(*) FROM placements 
      WHERE user_id = _user_id AND created_at >= _filter_date
    ),
    'sharedMatches', (
      SELECT count(*) FROM placements 
      WHERE user_id = _user_id AND stage = 'Shared' AND shared_at >= _filter_date
    ),
    'sentMatches', (
      SELECT count(*) FROM placements 
      WHERE user_id = _user_id AND stage = 'Vorgestellt' AND updated_at >= _filter_date
    ),
    'invitations', (
      SELECT count(*) FROM activity_logs 
      WHERE entity_type = 'placements' 
        AND action = 'UPDATE' 
        AND user_id = _user_id 
        AND created_at >= _filter_date
        AND (
          changes->'stage'->>'new' IN ('Invitation', 'Interview 1', 'Interview 2', 'Trial Day')
        )
    ),
    'totalTasks', (
      SELECT count(*) FROM tasks 
      WHERE user_id = _user_id AND completed = true AND updated_at >= _filter_date
    )
  );
$$;
