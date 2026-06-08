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
    const { instruction, currentData } = await req.json();

    if (!instruction || !currentData) {
      return new Response(
        JSON.stringify({ error: 'instruction and currentData are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!GOOGLE_GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `Du bist ein hochpräziser Analyse-Assistent für ein Recruiting-CRM. Deine Aufgabe ist es, Stelleninhalte gemäss der Benutzeranweisung zu verarbeiten.

## KRITISCHE REGELN:
1. **BENUTZERANWEISUNG HAT HÖCHSTE PRIORITÄT**: Führe GENAU die gegebene Anweisung aus.
2. **KEINE ERFINDUNG**: Füge keine Informationen hinzu, die nicht im Original vorhanden sind.
3. **STRIKTE JSON-AUSGABE**: Antworte NUR mit gültigem JSON.

## TEXTSTANDARD:
- Schweizer Hochdeutsch: kein "ß", immer "ss" (z.B. "gross" statt "groß", "Strasse" statt "Straße")
- UMLAUTE VERWENDEN: ä, ö, ü, Ä, Ö, Ü
- HTML-Listen (<ul><li>) beibehalten und nicht in Plaintext umwandeln
- Jeder <li>-Eintrag beginnt mit Grossbuchstaben
- Bulletpoints enden NIE mit Punkt

## BENUTZERANWEISUNG:
${instruction}

## VERFÜGBARE FELDER:
- description: Stellenbeschreibung (Freitext/HTML)
- responsibilities: Aufgaben (HTML-Liste)
- requirements: Anforderungen (HTML-Liste)
- benefits: Benefits/Vorteile (HTML-Liste)

## AKTUELLE STELLENDATEN:
${JSON.stringify(currentData, null, 2)}

## ANTWORTFORMAT (NUR DIESES JSON):
{
  "fields": [
    {"key": "feldname", "label": "Anzeigename", "value": "Übersetzter/verarbeiteter Wert", "action": "replace"}
  ]
}

Gib NUR Felder zurück, die tatsächlich geändert wurden. Wenn ein Feld leer oder null ist, überspringe es.`;

    console.log('process-job-info: Calling Gemini with instruction length:', instruction.length);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: systemPrompt }]
          }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('process-job-info: AI response received');

    // Parse JSON
    let parsedContent;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError, 'Raw:', content);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', fields: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const labelMap: Record<string, string> = {
      description: 'Beschreibung',
      responsibilities: 'Aufgaben',
      requirements: 'Anforderungen',
      benefits: 'Benefits',
    };

    const fields = (parsedContent.fields || []).map((field: any) => ({
      ...field,
      label: labelMap[field.key] || field.label || field.key,
    }));

    return new Response(
      JSON.stringify({ fields }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-job-info:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
