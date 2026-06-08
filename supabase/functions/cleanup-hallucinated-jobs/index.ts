import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Find ALL External jobs with source_url that have responsibilities OR requirements filled
  // These were all processed by the old batch-enrich which may have hallucinated content
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, title, responsibilities, requirements, benefits, description')
    .eq('status', 'External')
    .not('source_url', 'is', null)
    .or('responsibilities.not.is.null,requirements.not.is.null');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const toClean = jobs || [];
  console.log(`Found ${toClean.length} External jobs with filled responsibilities/requirements to reset`);

  let cleaned = 0;
  for (const job of toClean) {
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        responsibilities: null,
        requirements: null,
        benefits: null,
        description: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (!updateError) {
      cleaned++;
      console.log(`Reset: ${job.title}`);
    } else {
      console.error(`Failed to reset ${job.title}:`, updateError.message);
    }
  }

  return new Response(JSON.stringify({
    success: true,
    found: toClean.length,
    cleaned,
    jobs: toClean.map(j => ({ id: j.id, title: j.title })),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
