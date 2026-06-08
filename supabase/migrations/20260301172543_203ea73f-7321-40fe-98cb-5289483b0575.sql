
-- Create a function for vector similarity search
CREATE OR REPLACE FUNCTION match_candidates_by_embedding(
  job_embedding vector(768),
  match_limit int DEFAULT 100,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (id uuid, similarity float)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    1 - (c.embedding <=> job_embedding) AS similarity
  FROM candidates c
  WHERE c.embedding IS NOT NULL
    AND c.status IN ('Active', 'Passive')
    AND 1 - (c.embedding <=> job_embedding) >= similarity_threshold
  ORDER BY c.embedding <=> job_embedding
  LIMIT match_limit;
$$;
