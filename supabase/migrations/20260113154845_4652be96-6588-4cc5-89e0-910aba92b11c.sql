-- Add follow_up column to placements table for "Nachfassen" feature
ALTER TABLE public.placements 
ADD COLUMN follow_up boolean DEFAULT false;