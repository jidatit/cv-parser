-- Add unique constraint to prevent duplicate rejection reasons per user
ALTER TABLE rejection_reasons 
ADD CONSTRAINT rejection_reasons_user_id_reason_unique UNIQUE (user_id, reason);

-- Insert default rejection reasons for all existing users
INSERT INTO rejection_reasons (user_id, reason)
SELECT p.id, reason
FROM profiles p
CROSS JOIN (
  VALUES 
    ('Gehaltsvorstellungen passen nicht zusammen'),
    ('Fehlende fachliche Qualifikationen'),
    ('Standort nicht passend / zu weite Entfernung'),
    ('Kandidat ist überqualifiziert für die Position'),
    ('Kulturelle Passung nicht gegeben'),
    ('Andere Kandidaten wurden bevorzugt')
) AS default_reasons(reason)
ON CONFLICT (user_id, reason) DO NOTHING;

-- Create function to add default rejection reasons for new users
CREATE OR REPLACE FUNCTION public.add_default_rejection_reasons()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO rejection_reasons (user_id, reason) VALUES
    (NEW.id, 'Gehaltsvorstellungen passen nicht zusammen'),
    (NEW.id, 'Fehlende fachliche Qualifikationen'),
    (NEW.id, 'Standort nicht passend / zu weite Entfernung'),
    (NEW.id, 'Kandidat ist überqualifiziert für die Position'),
    (NEW.id, 'Kulturelle Passung nicht gegeben'),
    (NEW.id, 'Andere Kandidaten wurden bevorzugt')
  ON CONFLICT (user_id, reason) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically add default rejection reasons when a new profile is created
DROP TRIGGER IF EXISTS on_profile_created_add_rejection_reasons ON profiles;
CREATE TRIGGER on_profile_created_add_rejection_reasons
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION add_default_rejection_reasons();