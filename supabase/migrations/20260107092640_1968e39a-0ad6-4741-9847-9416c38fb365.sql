-- Fix overly permissive INSERT policy on languages table
DROP POLICY IF EXISTS "Authenticated users can insert languages" ON public.languages;

CREATE POLICY "Authenticated users can insert languages" 
ON public.languages 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);