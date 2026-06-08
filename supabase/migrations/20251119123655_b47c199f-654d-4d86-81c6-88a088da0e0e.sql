-- Remove last_contact column from candidates table
ALTER TABLE candidates DROP COLUMN IF EXISTS last_contact;