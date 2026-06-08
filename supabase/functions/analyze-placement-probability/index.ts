import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callGeminiAPI(prompt: string) {
  const GOOGLE_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

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
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { notes, stage } = await req.json();
    
    if (!notes || notes.length === 0) {
      return new Response(
        JSON.stringify({ 
          probability: 10, 
          trend: 'neutral',
          summary: 'Keine Notizen vorhanden',
          key_signals: [],
          confidence: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare notes text
    const notesText = notes.map((note: any) => {
      const content = typeof note === 'string' ? note : note.content || note.text || '';
      return content.replace(/<[^>]*>/g, ''); // Strip HTML
    }).join('\n---\n');

    // STRENGE Basis-Scores
    const stageWeights: Record<string, number> = {
      'Ready2Send': 5,
      'Vorgestellt': 8,
      'Shared': 10,
      'Inquiry': 15,
      'Invitation': 25,
      'Interview 1': 35,
      'Interview 2': 50,
      'Trial Day': 65,
      'Offered': 80,
      'Placed': 100,
      'Abgelehnt': 0
    };

    const stageBaseScore = stageWeights[stage] ?? 5;

    const prompt = `Du analysierst NUR die Notizen eines Recruiting-Prozesses und bewertest das Sentiment STRENG.

WICHTIG: Die Firma zahlt ein Honorar nur bei erfolgreicher Einstellung. Der Kandidat muss so gut passen, dass die Firma freiwillig zahlt!

Sei KRITISCH bei der Analyse:
- Positive Signale: Explizite Begeisterung, konkretes Lob, schnelle positive Rückmeldungen, Interesse an Gehalt/Start
- Negative Signale: Jede Art von Bedenken, Verzögerungen, fehlende Rückmeldung, Ghosting, "wir melden uns"
- Neutral bedeutet KEIN Fortschritt - also eher negativ zu werten

Die meisten Prozesse scheitern! Sei realistisch pessimistisch.

Aktuelle Phase: "${stage}" (Basis-Score: ${stageBaseScore}%)

Notizen:

${notesText}

Antworte NUR mit diesem JSON (keine Erklärung):
{
  "sentiment_modifier": number zwischen -15 und +15 (nur bei SEHR klaren Signalen mehr als +-10),
  "trend": "positive" | "negative" | "neutral",
  "summary": "1 Satz zum Gesamteindruck der Notizen",
  "key_signals": ["Max 3 wichtige Signale aus den Notizen"]
}`;

    try {
      const content = await callGeminiAPI(prompt);
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysisData = JSON.parse(jsonMatch[0]);
        
        let sentimentMod = analysisData.sentiment_modifier || 0;
        sentimentMod = Math.max(-15, Math.min(15, sentimentMod));
        
        let probability = stageBaseScore + sentimentMod;
        probability = Math.max(2, Math.min(95, probability));
        
        return new Response(
          JSON.stringify({
            probability,
            trend: analysisData.trend || 'neutral',
            summary: analysisData.summary || 'Analyse abgeschlossen',
            key_signals: analysisData.key_signals || [],
            confidence: 0.7,
            stage_base_score: stageBaseScore
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          probability: stageBaseScore, 
          trend: 'neutral',
          summary: 'Analyse nicht möglich',
          key_signals: [],
          confidence: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error("API error:", error);
      return new Response(
        JSON.stringify({ 
          probability: stageBaseScore, 
          trend: 'neutral',
          summary: 'Analyse nicht verfügbar',
          key_signals: [],
          confidence: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        probability: 10, 
        trend: 'neutral',
        summary: 'Fehler bei der Analyse',
        key_signals: [],
        confidence: 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
