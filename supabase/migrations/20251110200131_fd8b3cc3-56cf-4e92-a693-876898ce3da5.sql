-- Create placements table to track candidate-job matches through the pipeline
CREATE TABLE public.placements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'Vorgestellt',
  notes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT placements_stage_check CHECK (stage IN (
    'Vorgestellt',
    'Shared',
    'Inquiry',
    'Invitation',
    'Interview 1',
    'Interview 2',
    'Trial Day',
    'Offered',
    'Placed'
  ))
);

-- Enable RLS
ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view all placements"
ON public.placements
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert placements"
ON public.placements
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update placements"
ON public.placements
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete placements"
ON public.placements
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_placements_updated_at
BEFORE UPDATE ON public.placements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();