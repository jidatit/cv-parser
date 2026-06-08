
-- Create ai_cache table for caching AI responses
CREATE TABLE public.ai_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name text NOT NULL,
  cache_key text NOT NULL,
  response_data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT ai_cache_function_key_unique UNIQUE (function_name, cache_key)
);

-- Index for fast lookups
CREATE INDEX idx_ai_cache_lookup ON public.ai_cache (function_name, cache_key, expires_at);

-- Enable RLS
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies for team members
CREATE POLICY "Team members can read ai_cache"
  ON public.ai_cache FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team members can insert ai_cache"
  ON public.ai_cache FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team members can update ai_cache"
  ON public.ai_cache FOR UPDATE
  USING (is_team_member(auth.uid()));
