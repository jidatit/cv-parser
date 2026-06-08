-- Make company-logos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'company-logos';

-- Drop the old public access policy
DROP POLICY IF EXISTS "Company logos are publicly accessible" ON storage.objects;

-- Create new policy: only authenticated users can view company logos
CREATE POLICY "Authenticated users can view company logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');