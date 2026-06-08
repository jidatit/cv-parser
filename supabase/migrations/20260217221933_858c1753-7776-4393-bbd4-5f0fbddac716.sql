
-- Commute Cache Table for Google Directions API cost reduction
CREATE TABLE public.commute_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origin text NOT NULL,
  destination text NOT NULL,
  auto_duration text,
  auto_distance text,
  oepnv_duration text,
  oepnv_distance text,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE(origin, destination)
);

-- Enable RLS
ALTER TABLE public.commute_cache ENABLE ROW LEVEL SECURITY;

-- Team members can read cache
CREATE POLICY "Team members can read commute cache"
ON public.commute_cache FOR SELECT
USING (is_team_member(auth.uid()));

-- Team members can insert cache
CREATE POLICY "Team members can insert commute cache"
ON public.commute_cache FOR INSERT
WITH CHECK (is_team_member(auth.uid()));

-- Team members can update cache (for upsert)
CREATE POLICY "Team members can update commute cache"
ON public.commute_cache FOR UPDATE
USING (is_team_member(auth.uid()));

-- Index for fast lookups
CREATE INDEX idx_commute_cache_lookup ON public.commute_cache (origin, destination, expires_at);
