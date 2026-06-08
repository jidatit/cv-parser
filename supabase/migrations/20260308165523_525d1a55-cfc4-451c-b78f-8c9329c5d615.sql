
-- Create user_type enum
CREATE TYPE public.user_type AS ENUM ('internal', 'candidate');

-- Add user_type column to profiles with default 'internal'
ALTER TABLE public.profiles 
  ADD COLUMN user_type public.user_type NOT NULL DEFAULT 'internal';

-- Update handle_new_user trigger to read user_type from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, user_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'user_type')::user_type, 'internal')
  );
  RETURN NEW;
END;
$$;
