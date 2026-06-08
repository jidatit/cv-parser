-- Add URL validation fields to jobs table
ALTER TABLE jobs
ADD COLUMN source_url_status TEXT,
ADD COLUMN source_url_checked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN source_url_reason TEXT;

-- Add comments for documentation
COMMENT ON COLUMN jobs.source_url_status IS 'URL status: active, expired, uncertain, unreachable, invalid';
COMMENT ON COLUMN jobs.source_url_checked_at IS 'Timestamp of last URL validation';
COMMENT ON COLUMN jobs.source_url_reason IS 'Reason/explanation from URL validation';

-- Add index for filtering by status
CREATE INDEX idx_jobs_source_url_status ON jobs(source_url_status) WHERE source_url_status IS NOT NULL;