-- Add recruiting_status column to candidates table
ALTER TABLE public.candidates 
ADD COLUMN recruiting_status TEXT DEFAULT NULL;

-- Add comment to describe the field
COMMENT ON COLUMN public.candidates.recruiting_status IS 'Status in der Recruiting-Pipeline: Austausch ausstehend, Unterlagen offen, Unterlagen geschickt, Ready2Push, Ready2Send';