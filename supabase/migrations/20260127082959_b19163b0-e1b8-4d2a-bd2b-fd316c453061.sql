-- Add columns to store sentiment analysis results
ALTER TABLE public.placements 
ADD COLUMN IF NOT EXISTS sentiment_probability integer,
ADD COLUMN IF NOT EXISTS sentiment_trend text,
ADD COLUMN IF NOT EXISTS sentiment_summary text,
ADD COLUMN IF NOT EXISTS sentiment_key_signals jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS sentiment_confidence integer,
ADD COLUMN IF NOT EXISTS sentiment_analyzed_at timestamp with time zone;