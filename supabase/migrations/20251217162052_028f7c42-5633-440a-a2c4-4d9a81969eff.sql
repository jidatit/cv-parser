-- Create activity_logs table
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies - team members can view all logs
CREATE POLICY "Team members can view all activity logs"
ON public.activity_logs
FOR SELECT
USING (is_team_member(auth.uid()));

-- Only system/triggers can insert (via security definer functions)
CREATE POLICY "System can insert activity logs"
ON public.activity_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Function to log activity
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT;
  v_changes JSONB;
BEGIN
  -- Get the current user
  v_user_id := auth.uid();
  
  -- If no user (system operation), skip logging
  IF v_user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  
  -- Determine action
  v_action := TG_OP;
  
  -- Calculate changes for UPDATE
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', old_val, 'new', new_val))
    INTO v_changes
    FROM (
      SELECT 
        COALESCE(o.key, n.key) as key,
        o.value as old_val,
        n.value as new_val
      FROM jsonb_each(to_jsonb(OLD)) o
      FULL OUTER JOIN jsonb_each(to_jsonb(NEW)) n ON o.key = n.key
      WHERE o.value IS DISTINCT FROM n.value
        AND COALESCE(o.key, n.key) NOT IN ('updated_at', 'created_at')
    ) diff;
  END IF;
  
  -- Insert activity log
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs (user_id, entity_type, entity_id, action, new_data)
    VALUES (v_user_id, TG_TABLE_NAME, NEW.id, v_action, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log if there are actual changes
    IF v_changes IS NOT NULL AND v_changes != '{}'::jsonb THEN
      INSERT INTO public.activity_logs (user_id, entity_type, entity_id, action, old_data, new_data, changes)
      VALUES (v_user_id, TG_TABLE_NAME, NEW.id, v_action, to_jsonb(OLD), to_jsonb(NEW), v_changes);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_logs (user_id, entity_type, entity_id, action, old_data)
    VALUES (v_user_id, TG_TABLE_NAME, OLD.id, v_action, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create triggers for candidates
CREATE TRIGGER log_candidates_activity
AFTER INSERT OR UPDATE OR DELETE ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Create triggers for jobs
CREATE TRIGGER log_jobs_activity
AFTER INSERT OR UPDATE OR DELETE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Create triggers for clients
CREATE TRIGGER log_clients_activity
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Create triggers for placements
CREATE TRIGGER log_placements_activity
AFTER INSERT OR UPDATE OR DELETE ON public.placements
FOR EACH ROW EXECUTE FUNCTION public.log_activity();