-- Add commute caching columns to placements table
ALTER TABLE public.placements
ADD COLUMN IF NOT EXISTS commute_auto_duration text,
ADD COLUMN IF NOT EXISTS commute_auto_distance text,
ADD COLUMN IF NOT EXISTS commute_oepnv_duration text,
ADD COLUMN IF NOT EXISTS commute_oepnv_distance text,
ADD COLUMN IF NOT EXISTS commute_calculated_at timestamp with time zone;