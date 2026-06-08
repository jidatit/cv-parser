import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize location for consistent cache keys
const normalize = (s: string): string => s.trim().toLowerCase();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { origin, destination } = await req.json();
    
    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: 'Origin and destination are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normOrigin = normalize(origin);
    const normDest = normalize(destination);

    // Service role client for cache operations (bypasses RLS)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Check cache first
    const { data: cached } = await serviceClient
      .from('commute_cache')
      .select('*')
      .eq('origin', normOrigin)
      .eq('destination', normDest)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cached) {
      console.log(`Cache HIT for "${normOrigin}" -> "${normDest}"`);
      return new Response(
        JSON.stringify({
          auto: cached.auto_duration || cached.auto_distance
            ? { duration: cached.auto_duration, distance: cached.auto_distance }
            : null,
          oepnv: cached.oepnv_duration || cached.oepnv_distance
            ? { duration: cached.oepnv_duration, distance: cached.oepnv_distance }
            : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Cache MISS for "${normOrigin}" -> "${normDest}", calling Google API`);

    // 2. No cache hit - call Google API
    const apiKey =
      Deno.env.get('Google_Directions/Geocoding_KEY') ??
      Deno.env.get('Google_Directions_and_Geocoding_KEY') ??
      Deno.env.get('VITE_GOOGLE_MAPS_API_KEY');

    if (!apiKey) {
      console.error('Google Maps API key not configured.');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [drivingResponse, transitResponse] = await Promise.all([
      fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&language=de&key=${apiKey}`
      ),
      fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=transit&language=de&key=${apiKey}`
      )
    ]);

    const [drivingData, transitData] = await Promise.all([
      drivingResponse.json(),
      transitResponse.json()
    ]);

    const formatDuration = (text: string | null): string | null => {
      if (!text) return null;
      return text
        .replace(/\s*Stunden?\s*/gi, 'h ')
        .replace(/\s*Minuten?\s*/gi, 'min')
        .replace(/\s*Min\.?\s*/gi, 'min')
        .replace(/\s*Std\.?\s*/gi, 'h ')
        .replace(/,\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const result: {
      auto: { duration: string | null; distance: string | null } | null;
      oepnv: { duration: string | null; distance: string | null } | null;
    } = { auto: null, oepnv: null };

    if (drivingData.status === 'OK' && drivingData.routes?.[0]?.legs?.[0]) {
      const leg = drivingData.routes[0].legs[0];
      result.auto = {
        duration: formatDuration(leg.duration?.text),
        distance: leg.distance?.text || null
      };
    }

    if (transitData.status === 'OK' && transitData.routes?.[0]?.legs?.[0]) {
      const leg = transitData.routes[0].legs[0];
      result.oepnv = {
        duration: formatDuration(leg.duration?.text),
        distance: leg.distance?.text || null
      };
    }

    // 3. Save to cache (upsert)
    await serviceClient
      .from('commute_cache')
      .upsert({
        origin: normOrigin,
        destination: normDest,
        auto_duration: result.auto?.duration || null,
        auto_distance: result.auto?.distance || null,
        oepnv_duration: result.oepnv?.duration || null,
        oepnv_distance: result.oepnv?.distance || null,
        calculated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'origin,destination' });

    console.log('Result cached and returned');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error calculating commute:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
