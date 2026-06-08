-- Add priority field to candidates table
ALTER TABLE public.candidates 
ADD COLUMN priority text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.candidates.priority IS 'Priority level for recruiting: high, medium, low';