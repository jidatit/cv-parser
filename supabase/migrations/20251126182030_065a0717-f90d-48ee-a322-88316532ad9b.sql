-- Create table for AI-generated matches between candidates and jobs
CREATE TABLE public.ai_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
  match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, job_id)
);

-- Enable Row Level Security
ALTER TABLE public.ai_matches ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view all ai_matches"
ON public.ai_matches
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert ai_matches"
ON public.ai_matches
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update ai_matches"
ON public.ai_matches
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete ai_matches"
ON public.ai_matches
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ai_matches_updated_at
BEFORE UPDATE ON public.ai_matches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();