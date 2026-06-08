import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.76.1');
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { input, sessionToken } = await req.json();

    if (!input || input.trim().length < 2) {
      return new Response(
        JSON.stringify({ predictions: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try multiple possible secret names for the Google API key
    const apiKey = Deno.env.get('Google_Directions_and_Geocoding_KEY') 
      || Deno.env.get('Google_Directions/Geocoding_KEY')
      || Deno.env.get('GOOGLE_CLOUD_API_KEY');
    
    if (!apiKey) {
      console.error('No Google API key configured (tried Google_Directions_and_Geocoding_KEY, Google_Directions/Geocoding_KEY, GOOGLE_CLOUD_API_KEY)');
      return new Response(
        JSON.stringify({ error: 'API key not configured', predictions: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Google Places Autocomplete API (New)
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('types', 'geocode|establishment');
    url.searchParams.set('components', 'country:ch|country:de|country:at'); // DACH region
    url.searchParams.set('language', 'de');
    
    if (sessionToken) {
      url.searchParams.set('sessiontoken', sessionToken);
    }

    console.log(`Fetching autocomplete for input: "${input}"`);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API error:', data.status, data.error_message);
      return new Response(
        JSON.stringify({ 
          error: data.error_message || data.status, 
          predictions: [] 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map to simplified format
    const predictions = (data.predictions || []).map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text || p.description,
      secondaryText: p.structured_formatting?.secondary_text || '',
    }));

    console.log(`Returning ${predictions.length} predictions`);

    return new Response(
      JSON.stringify({ predictions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in places-autocomplete:', error);
    return new Response(
      JSON.stringify({ error: errorMessage, predictions: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
