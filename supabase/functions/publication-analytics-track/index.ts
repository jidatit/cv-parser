import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_EVENTS = ['view', 'click', 'apply', 'scroll_75'];

// In-memory rate limiting per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const MAX_REQUESTS_PER_MINUTE = 60;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60_000 });
    return false;
  }
  
  entry.count++;
  if (entry.count > MAX_REQUESTS_PER_MINUTE) {
    return true;
  }
  return false;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 60_000);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), { 
        status: 429, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { job_id, variant_shown, event_type, device_type } = await req.json();

    // Validate parameters
    if (!job_id || typeof job_id !== 'string' || job_id.length > 50) {
      return new Response(JSON.stringify({ error: 'Invalid parameters' }), { status: 400, headers: corsHeaders });
    }
    if (!event_type || !VALID_EVENTS.includes(event_type)) {
      return new Response(JSON.stringify({ error: 'Invalid parameters' }), { status: 400, headers: corsHeaders });
    }

    // Validate UUID format for job_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return new Response(JSON.stringify({ error: 'Invalid job_id format' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Validate job exists before inserting analytics
    const { data: job } = await supabase.from('jobs').select('id').eq('id', job_id).single();
    if (!job) {
      return new Response(JSON.stringify({ error: 'Invalid job_id' }), { status: 400, headers: corsHeaders });
    }

    // Sanitize variant_shown and device_type
    const safeVariant = (variant_shown === 'A' || variant_shown === 'B') ? variant_shown : 'A';
    const safeDevice = ['desktop', 'mobile', 'tablet'].includes(device_type) ? device_type : 'desktop';

    // Write to job_analytics table
    const { error } = await supabase.from('job_analytics').insert({
      job_id,
      variant_shown: safeVariant,
      event_type,
      device_type: safeDevice,
    });

    if (error) {
      console.error('Insert error:', error);
      return new Response(JSON.stringify({ error: 'Failed to track event' }), { status: 500, headers: corsHeaders });
    }

    // Also write to legacy publication_analytics for backwards compat
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('publication_analytics')
      .select('id, clicks, views')
      .eq('job_id', job_id)
      .eq('date', today)
      .is('variant', null)
      .single();

    if (existing) {
      const update: any = {};
      if (event_type === 'click') update.clicks = existing.clicks + 1;
      if (event_type === 'view') update.views = existing.views + 1;
      if (Object.keys(update).length > 0) {
        await supabase.from('publication_analytics').update(update).eq('id', existing.id);
      }
    } else if (event_type === 'click' || event_type === 'view') {
      await supabase.from('publication_analytics').insert({
        job_id,
        date: today,
        clicks: event_type === 'click' ? 1 : 0,
        views: event_type === 'view' ? 1 : 0,
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
});
