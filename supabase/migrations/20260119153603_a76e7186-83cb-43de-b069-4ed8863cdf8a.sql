-- Add column for candidate core values
ALTER TABLE public.candidates 
ADD COLUMN candidate_values TEXT[] DEFAULT NULL;