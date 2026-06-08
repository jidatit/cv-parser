CREATE OR REPLACE FUNCTION public.match_jobs_by_embedding(
  candidate_embedding vector(768),
  match_limit integer DEFAULT 15,
  similarity_threshold double precision DEFAULT 0.55
)
RETURNS TABLE(id uuid, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    j.id,
    1 - (j.embedding <=> candidate_embedding) AS similarity
  FROM jobs j
  WHERE j.embedding IS NOT NULL
    AND j.status IN ('Active', 'Offen', 'External')
    AND 1 - (j.embedding <=> candidate_embedding) >= similarity_threshold
  ORDER BY j.embedding <=> candidate_embedding
  LIMIT match_limit;
$$;