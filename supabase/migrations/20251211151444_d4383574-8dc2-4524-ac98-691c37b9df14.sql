-- Create storage policies for profile-avatars bucket to allow authenticated users to upload

-- Allow authenticated users to upload files to the candidates folder
CREATE POLICY "Authenticated users can upload candidate avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = 'candidates');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update candidate avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = 'candidates');

-- Allow authenticated users to delete avatars
CREATE POLICY "Authenticated users can delete candidate avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = 'candidates');

-- Allow public read access (bucket is already public)
CREATE POLICY "Public can view candidate avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-avatars');