-- Update DELETE policy for candidates to allow admins
DROP POLICY IF EXISTS "Authenticated users can delete candidates" ON public.candidates;
CREATE POLICY "Authenticated users can delete candidates" 
ON public.candidates 
FOR DELETE 
USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- Update DELETE policy for jobs to allow admins
DROP POLICY IF EXISTS "Authenticated users can delete jobs" ON public.jobs;
CREATE POLICY "Authenticated users can delete jobs" 
ON public.jobs 
FOR DELETE 
USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- Update DELETE policy for clients to allow admins
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON public.clients;
CREATE POLICY "Authenticated users can delete clients" 
ON public.clients 
FOR DELETE 
USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));