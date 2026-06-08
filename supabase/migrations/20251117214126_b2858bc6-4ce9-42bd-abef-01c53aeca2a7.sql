-- Drop the old check constraint
ALTER TABLE placements DROP CONSTRAINT IF EXISTS placements_stage_check;

-- Add new check constraint that includes "Abgelehnt"
ALTER TABLE placements ADD CONSTRAINT placements_stage_check 
CHECK (stage IN (
  'Vorgestellt',
  'Shared', 
  'Inquiry',
  'Invitation',
  'Interview 1',
  'Interview 2',
  'Trial Day',
  'Offered',
  'Placed',
  'Abgelehnt',
  'Ready2Send',
  'Ready2Share'
));