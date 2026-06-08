import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 10;
const MAX_PER_INVOCATION = 30; // Process at most 30 records per call to avoid worker limits
const DELAY_BETWEEN_CALLS_MS = 200;

function buildCandidateEmbeddingText(c: any): string {
  const parts: string[] = [];
  if (c.position) parts.push(c.position);
  if (c.desired_position) parts.push(c.desired_position);
  if (c.industry) parts.push(c.industry);
  if (c.skills?.length) parts.push(c.skills.join(', '));
  if (c.summary) parts.push(c.summary.substring(0, 300));
  const workExp = c.work_experience;
  if (Array.isArray(workExp) && workExp.length > 0) {
    const latest = workExp[0];
    if (latest.position || latest.role_title) parts.push(latest.position || latest.role_title);
    if (latest.description) parts.push(latest.description.substring(0, 200));
  }
  return parts.filter(Boolean).join(' | ');
}

function buildJobEmbeddingText(j: any): string {
  const parts: string[] = [];
  if (j.title) parts.push(j.title);
  if (j.description) parts.push(j.description.substring(0, 500));
  if (j.requirements) parts.push(j.requirements.substring(0, 500));
  if (j.responsibilities) parts.push(j.responsibilities.substring(0, 300));
  if (j.skills?.length) parts.push(j.skills.join(', '));
  return parts.filter(Boolean).join(' | ');
}

async function generateEmbedding(text: string): Promise<number[]> {
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_GEMINI_API_KEY not configured');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`Embedding API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.embedding?.values || [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const tableFilter = body.table; // optional: 'candidates' or 'jobs'

    const results = { candidates: { processed: 0, skipped: 0, errors: 0 }, jobs: { processed: 0, skipped: 0, errors: 0 } };
    let totalProcessed = 0;
    let hasMore = false;

    // Process candidates
    if (totalProcessed < MAX_PER_INVOCATION && (!tableFilter || tableFilter === 'candidates')) {
      const limit = MAX_PER_INVOCATION - totalProcessed;
      const { data: candidates, error } = await supabase
        .from('candidates')
        .select('*')
        .is('embedding', null)
        .in('status', ['Active', 'Passive'])
        .limit(limit);

      if (error) {
        console.error('Failed to fetch candidates:', error);
      } else if (candidates?.length) {
        console.log(`Processing ${candidates.length} candidates (limit ${limit})`);
        if (candidates.length >= limit) hasMore = true;

        for (const candidate of candidates) {
          if (totalProcessed >= MAX_PER_INVOCATION) { hasMore = true; break; }
          try {
            const text = buildCandidateEmbeddingText(candidate);
            if (text.length < 10) { results.candidates.skipped++; continue; }

            const embedding = await generateEmbedding(text);
            if (!embedding.length) { results.candidates.skipped++; continue; }

            const vectorStr = `[${embedding.join(',')}]`;
            const { error: updateError } = await supabase
              .from('candidates')
              .update({ embedding: vectorStr } as any)
              .eq('id', candidate.id);

            if (updateError) {
              console.error(`Failed candidate ${candidate.id}:`, updateError);
              results.candidates.errors++;
            } else {
              results.candidates.processed++;
              totalProcessed++;
            }
            await sleep(DELAY_BETWEEN_CALLS_MS);
          } catch (e) {
            if (e.message === 'RATE_LIMITED') {
              console.log('Rate limited, waiting 10s...');
              await sleep(10000);
            }
            results.candidates.errors++;
          }
        }
        console.log(`Candidates done: ${JSON.stringify(results.candidates)}`);
      }
    }

    // Process jobs
    if (totalProcessed < MAX_PER_INVOCATION && (!tableFilter || tableFilter === 'jobs')) {
      const limit = MAX_PER_INVOCATION - totalProcessed;
      const { data: jobs, error } = await supabase
        .from('jobs')
        .select('*')
        .is('embedding', null)
        .limit(limit);

      if (error) {
        console.error('Failed to fetch jobs:', error);
      } else if (jobs?.length) {
        console.log(`Processing ${jobs.length} jobs (limit ${limit})`);
        if (jobs.length >= limit) hasMore = true;

        for (const job of jobs) {
          if (totalProcessed >= MAX_PER_INVOCATION) { hasMore = true; break; }
          try {
            const text = buildJobEmbeddingText(job);
            if (text.length < 10) { results.jobs.skipped++; continue; }

            const embedding = await generateEmbedding(text);
            if (!embedding.length) { results.jobs.skipped++; continue; }

            const vectorStr = `[${embedding.join(',')}]`;
            const { error: updateError } = await supabase
              .from('jobs')
              .update({ embedding: vectorStr } as any)
              .eq('id', job.id);

            if (updateError) {
              console.error(`Failed job ${job.id}:`, updateError);
              results.jobs.errors++;
            } else {
              results.jobs.processed++;
              totalProcessed++;
            }
            await sleep(DELAY_BETWEEN_CALLS_MS);
          } catch (e) {
            if (e.message === 'RATE_LIMITED') {
              console.log('Rate limited on jobs, waiting 10s...');
              await sleep(10000);
            }
            results.jobs.errors++;
          }
        }
        console.log(`Jobs done: ${JSON.stringify(results.jobs)}`);
      }
    }

    // Check remaining
    if (!hasMore) {
      const { count: cCount } = await supabase.from('candidates').select('id', { count: 'exact', head: true }).is('embedding', null).in('status', ['Active', 'Passive']);
      const { count: jCount } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).is('embedding', null);
      if ((cCount || 0) > 0 || (jCount || 0) > 0) hasMore = true;
    }

    // If no records were processed in this round, stop looping even if unprocessable records remain
    if (totalProcessed === 0) {
      hasMore = false;
    }

    console.log(`Batch complete: processed=${totalProcessed}, hasMore=${hasMore}`);

    return new Response(JSON.stringify({ success: true, results, hasMore }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('batch-generate-embeddings error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
