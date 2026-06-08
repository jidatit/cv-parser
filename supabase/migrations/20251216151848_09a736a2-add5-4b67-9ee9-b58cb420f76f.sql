-- Add new columns for comprehensive match analysis
ALTER TABLE public.placements 
ADD COLUMN IF NOT EXISTS match_risks jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS match_summary text DEFAULT NULL;