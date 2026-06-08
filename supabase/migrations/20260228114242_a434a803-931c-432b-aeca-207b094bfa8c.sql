ALTER TABLE public.market_radar_profiles
ADD COLUMN pensum_min integer NOT NULL DEFAULT 0,
ADD COLUMN pensum_max integer NOT NULL DEFAULT 100;