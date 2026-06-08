-- Erstelle eine Tabelle für Fähigkeiten/Skills
CREATE TABLE public.skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index für schnelle Suche nach Namen
CREATE INDEX idx_skills_name ON public.skills(name);

-- Erlaube allen das Lesen und Einfügen der Skills
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view skills"
ON public.skills
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert skills"
ON public.skills
FOR INSERT
WITH CHECK (true);