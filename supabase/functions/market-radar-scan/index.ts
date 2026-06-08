import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-language',
};

// ── Shared cache helper ──
async function hashKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

function extractIntroDescription(description: string): string {
  if (!description) return '';
  const sectionPatterns = [
    /\n\s*(Aufgaben|Ihre Aufgaben|Deine Aufgaben|Tasks|Responsibilities|Your Tasks|Tätigkeiten)/i,
    /\n\s*(Anforderungen|Ihr Profil|Dein Profil|Requirements|Qualifications|Your Profile|Das bringen Sie mit)/i,
    /\n\s*(Benefits|Vorteile|Wir bieten|We offer|Unser Angebot|Was wir bieten)/i,
    /\n\s*(Was Sie erwartet|Was dich erwartet|What we offer|What you bring)/i,
    /\n\s*(Ihre Qualifikationen|Unsere Anforderungen|Das erwartet Sie|Dein Profil)/i,
    /\n\s*•\s/,
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

// ── Job Link Extraction ──

const JOB_PORTAL_DOMAINS = [
  'jobs.ch', 'indeed.com', 'linkedin.com', 'glassdoor.com', 'stepstone.',
  'monster.', 'xing.com', 'jobscout24.', 'jobup.ch', 'tutti.ch',
  'myworkdayjobs.com', 'workday.com', 'successfactors.', 'greenhouse.io',
  'lever.co', 'smartrecruiters.', 'recruitee.', 'personio.', 'join.com',
  'google.com/search', 'talent.com', 'jooble.', 'neuvoo.', 'adzuna.',
];

function isJobPortalUrl(url: string): boolean {
  if (!url) return false;
  return JOB_PORTAL_DOMAINS.some(domain => url.toLowerCase().includes(domain));
}

function extractBestJobLink(job: any): string | null {
  const applyOptions = job.apply_options || [];
  for (const opt of applyOptions) {
    if (opt.link && !isJobPortalUrl(opt.link)) return opt.link;
  }
  if (applyOptions.length > 0 && applyOptions[0].link) return applyOptions[0].link;
  return job.share_link || null;
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
  'stellentreff',
  'axxeva', 'malfix', 'e-selection',
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
  const cnStripped = cn.replace(/\s|ag|gmbh|sa|sàrl|sarl|ltd|inc/gi, '');
  if (/job/i.test(cnStripped)) return true;
  if (/stellen?|position/i.test(cnStripped)) return true;
  if (/shark|recruitment|staffing|consult|selection|placement|executive|interim|workforce|outsourc/i.test(cn)) return true;
  if (/work\d|work4/i.test(cn)) return true;
  return false;
}

// ── Smart Deduplication ──

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
  for (const [k, v] of seen) {
    const uid = v.job_id || `${(v.company_name || '').toLowerCase()}|${(v.title || '').toLowerCase().substring(0, 40)}`;
    if (!result.has(uid)) result.set(uid, v);
  }
  return Array.from(result.values());
}

// ── Dedup key for smart pagination (Vorschlag 6) ──
function getJobDedupKey(job: any): string {
  const title = (job.title || '').toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 40);
  const company = (job.company_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return job.job_id || `${company}|${title}`;
}

function extractHighlights(job: any): { responsibilities?: string; requirements?: string; benefits?: string } {
  const highlights = job.job_highlights || [];
  const result: Record<string, string> = {};
  for (const h of highlights) {
    const items = h.items || [];
    if (items.length === 0) continue;
    const html = '<ul>' + items.map((i: string) => `<li>${i}</li>`).join('') + '</ul>';
    const title = (h.title || '').toLowerCase();
    if (title.includes('qualificat') || title.includes('anforder') || title.includes('requirement')) {
      result.requirements = html;
    } else if (title.includes('responsibilit') || title.includes('aufgab') || title.includes('duties')) {
      result.responsibilities = html;
    } else if (title.includes('benefit') || title.includes('vorteil') || title.includes('we offer') || title.includes('wir bieten')) {
      result.benefits = html;
    }
  }
  return result;
}

function extractExtensions(job: any): Record<string, any> {
  const ext = job.detected_extensions || {};
  const fields: Record<string, any> = {};
  if (ext.salary) fields.salary_range = ext.salary.replace(/EUR/gi, 'CHF').replace(/€/g, 'CHF');
  if (ext.schedule_type) fields.employment_type = ext.schedule_type;
  return fields;
}

// ── Swiss Region Mapping ──

const REGION_MAPPING: Record<string, string[]> = {
  'zentralschweiz': ['Luzern, Switzerland', 'Zug, Switzerland', 'Schwyz, Switzerland'],
  'ostschweiz': ['St. Gallen, Switzerland', 'Thurgau, Switzerland', 'Appenzell, Switzerland'],
  'nordwestschweiz': ['Basel, Switzerland', 'Aarau, Switzerland', 'Olten, Switzerland'],
  'mittelland': ['Bern, Switzerland', 'Solothurn, Switzerland', 'Thun, Switzerland'],
  'westschweiz': ['Lausanne, Switzerland', 'Genf, Switzerland', 'Fribourg, Switzerland'],
  'zürich': ['Zürich, Switzerland', 'Winterthur, Switzerland'],
  'tessin': ['Lugano, Switzerland', 'Bellinzona, Switzerland'],
  'graubünden': ['Chur, Switzerland', 'Davos, Switzerland'],
};

// B2: City neighbors mapping for automatic regional expansion
const CITY_NEIGHBORS: Record<string, string[]> = {
  'zürich': ['Winterthur, Switzerland', 'Baden, Switzerland', 'Zug, Switzerland'],
  'bern': ['Thun, Switzerland', 'Biel, Switzerland', 'Solothurn, Switzerland'],
  'basel': ['Liestal, Switzerland', 'Aarau, Switzerland', 'Olten, Switzerland'],
  'luzern': ['Zug, Switzerland', 'Schwyz, Switzerland', 'Aarau, Switzerland'],
  'st. gallen': ['Frauenfeld, Switzerland', 'Winterthur, Switzerland', 'Appenzell, Switzerland'],
  'lausanne': ['Genf, Switzerland', 'Fribourg, Switzerland', 'Montreux, Switzerland'],
  'genf': ['Lausanne, Switzerland', 'Nyon, Switzerland'],
  'winterthur': ['Zürich, Switzerland', 'Frauenfeld, Switzerland', 'Schaffhausen, Switzerland'],
  'zug': ['Zürich, Switzerland', 'Luzern, Switzerland', 'Schwyz, Switzerland'],
  'aarau': ['Olten, Switzerland', 'Baden, Switzerland', 'Luzern, Switzerland'],
  'lugano': ['Bellinzona, Switzerland', 'Locarno, Switzerland'],
  'biel': ['Bern, Switzerland', 'Solothurn, Switzerland', 'Neuchâtel, Switzerland'],
  'thun': ['Bern, Switzerland', 'Interlaken, Switzerland'],
  'baden': ['Zürich, Switzerland', 'Aarau, Switzerland', 'Brugg, Switzerland'],
  'olten': ['Aarau, Switzerland', 'Solothurn, Switzerland', 'Basel, Switzerland'],
  'schaffhausen': ['Winterthur, Switzerland', 'Frauenfeld, Switzerland'],
  'frauenfeld': ['Winterthur, Switzerland', 'St. Gallen, Switzerland'],
  'solothurn': ['Bern, Switzerland', 'Olten, Switzerland', 'Biel, Switzerland'],
  'chur': ['Davos, Switzerland', 'St. Gallen, Switzerland'],
};

// Vorschlag 3: Resolve locations - returns { primary, neighbors, fallback }
function resolveLocationsStructured(location: string): { primary: string[]; neighbors: string[]; fallback: string } {
  if (!location) return { primary: ['Switzerland'], neighbors: [], fallback: 'Switzerland' };
  const lower = location.toLowerCase().trim();
  
  // Check region mapping first - all are primary
  for (const [region, cities] of Object.entries(REGION_MAPPING)) {
    if (lower.includes(region)) return { primary: cities, neighbors: [], fallback: 'Switzerland' };
  }
  
  // Try as city
  const city = extractCity(location);
  if (city) {
    const cityLower = city.toLowerCase();
    const neighborLocs = CITY_NEIGHBORS[cityLower] || [];
    return {
      primary: [`${city}, Switzerland`],
      neighbors: neighborLocs,
      fallback: 'Switzerland',
    };
  }
  return { primary: ['Switzerland'], neighbors: [], fallback: 'Switzerland' };
}

function extractCity(address: string): string {
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    const cityPart = parts[parts.length >= 3 ? parts.length - 2 : parts.length - 1];
    return cityPart.replace(/^\d{4,5}\s+/, '').trim() || parts[0];
  }
  return parts[0].replace(/^\d{4,5}\s+/, '').trim();
}

// ── Single SerpApi page fetch with caching (Vorschlag 1 + 4) ──

async function fetchSerpApiPage(
  params: Record<string, string>,
  serviceClient: any,
): Promise<{ results: any[]; nextPageToken: string | null }> {
  // Build cache key from search params (excluding api_key)
  const { api_key, ...cacheParams } = params;
  const cacheInput = JSON.stringify(cacheParams);
  const cacheKey = await hashKey(cacheInput);
  
  // Vorschlag 1+4: Check shared cache
  const { data: cached } = await serviceClient
    .from('ai_cache').select('response_data')
    .eq('function_name', 'serpapi-jobs').eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  
  if (cached) {
    const cachedData = cached.response_data as any;
    console.log(`  [cache HIT] q="${params.q}", loc="${params.location}"`);
    return { results: cachedData.results || [], nextPageToken: cachedData.nextPageToken || null };
  }

  // No cache - make actual API call
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

// ── SerpApi search with all optimizations ──

async function searchSerpApi(
  query: string,
  locations: string[],
  radiusKm: number | null,
  maxPages: number,
  language: string,
  serviceClient: any,
  chips?: string,
  ltype?: string,
  isPrimaryLocation?: boolean,
): Promise<any[]> {
  const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
  if (!SERPAPI_KEY) throw new Error("SERPAPI_KEY is not configured");

  const allResults: any[] = [];
  const globalSeenKeys = new Set<string>(); // For Vorschlag 6: track seen jobs across pages

  for (const loc of locations) {
    let nextPageToken: string | null = null;
    let locationResults = 0;

    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, string> = {
        engine: 'google_jobs',
        q: query,
        location: loc,
        hl: language || 'de',
        gl: 'ch',
        api_key: SERPAPI_KEY,
      };

      if (radiusKm && !loc.startsWith('Switzerland') && loc !== 'Switzerland') {
        params.lrad = String(radiusKm);
      }
      if (nextPageToken) params.next_page_token = nextPageToken;
      if (chips) params.chips = chips;
      if (ltype) params.ltype = ltype;

      console.log(`SerpApi: q="${query}", loc="${loc}", page=${page}, hl=${language}`);
      
      try {
        const { results: pageResults, nextPageToken: nextToken } = await fetchSerpApiPage(params, serviceClient);
        
        // Vorschlag 6: Count genuinely new results on this page
        let newOnThisPage = 0;
        for (const job of pageResults) {
          const key = getJobDedupKey(job);
          if (!globalSeenKeys.has(key)) {
            globalSeenKeys.add(key);
            newOnThisPage++;
          }
        }
        
        allResults.push(...pageResults);
        locationResults += pageResults.length;
        nextPageToken = nextToken;

        // Vorschlag 6: Stop pagination if <5 new results on this page
        if (page > 0 && newOnThisPage < 5) {
          console.log(`  [smart-pagination] Only ${newOnThisPage} new results on page ${page}, stopping`);
          break;
        }

        if (pageResults.length === 0 || !nextPageToken) break;
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        if (page === 0) console.error(`SerpApi error for "${query}" at "${loc}":`, e);
        break;
      }
    }

    // Vorschlag 5: B3 Radius fallback ONLY for primary locations
    if (locationResults === 0 && radiusKm && isPrimaryLocation && !loc.startsWith('Switzerland') && loc !== 'Switzerland') {
      console.log(`[market-radar] B3 fallback: retrying "${query}" at "${loc}" without radius`);
      let nextPageTokenFallback: string | null = null;
      for (let page = 0; page < Math.min(maxPages, 3); page++) {
        const params: Record<string, string> = {
          engine: 'google_jobs',
          q: query,
          location: loc,
          hl: language || 'de',
          gl: 'ch',
          api_key: SERPAPI_KEY,
        };
        if (nextPageTokenFallback) params.next_page_token = nextPageTokenFallback;
        if (chips) params.chips = chips;
        if (ltype) params.ltype = ltype;

        try {
          const { results: pageResults, nextPageToken: nextToken } = await fetchSerpApiPage(params, serviceClient);
          allResults.push(...pageResults);
          nextPageTokenFallback = nextToken;
          if (pageResults.length === 0 || !nextPageTokenFallback) break;
          await new Promise(r => setTimeout(r, 200));
        } catch { break; }
      }
    }
  }

  return allResults;
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
    const { data: fallback } = await serviceClient
      .from('clients').select('id').ilike('name', `%${searchName.substring(0, 10)}%`).limit(1).maybeSingle();
    if (fallback) {
      return { clientId: fallback.id, isNew: false };
    }
    throw error;
  }

  const clientId = newClient.id;

  fetch(`${supabaseUrl}/functions/v1/enrich-client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({
      client_id: clientId,
      company_name: searchName,
      apply_options: job?.apply_options || [],
      location: job?.location || null,
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
      .from('jobs').select('id').eq('external_job_id', externalId).maybeSingle();
    if (byExtId) return { jobId: byExtId.id, isNew: false };
  }

  const { data: existing } = await serviceClient
    .from('jobs').select('id').eq('client_id', clientId).ilike('title', titleNorm).limit(1).maybeSingle();
  if (existing) return { jobId: existing.id, isNew: false };

  const jobLink = extractBestJobLink(job);
  const extensionFields = extractExtensions(job);
  const highlights = extractHighlights(job);

  const { data: newJob, error } = await serviceClient
    .from('jobs')
    .insert({
      title: titleNorm,
      location: job.location || null,
      description: extractIntroDescription(job.description || '') || null,
      source_url: jobLink,
      client_id: clientId,
      user_id: userId,
      status: 'External',
      external_job_id: externalId,
      ...extensionFields,
      ...(highlights.responsibilities ? { responsibilities: highlights.responsibilities } : {}),
      ...(highlights.requirements ? { requirements: highlights.requirements } : {}),
      ...(highlights.benefits ? { benefits: highlights.benefits } : {}),
    })
    .select('id')
    .single();

  if (error) {
    console.error(`Failed to import job "${titleNorm}":`, error.message);
    throw error;
  }

  return { jobId: newJob.id, isNew: true };
}

// ── Live Enrichment: 4-Tier Scraping Cascade ──

const PERMANENT_ERROR_CODES = [403, 410, 451];

async function scrapeAndStructureJob(
  sourceUrl: string, jobTitle: string, jobId: string, serviceClient: any
): Promise<void> {
  const FIRECRAWL_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  const GEMINI_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  
  let rawText = '';
  let strategy = 'none';

  // ── Tier 1: Direct Fetch ──
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(sourceUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const html = await resp.text();
      rawText = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (rawText.length > 1000) strategy = 'direct';
    } else if (PERMANENT_ERROR_CODES.includes(resp.status)) {
      // Googlebot retry
      const resp2 = await fetch(sourceUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      if (resp2.ok) {
        const html = await resp2.text();
        rawText = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (rawText.length > 1000) strategy = 'direct-googlebot';
      } else {
        // Mark permanently dead
        await serviceClient.from('jobs').update({ source_url_status: 'dead' }).eq('id', jobId);
        return;
      }
    }
  } catch (e) {
    console.log(`[enrich] Direct fetch failed for ${jobId}: ${e}`);
  }

  // ── Tier 2: Firecrawl ──
  if (!strategy && FIRECRAWL_KEY) {
    try {
      const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: sourceUrl,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const md = data.data?.markdown || data.markdown || '';
        if (md.length > 1000) {
          rawText = md;
          strategy = 'firecrawl';
        }
      }
    } catch (e) {
      console.log(`[enrich] Firecrawl failed for ${jobId}: ${e}`);
    }
  }

  // ── Tier 3: Google Cache ──
  if (!strategy) {
    try {
      const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(sourceUrl)}`;
      const resp = await fetch(cacheUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const html = await resp.text();
        const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length > 1000) {
          rawText = text;
          strategy = 'google-cache';
        }
      }
    } catch (e) {
      console.log(`[enrich] Google cache failed for ${jobId}: ${e}`);
    }
  }

  // ── Tier 4: Gemini Search Grounding ──
  if (!strategy && GEMINI_KEY) {
    try {
      const domain = new URL(sourceUrl).hostname;
      const groundingResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Retrieve the FULL job posting content from this URL: ${sourceUrl}\nJob title: "${jobTitle}" on ${domain}.\nReturn the COMPLETE text including tasks, requirements, and benefits. Do NOT summarize.` }] }],
            tools: [{ google_search: { dynamic_retrieval_config: { mode: "MODE_DYNAMIC", dynamic_threshold: 0.0 } } }],
            generationConfig: { temperature: 0.0, maxOutputTokens: 4096 },
          }),
          signal: AbortSignal.timeout(12000),
        }
      );
      if (groundingResp.ok) {
        const gData = await groundingResp.json();
        const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (gText.length > 500) {
          rawText = gText;
          strategy = 'gemini-grounding';
        }
      }
    } catch (e) {
      console.log(`[enrich] Gemini grounding failed for ${jobId}: ${e}`);
    }
  }

  // ── Extract structured data with Gemini ──
  if (rawText.length < 1000) {
    console.log(`[enrich] Insufficient text for ${jobId} (${rawText.length} chars via ${strategy || 'none'}), skipping`);
    await serviceClient.from('jobs').update({ source_url_status: 'enriched', source_url_checked_at: new Date().toISOString() }).eq('id', jobId);
    return;
  }

  try {
    const extractPrompt = `Extract from this job posting text (scraped from ${sourceUrl}):

1. A short intro/company description (2-4 sentences, NO tasks/requirements/benefits)
2. Tasks/responsibilities (max 10 items) - copy VERBATIM from source, do NOT paraphrase
3. Requirements/qualifications (max 10 items) - copy VERBATIM from source
4. Benefits (max 7 items) - copy VERBATIM from source

STRICT FIDELITY: Copy the original text word-for-word. Do NOT summarize or rephrase.
Fix only obvious typos. Use Swiss German orthography (ss instead of ß). Bullet points must NOT end with a period.

Return JSON: { "description": "...", "tasks": [...], "requirements": [...], "benefits": [...] }

TEXT (${strategy}):
${rawText.substring(0, 8000)}`;

    const result = await callGeminiAPI("Extract structured job data. Return valid JSON only.", extractPrompt, 3072);
    const parsed = JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());

    const updateFields: Record<string, any> = {
      source_url_status: 'enriched',
      source_url_checked_at: new Date().toISOString(),
    };
    if (parsed.description) updateFields.description = parsed.description;
    if (parsed.tasks?.length) updateFields.responsibilities = '<ul>' + parsed.tasks.map((t: string) => `<li>${t}</li>`).join('') + '</ul>';
    if (parsed.requirements?.length) updateFields.requirements = '<ul>' + parsed.requirements.map((r: string) => `<li>${r}</li>`).join('') + '</ul>';
    if (parsed.benefits?.length) updateFields.benefits = '<ul>' + parsed.benefits.map((b: string) => `<li>${b}</li>`).join('') + '</ul>';

    await serviceClient.from('jobs').update(updateFields).eq('id', jobId);
    console.log(`[enrich] ✓ Job ${jobId} enriched via ${strategy} (${rawText.length} chars)`);
  } catch (e) {
    console.error(`[enrich] Gemini extraction failed for ${jobId}:`, e);
    await serviceClient.from('jobs').update({ source_url_status: 'enriched', source_url_checked_at: new Date().toISOString() }).eq('id', jobId);
  }
}

// ── Synonym Generation (B1: now includes English synonyms) ──

const SYNONYM_PROMPT = `You are an expert recruiter. Generate a Google Jobs search query with OR-linked job title synonyms.

RULES:
1. Return ONLY the query string. No JSON, no explanation.
2. Generate 2-3 German synonyms AND 1-2 English synonyms for the given job title, each in quotes, linked with OR.
3. NO location words, NO company names.
4. Use broad, commonly used job titles in both languages.
5. English synonyms are important because many Swiss job postings (IT, Pharma, Finance) are in English.

FORMAT: "German1" OR "German2" OR "English1" OR "English2"

EXAMPLES:
"Bauleiter" OR "Bauführer" OR "Projektleiter Bau" OR "Construction Manager" OR "Site Manager"
"SPS Programmierer" OR "Automatisierungstechniker" OR "PLC Programmer" OR "Automation Engineer"
"Buchhalter" OR "Finanzbuchhalter" OR "Accountant" OR "Financial Controller"`;

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

  try {
    const startTime = Date.now();
    const { queries, location, radius_km, language, time_filter, work_model, max_pages, auto_synonyms, profile_id, pensum_min, pensum_max } = await req.json();

    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one search query is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userId = userData.user.id;
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const maxPagesVal = Math.min(Math.max(max_pages || 3, 1), 10);

    // Map time_filter to chips parameter
    const chipParts: string[] = [];
    const timeChipsMap: Record<string, string> = {
      'today': 'date_posted:today',
      '3days': 'date_posted:3days',
      'week': 'date_posted:week',
      'month': 'date_posted:month',
    };
    if (timeChipsMap[time_filter]) chipParts.push(timeChipsMap[time_filter]);

    const pMin = typeof pensum_min === 'number' ? pensum_min : 0;
    const pMax = typeof pensum_max === 'number' ? pensum_max : 100;
    if (pMin >= 80) {
      chipParts.push('employment_type:FULLTIME');
    } else if (pMax < 80) {
      chipParts.push('employment_type:PARTTIME');
    }

    const chips = chipParts.length > 0 ? chipParts.join(',') : undefined;
    const ltype = work_model === 'remote' ? '1' : undefined;

    // Vorschlag 3: Resolve locations with primary/neighbor/fallback structure
    const locationStructure = resolveLocationsStructured(location || '');
    
    console.log(`[market-radar] Starting scan: ${queries.length} queries, location="${location}", primary=${locationStructure.primary.length}, neighbors=${locationStructure.neighbors.length}, radius=${radius_km}km, pages=${maxPagesVal}`);

    // ── Step 0: Create scan record with status 'running' ──
    const { data: scanRecord, error: scanInsertError } = await serviceClient.from('market_radar_scans').insert({
      user_id: userId,
      profile_id: profile_id || null,
      queries_used: queries,
      location: location || null,
      total_scraped: 0,
      total_new: 0,
      total_existing: 0,
      total_filtered: 0,
      duration_ms: 0,
      status: 'running',
      imported_job_ids: [],
    }).select('id').single();

    if (scanInsertError) {
      console.error('Failed to create scan record:', scanInsertError);
      throw scanInsertError;
    }
    const scanId = scanRecord.id;

    // ── Step 1: Optionally generate synonyms (B1: now with English synonyms) ──
    let expandedQueries = [...queries];
    if (auto_synonyms) {
      const synonymPromises = queries.map(async (q: string) => {
        try {
          const result = await callGeminiAPI(SYNONYM_PROMPT, `Job title: ${q}`, 256);
          let cleaned = result.trim().replace(/```/g, '').trim();
          if (cleaned.startsWith('"') && cleaned.endsWith('"') && !cleaned.includes(' OR ')) {
            cleaned = cleaned.slice(1, -1);
          }
          if (cleaned.includes(' OR ')) {
            const terms = cleaned.split(/\s+OR\s+/);
            const fixedTerms = terms.map(t => {
              t = t.trim();
              t = t.replace(/^[\\"']+|[\\"']+$/g, '');
              return `"${t}"`;
            });
            return fixedTerms.join(' OR ');
          }
          return `"${q}"`;
        } catch (e) {
          console.error(`Synonym generation failed for "${q}":`, e);
          return `"${q}"`;
        }
      });
      expandedQueries = await Promise.all(synonymPromises);
    } else {
      expandedQueries = queries.map((q: string) => `"${q}"`);
    }

    console.log(`[market-radar] Expanded queries:`, expandedQueries);

    // ── Step 2: Search with early-termination + conditional neighbors ──
    let allResults: any[] = [];
    let serpApiCallCount = 0;

    for (const eq of expandedQueries) {
      // Step 2a: Search combined query on PRIMARY locations first
      const primaryResults: any[] = [];
      
      const combinedResults = await searchSerpApi(
        eq, locationStructure.primary, radius_km || null, maxPagesVal, 'de',
        serviceClient, chips, ltype, true
      );
      primaryResults.push(...combinedResults);
      console.log(`[market-radar] "${eq}" (combined, primary) → ${combinedResults.length} results`);

      // Also search fallback (Switzerland) always
      if (!locationStructure.primary.includes('Switzerland')) {
        const fallbackResults = await searchSerpApi(
          eq, ['Switzerland'], null, maxPagesVal, 'de',
          serviceClient, chips, ltype, false
        );
        primaryResults.push(...fallbackResults);
        console.log(`[market-radar] "${eq}" (combined, Switzerland) → ${fallbackResults.length} results`);
      }

      allResults.push(...primaryResults);

      // Vorschlag 3: Only search NEIGHBORS if primary returned <20 results
      const dedupedPrimary = deduplicateJobs(primaryResults);
      if (dedupedPrimary.length < 20 && locationStructure.neighbors.length > 0) {
        console.log(`[market-radar] Only ${dedupedPrimary.length} primary results, expanding to ${locationStructure.neighbors.length} neighbors`);
        const neighborResults = await searchSerpApi(
          eq, locationStructure.neighbors, null, Math.max(Math.ceil(maxPagesVal / 2), 2), 'de',
          serviceClient, chips, ltype, false // Vorschlag 5: not primary = no B3 fallback
        );
        allResults.push(...neighborResults);
        console.log(`[market-radar] "${eq}" (neighbors) → ${neighborResults.length} results`);
      } else if (locationStructure.neighbors.length > 0) {
        console.log(`[market-radar] ${dedupedPrimary.length} primary results ≥ 20, skipping ${locationStructure.neighbors.length} neighbors`);
      }

      // Vorschlag 2: Early-termination for synonym splits
      // Only split individual terms if combined query returned <25 unique results
      const combinedDedupCount = deduplicateJobs(primaryResults).length;
      
      if (eq.includes(' OR ') && combinedDedupCount < 25) {
        console.log(`[market-radar] Combined returned ${combinedDedupCount} < 25, running individual term searches`);
        const terms = eq.split(/\s+OR\s+/);
        
        const germanTerms: string[] = [];
        const englishTerms: string[] = [];
        
        for (const term of terms) {
          const cleaned = term.trim();
          if (!cleaned) continue;
          const unquoted = cleaned.replace(/^[\\"']+|[\\"']+$/g, '');
          const isGerman = /[äöüÄÖÜß]/.test(unquoted) || /\b(und|oder|für|bei|mit)\b/i.test(unquoted);
          const isEnglish = /\b(manager|engineer|developer|analyst|specialist|consultant|officer|lead|head|director|coordinator)\b/i.test(unquoted);
          
          if (isEnglish && !isGerman) {
            englishTerms.push(cleaned);
          } else {
            germanTerms.push(cleaned);
          }
          
          // Individual term search on primary locations only
          const termLang = (isEnglish && !isGerman) ? 'en' : 'de';
          const termResults = await searchSerpApi(
            cleaned, locationStructure.primary, radius_km || null,
            Math.max(Math.ceil(maxPagesVal / 2), 2), termLang,
            serviceClient, chips, ltype, true
          );
          allResults.push(...termResults);
        }
        
        // B1: Combined English search if we have English terms
        if (englishTerms.length > 0) {
          const englishCombined = englishTerms.join(' OR ');
          const enResults = await searchSerpApi(
            englishCombined, locationStructure.primary, radius_km || null,
            Math.max(Math.ceil(maxPagesVal / 2), 2), 'en',
            serviceClient, chips, ltype, true
          );
          allResults.push(...enResults);
        }
      } else if (eq.includes(' OR ')) {
        console.log(`[market-radar] Combined returned ${combinedDedupCount} ≥ 25, SKIPPING individual term searches (early-termination)`);
        
        // B1: Still do English combined search even with early-termination
        const terms = eq.split(/\s+OR\s+/);
        const englishTerms = terms.filter(t => {
          const unquoted = t.trim().replace(/^[\\"']+|[\\"']+$/g, '');
          const isGerman = /[äöüÄÖÜß]/.test(unquoted);
          const isEnglish = /\b(manager|engineer|developer|analyst|specialist|consultant|officer|lead|head|director|coordinator)\b/i.test(unquoted);
          return isEnglish && !isGerman;
        });
        
        if (englishTerms.length > 0) {
          const englishCombined = englishTerms.map(t => t.trim()).join(' OR ');
          const enResults = await searchSerpApi(
            englishCombined, locationStructure.primary, radius_km || null,
            Math.max(Math.ceil(maxPagesVal / 2), 2), 'en',
            serviceClient, chips, ltype, false
          );
          allResults.push(...enResults);
          console.log(`[market-radar] English combined search → ${enResults.length} results`);
        }
      }
    }

    // ── Step 3: Deduplicate ──
    allResults = deduplicateJobs(allResults);
    console.log(`[market-radar] After dedup: ${allResults.length}`);

    // ── Step 4: Filter agencies + Parallel CRM Import ──
    let totalNew = 0;
    let totalExisting = 0;
    let totalFiltered = 0;
    const importedJobs: { jobId: string; title: string; company: string; location: string; sourceUrl: string | null; isNew: boolean }[] = [];

    const nonAgencyJobs = allResults.filter(job => {
      if (!job.company_name || !job.title) return false;
      if (isRecruitmentAgency(job.company_name, job.via || '')) {
        totalFiltered++;
        return false;
      }
      return true;
    });

    console.log(`[market-radar] Non-agency jobs: ${nonAgencyJobs.length}, filtered: ${totalFiltered}`);

    const batchSize = 5;
    const enrichmentPromises: Promise<void>[] = [];
    let enrichmentCount = 0;
    const MAX_LIVE_ENRICHMENTS = 30;

    for (let i = 0; i < nonAgencyJobs.length; i += batchSize) {
      const batch = nonAgencyJobs.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async (job: any) => {
        try {
          const { clientId } = await findOrCreateClient(job.company_name, userId, serviceClient, supabaseUrl, serviceRoleKey, job);
          const { jobId, isNew } = await importJobIfNew(job, clientId, userId, serviceClient);

          const sourceUrl = extractBestJobLink(job);

          // Live enrichment for new jobs: 4-tier scraping cascade
          if (isNew && sourceUrl && enrichmentCount < MAX_LIVE_ENRICHMENTS) {
            const highlights = extractHighlights(job);
            const hasHighlights = highlights.responsibilities || highlights.requirements || highlights.benefits;
            if (!hasHighlights) {
              enrichmentCount++;
              enrichmentPromises.push(
                scrapeAndStructureJob(sourceUrl, job.title, jobId, serviceClient)
                  .catch(e => console.error(`[enrich] Failed for ${jobId}:`, e))
              );
            }
          }

          return {
            jobId,
            title: job.title,
            company: job.company_name,
            location: job.location || '',
            sourceUrl,
            isNew,
          };
        } catch (e) {
          console.error(`Import failed for "${job.title}":`, e);
          return null;
        }
      }));

      for (const r of batchResults) {
        if (!r) continue;
        if (r.isNew) totalNew++;
        else totalExisting++;
        importedJobs.push(r);
      }
    }

    // Await all enrichment promises before completing the scan
    if (enrichmentPromises.length > 0) {
      console.log(`[market-radar] Awaiting ${enrichmentPromises.length} live enrichments...`);
      await Promise.allSettled(enrichmentPromises);
      console.log(`[market-radar] All enrichments settled`);
    }

    const durationMs = Date.now() - startTime;
    console.log(`[market-radar] Done: ${totalNew} new, ${totalExisting} existing, ${totalFiltered} filtered, ${durationMs}ms`);

    // ── Step 5: Update scan record with results ──
    await serviceClient.from('market_radar_scans').update({
      total_scraped: allResults.length + totalFiltered,
      total_new: totalNew,
      total_existing: totalExisting,
      total_filtered: totalFiltered,
      duration_ms: durationMs,
      status: 'completed',
      imported_job_ids: importedJobs.map(j => ({ jobId: j.jobId, title: j.title, company: j.company, location: j.location, sourceUrl: j.sourceUrl, isNew: j.isNew })),
    }).eq('id', scanId);

    return new Response(JSON.stringify({
      scan_id: scanId,
      success: true,
      total_scraped: allResults.length + totalFiltered,
      total_new: totalNew,
      total_existing: totalExisting,
      total_filtered: totalFiltered,
      duration_ms: durationMs,
      queries_used: expandedQueries,
      imported_jobs: importedJobs,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in market-radar-scan:', error);
    try {
      const serviceRoleKey2 = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabaseUrl2 = Deno.env.get('SUPABASE_URL')!;
      const sc = createClient(supabaseUrl2, serviceRoleKey2);
      const authHeader2 = req.headers.get('Authorization');
      if (authHeader2) {
        const ac = createClient(supabaseUrl2, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader2 } } });
        const { data: u } = await ac.auth.getUser(authHeader2.replace('Bearer ', ''));
        if (u?.user) {
          await sc.from('market_radar_scans').update({ status: 'failed' }).eq('user_id', u.user.id).eq('status', 'running');
        }
      }
    } catch (_) { /* best effort */ }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
