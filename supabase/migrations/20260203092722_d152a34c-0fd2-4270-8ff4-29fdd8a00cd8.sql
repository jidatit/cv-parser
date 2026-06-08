-- Add last_pushed_at column to candidates table
ALTER TABLE public.candidates 
ADD COLUMN last_pushed_at TIMESTAMP WITH TIME ZONE;