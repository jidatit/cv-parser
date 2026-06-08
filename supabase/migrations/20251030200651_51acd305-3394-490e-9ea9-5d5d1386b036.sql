-- Create storage bucket for candidate documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidate-documents',
  'candidate-documents',
  false,
  20971520,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
);

-- RLS Policy: Users can view documents for candidates they have access to
CREATE POLICY "Users can view candidate documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'candidate-documents' AND
  auth.uid() IS NOT NULL
);

-- RLS Policy: Users can upload documents for candidates
CREATE POLICY "Users can upload candidate documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'candidate-documents' AND
  auth.uid() IS NOT NULL
);

-- RLS Policy: Users can delete their own uploaded documents
CREATE POLICY "Users can delete candidate documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'candidate-documents' AND
  auth.uid() IS NOT NULL
);