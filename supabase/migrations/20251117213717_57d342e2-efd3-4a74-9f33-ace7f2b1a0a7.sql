-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Policy: Users can view their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Drop the trigger and function for auto-adding rejection reasons
DROP TRIGGER IF EXISTS on_profile_created_add_rejection_reasons ON profiles;
DROP FUNCTION IF EXISTS public.add_default_rejection_reasons();

-- Drop old RLS policies FIRST before modifying table
DROP POLICY IF EXISTS "Users can create their own rejection reasons" ON public.rejection_reasons;
DROP POLICY IF EXISTS "Users can delete their own rejection reasons" ON public.rejection_reasons;
DROP POLICY IF EXISTS "Users can update their own rejection reasons" ON public.rejection_reasons;
DROP POLICY IF EXISTS "Users can view their own rejection reasons" ON public.rejection_reasons;

-- Remove user_id from rejection_reasons and make it global
ALTER TABLE public.rejection_reasons DROP CONSTRAINT IF EXISTS rejection_reasons_user_id_reason_unique;
ALTER TABLE public.rejection_reasons DROP COLUMN user_id CASCADE;

-- Add unique constraint on reason only (global unique reasons)
ALTER TABLE public.rejection_reasons ADD CONSTRAINT rejection_reasons_reason_unique UNIQUE (reason);

-- Create new RLS policies for global rejection reasons
CREATE POLICY "Everyone can view rejection reasons"
ON public.rejection_reasons
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only admins can insert rejection reasons"
ON public.rejection_reasons
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update rejection reasons"
ON public.rejection_reasons
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete rejection reasons"
ON public.rejection_reasons
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Clean up duplicate rejection reasons and keep only one of each
DELETE FROM public.rejection_reasons a
USING public.rejection_reasons b
WHERE a.id > b.id AND a.reason = b.reason;

-- Insert default global rejection reasons if they don't exist
INSERT INTO public.rejection_reasons (reason)
VALUES 
  ('Gehaltsvorstellungen passen nicht zusammen'),
  ('Fehlende fachliche Qualifikationen'),
  ('Standort nicht passend / zu weite Entfernung'),
  ('Kandidat ist überqualifiziert für die Position'),
  ('Kulturelle Passung nicht gegeben'),
  ('Andere Kandidaten wurden bevorzugt')
ON CONFLICT (reason) DO NOTHING;