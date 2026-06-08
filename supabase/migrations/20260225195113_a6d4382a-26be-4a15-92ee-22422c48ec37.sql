ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_job_id TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_external_job_id ON jobs(external_job_id) WHERE external_job_id IS NOT NULL;