-- Add Ready2Send to placements stage constraint
ALTER TABLE public.placements DROP CONSTRAINT IF EXISTS placements_stage_check;

ALTER TABLE public.placements ADD CONSTRAINT placements_stage_check CHECK (stage IN (
  'Ready2Send',
  'Vorgestellt',
  'Shared',
  'Inquiry',
  'Invitation',
  'Interview 1',
  'Interview 2',
  'Trial Day',
  'Offered',
  'Placed'
));