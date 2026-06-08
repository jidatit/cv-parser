
-- Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function that calls generate-embedding via pg_net (async, non-blocking)
-- Uses anon key since verify_jwt = false is configured for generate-embedding
CREATE OR REPLACE FUNCTION public.trigger_generate_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://bwjnfbpczevbhhjmsosq.supabase.co/functions/v1/generate-embedding',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3am5mYnBjemV2Ymhoam1zb3NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNTk0NTMsImV4cCI6MjA4MTgzNTQ1M30.D1QtwVfBzdVeWb1E2kCWI3Hf8_pbNmmweg4UOgW-q1c"}'::jsonb,
    body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'id', NEW.id::text
    )
  );
  RETURN NEW;
END;
$$;

-- Column-level trigger on candidates (only fires on relevant content changes)
CREATE TRIGGER on_candidate_change_generate_embedding
  AFTER INSERT OR UPDATE OF position, desired_position, industry, skills, summary, work_experience
  ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_embedding();

-- Column-level trigger on jobs (only fires on relevant content changes)
CREATE TRIGGER on_job_change_generate_embedding
  AFTER INSERT OR UPDATE OF title, description, requirements, responsibilities, skills
  ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_embedding();
