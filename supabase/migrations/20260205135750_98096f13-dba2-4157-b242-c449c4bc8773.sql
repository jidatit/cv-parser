-- Unique Constraint hinzufügen um doppelte AI-Matches zu verhindern
ALTER TABLE ai_matches 
ADD CONSTRAINT ai_matches_candidate_job_user_unique 
UNIQUE (candidate_id, job_id, user_id);