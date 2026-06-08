CREATE OR REPLACE FUNCTION public.sync_job_status_on_client_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('Offen', 'Partner') 
     AND (OLD.status IS NULL OR OLD.status NOT IN ('Offen', 'Partner')) THEN
    UPDATE jobs SET status = 'Offen' 
    WHERE client_id = NEW.id AND status IN ('Active', 'External');
  END IF;
  
  IF OLD.status IN ('Offen', 'Partner') 
     AND NEW.status NOT IN ('Offen', 'Partner') THEN
    UPDATE jobs SET status = 'Active' 
    WHERE client_id = NEW.id AND status = 'Offen';
  END IF;
  
  RETURN NEW;
END;
$$;