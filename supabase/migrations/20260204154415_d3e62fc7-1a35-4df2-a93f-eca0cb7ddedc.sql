-- Create a table to track AI matching processing jobs
CREATE TABLE public.ai_matching_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  progress INTEGER NOT NULL DEFAULT 0,
  total_candidates INTEGER,
  processed_candidates INTEGER DEFAULT 0,
  new_matches INTEGER DEFAULT 0,
  total_matches INTEGER,
  error TEXT,
  message TEXT,
  stats JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_matching_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies - users can only see their own jobs
CREATE POLICY "Users can view their own matching jobs"
ON public.ai_matching_jobs
FOR SELECT
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Users can create their own matching jobs"
ON public.ai_matching_jobs
FOR INSERT
WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Users can update their own matching jobs"
ON public.ai_matching_jobs
FOR UPDATE
USING (public.is_team_member(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_ai_matching_jobs_updated_at
BEFORE UPDATE ON public.ai_matching_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();