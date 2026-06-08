-- Add notice_period column to candidates table
ALTER TABLE public.candidates 
ADD COLUMN notice_period text;