-- Add DELETE policy for languages table
CREATE POLICY "Authenticated users can delete languages" 
ON public.languages 
FOR DELETE 
USING (auth.uid() IS NOT NULL);