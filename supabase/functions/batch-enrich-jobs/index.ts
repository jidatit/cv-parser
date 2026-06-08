import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BATCH_SIZE = 10;
const PERMANENT_ERROR_CODES = [403, 410, 451];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check - validate user is authenticated (skip for service role self-invocations)
  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = authHeader?.replace('Bearer ', '') || '';
  
  // Allow service role key (used by self-invocation chain)
  const isServiceRole = token === serviceRoleKey;
  
  if (!isServiceRole && authHeader?.startsWith('Bearer ')) {
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userData?.user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  try {
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if specific job_ids were passed (from external-job-search fire-and-forget)
    let targetJobIds: string[] | null = null;
    try {
      const body = await req.json();
      if (body?.job_ids && Array.isArray(body.job_ids) && body.job_ids.length > 0) {
        targetJobIds = body.job_ids;
        console.log(`Targeted enrichment for ${targetJobIds.length} specific job IDs`);
      }
    } catch {
      // No body or invalid JSON — proceed with default scan
    }

    let allJobsMissingContent: any[] = [];

    if (targetJobIds) {
      // Targeted mode: fetch only the specified jobs
      const { data: targetedJobs, error: targetFetchError } = await supabase
        .from('jobs')
        .select('id, title, source_url, description, responsibilities, requirements, benefits, salary_range, skills, experience_level, location')
        .in('id', targetJobIds)
        .or('source_url_status.is.null,source_url_status.eq.active');

      if (targetFetchError) throw new Error(`Failed to fetch targeted jobs: ${targetFetchError.message}`);

      allJobsMissingContent = (targetedJobs || []).filter(job => {
        const hasResponsibilities = job.responsibilities && job.responsibilities !== '' && job.responsibilities !== '<p></p>';
        const hasRequirements = job.requirements && job.requirements !== '' && job.requirements !== '<p></p>';
        return !(hasResponsibilities && hasRequirements);
      });

      console.log(`Targeted: ${allJobsMissingContent.length} of ${targetJobIds.length} need content`);
    } else {
      // Default mode: scan all jobs needing enrichment
      const { data: jobsWithUrl, error: fetchError1 } = await supabase
        .from('jobs')
        .select('id, title, source_url, description, responsibilities, requirements, benefits, salary_range, skills, experience_level, location')
        .or('source_url_status.is.null,source_url_status.eq.active')
        .neq('status', 'Archived')
        .neq('status', 'External')
        .not('source_url', 'is', null)
        .order('created_at', { ascending: true })
        .limit(200);

      const { data: externalJobs, error: fetchError2 } = await supabase
        .from('jobs')
        .select('id, title, source_url, description, responsibilities, requirements, benefits, salary_range, skills, experience_level, location')
        .eq('status', 'External')
        .not('source_url', 'is', null)
        .or('source_url_status.is.null,source_url_status.eq.active')
        .order('created_at', { ascending: false })
        .limit(500);

      const fetchError = fetchError1 || fetchError2;
      if (fetchError) throw new Error(`Failed to fetch jobs: ${fetchError.message}`);

      const seenIds = new Set<string>();
      const jobs = [...(externalJobs || []), ...(jobsWithUrl || [])].filter(j => {
        if (seenIds.has(j.id)) return false;
        seenIds.add(j.id);
        return true;
      });

      allJobsMissingContent = jobs.filter(job => {
        const hasDescription = job.description && job.description !== '' && job.description !== '<p></p>';
        const hasResponsibilities = job.responsibilities && job.responsibilities !== '' && job.responsibilities !== '<p></p>';
        const hasRequirements = job.requirements && job.requirements !== '' && job.requirements !== '<p></p>';
        return !(hasDescription && hasResponsibilities && hasRequirements);
      });
    }

    const jobsToProcess = allJobsMissingContent.slice(0, BATCH_SIZE);

    console.log(`Processing batch of ${jobsToProcess.length} (${allJobsMissingContent.length} total missing content)`);

    if (jobsToProcess.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No jobs to process',
        stats: { processed: 0, success: 0, failed: 0, remaining: 0 }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      details: [] as { id: string; title: string; status: string; error?: string }[]
    };

    for (const job of jobsToProcess) {
      results.processed++;
      
      try {
        console.log(`Processing job: ${job.title} (${job.id})`);
        
        let limitedContent: string | null = null;
        
        if (job.source_url) {
          // === SAME FETCH LOGIC AS parse-job-posting ===
          let fetchUrl = job.source_url.trim();
          if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
            fetchUrl = `https://${fetchUrl}`;
          }

          const browserHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
          };

          let textContent = '';
          let contentSufficient = false;

          try {
            let websiteResponse = await fetch(fetchUrl, { headers: browserHeaders, redirect: 'follow' });

            // Retry with Googlebot UA if blocked (same as parse-job-posting)
            if (websiteResponse.status === 403 || websiteResponse.status === 401) {
              console.log(`Retrying ${job.title} with Googlebot UA...`);
              websiteResponse = await fetch(fetchUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                  'Accept': 'text/html',
                },
                redirect: 'follow',
              });
            }

            if (websiteResponse.ok) {
              const htmlContent = await websiteResponse.text();
              textContent = htmlContent
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              contentSufficient = textContent.length > 1000;
              console.log(`Fetched ${job.title}, text length: ${textContent.length}, sufficient: ${contentSufficient}`);
            } else {
              console.warn(`Direct fetch failed for ${job.title}: HTTP ${websiteResponse.status}`);
              // Mark permanent errors as dead
              if (PERMANENT_ERROR_CODES.includes(websiteResponse.status)) {
                console.log(`Marking source_url as dead for ${job.title} (HTTP ${websiteResponse.status})`);
                await supabase.from('jobs').update({ 
                  source_url_status: 'dead', 
                  source_url_reason: `HTTP ${websiteResponse.status}`,
                  updated_at: new Date().toISOString() 
                }).eq('id', job.id);
              }
            }
          } catch (fetchErr) {
            console.warn(`Network error fetching ${job.source_url}:`, fetchErr);
          }

          // Strategy 2: Firecrawl (Headless Browser — renders JavaScript)
          if (!contentSufficient) {
            const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
            if (FIRECRAWL_API_KEY) {
              console.log(`Trying Firecrawl for ${job.title}...`);
              try {
                const fcResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    url: fetchUrl,
                    formats: ['markdown'],
                    onlyMainContent: true,
                    waitFor: 3000,
                  }),
                });
                if (fcResponse.ok) {
                  const fcData = await fcResponse.json();
                  const markdown = fcData.data?.markdown || fcData.markdown || '';
                  if (markdown.length > 500) {
                    textContent = markdown;
                    contentSufficient = true;
                    console.log(`Firecrawl successful for ${job.title}, length: ${markdown.length}`);
                  } else {
                    console.log(`Firecrawl content too short for ${job.title}: ${markdown.length}`);
                  }
                } else {
                  console.warn(`Firecrawl failed for ${job.title}: HTTP ${fcResponse.status}`);
                }
              } catch (fcErr) {
                console.warn(`Firecrawl error for ${job.title}:`, fcErr);
              }
            }
          }

          // Strategy 3: Google Cache fallback (same as parse-job-posting)
          if (!contentSufficient) {
            console.log(`Trying Google Cache for ${job.title}...`);
            try {
              const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(fetchUrl)}`;
              const cacheResponse = await fetch(cacheUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
                redirect: 'follow',
              });
              if (cacheResponse.ok) {
                const cacheHtml = await cacheResponse.text();
                const cacheText = cacheHtml
                  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (cacheText.length > 1000) {
                  textContent = cacheText;
                  contentSufficient = true;
                  console.log(`Google Cache successful for ${job.title}, length: ${cacheText.length}`);
                }
              }
            } catch (cacheErr) {
              console.warn(`Google Cache error for ${job.title}:`, cacheErr);
            }
          }

          // Strategy 4: Gemini Search Grounding (optimized for JS-rendered portals like jobagent.ch, jobs.ch)
          if (!contentSufficient) {
            console.log(`Trying Gemini Search Grounding for ${job.title}...`);
            try {
              // Extract domain for targeted search hints
              let domain = '';
              try { domain = new URL(fetchUrl).hostname; } catch {}
              
              const groundingPrompt = `Finde den vollständigen Inhalt dieser Stellenanzeige: ${fetchUrl}

WICHTIG: Die Seite nutzt Client-Side Rendering (JavaScript). Der Inhalt wird dynamisch nachgeladen und ist NICHT im HTML-Quellcode sichtbar.

Suche gezielt nach dem VOLLSTÄNDIGEN Stelleninserat mit folgenden Informationen:
- Jobtitel und Unternehmen
- Standort / Arbeitsort
- Aufgaben / Verantwortlichkeiten (vollständige Liste)
- Anforderungen / Qualifikationen (vollständige Liste)  
- Benefits / Was wir bieten
- Pensum / Arbeitszeit
- Anstellungsart

${job.title ? `Der Stellentitel lautet: "${job.title}"` : ''}
${domain ? `Die Stelle ist auf ${domain} publiziert.` : ''}

Suche auch auf jobs.ch, jobagent.ch, jobscout24.ch oder der Firmenwebseite nach dieser exakten Stelle, falls die Original-URL nicht abrufbar ist.

Gib den GESAMTEN Text der Stellenanzeige zurück. Formatiere als strukturierten Text mit klaren Abschnitten.`;

              const groundingResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ role: 'user', parts: [{ text: groundingPrompt }] }],
                  tools: [{ googleSearchRetrieval: { dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0.0 } } }],
                  generationConfig: { temperature: 0.0, maxOutputTokens: 8192 }
                }),
              });
              if (groundingResponse.ok) {
                const groundingData = await groundingResponse.json();
                const groundedText = groundingData.candidates?.[0]?.content?.parts?.[0]?.text;
                if (groundedText && groundedText.length > 200) {
                  textContent = groundedText;
                  contentSufficient = true;
                  console.log(`Gemini grounding successful for ${job.title}, length: ${groundedText.length}`);
                }
              }
            } catch (groundingErr) {
              console.warn(`Gemini grounding error for ${job.title}:`, groundingErr);
            }
          }

          if (contentSufficient) {
            const maxLength = 50000;
            limitedContent = textContent.length > maxLength ? textContent.substring(0, maxLength) + '...' : textContent;
          }
        }
        
        // Fallback: restructure existing description ONLY if long enough (>300 chars)
        if (!limitedContent && job.description && job.description.length > 300) {
          console.log(`Fallback: restructuring existing description for ${job.title} (${job.description.length} chars)`);
          const restructured = await restructureDescription(GOOGLE_API_KEY, job.description, job.title);
          if (restructured) {
            const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
            if (restructured.description) updateData.description = restructured.description;
            if (restructured.responsibilities && (!job.responsibilities || job.responsibilities.length < 10)) updateData.responsibilities = restructured.responsibilities;
            if (restructured.requirements && (!job.requirements || job.requirements.length < 10)) updateData.requirements = restructured.requirements;
            if (restructured.benefits && (!job.benefits || job.benefits.length < 10)) updateData.benefits = restructured.benefits;

            const { error: updateError } = await supabase.from('jobs').update(updateData).eq('id', job.id);
            if (updateError) throw new Error(`Failed to update job: ${updateError.message}`);
            
            results.success++;
            results.details.push({ id: job.id, title: job.title, status: 'restructured' });
            console.log(`Successfully restructured job: ${job.title}`);
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }
        
        // If still no content, skip this job entirely — do NOT send garbage to Gemini
        if (!limitedContent) {
          // Mark as dead so it's skipped in future batches
          await supabase.from('jobs').update({ 
            source_url_status: 'dead', 
            source_url_reason: 'All fetch strategies failed',
            updated_at: new Date().toISOString() 
          }).eq('id', job.id);
          console.log(`Marked ${job.title} as dead — will be skipped in future batches`);
          throw new Error(`All fetch strategies failed for ${job.source_url || 'no URL'}, marked as dead`);
        }

        // Call Google Gemini API for URL-based enrichment
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{
                text: `Du bist ein Experte für das Extrahieren von strukturierten Daten aus Stellenanzeigen.

WICHTIGE REGELN:
1. Extrahiere NUR Informationen, die tatsächlich im Dokument vorhanden sind
2. Wenn eine Information NICHT gefunden wird, setze den Wert auf null
3. Formatiere Aufgaben, Anforderungen und Benefits als HTML-Listen: <ul><li>Punkt 1</li><li>Punkt 2</li></ul>
4. KEINE Bullet-Zeichen (•, -, *) im Text verwenden — NUR <ul><li> HTML-Tags
5. Jeder Listenpunkt endet OHNE Punkt

KRITISCH - AUFGABEN UND ANFORDERUNGEN WORTGETREU ÜBERNEHMEN:
- Die Felder "responsibilities" und "requirements" müssen INHALTLICH WORTGETREU aus dem Original übernommen werden
- KEINE Umformulierungen, KEINE Zusammenfassungen, KEINE eigenen Interpretationen
- Kopiere den Inhalt so wie er in der Stellenanzeige steht

WICHTIG - GROSS-/KLEINSCHREIBUNG:
- Text der DURCHGEHEND IN GROSSBUCHSTABEN geschrieben ist, MUSS in normale Gross-/Kleinschreibung konvertiert werden
- JEDER Listenpunkt (<li>) MUSS mit einem Grossbuchstaben beginnen
- Beispiel: "selbstständiges arbeiten" → "Selbstständiges Arbeiten"
- Beispiel: "SENIOR SOFTWARE ENTWICKLER" → "Senior Software Entwickler"
- Verwende korrekte deutsche Grammatik: Substantive gross, Rest klein
- Eigennamen (Firmennamen, Städte, Produkte) behalten ihre korrekte Schreibweise
- Umlaute IMMER verwenden (ä, ö, ü), NICHT ae, oe, ue
- Schweizer Rechtschreibung: "ss" statt "ß"

Stellenanzeige:
${limitedContent}

BENEFITS EXTRAHIEREN:
- Extrahiere Benefits/Vorteile wenn vorhanden
- Maximal 5-7 Punkte, jeder Punkt 4-7 Wörter
- Formuliere ANSPRECHEND und INTERESSANT, nicht langweilig

Antworte NUR mit diesem JSON-Format (keine Erklärung):
{
  "description": "Allgemeine Beschreibung der Position und des Unternehmens als Fliesstext (oder null wenn nicht gefunden)",
  "responsibilities": "<ul><li>Aufgabe 1</li><li>Aufgabe 2</li></ul> — WORTGETREU, jeder Punkt grossgeschrieben (oder null)",
  "requirements": "<ul><li>Anforderung 1</li><li>Anforderung 2</li></ul> — WORTGETREU, jeder Punkt grossgeschrieben (oder null)",
  "benefits": "<ul><li>Benefit 1</li><li>Benefit 2</li></ul> — maximal 5-7 Punkte, je 4-7 Wörter, interessant formuliert (oder null)",
  "salary": "Gehaltsangabe/Lohnspanne wenn vorhanden (oder null wenn nicht gefunden)",
  "experience_level": "Junior, Mid-Level, Senior, Lead etc. (oder null wenn nicht gefunden)",
  "skills": ["Skill1", "Skill2"] oder [] wenn keine gefunden,
  "location": "Arbeitsort/Standort mit PLZ wenn vorhanden (oder null wenn nicht gefunden)"
}`
              }]
            }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 8192,
            }
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Google Gemini API error:', response.status, errorText);
          throw new Error(`Google Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!content) {
          throw new Error('No structured data extracted from job posting');
        }

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const parsedData = JSON.parse(jsonMatch[0]);

        // Swiss German: replace ß with ss
        const replaceEszett = (val: any): any => {
          if (typeof val === 'string') return val.replace(/ß/g, 'ss');
          if (Array.isArray(val)) return val.map((v: any) => typeof v === 'string' ? v.replace(/ß/g, 'ss') : v);
          return val;
        };
        if (parsedData.description) parsedData.description = replaceEszett(parsedData.description);
        if (parsedData.responsibilities) parsedData.responsibilities = replaceEszett(parsedData.responsibilities);
        if (parsedData.requirements) parsedData.requirements = replaceEszett(parsedData.requirements);
        if (parsedData.benefits) parsedData.benefits = replaceEszett(parsedData.benefits);

        console.log('Parsed data for job:', job.title);

        // Build update object - only update fields that are empty and have new data
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        let contentFieldsUpdated = 0;
        
        if (parsedData.description && (!job.description || job.description === '' || job.description === '<p></p>')) {
          updateData.description = parsedData.description;
          contentFieldsUpdated++;
        }
        if (parsedData.responsibilities && (!job.responsibilities || job.responsibilities === '' || job.responsibilities === '<p></p>')) {
          updateData.responsibilities = parsedData.responsibilities;
          contentFieldsUpdated++;
        }
        if (parsedData.requirements && (!job.requirements || job.requirements === '' || job.requirements === '<p></p>')) {
          updateData.requirements = parsedData.requirements;
          contentFieldsUpdated++;
        }
        if (parsedData.benefits && (!job.benefits || job.benefits === '' || job.benefits === '<p></p>')) {
          updateData.benefits = parsedData.benefits;
          contentFieldsUpdated++;
        }
        if (parsedData.salary && (!job.salary_range || job.salary_range === '')) {
          updateData.salary_range = parsedData.salary;
        }
        if (parsedData.experience_level && (!job.experience_level || job.experience_level === '')) {
          updateData.experience_level = parsedData.experience_level;
        }
        if (parsedData.skills && Array.isArray(parsedData.skills) && parsedData.skills.length > 0 && (!job.skills || job.skills.length === 0)) {
          updateData.skills = parsedData.skills;
        }
        if (parsedData.location && (!job.location || job.location === '')) {
          updateData.location = parsedData.location;
        }

        // If no content fields were updated, mark as enriched and count as skipped (not failed)
        if (contentFieldsUpdated === 0) {
          console.log(`No new content fields to update for ${job.title} — marking as source_url_status=enriched to skip in future`);
          await supabase.from('jobs').update({ 
            source_url_status: 'enriched',
            updated_at: new Date().toISOString()
          }).eq('id', job.id);
          results.skipped++;
          results.details.push({ id: job.id, title: job.title, status: 'skipped', error: 'No new content fields to update' });
          continue;
        }

        const { error: updateError } = await supabase
          .from('jobs')
          .update(updateData)
          .eq('id', job.id);

        if (updateError) {
          throw new Error(`Failed to update job: ${updateError.message}`);
        }

        results.success++;
        results.details.push({ id: job.id, title: job.title, status: 'success' });
        console.log(`Successfully updated job: ${job.title} (${contentFieldsUpdated} fields)`);

        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.details.push({ id: job.id, title: job.title, status: 'failed', error: errorMessage });
        console.error(`Failed to process job ${job.title}:`, errorMessage);
      }
    }

    const remainingCount = Math.max(0, allJobsMissingContent.length - results.success - results.skipped);

    // For targeted mode: self-invoke for remaining jobs
    if (targetJobIds && remainingCount > 0) {
      const processedIds = new Set(results.details.map(d => d.id));
      const remainingIds = allJobsMissingContent
        .filter(j => !processedIds.has(j.id))
        .map(j => j.id);
      if (remainingIds.length > 0) {
        console.log(`Self-invoking for ${remainingIds.length} remaining targeted jobs`);
        fetch(`${supabaseUrl}/functions/v1/batch-enrich-jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ job_ids: remainingIds }),
        }).catch(e => console.error('Self-invoke failed:', e));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Batch processing complete`,
      stats: {
        processed: results.processed,
        success: results.success,
        failed: results.failed,
        skipped: results.skipped,
        remaining: remainingCount
      },
      details: results.details
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in batch-enrich-jobs function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Fallback: Restructure an existing long description into separate fields using Gemini.
 */
async function restructureDescription(
  apiKey: string,
  description: string,
  title: string
): Promise<{ description: string; responsibilities: string; requirements: string; benefits: string } | null> {
  const prompt = `Du bist ein Experte für Stelleninserate. Der folgende Text ist eine komplette Stellenbeschreibung die als Fliesstext in einem einzigen Feld gespeichert wurde. Teile den Text in die korrekten Kategorien auf.

WICHTIGE REGELN:
- Übernimm den Text möglichst wortgetreu, korrigiere nur offensichtliche Fehler
- Verwende Schweizer Hochdeutsch: "ss" statt "ß"
- Formatiere Auflistungen als HTML-Listen mit <ul><li>...</li></ul>
- KEINE Bullet-Zeichen (•) im Text
- JEDER Listenpunkt (<li>) MUSS mit einem Grossbuchstaben beginnen
- Wenn eine Kategorie nicht im Text vorkommt, gib einen leeren String zurück

Stellentitel: ${title}

TEXT:
${description.substring(0, 50000)}

Antworte NUR mit einem JSON-Objekt (keine Erklärungen, kein Markdown):
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini restructure error:', response.status);
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
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
