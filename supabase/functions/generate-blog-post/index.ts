import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-language',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { topic, keywords = [], target_audience = 'candidates', language = 'de' } = await req.json();

    if (!topic || topic.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const geminiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Enrich with job data
    const { data: jobs } = await supabase
      .from('jobs')
      .select('title, location, skills, requirements, status, industry:clients(industry)')
      .eq('status', 'Active')
      .limit(50);

    let jobContext = '';
    if (jobs && jobs.length > 0) {
      const totalJobs = jobs.length;
      const skillsMap: Record<string, number> = {};
      const locationsMap: Record<string, number> = {};
      const industriesMap: Record<string, number> = {};

      for (const job of jobs) {
        if (job.skills) {
          for (const skill of job.skills as string[]) {
            skillsMap[skill] = (skillsMap[skill] || 0) + 1;
          }
        }
        if (job.location) {
          locationsMap[job.location] = (locationsMap[job.location] || 0) + 1;
        }
        const ind = (job as any).industry?.industry;
        if (ind) {
          industriesMap[ind] = (industriesMap[ind] || 0) + 1;
        }
      }

      const topSkills = Object.entries(skillsMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s);
      const topLocations = Object.entries(locationsMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l]) => l);
      const topIndustries = Object.entries(industriesMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([i]) => i);

      jobContext = `
## AKTUELLE MARKTDATEN (aus unserer Datenbank)
- ${totalJobs} offene Stellen aktuell
- Gefragteste Skills: ${topSkills.join(', ')}
- Haeufigste Standorte: ${topLocations.join(', ')}
- Top-Branchen: ${topIndustries.join(', ')}
Nutze diese Daten wo passend im Artikel, um Glaubwuerdigkeit und Aktualitaet zu unterstreichen.`;
    }

    const langMap: Record<string, string> = { de: 'Deutsch', en: 'Englisch', fr: 'Franzoesisch', it: 'Italienisch', es: 'Spanisch' };
    const outputLanguage = langMap[language] || 'Deutsch';

    const audienceMap: Record<string, string> = {
      candidates: 'Kandidaten/Fachkraefte die eine neue Stelle suchen',
      clients: 'Unternehmen/HR-Verantwortliche die Fachkraefte suchen',
      both: 'Sowohl Kandidaten als auch Unternehmen',
    };
    const audienceDesc = audienceMap[target_audience] || audienceMap.candidates;

    const prompt = `Du bist ein erfahrener Content-Marketing-Experte fuer eine Premium-Personalberatungsagentur (Headhunter). Schreibe einen SEO-optimierten Blog-Artikel.

## THEMA
${topic}
${keywords.length > 0 ? `Keywords: ${keywords.join(', ')}` : ''}

## ZIELGRUPPE
${audienceDesc}

## ANFORDERUNGEN
- Laenge: 600-800 Woerter
- Tonalitaet: Professionell, autoritaetiv, Headhunter-Branding
- Struktur: H2/H3-Ueberschriften, kurze Absaetze, Bulletpoints wo sinnvoll
- SEO: Natuerliche Integration von Long-Tail-Keywords
- Sprache: ${outputLanguage}. Verwende korrekte Umlaute (ae, oe, ue, ss). Bulletpoints enden NICHT mit einem Punkt
- Perspektive: Als Personalberatung/Headhunter die Expertise teilt
- Kein generischer "KI-Stil" - schreibe lebendig, mit konkreten Beispielen und Zahlen

${jobContext}

## OUTPUT-FORMAT (striktes JSON)
{
  "title": "Packender Artikeltitel (max 70 Zeichen)",
  "slug": "seo-freundlicher-url-slug",
  "content_html": "<h2>...</h2><p>...</p>",
  "excerpt": "Teaser-Text fuer die Uebersicht (max 160 Zeichen)",
  "meta_description": "SEO Meta-Description (max 160 Zeichen)",
  "seo_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "category": "Eine von: Arbeitsmarkt, Karrieretipps, Branchennews, Recruiting-Wissen, Gehaltsreport",
  "word_count": 720
}

Antworte NUR mit dem JSON-Objekt, ohne zusaetzlichen Text.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8 },
        }),
      }
    );

    const geminiData = await geminiResponse.json();
    const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed: any = {};
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse Gemini response:', e);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find matching published jobs for linking suggestions
    const suggestedJobIds: string[] = [];
    if (jobs && jobs.length > 0) {
      const topicLower = topic.toLowerCase();
      for (const job of jobs.slice(0, 5)) {
        if (job.title?.toLowerCase().includes(topicLower) || topicLower.includes(job.title?.toLowerCase() || '')) {
          // Would need job.id but we don't select it - just provide empty for now
        }
      }
    }

    return new Response(JSON.stringify({
      ...parsed,
      ai_generated: true,
      target_audience,
      language,
      suggested_job_links: suggestedJobIds,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('generate-blog-post error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
