-- Add DELETE policy for skills table
CREATE POLICY "Authenticated users can delete skills"
ON public.skills
FOR DELETE
USING (auth.uid() IS NOT NULL);