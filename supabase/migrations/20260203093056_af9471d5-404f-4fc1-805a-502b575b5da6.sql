-- Backfill last_pushed_at from existing push notes in candidates.notes
-- Only process candidates where notes is a valid JSON array
UPDATE public.candidates c
SET last_pushed_at = subquery.latest_push
FROM (
  SELECT 
    c2.id,
    MAX((note->>'timestamp')::timestamptz) as latest_push
  FROM candidates c2,
    LATERAL jsonb_array_elements(c2.notes::jsonb) AS note
  WHERE c2.notes IS NOT NULL 
    AND c2.notes LIKE '[{%'
    AND (note->>'isPush')::boolean = true
  GROUP BY c2.id
) subquery
WHERE c.id = subquery.id;