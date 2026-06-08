-- Add benefits column to jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS benefits TEXT;