-- Add responsibilities column to jobs table for tasks/duties
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS responsibilities text;