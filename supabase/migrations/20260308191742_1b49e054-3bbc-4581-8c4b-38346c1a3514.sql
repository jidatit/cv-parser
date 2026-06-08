-- Fix existing candidate users from viewer to candidate role
UPDATE user_roles SET role = 'candidate' WHERE user_id IN (SELECT id FROM profiles WHERE user_type = 'candidate') AND role = 'viewer';

-- Update handle_new_user trigger to auto-assign candidate role
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, user_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'user_type')::user_type, 'internal')
  );

  -- Auto-assign candidate role for candidate users
  IF COALESCE((NEW.raw_user_meta_data->>'user_type')::user_type, 'internal') = 'candidate' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'candidate')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;