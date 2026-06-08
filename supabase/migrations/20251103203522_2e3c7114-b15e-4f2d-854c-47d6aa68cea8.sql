-- Add status column to clients table
ALTER TABLE public.clients 
ADD COLUMN status TEXT DEFAULT 'Offen' CHECK (status IN ('Nicht offen', 'Offen', 'Partner'));