-- Migration: Add missing fields to candidates table
-- Created: 2026-01-23

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

-- Add index for assigned_to for faster queries
CREATE INDEX IF NOT EXISTS idx_candidates_assigned_to ON public.candidates(assigned_to);

-- Add index for linkedin_url for faster lookups
CREATE INDEX IF NOT EXISTS idx_candidates_linkedin_url ON public.candidates(linkedin_url);

-- Add comment to document the migration
COMMENT ON COLUMN public.candidates.assigned_to IS 'User ID of the recruiter assigned to this candidate';
COMMENT ON COLUMN public.candidates.signature_achievements IS 'Array of key achievements of the candidate';
COMMENT ON COLUMN public.candidates.growth_potential IS 'Array of growth potential indicators';
COMMENT ON COLUMN public.candidates.ai_summary IS 'AI-generated summary of candidate profile';
COMMENT ON COLUMN public.candidates.notice_period IS 'Notice period required by candidate';
COMMENT ON COLUMN public.candidates.most_proud_of IS 'What the candidate is most proud of';
COMMENT ON COLUMN public.candidates.potential_risks IS 'Potential risks or concerns about the candidate';
COMMENT ON COLUMN public.candidates.insights_notes IS 'Additional insights and notes about the candidate';
COMMENT ON COLUMN public.candidates.candidate_values IS 'Array of candidate values and priorities';
COMMENT ON COLUMN public.candidates.awards_publications IS 'JSON object containing awards and publications';
COMMENT ON COLUMN public.candidates.linkedin_url IS 'LinkedIn profile URL of the candidate';
COMMENT ON COLUMN public.candidates.driving_license IS 'Driving license information (e.g., Yes (B), No, Class C)';