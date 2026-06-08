-- Create storage bucket for job documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-documents', 'job-documents', true);

-- Allow team members to upload files
CREATE POLICY "Team members can upload job documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'job-documents' 
  AND is_team_member(auth.uid())
);

-- Allow team members to view/download files
CREATE POLICY "Team members can view job documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'job-documents' 
  AND is_team_member(auth.uid())
);

-- Allow team members to delete their uploaded files
CREATE POLICY "Team members can delete job documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'job-documents' 
  AND is_team_member(auth.uid())
);