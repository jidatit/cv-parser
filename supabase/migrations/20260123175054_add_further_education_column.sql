-- Run this in Supabase SQL Editor

ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS further_education jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN candidates.further_education IS 'Further education/training courses from WEITERBILDUNG section';