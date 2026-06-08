-- Create a table for languages (like skills)
CREATE TABLE public.languages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;

-- Create policy for reading languages (everyone can read)
CREATE POLICY "Languages are viewable by authenticated users" 
ON public.languages 
FOR SELECT 
TO authenticated
USING (true);

-- Create policy for inserting languages (authenticated users can add)
CREATE POLICY "Authenticated users can insert languages" 
ON public.languages 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Create index for faster searches
CREATE INDEX idx_languages_name ON public.languages(name);

-- Insert common languages
INSERT INTO public.languages (name) VALUES 
  ('Deutsch'),
  ('Englisch'),
  ('Französisch'),
  ('Spanisch'),
  ('Italienisch'),
  ('Portugiesisch'),
  ('Russisch'),
  ('Chinesisch'),
  ('Japanisch'),
  ('Koreanisch'),
  ('Arabisch'),
  ('Türkisch'),
  ('Polnisch'),
  ('Niederländisch'),
  ('Schwedisch')
ON CONFLICT (name) DO NOTHING;