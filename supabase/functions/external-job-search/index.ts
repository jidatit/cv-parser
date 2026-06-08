import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const SEARCH_ALGO_VERSION = "v10-cost-optimized";
const MAX_NEW_IMPORTS_PER_SEARCH = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-language',
};

// ── Helpers ──

async function hashKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getGoogleApiKey(): string {
  return Deno.env.get("Google_Directions_and_Geocoding_KEY")
    || Deno.env.get("Google_Directions/Geocoding_KEY")
    || Deno.env.get("GOOGLE_CLOUD_API_KEY")
    || '';
}

function normalizeLocationForSearch(location: string): string {
  if (!location) return '';
  return location
    .replace(/\d{4,5}\s*/g, '')
    .replace(/,?\s*schweiz$/i, '')
    .replace(/,?\s*switzerland$/i, '')
    .replace(/,?\s*CH$/i, '')
    .replace(/\bstrasse\b.*$/i, '')
    .replace(/\bweg\b.*$/i, '')
    .replace(/\bgasse\b.*$/i, '')
    .replace(/^\s*,\s*/, '')
    .trim();
}

function commuteMinutesToRadiusKm(maxCommuteStr: string | null): number | null {
  if (!maxCommuteStr) return null;
  const minutes = parseInt(maxCommuteStr);
  if (isNaN(minutes)) return null;
  return Math.round(minutes * 1.2);
}

// ── Job Link Extraction ──

const JOB_PORTAL_DOMAINS = [
  'jobs.ch', 'indeed.com', 'linkedin.com', 'glassdoor.com', 'stepstone.',
  'monster.', 'xing.com', 'jobscout24.', 'jobup.ch', 'tutti.ch',
  'myworkdayjobs.com', 'workday.com', 'successfactors.', 'greenhouse.io',
  'lever.co', 'smartrecruiters.', 'recruitee.', 'personio.', 'join.com',
  'karriere.at', 'stellenanzeigen.de', 'careerbuilder.', 'ziprecruiter.',
  'google.com/search', 'talent.com', 'jooble.', 'neuvoo.', 'adzuna.',
  'ostendis.com', 'abacus.ch',
];

function isJobPortalUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return JOB_PORTAL_DOMAINS.some(domain => lower.includes(domain));
}

function extractBestJobLink(job: any): string | null {
  const applyOptions = job.apply_options || [];
  for (const opt of applyOptions) {
    if (opt.link && !isJobPortalUrl(opt.link)) {
      return opt.link;
    }
  }
  if (applyOptions.length > 0 && applyOptions[0].link) {
    return applyOptions[0].link;
  }
  return job.share_link || null;
}

function extractCompanyDomainFromApplyOptions(job: any): string | null {
  const applyOptions = job.apply_options || [];
  for (const opt of applyOptions) {
    if (opt.link && !isJobPortalUrl(opt.link)) {
      try {
        const url = new URL(opt.link);
        return `${url.protocol}//${url.hostname}`;
      } catch { /* ignore */ }
    }
  }
  return null;
}

// ── Company Name Normalization ──

const LEGAL_FORMS: Record<string, string> = {
  'ag': 'AG', 'gmbh': 'GmbH', 'sa': 'SA', 'se': 'SE',
  'kg': 'KG', 'ohg': 'OHG', 'ltd': 'Ltd', 'inc': 'Inc',
  'plc': 'PLC', 'llc': 'LLC', 'co': 'Co', 'corp': 'Corp',
  'e.v.': 'e.V.', 'ev': 'e.V.', 'gbr': 'GbR', 'ug': 'UG',
  'sarl': 'SARL', 'sàrl': 'Sàrl', 'sia': 'SIA',
};

const LOWERCASE_WORDS = new Set([
  'und', 'and', 'de', 'von', 'van', 'der', 'die', 'das',
  'für', 'for', 'of', 'the', 'la', 'le', 'et', 'del',
]);

const KNOWN_ACRONYMS = new Set([
  'IT', 'HR', 'SAP', 'ERP', 'CRM', 'CEO', 'CTO', 'CFO', 'COO',
  'BIM', 'CAD', 'KV', 'QS', 'QM', 'PM', 'BI', 'AI', 'ML',
  'CNC', 'PLC', 'SPS', 'HLK', 'HVAC', 'MES', 'PLM', 'BPO',
]);

function normalizeCompanyCase(name: string): string {
  if (!name) return '';
  return name.trim().split(/\s+/).map((word, idx) => {
    const lower = word.toLowerCase();
    if (LEGAL_FORMS[lower]) return LEGAL_FORMS[lower];
    if (KNOWN_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
    if (idx > 0 && LOWERCASE_WORDS.has(lower)) return lower;
    if (word.length <= 4 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

// ── Description Cleanup ──

function extractIntroDescription(description: string): string {
  if (!description) return '';
  const sectionPatterns = [
    /\n\s*(Aufgaben|Ihre Aufgaben|Deine Aufgaben|Tasks|Responsibilities|Your Tasks|Tätigkeiten)/i,
    /\n\s*(Anforderungen|Ihr Profil|Dein Profil|Requirements|Qualifications|Your Profile|Das bringen Sie mit)/i,
    /\n\s*(Benefits|Vorteile|Wir bieten|We offer|Unser Angebot|Was wir bieten)/i,
    /\n\s*(Was Sie erwartet|Was dich erwartet|What we offer|What you bring)/i,
    /\n\s*(Ihre Qualifikationen|Unsere Anforderungen|Das erwartet Sie|Dein Profil)/i,
    /\n\s*•\s/,
    /\n\s*[-–]\s+\S/,
    /\n\s*\*\s+\S/,
  ];
  let cutIndex = description.length;
  for (const pattern of sectionPatterns) {
    const match = description.match(pattern);
    if (match && match.index !== undefined && match.index < cutIndex) {
      cutIndex = match.index;
    }
  }
  const intro = description.substring(0, cutIndex).trim();
  return intro.length > 20 ? intro : '';
}
// ── Fetch Job Content (4-stage scraping strategy) ──

async function fetchJobContent(url: string): Promise<{ text: string; method: string } | null> {
  if (!url) return null;
  
  let fetchUrl = url.trim();
  if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
    fetchUrl = `https://${fetchUrl}`;
  }

  // Stage 1: Direct Fetch with browser headers + Googlebot retry
  try {
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
    };
    let resp = await fetch(fetchUrl, { headers: browserHeaders, redirect: 'follow' });
    
    if (resp.status === 403 || resp.status === 401) {
      resp = await fetch(fetchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Accept': 'text/html' },
        redirect: 'follow',
      });
    }

    if (resp.ok) {
      const html = await resp.text();
      const text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 1000) {
        return { text, method: 'direct' };
      }
    }
  } catch (e) {
    console.warn('[fetchJobContent] Direct fetch error:', e);
  }

  // Stage 2: Firecrawl
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (FIRECRAWL_API_KEY) {
    try {
      const fcResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: fetchUrl, formats: ['markdown'], onlyMainContent: true, waitFor: 3000 }),
      });
      if (fcResp.ok) {
        const fcData = await fcResp.json();
        const markdown = fcData.data?.markdown || fcData.markdown || '';
        if (markdown.length > 500) {
          return { text: markdown, method: 'firecrawl' };
        }
      }
    } catch (e) {
      console.warn('[fetchJobContent] Firecrawl error:', e);
    }
  }

  // Stage 3: Google Cache
  try {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(fetchUrl)}`;
    const cacheResp = await fetch(cacheUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
      redirect: 'follow',
    });
    if (cacheResp.ok) {
      const cacheHtml = await cacheResp.text();
      const cacheText = cacheHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cacheText.length > 1000) {
        return { text: cacheText, method: 'google-cache' };
      }
    }
  } catch (e) {
    console.warn('[fetchJobContent] Google Cache error:', e);
  }

  // Stage 4: Gemini Search Grounding
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (GOOGLE_API_KEY) {
    try {
      let domain = '';
      try { domain = new URL(fetchUrl).hostname; } catch {}
      
      const groundingPrompt = `Finde den vollständigen Inhalt dieser Stellenanzeige: ${fetchUrl}
WICHTIG: Die Seite nutzt möglicherweise Client-Side Rendering (JavaScript).
Suche gezielt nach dem VOLLSTÄNDIGEN Stelleninserat mit Aufgaben, Anforderungen und Benefits.
${domain ? `Die Stelle ist auf ${domain} publiziert.` : ''}
Gib den GESAMTEN Text der Stellenanzeige zurück.`;

      const groundResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: groundingPrompt }] }],
          tools: [{ googleSearchRetrieval: { dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0.0 } } }],
          generationConfig: { temperature: 0.0, maxOutputTokens: 8192 },
        }),
      });
      if (groundResp.ok) {
        const groundData = await groundResp.json();
        const groundedText = groundData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (groundedText && groundedText.length > 200) {
          return { text: groundedText, method: 'gemini-grounding' };
        }
      }
    } catch (e) {
      console.warn('[fetchJobContent] Gemini grounding error:', e);
    }
  }

  return null;
}

// ── Gemini ──

async function callGeminiAPI(systemPrompt: string, userPrompt: string, maxTokens = 4096) {
  const GOOGLE_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!GOOGLE_API_KEY) throw new Error("GOOGLE_GEMINI_API_KEY is not configured");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens }
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

// ── Extract city from address ──
function extractCity(address: string): string {
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    const cityPart = parts[parts.length >= 3 ? parts.length - 2 : parts.length - 1];
    return cityPart.replace(/^\d{4,5}\s+/, '').trim() || parts[0];
  }
  return parts[0].replace(/^\d{4,5}\s+/, '').trim();
}

// ── Dedup key for smart pagination (Vorschlag 6) ──
function getJobDedupKey(job: any): string {
  const title = (job.title || '').toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 40);
  const company = (job.company_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return job.job_id || `${company}|${title}`;
}

// ── Single SerpApi page fetch with shared caching (Vorschlag 1+4) ──

async function fetchSerpApiPage(
  params: Record<string, string>,
  serviceClient: any,
): Promise<{ results: any[]; nextPageToken: string | null }> {
  const { api_key, ...cacheParams } = params;
  const cacheInput = JSON.stringify(cacheParams);
  const cacheKey = await hashKey(cacheInput);
  
  // Check shared cache (same namespace as market-radar)
  const { data: cached } = await serviceClient
    .from('ai_cache').select('response_data')
    .eq('function_name', 'serpapi-jobs').eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  
  if (cached) {
    const cachedData = cached.response_data as any;
    console.log(`  [cache HIT] q="${params.q}", loc="${params.location}"`);
    return { results: cachedData.results || [], nextPageToken: cachedData.nextPageToken || null };
  }

  const response = await fetch(`https://serpapi.com/search.json?${new URLSearchParams({ ...params, api_key })}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("SerpApi error:", response.status, errorText);
    const unsupported = response.status === 400 && errorText.toLowerCase().includes('unsupported');
    if (unsupported) return { results: [], nextPageToken: null };
    throw new Error(`SerpApi error: ${response.status}`);
  }

  const data = await response.json();
  const pageResults = data.jobs_results || [];
  const nextPageToken = data.serpapi_pagination?.next_page_token || null;

  // Store in shared cache (6h TTL)
  await serviceClient.from('ai_cache').upsert({
    function_name: 'serpapi-jobs',
    cache_key: cacheKey,
    response_data: { results: pageResults, nextPageToken },
    expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  }, { onConflict: 'function_name,cache_key' }).then(({ error }: any) => {
    if (error) console.warn('Cache store error:', error.message);
  });

  return { results: pageResults, nextPageToken };
}

// ── SerpApi search with smart pagination (Vorschlag 6) ──

async function searchSerpApi(
  query: string,
  candidateLocation: string,
  radiusKm: number | null,
  serviceClient: any,
  chips?: string,
): Promise<any[]> {
  const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
  if (!SERPAPI_KEY) throw new Error("SERPAPI_KEY is not configured");

  const allResults: any[] = [];
  const maxPages = 5;
  const globalSeenKeys = new Set<string>();

  const city = candidateLocation ? extractCity(candidateLocation) : null;
  const locationCandidates = city
    ? [`${city}, Switzerland`, 'Switzerland']
    : ['Switzerland'];

  let lastError: Error | null = null;

  for (const location of locationCandidates) {
    let nextPageToken: string | null = null;

    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, string> = {
        engine: 'google_jobs',
        q: query,
        location,
        hl: 'de',
        gl: 'ch',
        api_key: SERPAPI_KEY,
      };

      if (radiusKm && city && location !== 'Switzerland') {
        params.lrad = String(radiusKm);
      }
      if (nextPageToken) params.next_page_token = nextPageToken;
      if (chips) params.chips = chips;

      console.log(`SerpApi: q="${query}", location="${location}", lrad=${params.lrad || 'none'}, page=${page}`);
      
      try {
        const { results: pageResults, nextPageToken: nextToken } = await fetchSerpApiPage(params, serviceClient);
        
        // Vorschlag 6: Count genuinely new results
        let newOnThisPage = 0;
        for (const job of pageResults) {
          const key = getJobDedupKey(job);
          if (!globalSeenKeys.has(key)) {
            globalSeenKeys.add(key);
            newOnThisPage++;
          }
        }
        
        allResults.push(...pageResults);
        nextPageToken = nextToken;

        // Vorschlag 6: Stop if <5 new results on this page
        if (page > 0 && newOnThisPage < 5) {
          console.log(`  [smart-pagination] Only ${newOnThisPage} new results on page ${page}, stopping`);
          break;
        }

        if (!nextPageToken || pageResults.length < 10) break;
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        if (location !== 'Switzerland' && errorMsg.includes('400')) break;
        if (page === 0) { lastError = e instanceof Error ? e : new Error(errorMsg); break; }
        break;
      }
    }
  }

  if (allResults.length === 0 && lastError) throw lastError;
  return allResults;
}

// ── Utilities ──

function sanitizeQuery(query: string): string {
  return query
    .replace(/[&\/()]/g, ' ')
    .replace(/-in\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonString(text: string): string {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  if (cleaned.includes(' OR ')) {
    return sanitizeQuery(cleaned.replace(/^[\"']|[\"']$/g, ''));
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'string') return parsed.trim();
    if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]).trim();
  } catch {}
  const match = cleaned.match(/\"([^\"]+)\"/);
  if (match) return match[1].trim();
  return sanitizeQuery(cleaned);
}

// A1: Parse multiple queries from Gemini JSON array response
function extractMultipleQueries(text: string): string[] {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((q: any) => {
        if (typeof q === 'string') return sanitizeQuery(q);
        if (q?.query) return sanitizeQuery(q.query);
        return '';
      }).filter((q: string) => q.length > 2);
    }
  } catch {}
  const lines = cleaned.split('\n').filter(l => l.includes(' OR ') || (l.includes("\"") && l.trim().length > 5));
  if (lines.length > 1) {
    return lines.map(l => sanitizeQuery(l.replace(/^[\d.)\-\s]+/, '').replace(/^[\"']|[\"']$/g, ''))).filter(q => q.length > 2);
  }
  const single = extractJsonString(text);
  return single ? [single] : [];
}

function deduplicateJobs(jobs: any[]): any[] {
  const seen = new Map<string, any>();
  for (const job of jobs) {
    const jobId = job.job_id;
    if (jobId && seen.has(`id:${jobId}`)) continue;

    const title = (job.title || '').toLowerCase()
      .replace(/\(m\/w\/d\)|\(w\/m\/d\)|\(m\/f\/d\)|\(d\/f\/m\)/gi, '')
      .replace(/\s+/g, ' ').trim().substring(0, 40);
    const company = (job.company_name || '').toLowerCase()
      .replace(/\b(ag|gmbh|ltd|sa|inc)\b/gi, '').replace(/\s+/g, ' ').trim();
    const key = `norm:${company}|${title}`;

    if (jobId) seen.set(`id:${jobId}`, job);
    if (!seen.has(key)) seen.set(key, job);
  }
  const result = new Map<string, any>();
  for (const [_k, v] of seen) {
    const uid = v.job_id || `${(v.company_name || '').toLowerCase()}|${(v.title || '').toLowerCase().substring(0, 40)}`;
    if (!result.has(uid)) result.set(uid, v);
  }
  return Array.from(result.values());
}

function parseMinutesFromDuration(duration: string | null): number | null {
  if (!duration) return null;
  let totalMin = 0;
  const hourMatch = duration.match(/(\d+)\s*(Stunde|hour|h)/i);
  const minMatch = duration.match(/(\d+)\s*(Min|min)/i);
  if (hourMatch) totalMin += parseInt(hourMatch[1]) * 60;
  if (minMatch) totalMin += parseInt(minMatch[1]);
  return totalMin > 0 ? totalMin : null;
}

function buildCandidateProfile(candidate: any): string {
  return `
Name: ${candidate.name}
Current Position: ${candidate.position || 'N/A'}
Desired Position: ${candidate.desired_position || candidate.position || 'N/A'}
Skills: ${(candidate.skills || []).join(', ') || 'N/A'}
Industry: ${candidate.industry || 'N/A'}
Location: ${candidate.location || 'N/A'}
Max Commute: ${candidate.max_commute || 'not specified'}
Experience: ${candidate.experience || 'N/A'}
Education: ${JSON.stringify(candidate.education || [])}
Work Experience: ${JSON.stringify((candidate.work_experience || []).map((w: any) => ({ company: w.company, position: w.position, description: (w.description || '').substring(0, 500), startDate: w.startDate, endDate: w.endDate })))}
Further Education & Certifications: ${JSON.stringify([...(candidate.further_education || []), ...(candidate.certifications || [])])}

Languages: ${JSON.stringify(candidate.languages || [])}
Desired Salary: ${candidate.desired_salary || 'N/A'}
Reason for Change: ${candidate.reason_for_change || 'N/A'}
Notes: ${(candidate.notes || '').substring(0, 1000)}`;
}

// ── Commute ──

async function calculateRealCommute(
  origin: string, destination: string, apiKey: string, serviceClient: any
): Promise<{ auto_duration: string | null; auto_distance: string | null } | null> {
  if (!apiKey || !origin || !destination) return null;
  const originNorm = origin.toLowerCase().trim();
  const destNorm = destination.toLowerCase().trim();

  const { data: cached } = await serviceClient
    .from('commute_cache')
    .select('auto_duration, auto_distance')
    .eq('origin', originNorm).eq('destination', destNorm)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (cached) return cached;

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('origin', origin);
    url.searchParams.set('destination', destination);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('language', 'de');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]) return null;

    const leg = data.routes[0].legs[0];
    const result = { auto_duration: leg.duration?.text || null, auto_distance: leg.distance?.text || null };

    await serviceClient.from('commute_cache').upsert({
      origin: originNorm, destination: destNorm,
      auto_duration: result.auto_duration, auto_distance: result.auto_distance,
      calculated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'origin,destination' }).then(({ error }: any) => {
      if (error) console.warn('Commute cache error:', error.message);
    });

    return result;
  } catch (e) {
    console.error('Directions API error:', e);
    return null;
  }
}

// ── Recruitment Agency Filter ──

const RECRUITMENT_AGENCY_KEYWORDS = [
  'randstad', 'adecco', 'manpower', 'hays', 'michael page', 'page group',
  'robert half', 'robert walters', 'kelly services', 'gi group',
  'synergie', 'staffgroup', 'tempstaff', 'careerplus', 'temptrend',
  'grafton', 'personal sigma', 'axia', 'universal job', 'the adecco group',
  'brunel', 'modis', 'akkodis', 'top itservices', 'computer futures',
  'progressive', 'swisslinx', 'lhh', 'spring professional', 'badenoch',
  'experis', 'jobtop', 'job top', 'interiman',
  'rocken', 'rocken.jobs', 'jokerlakaye', 'coopers group', 'antal',
  'executivelab', 'lionstep', 'x28', 'ostendis',
  'personalberatung', 'personalvermittlung', 'headhunting',
  'staffing', 'zeitarbeit', 'temporär', 'personaldienstleist',
  'recruiting agentur', 'talent acquisition partner',
  'trio personal', 'talentzio', 'humanis', 'jörg lienert', 'egon zehnder',
  'mercuri urval', 'kienbaum', 'boyden', 'russell reynolds',
  ' personal ag', ' personal gmbh', ' personal ch',
  'teamgold', 'anker swiss', 'anker personal',
  'findea', 'nexus personal', 'oliver james',
  'alexander ash', 'nordic jobs', 'kelly ocg',
  'quiton', 'careum', 'vivian associates',
  'yellowshark', 'work4you', 'valjob', 'myitjob',
  'jobup', 'jobscout24', 'jobcloud', 'jobwinner',
  'addeco', 'paxpartner', 'selected', 'exxecutive',
  'stellentreff', 'impirio',
  'axxeva', 'malfix', 'e-selection',
  'avilium', 'joker kaderselektion', 'joker kader', 'albedis',
  'sitech', 'human professional', 'univativ', 'persigo', 'prosearch',
  'dasteam', 'müntener & thomas', 'müntener', 'muntener & thomas', 'muntener',
];

function isRecruitmentAgency(companyName: string, via: string): boolean {
  const combined = `${companyName} ${via}`.toLowerCase();
  if (RECRUITMENT_AGENCY_KEYWORDS.some(kw => combined.includes(kw))) return true;
  const cn = companyName.trim().toLowerCase();
  if (!cn || cn === 'confidential' || cn === 'vertraulich') return true;
  if (/\bpersonal\b/i.test(companyName) && !/personal(isiert|lich)/i.test(companyName)) return true;
  if (/\b(rekrutierung|recruiting|talent|workforce|hr solutions)\b/i.test(cn)) return true;
  const cnStripped = cn.replace(/\s|ag|gmbh|sa|sàrl|ltd|inc/gi, '');
  if (/job/i.test(cnStripped)) return true;
  if (/stellen?|position/i.test(cnStripped)) return true;
  if (/shark|recruitment|staffing|consult|selection|placement|executive|interim|workforce|outsourc/i.test(cn)) return true;
  if (/work\d|work4/i.test(cn)) return true;
  return false;
}

// ── CRM Import Helpers ──

function normalizeForMatching(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase()
    .replace(/\b(ag|gmbh|sa|sàrl|sarl|ltd|inc|se|kg|co|ohg|plc|llc|corp|ug|gbr|sia)\b/gi, '')
    .replace(/[.,\-+&\/\\()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyCompanyMatch(a: string, b: string): boolean {
  const wA = normalizeForMatching(a).split(/\s+/).filter(w => w.length >= 3);
  const wB = normalizeForMatching(b).split(/\s+/).filter(w => w.length >= 3);
  if (wA.length === 0 || wB.length === 0) return false;
  const [shorter, longer] = wA.length <= wB.length ? [wA, wB] : [wB, wA];
  const longerSet = new Set(longer);
  return shorter.every(w => longerSet.has(w));
}

// ── Dedup Helpers ──

function normalizeTitleForDedup(title: string): string {
  if (!title) return '';
  return title.toLowerCase()
    .replace(/\(m\/w\/d\)|\(w\/m\/d\)|\(m\/f\/d\)|\(d\/f\/m\)|\(m\/w\)|\(w\/m\)/gi, '')
    .replace(/\/in\b/g, '')
    .replace(/\d{2,3}\s*[-–]\s*\d{2,3}\s*%/g, '')
    .replace(/\d{2,3}\s*%/g, '')
    .replace(/[,;:.\-–\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLocationParts(location: string): string[] {
  if (!location) return [];
  return location.toLowerCase()
    .replace(/[()]/g, ' ')
    .split(/[,\\s]+/)
    .map(s => s.trim())
    .filter(s => s.length > 2);
}

function locationsOverlap(locA: string, locB: string): boolean {
  if (!locA || !locB) return true;
  const partsA = extractLocationParts(locA);
  const partsB = extractLocationParts(locB);
  if (partsA.length === 0 || partsB.length === 0) return true;
  for (const a of partsA) {
    for (const b of partsB) {
      if (a.includes(b) || b.includes(a)) return true;
    }
  }
  return false;
}

function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function contentMatches(htmlA: string, htmlB: string): boolean {
  if (!htmlA || !htmlB) return false;
  const a = stripHtmlTags(htmlA);
  const b = stripHtmlTags(htmlB);
  if (a.length < 30 || b.length < 30) return false;
  return a === b;
}

// Promise-based cache to prevent race conditions during parallel imports
const clientCache = new Map<string, Promise<{ clientId: string; isNew: boolean }>>();

async function findOrCreateClient(
  companyName: string, userId: string, serviceClient: any, supabaseUrl: string, serviceRoleKey: string, job?: any
): Promise<{ clientId: string; isNew: boolean }> {
  const normalizedInput = normalizeForMatching(companyName);

  // If there's already an in-flight or resolved promise for this company, await it
  if (clientCache.has(normalizedInput)) {
    return clientCache.get(normalizedInput)!;
  }

  // Create the promise and store it BEFORE starting async work
  const promise = _doFindOrCreateClient(companyName, normalizedInput, userId, serviceClient, supabaseUrl, serviceRoleKey, job);
  clientCache.set(normalizedInput, promise);

  // If the promise rejects, remove it from cache so retries can work
  promise.catch(() => clientCache.delete(normalizedInput));

  return promise;
}

async function _doFindOrCreateClient(
  companyName: string, normalizedInput: string, userId: string, serviceClient: any, supabaseUrl: string, serviceRoleKey: string, job?: any
): Promise<{ clientId: string; isNew: boolean }> {
  const searchName = normalizeCompanyCase(companyName);

  const { data: allClients } = await serviceClient
    .from('clients').select('id, name');

  if (allClients && allClients.length > 0) {
    for (const client of allClients) {
      if (normalizeForMatching(client.name) === normalizedInput) {
        return { clientId: client.id, isNew: false };
      }
    }
    for (const client of allClients) {
      if (fuzzyCompanyMatch(companyName, client.name)) {
        return { clientId: client.id, isNew: false };
      }
    }
  }

  const { data: newClient, error } = await serviceClient
    .from('clients').insert({ name: searchName, user_id: userId, status: 'N/D' }).select('id').single();

  if (error) {
    console.error(`Failed to create client "${searchName}":`, error.message);
    const { data: fallback } = await serviceClient
      .from('clients').select('id').ilike('name', `%${searchName.substring(0, 10)}%`).limit(1).maybeSingle();
    if (fallback) {
      return { clientId: fallback.id, isNew: false };
    }
    throw error;
  }

  const clientId = newClient.id;

  const applyOpts = job?.apply_options || [];
  const jobLocation = job?.location || null;
  fetch(`${supabaseUrl}/functions/v1/enrich-client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({
      client_id: clientId,
      company_name: searchName,
      apply_options: applyOpts,
      location: jobLocation,
    }),
  }).catch(e => console.error(`Enrichment trigger failed for "${searchName}":`, e));

  return { clientId, isNew: true };
}

async function importJobIfNew(
  job: any, clientId: string, userId: string, serviceClient: any
): Promise<{ jobId: string; isNew: boolean }> {
  const titleNorm = normalizeCompanyCase((job.title || '').trim());
  const externalId = job.job_id || null;

  if (externalId) {
    const { data: byExtId } = await serviceClient
      .from('jobs').select('id')
      .eq('external_job_id', externalId)
      .maybeSingle();
    if (byExtId) return { jobId: byExtId.id, isNew: false };
  }

  const { data: clientJobs } = await serviceClient
    .from('jobs')
    .select('id, title, location, responsibilities, requirements')
    .eq('client_id', clientId)
    .not('status', 'eq', 'Archiviert');

  if (clientJobs && clientJobs.length > 0) {
    const newTitleNorm = normalizeTitleForDedup(job.title || '');
    const newLocation = job.location || '';

    for (const existing of clientJobs) {
      const existingTitleNorm = normalizeTitleForDedup(existing.title || '');

      if (newTitleNorm && existingTitleNorm) {
        const titleMatch = newTitleNorm === existingTitleNorm
          || newTitleNorm.includes(existingTitleNorm)
          || existingTitleNorm.includes(newTitleNorm);

        if (titleMatch && locationsOverlap(newLocation, existing.location || '')) {
          return { jobId: existing.id, isNew: false };
        }
      }

      const highlights = job.job_highlights || [];
      let newResp = '';
      let newReq = '';
      for (const h of highlights) {
        const items = h.items || [];
        if (items.length === 0) continue;
        const html = items.join(' ');
        const htitle = (h.title || '').toLowerCase();
        if (htitle.includes('responsibilit') || htitle.includes('aufgab') || htitle.includes('duties')) {
          newResp = html;
        } else if (htitle.includes('qualificat') || htitle.includes('anforder') || htitle.includes('requirement')) {
          newReq = html;
        }
      }

      if (newResp || newReq) {
        const respMatch = contentMatches(newResp, stripHtmlTags(existing.responsibilities || ''));
        const reqMatch = contentMatches(newReq, stripHtmlTags(existing.requirements || ''));

        if ((respMatch || reqMatch) && locationsOverlap(newLocation, existing.location || '')) {
          return { jobId: existing.id, isNew: false };
        }
      }
    }
  }

  const jobLink = extractBestJobLink(job);
  const extensions = job.detected_extensions || {};
  const enrichedFields: Record<string, any> = {};
  if (extensions.salary) enrichedFields.salary_range = extensions.salary.replace(/EUR/gi, 'CHF').replace(/€/g, 'CHF');
  if (extensions.schedule_type) enrichedFields.employment_type = extensions.schedule_type;

  const highlights = job.job_highlights || [];
  const highlightFields: Record<string, any> = {};
  for (const h of highlights) {
    const items = h.items || [];
    if (items.length === 0) continue;
    const html = '<ul>' + items.map((i: string) => `<li>${i}</li>`).join('') + '</ul>';
    const htitle = (h.title || '').toLowerCase();
    if (htitle.includes('qualificat') || htitle.includes('anforder') || htitle.includes('requirement')) {
      highlightFields.requirements = html;
    } else if (htitle.includes('responsibilit') || htitle.includes('aufgab') || htitle.includes('duties')) {
      highlightFields.responsibilities = html;
    } else if (htitle.includes('benefit') || htitle.includes('vorteil') || htitle.includes('we offer') || htitle.includes('wir bieten')) {
      highlightFields.benefits = html;
    }
  }

  if (extensions.work_from_home) {
    if (!highlightFields.benefits) highlightFields.benefits = '<ul><li>Home Office / Remote möglich</li></ul>';
    else highlightFields.benefits = highlightFields.benefits.replace('</ul>', '<li>Home Office / Remote möglich</li></ul>');
  }

  const rawDescription = job.description || '';
  let descriptionForDb: string | null = extractIntroDescription(rawDescription) || null;
  // Always keep at least the raw description intro — never null it out
  if (!descriptionForDb && rawDescription.length > 0) {
    descriptionForDb = rawDescription.substring(0, 2000);
  }

  const { data: newJob, error } = await serviceClient
    .from('jobs')
    .insert({
      title: titleNorm,
      location: job.location || null,
      description: descriptionForDb,
      source_url: jobLink,
      client_id: clientId,
      user_id: userId,
      status: 'External',
      external_job_id: externalId,
      ...enrichedFields,
      ...highlightFields,
    })
    .select('id')
    .single();

  if (error) {
    console.error(`Failed to import job "${titleNorm}":`, error.message);
    throw error;
  }

  return { jobId: newJob.id, isNew: true };
}

// ── Prompts ──

const MULTI_QUERY_PROMPT = `You are an expert recruiter building Google Jobs search queries for the Swiss/DACH job market.

Your task: Analyze the candidate profile and generate 3 DIFFERENT search queries to find all possible matching jobs.

QUERY STRATEGY:
- Query 1: Based on the candidate's DESIRED POSITION (what they want to become/do next)
- Query 2: Based on the candidate's CURRENT POSITION / most recent work experience title
- Query 3: Based on the candidate's SKILLS + INDUSTRY (alternative roles that use the same skillset)

RULES FOR EACH QUERY:
1. Each query uses 2-3 German synonyms in quotes, linked with OR
2. NO location words, NO company names
3. Use gender-neutral German job titles
4. Use broad, commonly used titles that exist on Google Jobs
5. Each query MUST be DIFFERENT from the others (different job titles/angles)
6. If desired_position equals current position, use a broader/senior variant for Query 1

FORMAT: Return a JSON array of 3 query strings. No markdown, no explanation.
["query1 with OR synonyms", "query2 with OR synonyms", "query3 with OR synonyms"]

EXAMPLES:
["\"Bauleiter\" OR \"Bauführer\" OR \"Projektleiter Bau\"", "\"Bauingenieur\" OR \"Bautechniker\"", "\"Projektmanager Hochbau\" OR \"Leiter Bauausführung\""]
["\"SAP Berater\" OR \"SAP Consultant\"", "\"IT Berater\" OR \"ERP Consultant\"", "\"Projektleiter IT\" OR \"Business Analyst SAP\""]`;

const SCORING_PROMPT = `You are a recruiting expert AI. Score each job against the candidate profile using these weighted criteria:

SCORING CRITERIA (use these weights):
- Skills Match (40%): Which of the candidate's skills are required or mentioned in the job posting?
- Experience Match (25%): Does the candidate's work experience align with the role's responsibilities?
- Education Match (15%): Does the candidate's education/certifications fit the job requirements?
- Career Direction (20%): Does this job align with where the candidate wants to go (check desired_position, reason_for_change, notes)?

For each job, provide:
- match_score: 0-100 (weighted composite score based on above criteria)
- reason: One sentence explaining the match (in German), mentioning which skills/experience matched
- tasks: Key responsibilities extracted from job description (array of strings, in German, max 10). If has_tasks is true for a job, return an EMPTY array for tasks.
- requirements: Key requirements extracted from job description (array of strings, in German, max 10). If has_requirements is true for a job, return an EMPTY array for requirements.
- benefits: Benefits mentioned in the job (array of strings, in German, max 7). If has_benefits is true for a job, return an EMPTY array for benefits.

LANGUAGE & GRAMMAR RULES:
- Fix all grammar, spelling, and capitalization errors in extracted text
- Use Swiss German orthography (use "ss" instead of "ß")
- Bullet points must NOT end with a period
- Convert ALL-CAPS text to proper capitalization

IMPORTANT:
- Score ALL jobs, even poor matches (we import everything)
- A job where 2-3 candidate skills match is already interesting (score 50-65)
- A job matching skills + experience + direction should score 70+
- DEDUPLICATE: Same job from multiple portals → keep best source only
- If a job has ALL three flags (has_tasks, has_requirements, has_benefits) as true, skip extraction entirely — just score it

Return a JSON array (no markdown, no code fences):
[{
  "job_index": 0,
  "match_score": 85,
  "reason": "...",
  "tasks": ["...", "..."],
  "requirements": ["...", "..."],
  "benefits": ["...", "..."]
}]`;

// ── Progress Helper ──

async function updateSearchJobProgress(serviceClient: any, searchJobId: string | null, updates: Record<string, any>) {
  if (!searchJobId) return;
  try {
    await serviceClient
      .from('external_search_jobs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', searchJobId);
  } catch (e) {
    console.warn('[updateSearchJobProgress] Failed:', e);
  }
}

// ── Main Handler ──

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });

  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let searchJobId: string | null = null;

  try {
    const { candidate, force_refresh, pensum_min, pensum_max, search_job_id } = await req.json();
    if (!candidate) {
      return new Response(JSON.stringify({ error: 'Candidate data is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userId = userData.user.id;
    searchJobId = search_job_id || null;
    console.log(`[${SEARCH_ALGO_VERSION}] Starting search for: ${candidate.name}${searchJobId ? ` (job: ${searchJobId})` : ''}`);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Mark search job as running
    await updateSearchJobProgress(serviceClient, searchJobId, {
      status: 'running',
      progress_message: 'Suchbegriffe werden generiert…',
    });
    const googleApiKey = getGoogleApiKey();
    const candidateProfile = buildCandidateProfile(candidate);
    const candidateLocation = candidate.location || '';

    const normalizedLocation = normalizeLocationForSearch(candidateLocation);
    const radiusKm = commuteMinutesToRadiusKm(candidate.max_commute);
    console.log(`[${SEARCH_ALGO_VERSION}] Location: "${normalizedLocation}", Radius: ${radiusKm || 'none'} km`);

    // Map pensum range to employment_type chip
    const pMin = typeof pensum_min === 'number' ? pensum_min : 0;
    const pMax = typeof pensum_max === 'number' ? pensum_max : 100;
    let pensumChip: string | undefined;
    if (pMin >= 80) {
      pensumChip = 'employment_type:FULLTIME';
    } else if (pMax < 80) {
      pensumChip = 'employment_type:PARTTIME';
    }

    // ── Stage 1: Check score cache (24h TTL) ──
    const scoreCacheInput = JSON.stringify({
      algo: SEARCH_ALGO_VERSION,
      name: candidate.name, position: candidate.position,
      desired_position: candidate.desired_position, skills: candidate.skills,
      location: candidate.location, industry: candidate.industry,
      max_commute: candidate.max_commute, work_experience: candidate.work_experience,
      notes: candidate.notes, further_education: candidate.further_education,
    });
    const scoreCacheKey = await hashKey(scoreCacheInput);

    if (!force_refresh) {
      const { data: cachedScore } = await serviceClient
        .from('ai_cache').select('response_data, created_at')
        .eq('function_name', 'ext-job-score').eq('cache_key', scoreCacheKey)
        .gt('expires_at', new Date().toISOString()).maybeSingle();

      if (cachedScore) {
        console.log(`[${SEARCH_ALGO_VERSION}] Score cache HIT`);
        const cachedData = cachedScore.response_data as any;
        // Store cached results in search job
        await updateSearchJobProgress(serviceClient, searchJobId, {
          status: 'completed',
          progress_message: 'Ergebnisse aus Cache geladen',
          results: cachedData.results || [],
          stats: { is_cached: true, cached_at: cachedScore.created_at, ...cachedData },
        });
        return new Response(JSON.stringify({ ...cachedData, is_cached: true, cached_at: cachedScore.created_at }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Stage 2: Generate MULTIPLE search queries (A1) ──
    const queryResult = await callGeminiAPI(MULTI_QUERY_PROMPT, candidateProfile, 512);
    let searchQueries = extractMultipleQueries(queryResult);
    console.log(`[${SEARCH_ALGO_VERSION}] Generated ${searchQueries.length} queries:`, searchQueries);

    await updateSearchJobProgress(serviceClient, searchJobId, {
      progress_message: `${searchQueries.length} Suchbegriffe generiert – Stellenmärkte werden durchsucht…`,
    });

    // Fallback: if no queries generated, use simple approach
    if (searchQueries.length === 0) {
      const skills = (candidate.skills || []).slice(0, 2).join(' ');
      const pos = candidate.desired_position || candidate.position || '';
      const fallbackQ = sanitizeQuery(`${skills} ${pos}`.trim()) || 'Fachkraft';
      searchQueries = [fallbackQ];
    }

    // ── Stage 3: SerpApi search with early-termination (Vorschlag 2) ──
    let allSerpResults: any[] = [];

    // Check aggregate cache first (keeps backward compat)
    const serpCacheKey = await hashKey(`${SEARCH_ALGO_VERSION}|${searchQueries.sort().join('|').toLowerCase()}|${normalizedLocation.toLowerCase()}|${radiusKm || 0}|${pensumChip || 'all'}`);

    if (!force_refresh) {
      const { data: cachedSerp } = await serviceClient
        .from('ai_cache').select('response_data')
        .eq('function_name', 'ext-job-serp').eq('cache_key', serpCacheKey)
        .gt('expires_at', new Date().toISOString()).maybeSingle();

      if (cachedSerp) {
        const results = (cachedSerp.response_data as any).results || [];
        if (results.length > 0) {
          console.log(`SerpApi aggregate cache HIT: ${results.length} results`);
          allSerpResults = results;
        }
      }
    }

    if (allSerpResults.length === 0) {
      // Vorschlag 2: For each base query, search combined first, then conditionally split
      for (const q of searchQueries) {
        // Search combined OR query first
        const combinedResults = await searchSerpApi(q, normalizedLocation, radiusKm, serviceClient, pensumChip);
        const combinedDeduped = deduplicateJobs(combinedResults);
        allSerpResults.push(...combinedResults);
        console.log(`"${q}" (combined) → ${combinedResults.length} raw, ${combinedDeduped.length} unique`);

        // Vorschlag 2: Only split into individual terms if combined returned <25 unique results
        if (q.includes(' OR ') && combinedDeduped.length < 25) {
          console.log(`  Combined returned ${combinedDeduped.length} < 25, running individual term searches`);
          const terms = q.split(/\s+OR\s+/);
          for (const term of terms) {
            const cleaned = term.trim();
            if (cleaned) {
              try {
                const termResults = await searchSerpApi(cleaned, normalizedLocation, radiusKm, serviceClient, pensumChip);
                console.log(`  "${cleaned}" → ${termResults.length} results`);
                allSerpResults.push(...termResults);
              } catch (e) {
                console.error(`Search failed for "${cleaned}":`, e);
              }
            }
          }
        } else if (q.includes(' OR ')) {
          console.log(`  Combined returned ${combinedDeduped.length} ≥ 25, SKIPPING individual term searches`);
        }
      }

      // Fallbacks if 0 results across all queries
      if (allSerpResults.length === 0 && radiusKm && normalizedLocation) {
        console.log(`[${SEARCH_ALGO_VERSION}] 0 results with radius, retrying without lrad...`);
        for (const q of searchQueries.slice(0, 3)) {
          try {
            const results = await searchSerpApi(q, normalizedLocation, null, serviceClient, pensumChip);
            allSerpResults.push(...results);
          } catch (e) { /* skip */ }
        }
      }

      if (allSerpResults.length === 0 && normalizedLocation) {
        console.log(`[${SEARCH_ALGO_VERSION}] 0 results with location, retrying switzerland-wide...`);
        for (const q of searchQueries.slice(0, 3)) {
          try {
            const results = await searchSerpApi(q, '', null, serviceClient, pensumChip);
            allSerpResults.push(...results);
          } catch (e) { /* skip */ }
        }
      }

      if (allSerpResults.length === 0) {
        const simpleQuery = sanitizeQuery(candidate.desired_position || candidate.position || '');
        if (simpleQuery) {
          console.log(`[${SEARCH_ALGO_VERSION}] Trying simplified query: "${simpleQuery}"`);
          const results = await searchSerpApi(simpleQuery, '', null, serviceClient, pensumChip);
          allSerpResults.push(...results);
        }
      }

      // C1: Cache TTL 12h for aggregate results
      if (allSerpResults.length > 0) {
        await serviceClient.from('ai_cache').upsert({
          function_name: 'ext-job-serp', cache_key: serpCacheKey,
          response_data: { results: allSerpResults },
          expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'function_name,cache_key' });
      }
    }

    allSerpResults = deduplicateJobs(allSerpResults);
    console.log(`[${SEARCH_ALGO_VERSION}] Total after dedup: ${allSerpResults.length}`);

    await updateSearchJobProgress(serviceClient, searchJobId, {
      progress_message: `${allSerpResults.length} Stellen gefunden – Import ins CRM…`,
    });

    // ── Stage 4: Bulk CRM Import ──
    let jobsNew = 0;
    let jobsExisting = 0;
    let jobsFilteredAgencies = 0;
    const filteredAgencyIndices = new Set<number>();
    const jobMappings: { serpIndex: number; jobId: string; clientId: string }[] = [];

    for (let i = 0; i < allSerpResults.length; i++) {
      const job = allSerpResults[i];
      if (!job.company_name || !job.title) continue;
      if (isRecruitmentAgency(job.company_name, job.via || '')) {
        jobsFilteredAgencies++;
        filteredAgencyIndices.add(i);
      }
    }

    const nonFilteredJobs = allSerpResults
      .map((job: any, i: number) => ({ job, origIndex: i }))
      .filter(({ origIndex }) => !filteredAgencyIndices.has(origIndex))
      .filter(({ job }) => job.company_name && job.title);

    const batchSize = 5;
    for (let b = 0; b < nonFilteredJobs.length; b += batchSize) {
      const batch = nonFilteredJobs.slice(b, b + batchSize);
      const batchResults = await Promise.all(batch.map(async ({ job, origIndex }) => {
        try {
          const { clientId } = await findOrCreateClient(
            job.company_name, userId, serviceClient, supabaseUrl, serviceRoleKey, job
          );

          if (jobsNew >= MAX_NEW_IMPORTS_PER_SEARCH) {
            const { data: existingJob } = await serviceClient
              .from('jobs').select('id').eq('client_id', clientId)
              .ilike('title', job.title.trim()).limit(1).maybeSingle();
            if (existingJob) {
              return { serpIndex: origIndex, jobId: existingJob.id, clientId, isNew: false };
            }
            return null;
          }

          const { jobId, isNew } = await importJobIfNew(job, clientId, userId, serviceClient);
          return { serpIndex: origIndex, jobId, clientId, isNew };
        } catch (e) {
          console.error(`Import failed for job "${job.title}" @ "${job.company_name}":`, e);
          return null;
        }
      }));

      for (const r of batchResults) {
        if (!r) continue;
        if (r.isNew) jobsNew++;
        else jobsExisting++;
        jobMappings.push({ serpIndex: r.serpIndex, jobId: r.jobId, clientId: r.clientId, isNew: r.isNew });
      }
    }

    console.log(`[${SEARCH_ALGO_VERSION}] Imported: ${jobsNew} new, ${jobsExisting} existing (of ${allSerpResults.length} scraped)`);

    if (allSerpResults.length === 0) {
      const emptyResult = {
        results: [], query: searchQueries[0] || '', queries_used: searchQueries,
        algo_version: SEARCH_ALGO_VERSION, total: 0,
        jobs_scraped: 0, jobs_new: 0, jobs_existing: 0, jobs_filtered_agencies: jobsFilteredAgencies,
        is_cached: false, cached_at: null,
      };
      await updateSearchJobProgress(serviceClient, searchJobId, {
        status: 'completed',
        progress_message: 'Keine Ergebnisse gefunden',
        results: [],
        stats: emptyResult,
      });
      return new Response(JSON.stringify(emptyResult), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await updateSearchJobProgress(serviceClient, searchJobId, {
      progress_message: `${jobsNew} neue Stellen importiert – KI-Bewertung läuft…`,
    });

    // ── Stage 5: AI Scoring (A4: cap at 50) ──
    const nonAgencyResults = allSerpResults
      .map((job: any, i: number) => ({ ...job, _origIndex: i }))
      .filter((_: any, i: number) => !filteredAgencyIndices.has(i));

    console.log(`[${SEARCH_ALGO_VERSION}] Non-agency results for scoring: ${nonAgencyResults.length} (filtered ${filteredAgencyIndices.size} agencies)`);

    const jobsForScoring = nonAgencyResults.slice(0, 50).map((job: any, idx: number) => {
      const highlights = job.job_highlights || [];
      const highlightTitles = highlights.map((h: any) => (h.title || '').toLowerCase());
      return {
        index: idx, title: job.title, company: job.company_name,
        location: job.location, description: (job.description || '').substring(0, 1500), via: job.via,
        has_tasks: highlightTitles.some((t: string) => t.includes('aufgaben') || t.includes('responsibilities') || t.includes('tätigkeiten')),
        has_requirements: highlightTitles.some((t: string) => t.includes('anforderungen') || t.includes('qualifikation') || t.includes('requirements') || t.includes('voraussetzungen')),
        has_benefits: highlightTitles.some((t: string) => t.includes('benefits') || t.includes('vorteile') || t.includes('bieten') || t.includes('angebot')),
      };
    });

    const scoringInput = `CANDIDATE PROFILE:\n${candidateProfile}\n\nJOBS TO SCORE:\n${JSON.stringify(jobsForScoring, null, 2)}`;
    const scoringResult = await callGeminiAPI(SCORING_PROMPT, scoringInput, 8192);

    let scores: any[] = [];
    try {
      scores = JSON.parse(scoringResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch (e) {
      console.error('Scoring parse error:', scoringResult.substring(0, 500));
      scores = [];
    }

    // ── Stage 6: Merge results ──
    let results = scores
      .filter((s: any) => s.match_score >= 40)
      .map((score: any) => {
        const job = nonAgencyResults[score.job_index];
        if (!job) return null;
        const mapping = jobMappings.find(m => m.serpIndex === job._origIndex);
        return {
          job_id: mapping?.jobId || null,
          client_id: mapping?.clientId || null,
          is_new_import: mapping ? mapping.isNew : false,
          title: job.title, company_name: job.company_name,
          location: job.location, description: job.description,
          via: job.via, job_link: extractBestJobLink(job),
          detected_extensions: job.detected_extensions || {},
          match_score: score.match_score, reason: score.reason,
          estimated_distance_km: 0,
          tasks: score.tasks || [], requirements: score.requirements || [], benefits: score.benefits || [],
          commute_duration: null as string | null, commute_distance: null as string | null, commute_exceeds_max: false,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.match_score - a.match_score);

    // ── Stage 6b: Write scoring-extracted fields back (fast, no scraping) ──
    for (const score of scores) {
      const job = nonAgencyResults[score.job_index];
      if (!job) continue;
      const mapping = jobMappings.find(m => m.serpIndex === job._origIndex);
      if (!mapping?.jobId) continue;

      const updateFields: Record<string, any> = {};

      if (score.tasks?.length > 0) {
        updateFields.responsibilities = '<ul>' + score.tasks.map((t: string) => `<li>${t}</li>`).join('') + '</ul>';
      }
      if (score.requirements?.length > 0) {
        updateFields.requirements = '<ul>' + score.requirements.map((r: string) => `<li>${r}</li>`).join('') + '</ul>';
      }
      if (score.benefits?.length > 0) {
        updateFields.benefits = '<ul>' + score.benefits.map((b: string) => `<li>${b}</li>`).join('') + '</ul>';
      }

      if (Object.keys(updateFields).length > 0) {
        for (const [field, value] of Object.entries(updateFields)) {
          await serviceClient
            .from('jobs')
            .update({ [field]: value, updated_at: new Date().toISOString() })
            .eq('id', mapping.jobId)
            .is(field, null);
        }
      }
    }

    // ── Stage 7: Commute calculation ──
    if (candidateLocation && googleApiKey && results.length > 0) {
      const commutePromises = results.slice(0, 10).map(async (result: any) => {
        if (!result.location) return;
        const commute = await calculateRealCommute(candidateLocation, result.location, googleApiKey, serviceClient);
        if (commute) {
          result.commute_duration = commute.auto_duration;
          result.commute_distance = commute.auto_distance;
          if (candidate.max_commute) {
            const maxMin = parseInt(candidate.max_commute);
            const actualMin = parseMinutesFromDuration(commute.auto_duration);
            if (!isNaN(maxMin) && actualMin) {
              result.commute_exceeds_max = actualMin > maxMin;
              if (actualMin > maxMin * 1.5) result.match_score = Math.max(0, result.match_score - 25);
              else if (actualMin > maxMin) result.match_score = Math.max(0, result.match_score - 10);
            }
          }
        }
      });
      await Promise.all(commutePromises);
      results.sort((a: any, b: any) => b.match_score - a.match_score);
    }

    const responseData = {
      results, query: searchQueries[0] || '', queries_used: searchQueries,
      algo_version: SEARCH_ALGO_VERSION, total: results.length,
      jobs_scraped: allSerpResults.length, jobs_new: jobsNew, jobs_existing: jobsExisting,
      jobs_filtered_agencies: jobsFilteredAgencies,
    };

    if (results.length > 0) {
      await serviceClient.from('ai_cache').upsert({
        function_name: 'ext-job-score', cache_key: scoreCacheKey,
        response_data: responseData,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'function_name,cache_key' });
    }

    console.log(`[${SEARCH_ALGO_VERSION}] Returning ${results.length} scored results (${jobsNew} new, ${jobsExisting} existing, ${jobsFilteredAgencies} agencies filtered)`);

    // Store final results in search job
    await updateSearchJobProgress(serviceClient, searchJobId, {
      status: 'completed',
      progress_message: `${results.length} passende Stellen gefunden`,
      results: results,
      stats: { ...responseData, is_cached: false, cached_at: null },
    });

    // ── Fire-and-forget: Trigger batch-enrich-jobs for newly imported jobs ──
    const newJobIds = jobMappings.filter(m => m.isNew).map(m => m.jobId);
    if (newJobIds.length > 0) {
      console.log(`[${SEARCH_ALGO_VERSION}] Triggering batch-enrich-jobs for ${newJobIds.length} new jobs`);
      fetch(`${supabaseUrl}/functions/v1/batch-enrich-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ job_ids: newJobIds }),
      }).catch(e => console.error('Failed to trigger batch-enrich-jobs:', e));
    }

    return new Response(JSON.stringify({ ...responseData, is_cached: false, cached_at: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in external-job-search:', error);

    // Update search job with error
    if (searchJobId) {
      try {
        const svcClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        await updateSearchJobProgress(svcClient, searchJobId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          progress_message: 'Suche fehlgeschlagen',
        });
      } catch {}
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
