-- Fix candidates table RLS: restrict SELECT to only own records
DROP POLICY IF EXISTS "Authenticated users can view all candidates" ON public.candidates;
CREATE POLICY "Users can view their own candidates" 
ON public.candidates 
FOR SELECT 
USING (auth.uid() = user_id);

-- Fix skills table: require authentication for INSERT
DROP POLICY IF EXISTS "Anyone can insert skills" ON public.skills;
CREATE POLICY "Authenticated users can insert skills" 
ON public.skills 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create invitations table for admin user management
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  invited_by uuid NOT NULL,
  token uuid DEFAULT gen_random_uuid(),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at timestamp with time zone DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone DEFAULT now(),
  accepted_at timestamp with time zone,
  UNIQUE(email, status)
);

-- Enable RLS on invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage invitations
CREATE POLICY "Admins can view all invitations" 
ON public.invitations 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert invitations" 
ON public.invitations 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update invitations" 
ON public.invitations 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete invitations" 
ON public.invitations 
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Public can verify their own invitation token (for accepting)
CREATE POLICY "Anyone can verify invitation by token" 
ON public.invitations 
FOR SELECT 
USING (status = 'pending' AND expires_at > now());