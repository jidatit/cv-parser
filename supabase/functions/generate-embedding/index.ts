import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Build embedding text for a candidate (NO location — geography handled by commute module)
function buildCandidateEmbeddingText(candidate: any): string {
  const parts: string[] = [];
  if (candidate.position) parts.push(candidate.position);
  if (candidate.desired_position) parts.push(candidate.desired_position);
  if (candidate.industry) parts.push(candidate.industry);
  if (candidate.skills?.length) parts.push(candidate.skills.join(', '));
  if (candidate.summary) parts.push(candidate.summary.substring(0, 300));
  
  // Add latest work experience context
  const workExp = candidate.work_experience;
  if (Array.isArray(workExp) && workExp.length > 0) {
    const latest = workExp[0];
    if (latest.position || latest.role_title) {
      parts.push(latest.position || latest.role_title);
    }
    if (latest.description) {
      parts.push(latest.description.substring(0, 200));
    }
  }
  
  return parts.filter(Boolean).join(' | ');
}

// Build embedding text for a job (NO location)
function buildJobEmbeddingText(job: any): string {
  const parts: string[] = [];
  if (job.title) parts.push(job.title);
  if (job.description) parts.push(job.description.substring(0, 500));
  if (job.requirements) parts.push(job.requirements.substring(0, 500));
  if (job.responsibilities) parts.push(job.responsibilities.substring(0, 300));
  if (job.skills?.length) parts.push(job.skills.join(', '));
  return parts.filter(Boolean).join(' | ');
}

// Call Google text-embedding-004 API
async function generateEmbedding(text: string): Promise<number[]> {
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_GEMINI_API_KEY is not configured');

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
    console.error('Embedding API error:', response.status, errorText);
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding?.values || [];
}

// Geocode a location string to lat/lng using Google Geocoding API
async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  if (!location || location.trim().length < 2) return null;

  const GOOGLE_API_KEY = Deno.env.get('Google_Directions/Geocoding_KEY');
  if (!GOOGLE_API_KEY) {
    console.log('Google_Directions/Geocoding_KEY not configured, skipping geocoding');
    return null;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`
    );

    if (!response.ok) {
      console.error('Geocoding API error:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }

    console.log(`Geocoding returned no results for: "${location}" (status: ${data.status})`);
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { table, id } = await req.json();

    if (!table || !id) {
      return new Response(JSON.stringify({ error: 'table and id are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (table !== 'candidates' && table !== 'jobs') {
      return new Response(JSON.stringify({ error: 'table must be candidates or jobs' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch the record
    const { data: record, error: fetchError } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !record) {
      console.error(`Record not found: ${table}/${id}`, fetchError);
      return new Response(JSON.stringify({ error: 'Record not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build embedding text
    const embeddingText = table === 'candidates'
      ? buildCandidateEmbeddingText(record)
      : buildJobEmbeddingText(record);

    if (!embeddingText || embeddingText.length < 10) {
      console.log(`Skipping embedding for ${table}/${id}: insufficient text (${embeddingText.length} chars)`);
      return new Response(JSON.stringify({ skipped: true, reason: 'insufficient text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Generating embedding for ${table}/${id} (${embeddingText.length} chars)`);

    // Generate embedding
    const embedding = await generateEmbedding(embeddingText);

    if (!embedding.length) {
      throw new Error('Empty embedding returned');
    }

    // Store embedding as vector string format for pgvector
    const vectorStr = `[${embedding.join(',')}]`;
    const updatePayload: any = { embedding: vectorStr };

    // Geocode location if not already set or if location changed
    const locationField = record.location;
    const hasCoords = record.location_lat != null && record.location_lng != null;
    
    if (locationField && !hasCoords) {
      console.log(`Geocoding location for ${table}/${id}: "${locationField}"`);
      const coords = await geocodeLocation(locationField);
      if (coords) {
        updatePayload.location_lat = coords.lat;
        updatePayload.location_lng = coords.lng;
        console.log(`✅ Geocoded "${locationField}" → ${coords.lat}, ${coords.lng}`);
      }
    }

    const { error: updateError } = await supabase
      .from(table)
      .update(updatePayload)
      .eq('id', id);

    if (updateError) {
      console.error(`Failed to store embedding for ${table}/${id}:`, updateError);
      throw new Error(`Failed to store embedding: ${updateError.message}`);
    }

    console.log(`✅ Embedding stored for ${table}/${id} (${embedding.length} dimensions)`);

    return new Response(JSON.stringify({ success: true, dimensions: embedding.length, geocoded: !!updatePayload.location_lat }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('generate-embedding error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
