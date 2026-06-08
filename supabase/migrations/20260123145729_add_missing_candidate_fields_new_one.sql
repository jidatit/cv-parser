-- Migration: Add missing fields to candidates table

-- Add missing columns to candidates table
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS signature_achievements TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS growth_potential TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_summary TEXT,
ADD COLUMN IF NOT EXISTS notice_period TEXT,
ADD COLUMN IF NOT EXISTS most_proud_of TEXT,
ADD COLUMN IF NOT EXISTS potential_risks TEXT,
ADD COLUMN IF NOT EXISTS insights_notes TEXT,
ADD COLUMN IF NOT EXISTS candidate_values TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS awards_publications JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS driving_license TEXT;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_candidates_assigned_to ON public.candidates(assigned_to);
CREATE INDEX IF NOT EXISTS idx_candidates_linkedin_url ON public.candidates(linkedin_url);