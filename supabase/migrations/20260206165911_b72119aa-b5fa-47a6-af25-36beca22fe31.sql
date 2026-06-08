-- Add structured_notes column to clients table for persistent notes storage
ALTER TABLE clients 
ADD COLUMN structured_notes jsonb DEFAULT '[]'::jsonb;