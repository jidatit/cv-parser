-- Add from_ai_match column to track placements created by accepting AI matches
ALTER TABLE placements ADD COLUMN from_ai_match BOOLEAN DEFAULT false;