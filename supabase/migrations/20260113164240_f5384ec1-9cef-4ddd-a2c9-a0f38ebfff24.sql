-- Add shared_at column to track when a placement entered the "Shared" stage
ALTER TABLE public.placements 
ADD COLUMN shared_at TIMESTAMP WITH TIME ZONE NULL;

-- Create a trigger function to automatically set shared_at when stage changes to "Shared"
CREATE OR REPLACE FUNCTION public.set_shared_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If stage is changing to 'Shared' and it wasn't 'Shared' before (or is new)
  IF NEW.stage = 'Shared' AND (OLD IS NULL OR OLD.stage != 'Shared') THEN
    NEW.shared_at = NOW();
  END IF;
  -- If stage is changing away from 'Shared', optionally clear the date (or keep it for history)
  -- We'll keep it for history purposes
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER trigger_set_shared_at
BEFORE INSERT OR UPDATE OF stage ON public.placements
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_at();

-- Backfill existing "Shared" placements with their updated_at as shared_at
UPDATE public.placements 
SET shared_at = updated_at 
WHERE stage = 'Shared' AND shared_at IS NULL;