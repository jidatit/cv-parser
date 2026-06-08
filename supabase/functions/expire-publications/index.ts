import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date().toISOString();
    const results: any[] = [];

    // 1. Expire live jobs past their expiration date
    const { data: expired, error: expireError } = await supabase
      .from('jobs')
      .update({ publication_status: 'expired', is_published: false })
      .eq('publication_status', 'live')
      .in('status', ['N/D', 'Active', 'Offen', 'Assignment', 'External'])
      .lt('publication_expires_at', now)
      .not('publication_expires_at', 'is', null)
      .select('id');

    if (expired?.length) {
      results.push({ action: 'expired', count: expired.length, ids: expired.map((j: any) => j.id) });
    }

    // 2. Activate scheduled jobs whose published_at has passed
    const { data: activated, error: activateError } = await supabase
      .from('jobs')
      .update({ publication_status: 'live', is_published: true })
      .eq('publication_status', 'scheduled')
      .lt('published_at', now)
      .not('published_at', 'is', null)
      .select('id');

    if (activated?.length) {
      results.push({ action: 'activated', count: activated.length, ids: activated.map((j: any) => j.id) });
    }

    // 3. Auto-optimize A/B winners
    const { data: splitJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('auto_optimize', true)
      .eq('active_variant', 'split')
      .eq('publication_status', 'live')
      .is('winner_variant', null);

    if (splitJobs?.length) {
      for (const job of splitJobs) {
        const { data: analytics } = await supabase
          .from('job_analytics')
          .select('variant_shown, event_type')
          .eq('job_id', job.id);

        if (!analytics) continue;

        const calc = (variant: string) => {
          const views = analytics.filter((e: any) => e.variant_shown === variant && e.event_type === 'view').length;
          const clicks = analytics.filter((e: any) => e.variant_shown === variant && e.event_type === 'click').length;
          return { views, clicks, ctr: views > 0 ? clicks / views : 0 };
        };

        const a = calc('A');
        const b = calc('B');

        // Need min 50 views per variant and 100 total
        if (a.views < 50 || b.views < 50 || (a.views + b.views) < 100) continue;

        // Check for >20% lift
        let winner: string | null = null;
        if (a.ctr > 0 && b.ctr > 0) {
          const liftBoverA = (b.ctr - a.ctr) / a.ctr;
          const liftAoverB = (a.ctr - b.ctr) / b.ctr;
          if (liftBoverA > 0.2) winner = 'B';
          else if (liftAoverB > 0.2) winner = 'A';
        }

        if (winner) {
          await supabase.from('jobs').update({
            active_variant: winner,
            winner_variant: winner,
            auto_optimize: false,
          }).eq('id', job.id);

          await supabase.from('publication_audit_log').insert({
            job_id: job.id,
            user_id: '00000000-0000-0000-0000-000000000000',
            action: 'auto_winner_set',
            details: {
              winner,
              metrics_a: a,
              metrics_b: b,
            },
          });

          results.push({ action: 'auto_winner', job_id: job.id, winner });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results, timestamp: now }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
