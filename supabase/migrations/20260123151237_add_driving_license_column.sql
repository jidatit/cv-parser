-- Add the 'driving_license' column to the 'candidates' table
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS driving_license TEXT;

-- Optionally, you can add an index if necessary, although it may not be needed for this column
-- CREATE INDEX IF NOT EXISTS idx_candidates_driving_license ON public.candidates(driving_license);

-- Verify that the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'candidates'
ORDER BY ordinal_position;
