-- Add content and phase columns to interview_prep_documents
ALTER TABLE interview_prep_documents 
ADD COLUMN IF NOT EXISTS content JSONB,
ADD COLUMN IF NOT EXISTS phase TEXT;

-- Add unique constraint to prevent duplicates per placement+phase
ALTER TABLE interview_prep_documents 
ADD CONSTRAINT unique_placement_phase 
UNIQUE (placement_id, phase);

-- Add UPDATE policy for team members (currently missing)
CREATE POLICY "Team members can update interview prep documents" 
ON interview_prep_documents 
FOR UPDATE 
USING (is_team_member(auth.uid()))
WITH CHECK (is_team_member(auth.uid()));