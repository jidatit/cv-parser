
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS public_responsibilities text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS public_requirements text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS public_benefits text;
