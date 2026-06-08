import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Job portal domains that should NOT be treated as company websites
const JOB_PORTAL_DOMAINS = [
  'jobs.ch', 'indeed.com', 'linkedin.com', 'glassdoor.com', 'stepstone.',
  'monster.', 'xing.com', 'jobscout24.', 'jobup.ch', 'tutti.ch',
  'myworkdayjobs.com', 'workday.com', 'successfactors.', 'greenhouse.io',
  'lever.co', 'smartrecruiters.', 'recruitee.', 'personio.', 'join.com',
  'google.com/search', 'talent.com', 'jooble.', 'neuvoo.', 'adzuna.',
  'ostendis.com', 'abacus.ch', 'karriere.at', 'stellenanzeigen.de',
  'careerbuilder.', 'ziprecruiter.',
];

function isJobPortalUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return JOB_PORTAL_DOMAINS.some(domain => lower.includes(domain));
}

// ── Step 1: Find Website ──

// Extract company domain from SerpApi apply_options
function extractCompanyDomainFromApplyOptions(applyOptions: any[]): string | null {
  if (!applyOptions || !Array.isArray(applyOptions)) return null;
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

// HEAD-request validation
async function validateUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CompanyParser/1.0)' },
    });
    clearTimeout(timeout);
    return res.ok || res.status === 301 || res.status === 302 || res.status === 308;
  } catch {
    return false;
  }
}

// Verify that a website actually belongs to the company by checking if the company name appears on the homepage
async function verifyWebsiteBelongsToCompany(url: string, companyName: string): Promise<boolean> {
  if (!url || !companyName) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return false;

    const html = await res.text();
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    // Normalize company name for matching
    const nameWords = companyName.toLowerCase()
      .replace(/\b(ag|gmbh|sa|sàrl|sarl|ltd|inc|se|kg|co|ohg|plc|llc|corp|ug|gbr|sia)\b/gi, '')
      .replace(/[.,\-+&\/\\()]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3);

    if (nameWords.length === 0) return true; // Can't verify, assume OK

    // Check if at least one significant name word appears on the page
    const matchCount = nameWords.filter(w => textContent.includes(w)).length;
    const matchRatio = matchCount / nameWords.length;

    console.log(`Website verification for "${companyName}" on ${url}: ${matchCount}/${nameWords.length} words found (${(matchRatio * 100).toFixed(0)}%)`);
    return matchRatio >= 0.5; // At least half the name words must appear
  } catch (e) {
    console.warn(`Website verification failed for ${url}:`, e);
    return false; // If we can't verify, reject it
  }
}

// Use Gemini with Google Search Grounding to find the real website
async function findWebsiteWithGrounding(companyName: string, location: string | null, apiKey: string): Promise<string | null> {
  try {
    const locationHint = location ? ` in ${location}` : ' in der Schweiz';
    const prompt = `Find the official company website URL for "${companyName}"${locationHint}. Return ONLY the URL, nothing else. If you cannot find it with certainty, return "UNKNOWN".`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini Grounding error:', response.status, errText);
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Also check grounding metadata for URLs
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const groundingChunks = groundingMetadata?.groundingChunks || [];
    
    // Try to extract URL from grounding chunks first (most reliable)
    for (const chunk of groundingChunks) {
      const webUri = chunk?.web?.uri;
      if (webUri && !isJobPortalUrl(webUri)) {
        try {
          const url = new URL(webUri);
          const candidateUrl = `${url.protocol}//${url.hostname}`;
          console.log(`Grounding chunk URL for "${companyName}": ${candidateUrl}`);
          return candidateUrl;
        } catch { /* ignore */ }
      }
    }

    // Fallback: parse URL from response text
    const cleaned = text.replace(/["\s\n]/g, '');
    if (cleaned === 'UNKNOWN' || !cleaned.startsWith('http')) return null;
    try {
      const url = new URL(cleaned);
      return `${url.protocol}//${url.hostname}`;
    } catch {
      return null;
    }
  } catch (e) {
    console.error(`Grounding search failed for "${companyName}":`, e);
    return null;
  }
}

// Multi-stage website discovery with verification
async function discoverAndVerifyWebsite(
  companyName: string,
  location: string | null,
  applyOptions: any[],
  apiKey: string
): Promise<string | null> {
  // Stage 1: Extract from apply_options (most reliable - actual job posting source)
  const domainFromApply = extractCompanyDomainFromApplyOptions(applyOptions);
  if (domainFromApply) {
    const isValid = await validateUrl(domainFromApply);
    if (isValid) {
      const belongs = await verifyWebsiteBelongsToCompany(domainFromApply, companyName);
      if (belongs) {
        console.log(`✅ Website from apply_options for "${companyName}": ${domainFromApply}`);
        return domainFromApply;
      }
      console.log(`❌ apply_options URL ${domainFromApply} doesn't match "${companyName}", trying grounding...`);
    }
  }

  // Stage 2: Gemini with Google Search Grounding (real search, not hallucination)
  const groundedUrl = await findWebsiteWithGrounding(companyName, location, apiKey);
  if (groundedUrl) {
    const isValid = await validateUrl(groundedUrl);
    if (isValid) {
      const belongs = await verifyWebsiteBelongsToCompany(groundedUrl, companyName);
      if (belongs) {
        console.log(`✅ Website from Gemini Grounding for "${companyName}": ${groundedUrl}`);
        return groundedUrl;
      }
      console.log(`❌ Grounding URL ${groundedUrl} failed verification for "${companyName}"`);
    }
  }

  console.log(`⚠️ No verified website found for "${companyName}"`);
  return null;
}

// ── Step 2b helper: Research metadata via Gemini Search Grounding ──

async function researchMetadataWithGrounding(
  companyName: string,
  location: string | null,
  apiKey: string
): Promise<{ industry?: string; address?: string } | null> {
  try {
    const locationHint = location ? ` in ${location}` : ' in der Schweiz';
    const prompt = `Finde folgende Informationen über das Unternehmen "${companyName}"${locationHint}:

1. Branche/Industrie (z.B. "Baugewerbe", "IT-Dienstleistungen", "Maschinenbau")
2. Hauptsitz-Adresse (Stadt und Land)

Antworte NUR im folgenden Format, nichts anderes:
BRANCHE: [Branche oder UNBEKANNT]
ADRESSE: [Stadt, Land oder UNBEKANNT]`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
        }),
      }
    );

    if (!response.ok) {
      console.error('Grounding metadata research failed:', await response.text());
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    console.log(`Grounding metadata for "${companyName}":`, text);

    const result: { industry?: string; address?: string } = {};

    const industryMatch = text.match(/BRANCHE:\s*(.+)/i);
    if (industryMatch && !industryMatch[1].includes('UNBEKANNT')) {
      result.industry = industryMatch[1].trim();
    }

    const addressMatch = text.match(/ADRESSE:\s*(.+)/i);
    if (addressMatch && !addressMatch[1].includes('UNBEKANNT')) {
      result.address = addressMatch[1].trim();
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (e) {
    console.error(`Grounding metadata error for "${companyName}":`, e);
    return null;
  }
}

// ── Main Handler ──

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, company_name, apply_options, location } = await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Load current client data
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const name = company_name || client.name;
    const enrichmentLog: string[] = [];
    let websiteUrl = client.website; // Use existing website if already set

    // ── Step 1: Find & verify website (only if not already set) ──
    if (!websiteUrl) {
      websiteUrl = await discoverAndVerifyWebsite(
        name,
        location || client.address || null,
        apply_options || [],
        GEMINI_API_KEY
      );

      if (websiteUrl) {
        await supabase.from('clients').update({ website: websiteUrl }).eq('id', client_id);
        enrichmentLog.push(`website: ${websiteUrl}`);
      }
    }

    // ── Step 2a: Parse website for metadata (if we have a website and fields are empty) ──
    const needsMetadata = !client.industry || !client.address || !client.email;
    let metadataEnriched = false;
    if (websiteUrl && needsMetadata) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        };
        const parseRes = await fetch(`${supabaseUrl}/functions/v1/parse-company-website`, {
          method: 'POST', headers,
          body: JSON.stringify({ url: websiteUrl }),
        });

        if (parseRes.ok) {
          const parseResult = await parseRes.json();
          const parsed = parseResult?.data || parseResult;

          if (parsed) {
            const updates: Record<string, string> = {};
            if (parsed.industry && !client.industry) updates.industry = parsed.industry;
            if (parsed.address && !client.address) updates.address = parsed.address;
            if (parsed.email && !client.email) updates.email = parsed.email;
            if (parsed.phone && !client.phone) updates.phone = parsed.phone;
            if (parsed.benefits && !client.benefits) updates.benefits = parsed.benefits;
            if (parsed.careers_url && !client.careers_url) updates.careers_url = parsed.careers_url;

            if (Object.keys(updates).length > 0) {
              await supabase.from('clients').update(updates).eq('id', client_id);
              enrichmentLog.push(`metadata: ${Object.keys(updates).join(', ')}`);
              metadataEnriched = true;
            }
          }
        } else {
          const errText = await parseRes.text();
          console.warn(`Website parse failed for "${name}" (${parseRes.status}):`, errText.substring(0, 200));
        }
      } catch (e) {
        console.error(`Website parse error for "${name}":`, e);
      }
    }

    // ── Step 2b: Gemini Grounding metadata fallback (if no website or parsing failed) ──
    const stillNeedsMetadata = !client.industry || !client.address;
    if (!metadataEnriched && stillNeedsMetadata) {
      try {
        console.log(`Using Gemini Search Grounding for metadata research: "${name}"`);
        const groundingMetadata = await researchMetadataWithGrounding(name, location || client.address || null, GEMINI_API_KEY);
        
        if (groundingMetadata) {
          const updates: Record<string, string> = {};
          if (groundingMetadata.industry && !client.industry) updates.industry = groundingMetadata.industry;
          if (groundingMetadata.address && !client.address) updates.address = groundingMetadata.address;
          
          if (Object.keys(updates).length > 0) {
            await supabase.from('clients').update(updates).eq('id', client_id);
            enrichmentLog.push(`grounding-metadata: ${Object.keys(updates).join(', ')}`);
          }
        }
      } catch (e) {
        console.error(`Grounding metadata research error for "${name}":`, e);
      }
    }

    // ── Step 3: Fetch logo (if not already set) ──
    if (!client.logo_url && (websiteUrl || name)) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        };
        const logoRes = await fetch(`${supabaseUrl}/functions/v1/fetch-company-logo`, {
          method: 'POST', headers,
          body: JSON.stringify({
            url: websiteUrl || '',
            client_id: client_id,
            company_name: name,
          }),
        });
        if (logoRes.ok) {
          enrichmentLog.push('logo');
        } else {
          await logoRes.text(); // consume body
        }
      } catch (e) {
        console.error(`Logo fetch error for "${name}":`, e);
      }
    }

    // ── Step 4: Generate AI description (ALWAYS, if not already approved) ──
    if (!client.description_approved) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        };
        const descRes = await fetch(`${supabaseUrl}/functions/v1/generate-company-description`, {
          method: 'POST', headers,
          body: JSON.stringify({ client_id: client_id }),
        });
        if (descRes.ok) {
          const descData = await descRes.json();
          if (descData.description) {
            await supabase.from('clients').update({
              description: descData.description,
            }).eq('id', client_id);
            enrichmentLog.push('description');
          }
        } else {
          await descRes.text(); // consume body
        }
      } catch (e) {
        console.error(`Description gen error for "${name}":`, e);
      }
    }

    console.log(`✅ Enrichment complete for "${name}" (${client_id}): [${enrichmentLog.join(', ') || 'nothing new'}]`);

    return new Response(
      JSON.stringify({
        success: true,
        client_id,
        enriched: enrichmentLog,
        website: websiteUrl || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Enrichment error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
