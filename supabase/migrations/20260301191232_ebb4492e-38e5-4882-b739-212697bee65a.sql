CREATE OR REPLACE FUNCTION public.match_candidates_by_embedding(
  job_embedding vector(768),
  match_limit integer DEFAULT 100,
  similarity_threshold double precision DEFAULT 0.3,
  filter_industry text DEFAULT NULL
)
RETURNS TABLE(id uuid, similarity double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    1 - (c.embedding <=> job_embedding) AS similarity
  FROM candidates c
  WHERE c.embedding IS NOT NULL
    AND c.status IN ('Active', 'Passive')
    AND 1 - (c.embedding <=> job_embedding) >= similarity_threshold
    AND (filter_industry IS NULL OR c.industry ILIKE filter_industry)
  ORDER BY c.embedding <=> job_embedding
  LIMIT match_limit;
$$;