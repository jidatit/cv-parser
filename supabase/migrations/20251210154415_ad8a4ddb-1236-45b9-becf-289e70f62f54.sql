-- Remove the public invitation verification policy (now handled by edge function with rate limiting)
DROP POLICY IF EXISTS "Anyone can verify invitation by token" ON public.invitations;