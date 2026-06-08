ALTER TABLE public.publication_rules 
ADD COLUMN IF NOT EXISTS anonymization_level text DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS auto_publish boolean DEFAULT false;