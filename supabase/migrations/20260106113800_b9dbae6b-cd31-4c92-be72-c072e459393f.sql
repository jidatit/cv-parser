-- Add awards_publications column to candidates table
ALTER TABLE public.candidates 
ADD COLUMN IF NOT EXISTS awards_publications JSONB DEFAULT '[]'::jsonb;