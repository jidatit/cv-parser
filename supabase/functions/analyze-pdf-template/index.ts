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
    console.log('Starting PDF template analysis');

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('No file provided');
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('File received:', file.name, file.size, 'bytes');

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    }

    // Convert PDF to base64 for AI analysis (process in chunks to avoid stack overflow)
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let base64Pdf = '';
    const chunkSize = 8192;
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      base64Pdf += String.fromCharCode(...chunk);
    }
    base64Pdf = btoa(base64Pdf);

    console.log('Analyzing PDF with Google Gemini');

    const prompt = `Du analysierst CV/Lebenslauf-PDFs und extrahierst Layout-Eigenschaften.

Analysiere dieses CV/Lebenslauf-PDF und extrahiere die wichtigsten Layout-Eigenschaften.

Gib die Antwort als JSON mit folgender Struktur zurück:
{
  "primaryColor": "blue|gray|purple|green|red|orange",
  "fontSize": "small|medium|large",
  "spacing": "compact|normal|relaxed",
  "layoutDescription": "Kurze Beschreibung des Layouts"
}

Wähle die Farbe basierend auf der dominanten Akzentfarbe im PDF.
Wähle fontSize basierend auf der relativen Schriftgröße (klein/mittel/groß).
Wähle spacing basierend darauf, wie dicht oder luftig das Layout ist.`;

    // Use Gemini API with PDF
    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }
          ]
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Gemini API error:', aiResponse.status, errorText);
      throw new Error('Failed to analyze PDF with AI');
    }

    const aiResult = await aiResponse.json();
    console.log('Gemini analysis result received');

    // Extract the JSON response from AI
    let layoutSettings;
    try {
      const content = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        layoutSettings = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback to default values
        layoutSettings = {
          primaryColor: 'blue',
          fontSize: 'medium',
          spacing: 'normal',
          layoutDescription: 'Standard-Layout'
        };
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      layoutSettings = {
        primaryColor: 'blue',
        fontSize: 'medium',
        spacing: 'normal',
        layoutDescription: 'Standard-Layout'
      };
    }

    console.log('Extracted layout settings:', layoutSettings);

    return new Response(
      JSON.stringify(layoutSettings),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in analyze-pdf-template function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        details: 'Failed to analyze PDF template'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
