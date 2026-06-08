-- Erhöhe das Dateigrößen-Limit für den candidate-documents Bucket auf 50 MB
UPDATE storage.buckets 
SET file_size_limit = 52428800  -- 50 MB in Bytes
WHERE id = 'candidate-documents';