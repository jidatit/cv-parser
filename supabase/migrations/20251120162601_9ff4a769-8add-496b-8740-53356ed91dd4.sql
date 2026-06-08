-- Create enum for configuration types
CREATE TYPE public.config_type AS ENUM (
  'candidate_status',
  'client_status',
  'job_status',
  'recruiting_stage',
  'match_stage'
);

-- Create status_configurations table
CREATE TABLE public.status_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  config_type config_type NOT NULL,
  config_value JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, config_type)
);

-- Enable RLS
ALTER TABLE public.status_configurations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own configurations"
  ON public.status_configurations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own configurations"
  ON public.status_configurations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own configurations"
  ON public.status_configurations
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own configurations"
  ON public.status_configurations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_status_configurations_updated_at
  BEFORE UPDATE ON public.status_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();