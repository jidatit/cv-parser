-- Add 'driving_license' column to the 'candidates' table
ALTER TABLE public.candidates
ADD COLUMN driving_license TEXT;

-- Optionally, you can add an index if necessary, although it may not be needed for this column
CREATE INDEX idx_candidates_driving_license ON public.candidates(driving_license);