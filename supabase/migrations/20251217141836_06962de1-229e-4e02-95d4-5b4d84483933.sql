-- Create helper function to check manager or admin role
CREATE OR REPLACE FUNCTION public.has_manager_or_admin_role(_user_id uuid)
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
      AND role IN ('admin', 'manager')
  )
$$;

-- Update candidates RLS: Managers can also view all candidates
DROP POLICY IF EXISTS "Users can view their own candidates" ON public.candidates;
CREATE POLICY "Users can view candidates"
ON public.candidates
FOR SELECT
USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'manager')
);

-- Managers can update candidates  
DROP POLICY IF EXISTS "Authenticated users can update candidates" ON public.candidates;
CREATE POLICY "Users can update candidates"
ON public.candidates
FOR UPDATE
USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'manager')
);

-- Managers can view all user_roles (for team overview)
CREATE POLICY "Managers can view all user_roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'manager'));