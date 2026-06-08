
-- Make interview-prep bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'interview-prep';

-- Drop old public SELECT policy
DROP POLICY IF EXISTS "Anyone can view interview prep files" ON storage.objects;

-- Create authenticated SELECT policy
CREATE POLICY "Team members can view interview prep files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'interview-prep' AND public.is_team_member(auth.uid()));
