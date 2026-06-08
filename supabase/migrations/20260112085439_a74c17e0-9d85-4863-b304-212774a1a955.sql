-- Add linkedin_url and source_contact columns to candidates table
ALTER TABLE public.candidates 
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS source_contact TEXT;