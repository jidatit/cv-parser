-- Add source_url column to jobs table for storing the original job posting link
ALTER TABLE public.jobs ADD COLUMN source_url TEXT;