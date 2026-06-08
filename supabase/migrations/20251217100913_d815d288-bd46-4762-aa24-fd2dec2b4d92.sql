-- Funktion um zu prüfen ob Nutzer ein Teammitglied ist (hat irgendeine Rolle)
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
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
  )
$$;

-- Alte Policy löschen
DROP POLICY IF EXISTS "Authenticated users can view all clients" ON public.clients;

-- Neue Policy: Nur Teammitglieder können alle Clients sehen
CREATE POLICY "Team members can view all clients" 
ON public.clients 
FOR SELECT 
USING (public.is_team_member(auth.uid()));