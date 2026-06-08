CREATE OR REPLACE FUNCTION sync_job_status_on_client_change()
RETURNS trigger AS $$
BEGIN
  -- Wenn Client auf "Offen" gesetzt wird: alle Active-Jobs -> Offen
  IF NEW.status = 'Offen' AND (OLD.status IS NULL OR OLD.status != 'Offen') THEN
    UPDATE jobs SET status = 'Offen' 
    WHERE client_id = NEW.id AND status = 'Active';
  END IF;
  
  -- Wenn Client nicht mehr "Offen": Offen-Jobs -> Active
  IF OLD.status = 'Offen' AND NEW.status != 'Offen' THEN
    UPDATE jobs SET status = 'Active' 
    WHERE client_id = NEW.id AND status = 'Offen';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_client_status_change
  AFTER UPDATE OF status ON clients
  FOR EACH ROW
  EXECUTE FUNCTION sync_job_status_on_client_change();