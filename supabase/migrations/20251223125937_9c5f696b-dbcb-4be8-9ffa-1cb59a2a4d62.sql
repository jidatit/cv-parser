-- Make the company-logos bucket public so logos can be displayed
UPDATE storage.buckets 
SET public = true 
WHERE id = 'company-logos';