-- Trigger-Funktion die bei INSERT auf ai_matches prüft ob bereits ein Placement existiert
CREATE OR REPLACE FUNCTION public.check_no_existing_placement()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.placements 
    WHERE candidate_id = NEW.candidate_id 
    AND job_id = NEW.job_id
  ) THEN
    RAISE EXCEPTION 'Cannot create AI match - placement already exists for this candidate-job combination';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger der vor jedem INSERT auf ai_matches prüft
CREATE TRIGGER prevent_ai_match_with_placement
BEFORE INSERT ON public.ai_matches
FOR EACH ROW
EXECUTE FUNCTION public.check_no_existing_placement();

-- Bereinige fehlerhafte AI-Matches die bereits ein Placement haben
DELETE FROM public.ai_matches 
WHERE (candidate_id, job_id) IN (
  SELECT candidate_id, job_id FROM public.placements
);