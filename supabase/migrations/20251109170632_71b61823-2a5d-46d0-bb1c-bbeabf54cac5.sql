-- Drop the old constraint
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;

-- Add the updated constraint with N/D
ALTER TABLE public.clients 
ADD CONSTRAINT clients_status_check 
CHECK (status = ANY (ARRAY['N/D'::text, 'Offen'::text, 'Nicht offen'::text, 'Partner'::text]));