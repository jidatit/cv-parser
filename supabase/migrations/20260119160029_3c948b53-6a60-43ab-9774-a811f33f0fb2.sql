-- Add phone column to profiles table
ALTER TABLE public.profiles
ADD COLUMN phone TEXT DEFAULT NULL;