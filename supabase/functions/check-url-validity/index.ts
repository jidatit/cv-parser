const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
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
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ valid: false, status: 0, error: 'Invalid URL format', contentStatus: 'invalid' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      
      // Get page content for analysis
      if (response.ok) {
        pageContent = await response.text();
      }
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          status: 0, 
          error: 'Connection failed or timeout',
          contentStatus: 'unreachable'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const httpValid = response.status >= 200 && response.status < 400;
    
    // If HTTP request failed, return immediately
    if (!httpValid) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          status: response.status,
          statusText: response.statusText,
          contentStatus: 'unreachable'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    let contentStatus: 'active' | 'expired' | 'uncertain' = 'uncertain';
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
      /<h[1-3][^>]*>.*?\d{1,3}\s*[-–]\s*\d{1,3}\s*%/i,  // Percentage range like 80-100%
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

    // 7. NEW: Search page indicators
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

    // 8. NEW: Multiple job listings detection
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
      // NEW: Redirect detection - detail URL redirected to search/list page
      contentStatus = 'expired';
      analysisReason = 'Die Detail-URL wurde auf eine Suchseite umgeleitet - die Stelle existiert nicht mehr.';
      skipAiAnalysis = true;
    } else if (hasJobIdInUrl && hasSearchPageIndicators) {
      // NEW: URL has job ID but page shows search results
      contentStatus = 'expired';
      analysisReason = 'Die Stellen-URL zeigt eine Suchseite statt der spezifischen Stelle - die Stelle existiert nicht mehr.';
      skipAiAnalysis = true;
    } else if (hasJobIdInUrl && hasMultipleJobListings && !hasJobTitle) {
      // NEW: URL has job ID but page shows multiple listings without a specific job title
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
    const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    
    if (!skipAiAnalysis && GOOGLE_GEMINI_API_KEY && textContent.length > 100) {
      try {
        const analysisText = textContent.slice(0, 8000);

        // IMPROVED AI PROMPT with explicit single job vs. list distinction
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
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
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
          
          // Extract JSON from response
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const analysis = JSON.parse(jsonMatch[0]);
              
              // Use AI analysis results
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
        // Continue without AI analysis if it fails
      }
    }

    return new Response(
      JSON.stringify({ 
        valid: httpValid, 
        status: response.status,
        statusText: response.statusText,
        contentStatus,
        analysisReason,
        // Debug info (can be removed in production)
        debug: {
          wasRedirectedToSearch,
          hasSearchPageIndicators,
          hasMultipleJobListings,
          hasJobIdInUrl,
          hasJobTitle,
          hasJobKeywords,
          jobCardCount
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        valid: false, 
        status: 0, 
        error: errorMessage,
        contentStatus: 'uncertain'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
