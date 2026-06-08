-- Create table to store interview prep documents
CREATE TABLE public.interview_prep_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  placement_id UUID NOT NULL REFERENCES public.placements(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  focus_areas TEXT[] DEFAULT '{}',
  custom_instructions TEXT,
  language TEXT DEFAULT 'de',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.interview_prep_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Team members can view interview prep documents"
ON public.interview_prep_documents
FOR SELECT
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can create interview prep documents"
ON public.interview_prep_documents
FOR INSERT
WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can delete interview prep documents"
ON public.interview_prep_documents
FOR DELETE
USING (public.is_team_member(auth.uid()));

-- Create storage bucket for interview prep PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('interview-prep', 'interview-prep', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Team members can upload interview prep files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'interview-prep' AND public.is_team_member(auth.uid()));

CREATE POLICY "Anyone can view interview prep files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'interview-prep');

CREATE POLICY "Team members can delete interview prep files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'interview-prep' AND public.is_team_member(auth.uid()));