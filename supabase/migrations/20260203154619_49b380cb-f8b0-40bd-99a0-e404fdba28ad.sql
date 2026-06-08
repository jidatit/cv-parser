-- Update the default value for jobs.status from 'Open' to 'Active'
ALTER TABLE public.jobs ALTER COLUMN status SET DEFAULT 'Active'::text;