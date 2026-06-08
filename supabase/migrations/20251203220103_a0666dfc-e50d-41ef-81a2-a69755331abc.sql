-- Add assigned_to column to candidates table
ALTER TABLE public.candidates 
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);

-- Add assigned_to column to jobs table
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_candidates_assigned_to ON public.candidates(assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON public.jobs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON public.candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_placements_user_id ON public.placements(user_id);