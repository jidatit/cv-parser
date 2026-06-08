-- Create industries table for dropdown suggestions
CREATE TABLE public.industries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read industries
CREATE POLICY "Team members can view industries" 
ON public.industries 
FOR SELECT 
USING (public.is_team_member(auth.uid()));

-- Allow authenticated users to insert new industries
CREATE POLICY "Team members can insert industries" 
ON public.industries 
FOR INSERT 
WITH CHECK (public.is_team_member(auth.uid()));

-- Insert some common industries as starting data
INSERT INTO public.industries (name) VALUES
  ('IT & Software'),
  ('Finanzdienstleistungen'),
  ('Gesundheitswesen'),
  ('Pharma & Biotech'),
  ('Maschinenbau'),
  ('Automobilindustrie'),
  ('Bauwesen'),
  ('Energie & Umwelt'),
  ('Telekommunikation'),
  ('Medien & Kommunikation'),
  ('Handel & E-Commerce'),
  ('Logistik & Transport'),
  ('Beratung & Consulting'),
  ('Versicherungen'),
  ('Immobilien'),
  ('Lebensmittel & Getränke'),
  ('Tourismus & Gastgewerbe'),
  ('Bildung & Forschung'),
  ('Chemie'),
  ('Textil & Mode'),
  ('Luft- und Raumfahrt'),
  ('Uhren & Schmuck'),
  ('Öffentlicher Sektor')
ON CONFLICT (name) DO NOTHING;