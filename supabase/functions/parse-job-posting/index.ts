import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Helper: fetch with AbortController timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Helper: check if we still have time budget
function checkTimeBudget(startTime: number, label: string) {
  const elapsed = Date.now() - startTime;
  if (elapsed > 50000) {
    throw new Error(`Time budget exceeded at ${label} (${elapsed}ms)`);
  }
  console.log(`[Timer] ${label}: ${elapsed}ms elapsed`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('parse-job-posting called, method:', req.method);

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const token = authHeader.replace('Bearer ', '');
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data, error: authError } = await authClient.auth.getUser(token);
  if (authError || !data?.user) {
    console.error('Auth error:', authError?.message);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { url, manualText } = await req.json();
    
    if (!url && !manualText) {
      throw new Error('No URL or manual text provided');
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    }

    let limitedContent: string | null = null;
    let usedGrounding = false;

    if (manualText) {
      console.log('Using manually pasted text, length:', manualText.length);
      const maxLength = 50000;
      limitedContent = manualText.length > maxLength 
        ? manualText.substring(0, maxLength) + '...'
        : manualText;
    } else {
      console.log('Fetching job posting from URL:', url);

      let fetchUrl = url.trim();
      if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
        fetchUrl = `https://${fetchUrl}`;
      }

      const browserHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      };

      let textContent = '';
      let contentSufficient = false;

      // Direct fetch with 8s timeout
      try {
        let websiteResponse = await fetchWithTimeout(fetchUrl, { headers: browserHeaders, redirect: 'follow' }, 8000);

        // Retry with Googlebot UA if blocked (5s timeout)
        if (websiteResponse.status === 403 || websiteResponse.status === 401) {
          console.log('First attempt blocked, retrying with Googlebot UA...');
          websiteResponse = await fetchWithTimeout(fetchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
              'Accept': 'text/html',
            },
            redirect: 'follow',
          }, 5000);
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
          console.log('Fetched content, text length:', textContent.length, 'sufficient:', contentSufficient);
        } else {
          console.log('Direct fetch failed with status:', websiteResponse.status);
        }
      } catch (fetchErr) {
        console.warn('Direct fetch error (timeout or network):', fetchErr instanceof Error ? fetchErr.message : fetchErr);
      }

      checkTimeBudget(startTime, 'after direct fetch');

      // Strategy 1+2: Firecrawl + Google Cache IN PARALLEL
      if (!contentSufficient) {
        const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
        
        const firecrawlPromise = FIRECRAWL_API_KEY ? (async () => {
          console.log('Trying Firecrawl for URL:', fetchUrl);
          try {
            const fcResponse = await fetchWithTimeout('https://api.firecrawl.dev/v1/scrape', {
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
            }, 12000);
            if (fcResponse.ok) {
              const fcData = await fcResponse.json();
              const markdown = fcData.data?.markdown || fcData.markdown || '';
              if (markdown.length > 500) {
                console.log('Firecrawl successful, length:', markdown.length);
                return markdown;
              }
              console.log('Firecrawl content too short:', markdown.length);
            } else {
              console.warn('Firecrawl failed: HTTP', fcResponse.status);
            }
          } catch (fcErr) {
            console.warn('Firecrawl error:', fcErr instanceof Error ? fcErr.message : fcErr);
          }
          return null;
        })() : Promise.resolve(null);

        const googleCachePromise = (async () => {
          console.log('Trying Google Cache...');
          try {
            const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(fetchUrl)}`;
            const cacheResponse = await fetchWithTimeout(cacheUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html',
              },
              redirect: 'follow',
            }, 5000);
            if (cacheResponse.ok) {
              const cacheHtml = await cacheResponse.text();
              const cacheText = cacheHtml
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              if (cacheText.length > 1000) {
                console.log('Google Cache successful, text length:', cacheText.length);
                return cacheText;
              }
              console.log('Google Cache content too short:', cacheText.length);
            } else {
              console.log('Google Cache failed with status:', cacheResponse.status);
            }
          } catch (cacheErr) {
            console.warn('Google Cache error:', cacheErr instanceof Error ? cacheErr.message : cacheErr);
          }
          return null;
        })();

        const [firecrawlResult, cacheResult] = await Promise.allSettled([firecrawlPromise, googleCachePromise]);
        
        const fcText = firecrawlResult.status === 'fulfilled' ? firecrawlResult.value : null;
        const gcText = cacheResult.status === 'fulfilled' ? cacheResult.value : null;

        // Prefer Firecrawl (usually cleaner markdown), fallback to cache
        if (fcText) {
          textContent = fcText;
          contentSufficient = true;
        } else if (gcText) {
          textContent = gcText;
          contentSufficient = true;
        }
      }

      checkTimeBudget(startTime, 'after Firecrawl+Cache parallel');

      // Strategy 3: Gemini with Google Search Grounding
      if (!contentSufficient) {
        console.log('Trying Gemini with Google Search grounding for URL:', fetchUrl);
        try {
          let domain = '';
          try { domain = new URL(fetchUrl).hostname; } catch {}
          
          const groundingPrompt = `Finde den vollständigen Inhalt dieser Stellenanzeige: ${fetchUrl}

WICHTIG: Die Seite nutzt möglicherweise Client-Side Rendering (JavaScript). Der Inhalt wird dynamisch nachgeladen und ist NICHT im HTML-Quellcode sichtbar.

Suche gezielt nach dem VOLLSTÄNDIGEN Stelleninserat mit folgenden Informationen:
- Jobtitel und Unternehmen
- Standort / Arbeitsort
- Aufgaben / Verantwortlichkeiten (vollständige Liste)
- Anforderungen / Qualifikationen (vollständige Liste)
- Benefits / Was wir bieten
- Pensum / Arbeitszeit
- Anstellungsart

${domain ? `Die Stelle ist auf ${domain} publiziert.` : ''}

Suche auch auf jobs.ch, jobagent.ch, jobscout24.ch oder der Firmenwebseite nach dieser exakten Stelle, falls die Original-URL nicht abrufbar ist.

Gib den GESAMTEN Text der Stellenanzeige zurück. Formatiere als strukturierten Text mit klaren Abschnitten.`;

          const groundingResponse = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: 'user',
                parts: [{ text: groundingPrompt }]
              }],
              tools: [{ googleSearchRetrieval: { dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0.0 } } }],
              generationConfig: { temperature: 0.0, maxOutputTokens: 8192 }
            }),
          }, 15000);

          if (groundingResponse.ok) {
            const groundingData = await groundingResponse.json();
            const groundedText = groundingData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (groundedText && groundedText.length > 200) {
              textContent = groundedText;
              contentSufficient = true;
              usedGrounding = true;
              console.log('Gemini grounding successful, text length:', groundedText.length);
            } else {
              console.log('Gemini grounding returned insufficient content');
            }
          } else {
            console.log('Gemini grounding failed with status:', groundingResponse.status);
          }
        } catch (groundingErr) {
          console.warn('Gemini grounding error:', groundingErr instanceof Error ? groundingErr.message : groundingErr);
        }
      }

      checkTimeBudget(startTime, 'after grounding');

      // Strategy 4: Return blocked error for manual paste
      if (!contentSufficient) {
        console.log('All strategies failed, returning blocked response');
        return new Response(JSON.stringify({
          blocked: true,
          error: 'Die Stellenanzeige konnte nicht automatisch abgerufen werden. Bitte kopiere den Stellentext manuell.',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const maxLength = 50000;
      limitedContent = textContent.length > maxLength 
        ? textContent.substring(0, maxLength) + '...'
        : textContent;
    }

    console.log('Content ready, length:', limitedContent!.length, 'sending to Gemini for parsing...');

    checkTimeBudget(startTime, 'before Gemini parsing');

    // Call Google Gemini API directly to extract structured job data (30s timeout - critical call)
    const geminiBody: any = {
      contents: [{
        role: 'user',
        parts: [{
          text: `Du bist ein Experte für das Extrahieren von strukturierten Daten aus Stellenanzeigen.

WICHTIGE REGELN:
1. Extrahiere NUR Informationen, die tatsächlich im Dokument vorhanden sind
2. Wenn eine Information NICHT gefunden wird, setze den Wert auf null
3. Formatiere Aufgaben und Anforderungen als Bullet Points mit "•" am Anfang jeder Zeile
4. Bullet Points enden NIE mit einem Punkt

KRITISCH - EMPLOYMENT_TYPE BESTIMMEN:
- Wenn "80-100%", "80% - 100%", "80%-100%", "80 - 100%" oder "100%" im Titel oder Text vorkommt → IMMER "Vollzeit" zurückgeben
- Bei niedrigeren Prozentangaben (z.B. 60%, 50%, 40%) → "Teilzeit"
- Wenn explizit "Vollzeit" oder "Full-time" steht → "Vollzeit"
- Wenn explizit "Teilzeit" oder "Part-time" steht → "Teilzeit"
- Ansonsten aus dem Text extrahieren oder null wenn nicht gefunden

KRITISCH - AUFGABEN UND ANFORDERUNGEN WORTGETREU ÜBERNEHMEN:
- Die Felder "responsibilities" und "requirements" müssen EXAKT und WORTGETREU aus dem Original übernommen werden
- KEINE Umformulierungen, KEINE Zusammenfassungen, KEINE eigenen Interpretationen
- Kopiere den Text 1:1 so wie er in der Stellenanzeige steht
- Nur die Formatierung als Bullet Points mit "•" anpassen
- Wenn der Originaltext bereits Aufzählungszeichen hat, ersetze diese durch "•"

WICHTIG - GROSS-/KLEINSCHREIBUNG KORRIGIEREN:
- Text der DURCHGEHEND IN GROSSBUCHSTABEN geschrieben ist, MUSS in normale Gross-/Kleinschreibung konvertiert werden
- Verwende korrekte deutsche Grammatik: Substantive gross, Rest klein
- Eigennamen (Firmennamen, Städte, Produkte) behalten ihre korrekte Schreibweise
- Beispiel: "SENIOR SOFTWARE ENTWICKLER" → "Senior Software Entwickler"
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
  "title": "Jobtitel/Position (oder null wenn nicht gefunden)",
  "company": "Firmenname (oder null wenn nicht gefunden)",
  "location": "Arbeitsort/Standort mit PLZ wenn vorhanden (oder null wenn nicht gefunden)",
  "employment_type": "Vollzeit, Teilzeit, Freelance oder Remote - WICHTIG: 80-100% oder 100% = IMMER Vollzeit (oder null wenn nicht gefunden)",
  "salary": "Gehaltsangabe/Lohnspanne wenn vorhanden - IMMER in CHF angeben, EUR/€ durch CHF ersetzen (oder null wenn nicht gefunden)",
  "description": "Allgemeine Beschreibung der Position und des Unternehmens (oder null wenn nicht gefunden)",
  "responsibilities": "Aufgaben und Tätigkeiten WORTGETREU aus dem Original als Bullet Points mit • - KEINE Umformulierung (oder null wenn nicht gefunden)",
  "requirements": "Anforderungen und Qualifikationen WORTGETREU aus dem Original als Bullet Points mit • - KEINE Umformulierung (oder null wenn nicht gefunden)",
  "benefits": "Benefits als ansprechende Bullet Points mit • - maximal 5-7 Punkte, je 4-7 Wörter, interessant formuliert (oder null wenn nicht gefunden)",
  "experience_level": "Junior, Mid-Level, Senior, Lead etc. (oder null wenn nicht gefunden)",
  "skills": ["Skill1", "Skill2"] oder [] wenn keine gefunden,
  "company_website": "Website/Homepage des Unternehmens wenn im Text erwähnt (oder null wenn nicht gefunden) - NUR die Firmen-Website, NICHT die URL der Stellenanzeige"
}`
        }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
      }
    };

    // No timeout on Gemini parsing - let it use the full Edge Function time budget (~55s remaining)
    // AbortController timeouts cause 500 errors; better to let the Edge Function hard-limit handle it
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Gemini API error:', response.status, errorText);
      throw new Error(`Google Gemini API error: ${response.status}`);
    }

    const geminiData = await response.json();
    console.log('Google Gemini response received');

    const geminiElapsed = Date.now() - startTime;
    console.log(`[Timer] Gemini parsing completed in ${geminiElapsed}ms`);

    // Extract the content from Gemini response format
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      console.error('Unexpected Gemini response structure:', JSON.stringify(geminiData));
      throw new Error('No structured data extracted from job posting');
    }

    // Extract JSON from response with robust cleaning
    const extractAndCleanJson = (response: string): unknown => {
      let cleaned = response
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("No JSON object found in response");
      }

      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

      try {
        return JSON.parse(cleaned);
      } catch (e) {
        cleaned = cleaned
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
          .replace(/[\x00-\x1F\x7F]/g, " ");

        return JSON.parse(cleaned);
      }
    };

    const parsedData = extractAndCleanJson(content) as {
      title?: string;
      company?: string;
      location?: string;
      employment_type?: string;
      salary?: string;
      description?: string;
      responsibilities?: string;
      requirements?: string;
      benefits?: string;
      experience_level?: string;
      skills?: string[];
      company_website?: string;
    };

    const ensureString = (val: unknown): string | null => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) return val.join('\n');
      return String(val);
    };
    parsedData.description = ensureString(parsedData.description);
    parsedData.responsibilities = ensureString(parsedData.responsibilities);
    parsedData.requirements = ensureString(parsedData.requirements);
    parsedData.benefits = ensureString(parsedData.benefits);

    // Convert plain-text bullets ("• item1 • item2") to HTML lists
    const bulletsToHtml = (text: string | null): string | null => {
      if (!text) return text;
      // Already HTML — skip
      if (/<(ul|ol|li)\b/i.test(text)) return text;
      // Split on bullet markers (•, -, *) at line or inline boundaries
      const items = text.split(/(?:^|\n)\s*(?:[•·●◦▪▫‣⁃\-\*])\s*|\s*•\s*/g)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      if (items.length <= 1 && !text.includes('•')) return text; // not a bullet list
      return '<ul>' + items.map(i => `<li>${i.charAt(0).toUpperCase() + i.slice(1)}</li>`).join('') + '</ul>';
    };

    // Swiss German: replace ß with ss
    if (parsedData.description) parsedData.description = parsedData.description.replace(/ß/g, 'ss');
    if (parsedData.responsibilities) parsedData.responsibilities = parsedData.responsibilities.replace(/ß/g, 'ss');
    if (parsedData.requirements) parsedData.requirements = parsedData.requirements.replace(/ß/g, 'ss');
    if (parsedData.benefits) parsedData.benefits = parsedData.benefits.replace(/ß/g, 'ss');

    // Convert bullet fields to HTML lists (after ß replacement)
    parsedData.responsibilities = bulletsToHtml(parsedData.responsibilities);
    parsedData.requirements = bulletsToHtml(parsedData.requirements);
    parsedData.benefits = bulletsToHtml(parsedData.benefits);

    console.log('Successfully parsed job posting:', parsedData.title);

    // Search for company in clients table
    let clientId = null;
    let clientName = null;
    let companyMatchStatus: 'found' | 'new' = 'new';
    
    // Only do client matching if we have time budget left
    const elapsedBeforeClientMatch = Date.now() - startTime;
    if (parsedData.company && elapsedBeforeClientMatch < 45000) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const authHeader = req.headers.get('Authorization');
        let userId = null;
        
        if (authHeader) {
          const token = authHeader.replace('Bearer ', '');
          const { data: { user } } = await supabase.auth.getUser(token);
          userId = user?.id;
        }

        if (userId) {
          console.log('Searching for company:', parsedData.company);
          
          const normalizeCompanyName = (name: string): string => {
            if (!name) return '';
            return name.trim().toLowerCase()
              .replace(/\b(ag|gmbh|sa|sàrl|sarl|ltd|inc|se|kg|co|ohg|plc|llc|corp|ug|gbr|sia)\b/gi, '')
              .replace(/[.,\-+&\/\\()]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
          };
          
          const fuzzyCompanyMatch = (a: string, b: string): boolean => {
            const wA = normalizeCompanyName(a).split(/\s+/).filter(w => w.length >= 3);
            const wB = normalizeCompanyName(b).split(/\s+/).filter(w => w.length >= 3);
            if (wA.length === 0 || wB.length === 0) return false;
            const [shorter, longer] = wA.length <= wB.length ? [wA, wB] : [wB, wA];
            const longerSet = new Set(longer);
            return shorter.every(w => longerSet.has(w));
          };
          
          const normalizedInput = normalizeCompanyName(parsedData.company);
          console.log('Normalized input:', normalizedInput);
          
          const { data: existingClients, error: searchError } = await supabase
            .from('clients')
            .select('id, name');

          if (searchError) {
            console.error('Error searching for client:', searchError);
          } else if (existingClients && existingClients.length > 0) {
            console.log('Found', existingClients.length, 'existing clients to check');
            
            for (const client of existingClients) {
              const normalizedExisting = normalizeCompanyName(client.name);
              if (normalizedExisting === normalizedInput) {
                clientId = client.id;
                clientName = client.name;
                companyMatchStatus = 'found';
                console.log('Found exact match:', client.name, '-> ID:', clientId);
                break;
              }
            }
            
            if (!clientId) {
              for (const client of existingClients) {
                if (fuzzyCompanyMatch(parsedData.company, client.name)) {
                  clientId = client.id;
                  clientName = client.name;
                  companyMatchStatus = 'found';
                  console.log('Found fuzzy match:', client.name, '-> ID:', clientId);
                  break;
                }
              }
            }
          }
          
          if (!clientId) {
            console.log('No matching company found - will be created on save');
          }
        } else {
          console.log('No user_id found - cannot match company');
        }
      } catch (error) {
        console.error('Error searching for company:', error);
      }
    } else if (elapsedBeforeClientMatch >= 45000) {
      console.log('Skipping client matching - time budget low:', elapsedBeforeClientMatch, 'ms');
    }

    // Domain extraction from source URL
    const JOB_PORTAL_DOMAINS = [
      'jobs.ch', 'jobscout24.ch', 'indeed.com', 'linkedin.com', 'xing.com',
      'stepstone.de', 'monster.ch', 'glassdoor.com', 'karriere.at',
      'stellenanzeigen.de', 'jobcloud.ch', 'jobup.ch', 'tutti.ch',
      'monster.de', 'indeed.ch', 'indeed.de', 'joinhandshake.com',
      'successfactors.eu', 'successfactors.com', 'myworkdayjobs.com', 'workday.com',
      'greenhouse.io', 'lever.co', 'smartrecruiters.com', 'recruitee.com',
      'personio.de', 'breezy.hr', 'ashbyhq.com', 'bamboohr.com',
      'icims.com', 'taleo.net', 'jobvite.com', 'ultipro.com',
      'rexx-systems.com', 'umantis.com', 'prescreen.io', 'onlyfy.com',
      'ostendis.com', 'abacus.ch', 'prospective.ch', 'gateway.one',
      'jobs.nzz.ch', 'topjobs.ch', 'alpha.ch', 'jobeo.ch', 'refline.ch',
    ];

    let companyWebsite = parsedData.company_website || null;

    try {
      const sourceUrl = new URL(url);
      const hostname = sourceUrl.hostname.replace(/^www\./, '');
      const isJobPortal = JOB_PORTAL_DOMAINS.some(portal => hostname === portal || hostname.endsWith('.' + portal));

      if (!isJobPortal) {
        const domainFromUrl = `${sourceUrl.protocol}//${sourceUrl.hostname}`;

        if (!companyWebsite) {
          companyWebsite = domainFromUrl;
          console.log('Using domain from source URL:', companyWebsite);
        } else {
          try {
            const geminiHostname = new URL(companyWebsite).hostname.replace(/^www\./, '');
            const urlHostname = hostname;
            if (geminiHostname === urlHostname || geminiHostname.includes(urlHostname) || urlHostname.includes(geminiHostname)) {
              companyWebsite = domainFromUrl;
              console.log('Same domain, using cleaner URL domain:', companyWebsite);
            } else {
              console.log('Different domains, keeping Gemini website:', companyWebsite);
            }
          } catch {
            companyWebsite = domainFromUrl;
          }
        }
      } else {
        console.log('Source URL is a job portal, not using as company website');
      }
    } catch (e) {
      console.log('Could not parse source URL for domain extraction:', e);
    }

    // Fallback: Search company website via Gemini (only if time budget allows, 8s timeout)
    const elapsedBeforeWebsiteSearch = Date.now() - startTime;
    if (!companyWebsite && parsedData.company && elapsedBeforeWebsiteSearch < 45000) {
      console.log('No company website found, searching via Gemini for:', parsedData.company);
      try {
        const websiteSearchResponse = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `Finde die offizielle Website/Homepage für das Unternehmen "${parsedData.company}". Antworte NUR mit der URL (z.B. https://example.com). Falls nicht findbar, antworte mit NOT_FOUND.` }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
          }),
        }, 8000);
        if (websiteSearchResponse.ok) {
          const searchData = await websiteSearchResponse.json();
          const foundUrl = searchData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (foundUrl && foundUrl !== 'NOT_FOUND' && foundUrl.startsWith('http')) {
            companyWebsite = foundUrl;
            console.log('Found company website via Gemini search:', companyWebsite);
          }
        }
      } catch (searchErr) {
        console.warn('Error searching for company website:', searchErr instanceof Error ? searchErr.message : searchErr);
      }
    } else if (elapsedBeforeWebsiteSearch >= 45000) {
      console.log('Skipping website search - time budget low:', elapsedBeforeWebsiteSearch, 'ms');
    }

    const totalElapsed = Date.now() - startTime;
    console.log(`[Timer] Total execution time: ${totalElapsed}ms`);

    const responseData = {
      ...parsedData,
      client_id: clientId,
      client_name: clientName,
      company_match_status: companyMatchStatus,
      company_website: companyWebsite,
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const totalElapsed = Date.now() - startTime;
    console.error(`Error in parse-job-posting function (after ${totalElapsed}ms):`, error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
