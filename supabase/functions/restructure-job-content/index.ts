import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-language',
};

const BATCH_SIZE = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: authError } = await authClient.auth.getClaims(token);
  if (authError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch external jobs with long description but little/no content in other fields
    const { data: allJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, title, description, responsibilities, requirements, benefits')
      .eq('status', 'External')
      .not('description', 'is', null);

    if (fetchError) throw new Error(`Failed to fetch jobs: ${fetchError.message}`);

    // Filter: description > 300 chars AND (responsibilities + requirements) combined < 50 chars or null
    const jobsToProcess = (allJobs || []).filter(job => {
      const descLen = (job.description || '').length;
      if (descLen <= 300) return false;

      const respLen = (job.responsibilities || '').length;
      const reqLen = (job.requirements || '').length;
      const combinedOtherFields = respLen + reqLen;

      // Other fields have very little content compared to description
      return combinedOtherFields < 50;
    });

    const totalFound = jobsToProcess.length;
    const batch = jobsToProcess.slice(0, BATCH_SIZE);

    console.log(`Found ${totalFound} external jobs needing restructuring, processing batch of ${batch.length}`);

    const results = {
      total_found: totalFound,
      restructured: 0,
      failed: 0,
      remaining: Math.max(0, totalFound - BATCH_SIZE),
      details: [] as { id: string; title: string; status: string }[],
    };

    for (const job of batch) {
      try {
        const structured = await restructureWithGemini(geminiKey, job.description!, job.title);

        if (!structured) {
          results.failed++;
          results.details.push({ id: job.id, title: job.title, status: 'gemini_failed' });
          continue;
        }

        const updates: Record<string, string> = {
          updated_at: new Date().toISOString(),
        };

        if (structured.description) updates.description = structured.description;
        if (structured.responsibilities) updates.responsibilities = structured.responsibilities;
        if (structured.requirements) updates.requirements = structured.requirements;
        if (structured.benefits) updates.benefits = structured.benefits;

        const { error: updateError } = await supabase
          .from('jobs')
          .update(updates)
          .eq('id', job.id);

        if (updateError) {
          console.error(`Failed to update job ${job.title}:`, updateError.message);
          results.failed++;
          results.details.push({ id: job.id, title: job.title, status: 'update_failed' });
        } else {
          results.restructured++;
          results.details.push({ id: job.id, title: job.title, status: 'success' });
          console.log(`✓ Restructured: ${job.title}`);
        }
      } catch (err) {
        console.error(`Error processing job ${job.title}:`, err);
        results.failed++;
        results.details.push({ id: job.id, title: job.title, status: 'error' });
      }
    }

    console.log(`Restructuring complete: ${results.restructured} success, ${results.failed} failed, ${results.remaining} remaining`);

    return new Response(JSON.stringify({
      success: true,
      message: `${results.restructured} Stellen restrukturiert${results.remaining > 0 ? `, ${results.remaining} verbleibend` : ''}`,
      stats: results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in restructure-job-content:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function restructureWithGemini(
  apiKey: string,
  description: string,
  title: string
): Promise<{ description: string; responsibilities: string; requirements: string; benefits: string } | null> {
  const prompt = `Du bist ein Experte für Stelleninserate. Der folgende Text ist eine komplette Stellenbeschreibung die als Fliesstext in einem einzigen Feld gespeichert wurde. Teile den Text in die korrekten Kategorien auf.

WICHTIGE REGELN:
- Übernimm den Text möglichst wortgetreu, korrigiere nur offensichtliche Fehler
- Verwende Schweizer Hochdeutsch: "ss" statt "ß" (z.B. "Strasse" nicht "Straße")
- Formatiere Auflistungen als HTML-Listen mit <ul><li>...</li></ul>
- Einzelne Punkte als <li>-Elemente, KEINE Bullet-Zeichen (•) im Text
- Die Einleitung/Firmenbeschreibung bleibt als Fliesstext (kein HTML nötig)
- Wenn eine Kategorie nicht im Text vorkommt, gib einen leeren String zurück

Stellentitel: ${title}

TEXT:
${description}

Antworte NUR mit einem JSON-Objekt in diesem Format (keine Erklärungen, kein Markdown):
{
  "description": "Einleitung und Firmenbeschreibung (kurzer Intro-Text)",
  "responsibilities": "<ul><li>Aufgabe 1</li><li>Aufgabe 2</li></ul>",
  "requirements": "<ul><li>Anforderung 1</li><li>Anforderung 2</li></ul>",
  "benefits": "<ul><li>Benefit 1</li><li>Benefit 2</li></ul>"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('No text in Gemini response');
      return null;
    }

    // Extract JSON from response (handle possible markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Gemini response:', text.substring(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Enforce Swiss German
    const swissify = (s: string) => s ? s.replace(/ß/g, 'ss') : '';

    return {
      description: swissify(parsed.description || ''),
      responsibilities: swissify(parsed.responsibilities || ''),
      requirements: swissify(parsed.requirements || ''),
      benefits: swissify(parsed.benefits || ''),
    };
  } catch (err) {
    console.error('Gemini restructure error:', err);
    return null;
  }
}
