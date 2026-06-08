import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');

serve(async (req) => {
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
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: authError } = await authClient.auth.getClaims(token);
  if (authError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    if (!GOOGLE_GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const formData = await req.formData();
    const files: File[] = [];
    for (const [, value] of formData.entries()) {
      if (value instanceof File) files.push(value);
    }

    if (files.length === 0) {
      return new Response(JSON.stringify({ error: 'No files provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`extract-benefits: Processing ${files.length} file(s)`);

    // Convert files to base64 parts
    const fileParts: any[] = [];
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png');
      fileParts.push({ inline_data: { mime_type: mimeType, data: base64 } });
    }

    const prompt = `Analysiere die hochgeladenen Dokumente und extrahiere ALLE Benefits, Vorteile und Zusatzleistungen für Mitarbeitende.

REGELN:
- Gib die Benefits als HTML-Liste zurück: <ul><li>Benefit 1</li><li>Benefit 2</li></ul>
- Schweizer Hochdeutsch: kein "ß", immer "ss"
- UMLAUTE VERWENDEN: ä, ö, ü, Ä, Ö, Ü
- Jeder <li>-Eintrag beginnt mit Grossbuchstaben
- Bulletpoints enden NIE mit Punkt
- Erfinde KEINE Benefits — nur was tatsächlich in den Dokumenten steht
- Fasse ähnliche Benefits NICHT zusammen, liste jeden einzeln auf
- Wenn keine Benefits erkennbar sind, gib ein leeres Array zurück

Antworte NUR mit diesem JSON:
{"benefits": "<ul><li>...</li></ul>"}

Falls keine Benefits gefunden: {"benefits": ""}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, ...fileParts] }],
          generationConfig: { temperature: 0.0 },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) throw new Error('No content in AI response');

    let benefits = '';
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        benefits = parsed.benefits || '';
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e, 'Raw:', content);
    }

    // Enforce ss instead of ß
    benefits = benefits.replace(/ß/g, 'ss');

    console.log('extract-benefits: Done, benefits length:', benefits.length);

    return new Response(
      JSON.stringify({ benefits }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-benefits-from-files:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
