
CREATE OR REPLACE FUNCTION public.sync_job_status_on_client_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- When client becomes Offen or Partner, set their Active/External jobs to Offen
  IF NEW.status IN ('Offen', 'Partner') 
     AND (OLD.status IS NULL OR OLD.status NOT IN ('Offen', 'Partner')) THEN
    UPDATE jobs SET status = 'Offen' 
    WHERE client_id = NEW.id AND status IN ('Active', 'External');
  END IF;
  
  -- When client becomes Nicht offen, set their Offen/Active jobs to Nicht offen
  IF NEW.status = 'Nicht offen' 
     AND (OLD.status IS NULL OR OLD.status != 'Nicht offen') THEN
    UPDATE jobs SET status = 'Nicht offen' 
    WHERE client_id = NEW.id AND status IN ('Offen', 'Active');
  END IF;
  
  -- When client leaves Offen/Partner for something other than Nicht offen, revert Offen jobs to Active
  IF OLD.status IN ('Offen', 'Partner') 
     AND NEW.status NOT IN ('Offen', 'Partner', 'Nicht offen') THEN
    UPDATE jobs SET status = 'Active' 
    WHERE client_id = NEW.id AND status = 'Offen';
  END IF;
  
  RETURN NEW;
END;
$function$;
