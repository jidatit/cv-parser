-- Add candidate insights columns for enhanced profile presentation
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS signature_achievements text[];
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS growth_potential text[];
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS most_proud_of text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS potential_risks text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS insights_notes text;