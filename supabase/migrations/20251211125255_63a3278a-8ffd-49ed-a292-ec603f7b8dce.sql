-- Add columns to store AI match analysis results
ALTER TABLE public.placements
ADD COLUMN IF NOT EXISTS match_score INTEGER,
ADD COLUMN IF NOT EXISTS match_reasons JSONB,
ADD COLUMN IF NOT EXISTS match_strengths JSONB,
ADD COLUMN IF NOT EXISTS match_gaps JSONB,
ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMP WITH TIME ZONE;