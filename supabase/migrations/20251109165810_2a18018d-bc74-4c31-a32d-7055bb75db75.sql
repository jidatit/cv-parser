-- Update default status for clients table to N/D (nicht definiert)
ALTER TABLE public.clients 
ALTER COLUMN status SET DEFAULT 'N/D';