
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location_lng double precision;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_lng double precision;
