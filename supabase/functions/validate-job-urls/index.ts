import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationResult {
  status: 'active' | 'expired' | 'uncertain' | 'unreachable' | 'invalid';
  reason: string;
}

async function validateUrl(url: string, geminiApiKey: string | undefined): Promise<ValidationResult> {
  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { status: 'invalid', reason: 'Ungültiges URL-Format' };
  }

  // Fetch the page content
  let response: Response;
  let pageContent = '';
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      pageContent = await response.text();
    }
  } catch (fetchError) {
    console.error('Fetch error:', fetchError);
    return { status: 'unreachable', reason: 'Verbindung fehlgeschlagen oder Timeout' };
  }

  const httpValid = response.status >= 200 && response.status < 400;
  
  if (!httpValid) {
    return { status: 'unreachable', reason: `HTTP ${response.status}: ${response.statusText}` };
  }

  // ========== REDIRECT DETECTION ==========
  const finalUrl = response.url;
  const originalPath = parsedUrl.pathname;
  const finalPath = new URL(finalUrl).pathname;
  
  // Check if soft-redirect occurred (detail URL -> search page)
  const wasRedirectedToSearch = 
    (originalPath.includes('/detail/') && !finalPath.includes('/detail/')) ||
    (originalPath.match(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i) && 
     !finalPath.match(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i));

  // ========== HEURISTIC PRE-CHECKS ==========
  let contentStatus: ValidationResult['status'] = 'uncertain';
  let analysisReason = '';
  let skipAiAnalysis = false;

  // 1. Check for empty job containers (common in SPAs)
  const emptyContainerPatterns = [
    /<div[^>]*id=["']?(singlejob|job-details|job-content|jobDetails|job-description|vacancy-details|position-details)[^>]*>\s*<\/div>/i,
    /<div[^>]*class=["'][^"']*job[^"']*["'][^>]*>\s*<\/div>/i,
    /<section[^>]*id=["']?(job|vacancy|position)[^>]*>\s*<\/section>/i,
  ];
  
  const hasEmptyJobContainer = emptyContainerPatterns.some(pattern => pattern.test(pageContent));

  // 2. Extended URL patterns for job IDs (including UUIDs)
  const hasJobIdInUrl = 
    /[?&\/](job|stelle|position|vacancy|karriere|career|detail)[=\/]?\d+/i.test(url) ||
    /\/jobs?\/\d+/i.test(url) ||
    /\/stellen?\/\d+/i.test(url) ||
    // UUID Pattern (jobs.ch, etc.)
    /\/(detail|job|stelle|vacancy|position)\/[a-f0-9-]{36}/i.test(url) ||
    // Any UUID in path that looks like a job ID
    /\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(url);
  
  // 3. Look for job title patterns in page content
  const jobTitlePatterns = [
    /<h[1-3][^>]*>.*?(m\/w\/d|w\/m\/d|\(m\/w\/d\)|\(w\/m\/d\))/i,
    /<h[1-3][^>]*>.*?\d{1,3}\s*[-–]\s*\d{1,3}\s*%/i,
    /<h[1-3][^>]*>.*?(Vollzeit|Teilzeit|Full-?time|Part-?time)/i,
    /class=["'][^"']*job-title[^"']*["'][^>]*>[^<]+</i,
  ];
  
  const hasJobTitle = jobTitlePatterns.some(pattern => pattern.test(pageContent));

  // 4. Extract and analyze text content
  const textContent = pageContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 5. Check for job-specific keywords
  const jobKeywords = [
    /Ihre Aufgaben|Your Tasks|Responsibilities|Aufgabenbereich/i,
    /Anforderungen|Requirements|Was Sie mitbringen|Ihr Profil/i,
    /Wir bieten|We offer|Benefits|Unser Angebot/i,
    /Bewerbung|Apply|Jetzt bewerben|Bewerbungsunterlagen/i,
  ];
  
  const hasJobKeywords = jobKeywords.filter(pattern => pattern.test(textContent)).length >= 2;

  // 6. Check for "expired" indicators in text
  const expiredPatterns = [
    /stelle.*bereits.*besetzt/i,
    /position.*already.*filled/i,
    /nicht.*mehr.*verfügbar/i,
    /no.*longer.*available/i,
    /stellenanzeige.*abgelaufen/i,
    /job.*expired/i,
    /bewerbungsfrist.*abgelaufen/i,
    /deadline.*passed/i,
  ];
  
  const hasExpiredIndicator = expiredPatterns.some(pattern => pattern.test(textContent));

  // 7. Search page indicators
  const searchPagePatterns = [
    /alle\s*filter/i,
    /filter\s*zurücksetzen/i,
    /suchergebnisse/i,
    /\d+\s*(stellen|jobs|ergebnisse)\s*(gefunden|anzeigen)/i,
    /sortieren\s*nach/i,
    /weitere\s*stellen/i,
    /ähnliche\s*stellen/i,
  ];
  const hasSearchPageIndicators = searchPagePatterns.filter(p => p.test(textContent)).length >= 2;

  // 8. Multiple job listings detection
  const jobCardPatterns = [
    /class=["'][^"']*(job-card|job-item|job-listing|stellenangebot|vacancy-card|position-card|search-result-item)[^"']*["']/gi,
    /data-job-id=["'][^"']+["']/gi,
    /<article[^>]*class=["'][^"']*job[^"']*["']/gi,
  ];
  
  let jobCardCount = 0;
  for (const pattern of jobCardPatterns) {
    const matches = pageContent.match(pattern);
    if (matches) {
      jobCardCount += matches.length;
    }
  }
  const hasMultipleJobListings = jobCardCount > 3;

  // Apply heuristics before AI analysis
  if (hasExpiredIndicator) {
    contentStatus = 'expired';
    analysisReason = 'Die Seite enthält Hinweise, dass die Stelle nicht mehr verfügbar ist.';
    skipAiAnalysis = true;
  } else if (wasRedirectedToSearch) {
    contentStatus = 'expired';
    analysisReason = 'Die Detail-URL wurde auf eine Suchseite umgeleitet - die Stelle existiert nicht mehr.';
    skipAiAnalysis = true;
  } else if (hasJobIdInUrl && hasSearchPageIndicators) {
    contentStatus = 'expired';
    analysisReason = 'Die Stellen-URL zeigt eine Suchseite statt der spezifischen Stelle - die Stelle existiert nicht mehr.';
    skipAiAnalysis = true;
  } else if (hasJobIdInUrl && hasMultipleJobListings && !hasJobTitle) {
    contentStatus = 'expired';
    analysisReason = 'Die Seite zeigt mehrere Stellenangebote statt einer einzelnen Stelle - die ursprüngliche Stelle ist nicht mehr verfügbar.';
    skipAiAnalysis = true;
  } else if (hasEmptyJobContainer) {
    contentStatus = 'expired';
    analysisReason = 'Keine Stellendetails auf der Seite gefunden (JavaScript-gerenderte Seite ohne Inhalt).';
    skipAiAnalysis = true;
  } else if (hasJobIdInUrl && !hasJobTitle && !hasJobKeywords) {
    contentStatus = 'expired';
    analysisReason = 'URL enthält Stellen-ID, aber keine spezifischen Stelleninformationen wurden gefunden.';
    skipAiAnalysis = true;
  } else if (textContent.length < 500 && !hasJobKeywords) {
    contentStatus = 'uncertain';
    analysisReason = 'Zu wenig Inhalt auf der Seite, um die Stelle zu verifizieren.';
    skipAiAnalysis = true;
  }

  // ========== AI ANALYSIS (if heuristics didn't determine status) ==========
  if (!skipAiAnalysis && geminiApiKey && textContent.length > 100) {
    try {
      const analysisText = textContent.slice(0, 8000);

      const aiPrompt = `Analysiere diesen Webseiteninhalt und bestimme, ob eine SPEZIFISCHE Stellenanzeige noch aktiv ist.

WICHTIG: Du prüfst ob EINE EINZELNE, KONKRETE Stelle angezeigt wird - NICHT ob die Seite irgendwelche Stellen listet!

AKTIV (nur wenn EINE spezifische Stelle mit allen Details):
- EIN konkreter Stellentitel prominent angezeigt (z.B. "Immobilienbewirtschafter (m/w) 70-100%")
- Detaillierte Aufgabenbeschreibung für DIESE EINE Stelle
- Anforderungen/Profil für DIESE EINE Stelle
- "Jetzt bewerben" Button für DIESE spezifische Stelle
- Firmenbeschreibung des Arbeitgebers für DIESE Stelle

EXPIRED/NICHT VORHANDEN (eine dieser Bedingungen reicht):
- Seite zeigt MEHRERE Stellenangebote (= Suchseite/Liste, nicht Detailseite)
- Suchfilter, "Alle Filter", "Sortieren nach" sichtbar
- "X Stellen gefunden" oder ähnliche Listenbeschreibung
- Keine spezifische Aufgabenbeschreibung für eine einzelne Stelle
- Generische Karriereseite ohne konkrete Position
- "Stelle nicht mehr verfügbar" Meldungen
- Nur allgemeine Firmeninformationen ohne spezifische Stellendetails

UNSICHER:
- Seite lädt noch / JavaScript-Rendering nötig
- Nicht eindeutig ob Detail- oder Listenseite

WEBSEITENINHALT:
${analysisText}

Antworte NUR im JSON-Format:
{
  "status": "active" | "expired" | "uncertain",
  "reason": "Kurze Begründung auf Deutsch",
  "isSearchPage": true/false,
  "jobCount": Anzahl der sichtbaren Stellen (1 = Detailseite, >1 = Liste)
}`;

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: aiPrompt
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 300,
            }
          })
        }
      );

      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json();
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const analysis = JSON.parse(jsonMatch[0]);
            
            if (analysis.status) {
              contentStatus = analysis.status;
            }
            if (analysis.reason) {
              analysisReason = analysis.reason;
            }
            
            // Additional check: if AI detected it's a search page or multiple jobs
            if (analysis.isSearchPage === true || (analysis.jobCount && analysis.jobCount > 1)) {
              contentStatus = 'expired';
              analysisReason = analysis.reason || 'Die Seite zeigt mehrere Stellen statt einer einzelnen Stellenanzeige.';
            }
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
          }
        }
      }
    } catch (aiError) {
      console.error('AI analysis error:', aiError);
    }
  }

  return { status: contentStatus, reason: analysisReason };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { limit, skipExisting, onlyWithoutContent, revalidateActive } = await req.json().catch(() => ({}));
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build query for jobs to validate
    let query = supabase
      .from('jobs')
      .select('id, title, source_url, source_url_status, requirements, responsibilities, description')
      .neq('status', 'Archived')
      .not('source_url', 'is', null);

    // NEW: Option to revalidate jobs that are currently marked as active
    if (revalidateActive) {
      query = query.eq('source_url_status', 'active');
    } else if (skipExisting) {
      query = query.is('source_url_status', null);
    }

    if (onlyWithoutContent) {
      query = query
        .or('requirements.is.null,requirements.eq.,requirements.eq.<p></p>')
        .or('responsibilities.is.null,responsibilities.eq.,responsibilities.eq.<p></p>')
        .or('description.is.null,description.eq.,description.eq.<p></p>');
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data: jobs, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'Keine Stellen zur Validierung gefunden',
          stats: { total: 0, active: 0, expired: 0, uncertain: 0, unreachable: 0, invalid: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting validation of ${jobs.length} jobs...`);

    const stats = {
      total: jobs.length,
      active: 0,
      expired: 0,
      uncertain: 0,
      unreachable: 0,
      invalid: 0,
      errors: 0,
    };

    const results: { id: string; title: string; status: string; reason: string }[] = [];

    // Process jobs with rate limiting (1 second delay between requests)
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      
      console.log(`[${i + 1}/${jobs.length}] Validating: ${job.title}`);

      try {
        const result = await validateUrl(job.source_url!, geminiApiKey);
        
        // Update the job record
        const { error: updateError } = await supabase
          .from('jobs')
          .update({
            source_url_status: result.status,
            source_url_checked_at: new Date().toISOString(),
            source_url_reason: result.reason,
          })
          .eq('id', job.id);

        if (updateError) {
          console.error(`Failed to update job ${job.id}:`, updateError);
          stats.errors++;
        } else {
          stats[result.status as keyof typeof stats]++;
          results.push({
            id: job.id,
            title: job.title,
            status: result.status,
            reason: result.reason,
          });
        }
      } catch (error) {
        console.error(`Error validating job ${job.id}:`, error);
        stats.errors++;
      }

      // Rate limiting: wait 1 second between requests to avoid overwhelming APIs
      if (i < jobs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('Validation complete:', stats);

    return new Response(
      JSON.stringify({
        message: `Validierung abgeschlossen: ${stats.total} Stellen geprüft`,
        stats,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in validate-job-urls:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
