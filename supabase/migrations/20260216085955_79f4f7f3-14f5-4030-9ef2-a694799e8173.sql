
-- Rename existing rejection reason
UPDATE public.rejection_reasons 
SET reason = 'Kandidat hat kein Interesse', updated_at = now()
WHERE reason = 'Kandidat hat Stelle abgelehnt';

-- Insert new rejection reason
INSERT INTO public.rejection_reasons (reason)
VALUES ('Kandidat ist nicht mehr verfügbar');
