
-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create trigger on candidates table for embedding generation
CREATE TRIGGER trigger_candidate_embedding
  AFTER INSERT OR UPDATE OF position, desired_position, industry, skills, summary, work_experience
  ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_embedding();

-- Create trigger on jobs table for embedding generation
CREATE TRIGGER trigger_job_embedding
  AFTER INSERT OR UPDATE OF title, description, requirements, responsibilities, skills
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_embedding();
