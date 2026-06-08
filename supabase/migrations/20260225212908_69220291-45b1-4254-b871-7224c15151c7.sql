
-- Market Radar Profiles (saved search configurations)
CREATE TABLE public.market_radar_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  queries TEXT[] NOT NULL DEFAULT '{}',
  location TEXT,
  radius_km INTEGER NOT NULL DEFAULT 50,
  language TEXT NOT NULL DEFAULT 'de',
  time_filter TEXT NOT NULL DEFAULT 'all',
  work_model TEXT NOT NULL DEFAULT 'all',
  max_pages INTEGER NOT NULL DEFAULT 3,
  auto_synonyms BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.market_radar_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view radar profiles" ON public.market_radar_profiles FOR SELECT USING (is_team_member(auth.uid()));
CREATE POLICY "Team members can insert radar profiles" ON public.market_radar_profiles FOR INSERT WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "Team members can update radar profiles" ON public.market_radar_profiles FOR UPDATE USING (is_team_member(auth.uid()));
CREATE POLICY "Team members can delete radar profiles" ON public.market_radar_profiles FOR DELETE USING (is_team_member(auth.uid()));

-- Market Radar Scans (history)
CREATE TABLE public.market_radar_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  profile_id UUID REFERENCES public.market_radar_profiles(id) ON DELETE SET NULL,
  queries_used TEXT[] NOT NULL DEFAULT '{}',
  location TEXT,
  total_scraped INTEGER NOT NULL DEFAULT 0,
  total_new INTEGER NOT NULL DEFAULT 0,
  total_existing INTEGER NOT NULL DEFAULT 0,
  total_filtered INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.market_radar_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view radar scans" ON public.market_radar_scans FOR SELECT USING (is_team_member(auth.uid()));
CREATE POLICY "Team members can insert radar scans" ON public.market_radar_scans FOR INSERT WITH CHECK (is_team_member(auth.uid()));
