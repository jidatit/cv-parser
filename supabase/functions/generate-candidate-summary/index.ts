import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
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
    const { candidateData, type = 'summary', inputText, skipCache = false } = await req.json();
    const GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    
    if (!GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    }

    // === CACHE CHECK for cacheable types ===
    const cacheableTypes = ['summary', 'growth', 'generate_risks'];
    const isCacheable = cacheableTypes.includes(type);
    let cacheKey = '';
    let serviceClient: any = null;

    if (isCacheable) {
      const cacheInput = JSON.stringify({
        type,
        name: candidateData.name,
        position: candidateData.position,
        desired_position: candidateData.desired_position,
        industry: candidateData.industry,
        experience: candidateData.experience,
        skills: candidateData.skills,
        languages: candidateData.languages,
        education: candidateData.education,
        work_experience: candidateData.work_experience,
        awards_publications: candidateData.awards_publications,
        reason_for_change: candidateData.reason_for_change,
      });
      cacheKey = await hashKey(cacheInput);

      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      if (!skipCache) {
        const { data: cached } = await serviceClient
          .from('ai_cache')
          .select('response_data')
          .eq('function_name', 'generate-candidate-summary')
          .eq('cache_key', cacheKey)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (cached) {
          console.log(`✅ Cache hit for generate-candidate-summary (${type})`);
          return new Response(JSON.stringify(cached.response_data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      console.log(`${skipCache ? 'Cache skipped' : 'Cache miss'} for generate-candidate-summary (${type}), calling AI...`);
    }

    // Build candidate context for AI
    const candidateContext = `
Kandidat: ${candidateData.name || 'Unbekannt'}
Aktuelle Position: ${candidateData.position || 'Nicht angegeben'}
Gewünschte Position: ${candidateData.desired_position || 'Nicht angegeben'}
Branche: ${candidateData.industry || 'Nicht angegeben'}
Erfahrung: ${candidateData.experience || 'Nicht angegeben'}
Skills: ${candidateData.skills?.join(', ') || 'Keine angegeben'}
Sprachen: ${candidateData.languages?.map((l: any) => `${l.name} (${l.level || 'k.A.'})`).join(', ') || 'Keine angegeben'}
Ausbildung: ${candidateData.education?.map((e: any) => `${e.degree} bei ${e.institution}`).join('; ') || 'Keine angegeben'}
Berufserfahrung: ${candidateData.work_experience?.map((w: any) => `${w.position} bei ${w.company} (${w.startDate || ''} - ${w.endDate || 'heute'})`).join('; ') || 'Keine angegeben'}
Awards/Publikationen: ${candidateData.awards_publications?.map((a: any) => a.title).join(', ') || 'Keine'}
Wechselgrund: ${candidateData.reason_for_change || 'Nicht angegeben'}
`;

    // Swiss German text standard - no ß, use ss instead, use proper umlauts, no periods at end of bullet points
    const swissGermanRule = '\n\nWICHTIG: Verwende Schweizer Hochdeutsch - kein "ß" (scharfes S), immer "ss" stattdessen (z.B. "gross" statt "groß", "Strasse" statt "Straße"). UMLAUTE IMMER VERWENDEN: Schreibe ä, ö, ü, Ä, Ö, Ü - niemals ae, oe, ue als Ersatz (z.B. "Führungskraft" nicht "Fuehrungskraft", "können" nicht "koennen"). Bullet Points enden NIEMALS mit einem Punkt - lasse das Satzzeichen am Ende weg.';

    let systemPrompt: string;
    let userPrompt: string;

    if (type === 'growth') {
      systemPrompt = `Du bist ein erfahrener Headhunter und HR-Experte. Basierend auf dem Kandidatenprofil sollst du 3-5 kurze Bullet Points zum Growth Potential des Kandidaten formulieren.

Fokussiere auf:
- Erkennbare Entwicklungsmuster in der Karriere
- Potentielle nächste Karriereschritte
- Lernfähigkeit und Anpassungsfähigkeit
- Führungspotential
- Branchenwechsel-Potential

Antworte NUR mit einem JSON-Array von Strings, z.B.:
["Punkt 1", "Punkt 2", "Punkt 3"]

Jeder Punkt sollte prägnant sein (max. 15 Wörter).${swissGermanRule}`;
      userPrompt = `Analysiere das Growth Potential dieses Kandidaten:\n${candidateContext}`;
    } else if (type === 'generate_risks') {
      systemPrompt = `Du bist ein erfahrener Headhunter und HR-Experte. Basierend auf dem Kandidatenprofil sollst du 3-5 potentielle Risiken und Annahmen identifizieren, die bei der Platzierung dieses Kandidaten berücksichtigt werden sollten.

Analysiere kritisch:
- Lücken im Lebenslauf oder häufige Jobwechsel
- Fehlende Qualifikationen oder Erfahrungen für typische Zielpositionen
- Mögliche kulturelle oder geografische Einschränkungen
- Gehaltserwartungen vs. Marktwert
- Mögliche Überqualifikation oder Unterqualifikation
- Wechselmotivation und Bindungspotential

Formuliere die Risiken:
- Neutral und sachlich, nicht wertend
- Als Überlegungen für den Recruiter, nicht als Urteile
- Mit konkreten Hinweisen, was abgeklärt werden sollte

Antworte NUR mit einem JSON-Array von Strings, z.B.:
["Risiko 1", "Risiko 2", "Risiko 3"]

Jeder Punkt sollte prägnant sein (max. 20 Wörter).${swissGermanRule}`;
      userPrompt = `Analysiere potentielle Risiken und Annahmen für diesen Kandidaten:\n${candidateContext}`;
    } else if (type === 'achievements') {
      systemPrompt = `Du bist ein erfahrener Headhunter. Formatiere die folgenden Stichworte oder Notizen zu den Signature Achievements eines Kandidaten in professionelle, prägnante Bullet Points.

Regeln:
- Formuliere jedes Achievement als klaren, wirkungsvollen Satz
- Beginne jeden Punkt mit einem starken Verb oder einer quantifizierbaren Leistung
- Halte jeden Punkt auf maximal 20 Wörter
- Behalte die Kernaussagen bei, verbessere nur die Formulierung
- Antworte NUR mit einem JSON-Array von Strings

Beispiel:
Input: "Umsatz gesteigert, Team aufgebaut, Prozesse optimiert"
Output: ["Umsatzsteigerung von 30% durch strategische Neukundengewinnung", "Aufbau und Führung eines 12-köpfigen Teams", "Optimierung der Kernprozesse mit 25% Effizienzgewinn"]${swissGermanRule}`;
      userPrompt = `Formatiere diese Achievements professionell:\n${inputText}\n\nKontext zum Kandidaten:\n${candidateContext}`;
    } else if (type === 'risks') {
      systemPrompt = `Du bist ein erfahrener Headhunter. Formatiere die folgenden Stichworte oder Notizen zu potentiellen Risiken und Annahmen über einen Kandidaten in klare, professionelle Bullet Points.

Regeln:
- Formuliere jeden Punkt neutral und sachlich
- Stelle Risiken als potentielle Überlegungen dar, nicht als Urteile
- Halte jeden Punkt auf maximal 20 Wörter
- Antworte NUR mit einem JSON-Array von Strings

Beispiel:
Input: "wenig Führungserfahrung, häufige Jobwechsel"
Output: ["Begrenzte direkte Führungserfahrung - könnte Einarbeitung benötigen", "Durchschnittliche Verweildauer von 2 Jahren - Motivation für langfristige Bindung abklären"]${swissGermanRule}`;
      userPrompt = `Formatiere diese Risiken/Annahmen professionell:\n${inputText}\n\nKontext zum Kandidaten:\n${candidateContext}`;
} else if (type === 'notes') {
      systemPrompt = `Du bist ein erfahrener Headhunter. Formatiere die folgenden persönlichen Einschätzungen und Beobachtungen zu einem Kandidaten in klare, professionelle Bullet Points.

WICHTIG: Insights Notes sind persönliche Kommentare des Headhunters über die PERSON, nicht über die Karriere.

Fokussiere auf:
- Charaktereigenschaften und Persönlichkeit
- Motivation und Antrieb
- Soft Skills und zwischenmenschliche Fähigkeiten
- Arbeitsweise und Einstellung
- Persönlicher Eindruck aus Gesprächen
- Kulturelle Passung und Teamfähigkeit

NICHT fokussieren auf:
- Karrierebezogene Fakten (die gehören in andere Felder)
- Technische Skills oder Qualifikationen

Regeln:
- Formuliere jeden Punkt als prägnante persönliche Beobachtung
- Behalte den authentischen Charakter bei, aber professionalisiere die Sprache
- Halte jeden Punkt auf maximal 20 Wörter
- Wähle am Ende GENAU 3 Kernwerte (einzelne Wörter) aus, die den Kandidaten am besten beschreiben
- Antworte mit einem JSON-Objekt: { "notes": ["Punkt 1", "Punkt 2"], "values": ["Wert1", "Wert2", "Wert3"] }

Beispiel:
Input: "sehr sympathisch, kommunikativ, könnte gut ins team passen, hoch motiviert"
Output: { "notes": ["Aussergewöhnlich sympathische und offene Persönlichkeit", "Starke Kommunikationsfähigkeit in Gesprächen erkennbar", "Hohe intrinsische Motivation und spürbarer Antrieb"], "values": ["Authentizität", "Teamgeist", "Engagement"] }${swissGermanRule}`;
      userPrompt = `Formatiere diese persönlichen Einschätzungen über den Kandidaten (Charakter, Motivation, Soft Skills) und wähle 3 passende Kernwerte:\n${inputText}\n\nKontext zum Kandidaten:\n${candidateContext}`;
} else if (type === 'proud') {
      systemPrompt = `Du bist ein erfahrener Headhunter. Formatiere die folgenden Stichworte darüber, worauf ein Kandidat PRIVAT am meisten stolz ist, in professionelle Bullet Points.

WICHTIG - FOKUS AUF PRIVATLEBEN:
"Most Proud Of" handelt von PRIVATEN Momenten und persönlichen Meilensteinen, NICHT von Karriereerfolgen!
(Karriereerfolge gehören in "Signature Achievements")

Beispiele für "Most Proud Of":
- Familie (Heirat, Kinder, Beziehungen)
- Persönliche Reisen und Abenteuer
- Hobbys und persönliche Projekte
- Ehrenamtliches Engagement
- Sportliche Leistungen (privat, nicht beruflich)
- Persönliche Überwindungen oder Herausforderungen
- Kreative Projekte (Musik, Kunst, Schreiben)

Regeln:
- Formuliere jeden Punkt als prägnante, wertschätzende Aussage
- Fokussiere auf PRIVATE, nicht berufliche Erfolge
- Falls der Input karrierebezogen ist, frage dich: Gibt es einen privaten Aspekt? Wenn nicht, weise darauf hin, dass dies eher in Signature Achievements gehört
- Respektvoll und warmherzig formulieren
- Halte jeden Punkt auf maximal 20 Wörter
- Antworte NUR mit einem JSON-Array von Strings

Beispiel:
Input: "Familie gegründet, Weltreise, Marathon gelaufen"
Output: ["Stolzer Familienvater mit zwei Kindern und erfülltem Privatleben", "Unvergessliche Weltreise als Ausdruck von Neugier und Abenteuerlust", "Persönlicher Meilenstein: Erster Marathon erfolgreich absolviert"]${swissGermanRule}`;
      userPrompt = `Formatiere diese PRIVATEN Momente (worauf ist der Kandidat persönlich stolz - NICHT Karriere):\n${inputText}\n\nKontext zum Kandidaten:\n${candidateContext}`;
    } else {
      systemPrompt = `Du bist ein erfahrener Headhunter. Schreibe eine prägnante, professionelle Zusammenfassung für ein Firmenexposé über den Kandidaten. 

Die Zusammenfassung soll:
- Maximal 40 Wörter lang sein
- Den Kandidaten positiv aber authentisch darstellen
- Die wichtigsten Qualifikationen und Stärken hervorheben
- Für potentielle Arbeitgeber ansprechend sein
- In der dritten Person geschrieben sein
- Auf Deutsch sein
- KEINE Aufzählungszeichen, Sterne (*), Bindestriche (-) oder Bullet Points verwenden — nur fliessender Text${swissGermanRule}

Antworte NUR mit der Zusammenfassung, ohne Anführungszeichen oder zusätzlichen Text.`;
      userPrompt = `Erstelle eine professionelle Kurzzusammenfassung für diesen Kandidaten:\n${candidateContext}`;
    }

    // Use direct Gemini API instead of Lovable gateway
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('No content in Gemini response:', JSON.stringify(data));
      throw new Error('No content in AI response');
    }

    // Helper to cache and return response
    const cacheAndReturn = async (responseData: any) => {
      if (isCacheable && serviceClient && cacheKey) {
        const ttl7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await serviceClient.from('ai_cache').upsert({
          function_name: 'generate-candidate-summary',
          cache_key: cacheKey,
          response_data: responseData,
          expires_at: ttl7Days,
        }, { onConflict: 'function_name,cache_key' });
        console.log(`✅ Cached generate-candidate-summary (${type})`);
      }
      return new Response(JSON.stringify(responseData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    };

    // Parse JSON array for types that return arrays
    if (['growth', 'generate_risks', 'achievements', 'risks', 'notes', 'proud'].includes(type)) {
      try {
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleanContent);
        
        // Special handling for notes type which returns { notes: [], values: [] }
        if (type === 'notes' && parsed.notes && parsed.values) {
          const responseData = { insights_notes: parsed.notes, candidate_values: parsed.values.slice(0, 3) };
          return cacheAndReturn(responseData);
        }
        
        const resultKey = type === 'growth' ? 'growth_potential' : 
                         type === 'generate_risks' ? 'potential_risks' :
                         type === 'achievements' ? 'signature_achievements' :
                         type === 'risks' ? 'potential_risks' : 
                         type === 'proud' ? 'most_proud_of' : 'insights_notes';
        return cacheAndReturn({ [resultKey]: parsed });
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        const points = content.split('\n').filter((line: string) => line.trim()).slice(0, 5);
        const resultKey = type === 'growth' ? 'growth_potential' : 
                         type === 'generate_risks' ? 'potential_risks' :
                         type === 'achievements' ? 'signature_achievements' :
                         type === 'risks' ? 'potential_risks' : 
                         type === 'proud' ? 'most_proud_of' : 'insights_notes';
        return cacheAndReturn({ [resultKey]: points });
      }
    } else {
      return cacheAndReturn({ summary: content.trim() });
    }

  } catch (error) {
    console.error('Error in generate-candidate-summary:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
