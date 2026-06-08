CREATE OR REPLACE FUNCTION sync_job_status_on_client_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'Offen' AND (OLD.status IS NULL OR OLD.status != 'Offen') THEN
    UPDATE jobs SET status = 'Offen' 
    WHERE client_id = NEW.id AND status = 'Active';
  END IF;
  
  IF OLD.status = 'Offen' AND NEW.status != 'Offen' THEN
    UPDATE jobs SET status = 'Active' 
    WHERE client_id = NEW.id AND status = 'Offen';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;