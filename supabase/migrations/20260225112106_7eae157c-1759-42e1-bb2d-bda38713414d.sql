-- One-time data migration: Set Active jobs at "Offen" clients to "Offen"
DO $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE jobs SET status = 'Offen' 
  WHERE client_id IN (SELECT id FROM clients WHERE status = 'Offen') 
  AND status = 'Active';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Updated % jobs from Active to Offen', affected_count;
END $$;