import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PER_INVOCATION = 50;
const DELAY_MS = 200;

async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  if (!location || location.trim().length < 2) return null;

  const GOOGLE_API_KEY = Deno.env.get('Google_Directions/Geocoding_KEY');
  if (!GOOGLE_API_KEY) throw new Error('Google_Directions/Geocoding_KEY not configured');

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    console.log(`No geocoding result for: "${location}" (${data.status})`);
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
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

    const results = { candidates: { processed: 0, skipped: 0, errors: 0 }, jobs: { processed: 0, skipped: 0, errors: 0 } };
    let totalProcessed = 0;
    let hasMore = false;

    // Process candidates without coordinates
    const candidateLimit = Math.min(MAX_PER_INVOCATION, MAX_PER_INVOCATION - totalProcessed);
    const { data: candidates, error: cErr } = await supabase
      .from('candidates')
      .select('id, location')
      .not('location', 'is', null)
      .is('location_lat', null)
      .limit(candidateLimit);

    if (cErr) {
      console.error('Failed to fetch candidates:', cErr);
    } else if (candidates?.length) {
      if (candidates.length >= candidateLimit) hasMore = true;
      for (const c of candidates) {
        if (totalProcessed >= MAX_PER_INVOCATION) { hasMore = true; break; }
        try {
          const coords = await geocodeLocation(c.location);
          if (!coords) { results.candidates.skipped++; continue; }

          const { error: uErr } = await supabase
            .from('candidates')
            .update({ location_lat: coords.lat, location_lng: coords.lng })
            .eq('id', c.id);

          if (uErr) { results.candidates.errors++; console.error(`Candidate ${c.id}:`, uErr); }
          else { results.candidates.processed++; totalProcessed++; }
          await sleep(DELAY_MS);
        } catch (e) {
          results.candidates.errors++;
          console.error(`Candidate ${c.id} error:`, e);
        }
      }
    }

    // Process jobs without coordinates
    if (totalProcessed < MAX_PER_INVOCATION) {
      const jobLimit = MAX_PER_INVOCATION - totalProcessed;
      const { data: jobs, error: jErr } = await supabase
        .from('jobs')
        .select('id, location')
        .not('location', 'is', null)
        .is('location_lat', null)
        .limit(jobLimit);

      if (jErr) {
        console.error('Failed to fetch jobs:', jErr);
      } else if (jobs?.length) {
        if (jobs.length >= jobLimit) hasMore = true;
        for (const j of jobs) {
          if (totalProcessed >= MAX_PER_INVOCATION) { hasMore = true; break; }
          try {
            const coords = await geocodeLocation(j.location);
            if (!coords) { results.jobs.skipped++; continue; }

            const { error: uErr } = await supabase
              .from('jobs')
              .update({ location_lat: coords.lat, location_lng: coords.lng })
              .eq('id', j.id);

            if (uErr) { results.jobs.errors++; console.error(`Job ${j.id}:`, uErr); }
            else { results.jobs.processed++; totalProcessed++; }
            await sleep(DELAY_MS);
          } catch (e) {
            results.jobs.errors++;
            console.error(`Job ${j.id} error:`, e);
          }
        }
      }
    }

    // Check remaining
    if (!hasMore) {
      const { count: cCount } = await supabase.from('candidates').select('id', { count: 'exact', head: true }).not('location', 'is', null).is('location_lat', null);
      const { count: jCount } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).not('location', 'is', null).is('location_lat', null);
      if ((cCount || 0) > 0 || (jCount || 0) > 0) hasMore = true;
    }

    if (totalProcessed === 0) hasMore = false;

    console.log(`Batch geocode: processed=${totalProcessed}, hasMore=${hasMore}`);

    return new Response(JSON.stringify({ success: true, results, hasMore }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('batch-geocode error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
