-- Update all jobs with responsibilities or requirements to Active status
UPDATE jobs 
SET status = 'Active'
WHERE (responsibilities IS NOT NULL AND responsibilities != '') 
   OR (requirements IS NOT NULL AND requirements != '')