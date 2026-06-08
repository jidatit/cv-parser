-- Add first_name and last_name columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN first_name TEXT DEFAULT NULL,
ADD COLUMN last_name TEXT DEFAULT NULL;