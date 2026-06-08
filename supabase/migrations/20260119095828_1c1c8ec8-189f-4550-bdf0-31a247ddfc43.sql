-- Add sub-scores columns to placements table for AI analysis caching
ALTER TABLE public.placements ADD COLUMN IF NOT EXISTS skills_score integer;
ALTER TABLE public.placements ADD COLUMN IF NOT EXISTS experience_score integer;
ALTER TABLE public.placements ADD COLUMN IF NOT EXISTS salary_score integer;