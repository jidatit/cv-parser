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


async function callGeminiAPI(prompt: string) {
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_GEMINI_API_KEY not configured');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
    let { url } = await req.json();
    
    // Normalize URL - add https:// if no protocol
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    
    console.log('Parsing company website:', url);

    if (!url) {
      throw new Error('URL is required');
    }

    // === CACHE CHECK ===
    const normalizedUrl = url.toLowerCase().replace(/\/+$/, '');
    const cacheKey = await hashKey(normalizedUrl);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: cached } = await serviceClient
      .from('ai_cache')
      .select('response_data')
      .eq('function_name', 'parse-company-website')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cached) {
      console.log('✅ Cache hit for parse-company-website:', normalizedUrl);
      return new Response(JSON.stringify(cached.response_data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('Cache miss for parse-company-website, calling AI...');

    // Fetch the website content with robust headers
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
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

    let websiteResponse = await fetch(url, { headers: browserHeaders, redirect: 'follow' });

    // Retry with minimal headers if forbidden
    if (websiteResponse.status === 403 || websiteResponse.status === 401) {
      console.log('First attempt blocked, retrying with alternative headers...');
      websiteResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html',
        },
        redirect: 'follow',
      });
    }

    // If 404, try toggling www. prefix
    if (websiteResponse.status === 404) {
      try {
        const parsedUrl = new URL(url);
        let altUrl: string;
        if (parsedUrl.hostname.startsWith('www.')) {
          parsedUrl.hostname = parsedUrl.hostname.replace(/^www\./, '');
        } else {
          parsedUrl.hostname = 'www.' + parsedUrl.hostname;
        }
        altUrl = parsedUrl.toString();
        console.log('Got 404, retrying with alternate URL:', altUrl);
        websiteResponse = await fetch(altUrl, { headers: browserHeaders, redirect: 'follow' });
      } catch (e) {
        console.log('Could not construct alternate URL:', e);
      }
    }

    if (!websiteResponse.ok) {
      throw new Error(`Failed to fetch website: ${websiteResponse.statusText}`);
    }

    const html = await websiteResponse.text();
    
    // More aggressive extraction of contact sections
    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Extract footer and contact sections with HTML preserved temporarily
    const footerRegex = /<footer[^>]*>[\s\S]*?<\/footer>/gi;
    const impressumRegex = /(?:<[^>]*(?:impressum|imprint|kontakt|contact|adresse)[^>]*>[\s\S]{0,3000})/gi;
    
    const footerSections = cleanHtml.match(footerRegex) || [];
    const contactSections = cleanHtml.match(impressumRegex) || [];
    
    // Extract all links that contain email addresses
    const emailRegex = /(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    const phoneRegex = /(?:\+41|0041|0)\s*\d{2}\s*\d{3}\s*\d{2}\s*\d{2}|\+41\s*\(\d{2}\)\s*\d{3}\s*\d{2}\s*\d{2}/gi;
    
    const emails = html.match(emailRegex) || [];
    const phones = html.match(phoneRegex) || [];
    
    // Format phone numbers with proper spacing
    const formattedPhones = phones.map(phone => {
      let clean = phone.replace(/\s+/g, '');
      if (clean.startsWith('+41')) {
        return clean.replace(/(\+41)(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
      }
      return phone;
    });
    
    // Extract career page links
    const jobListingKeywords = ['jobs', 'stellen', 'stellenangebote', 'offene-stellen', 'vacancies', 'stellenportal', 'job-openings', 'open-positions', 'offene-positionen'];
    const generalCareerKeywords = ['karriere', 'career', 'careers', 'work-with-us', 'join', 'arbeiten-bei', 'join-us'];
    
    const priorityLinks: string[] = [];
    const secondaryLinks: string[] = [];
    
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let hrefMatch;
    while ((hrefMatch = hrefRegex.exec(html)) !== null) {
      const link = hrefMatch[1].toLowerCase();
      let fullLink = hrefMatch[1];
      
      if (fullLink.startsWith('/')) {
        const baseUrl = new URL(url);
        fullLink = `${baseUrl.protocol}//${baseUrl.host}${fullLink}`;
      } else if (!fullLink.startsWith('http')) {
        const baseUrl = new URL(url);
        fullLink = `${baseUrl.protocol}//${baseUrl.host}/${fullLink}`;
      }
      
      if (jobListingKeywords.some(keyword => link.includes(keyword))) {
        if (!priorityLinks.includes(fullLink)) {
          priorityLinks.push(fullLink);
        }
      } else if (generalCareerKeywords.some(keyword => link.includes(keyword))) {
        if (!secondaryLinks.includes(fullLink)) {
          secondaryLinks.push(fullLink);
        }
      }
    }
    
    const careerLinks = [...priorityLinks, ...secondaryLinks];
    
    console.log('Found career links:', careerLinks);
    
    // Clean text content
    let textContent = cleanHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Build priority content with emphasis on contact information
    const priorityContent = [
      '=== FOOTER SECTIONS ===',
      ...footerSections.map(s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')),
      '=== CONTACT SECTIONS ===',
      ...contactSections.map(s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')),
      '=== FOUND EMAILS ===',
      emails.join(', '),
      '=== FOUND PHONES ===',
      formattedPhones.join(', '),
      '=== FOUND CAREER LINKS ===',
      careerLinks.join(', '),
      '=== MAIN CONTENT (search for benefits, perks, work culture) ===',
      textContent.slice(0, 6000)
    ].join('\n\n').slice(0, 15000);

    console.log('Extracted priority content length:', priorityContent.length);

    // Load predefined industries from DB
    const { data: existingIndustries } = await serviceClient
      .from('industries')
      .select('name')
      .order('name');

    const industryList = existingIndustries?.map(i => i.name).join('", "') || '';
    console.log('Loaded industries from DB:', existingIndustries?.length || 0);

    const parsePrompt = `You are a company information extraction assistant. Analyze the website content and extract company information. Return ONLY a valid JSON object with these fields:
- name: company name (string)
- industry: Choose ONE from the following predefined list: "${industryList}". If none fits well, you may suggest a new one in German. (string)
- description: CRITICAL - comprehensive company description IN GERMAN (string, 4-5 sentences). MUST ALWAYS INCLUDE: employee count, locations, business areas, unique information
- contact_person: name of HR contact person if found (string or null)
- email: general company contact email (string or null)
- phone: phone number with country code (string or null)
- address: main headquarters address (string or null)
- careers_url: careers/jobs page URL (string or null)
- benefits: ALL employee benefits mentioned IN GERMAN, formatted as bullet points separated by " • " (string or null)

Extract company information from this website content:

${priorityContent}`;

    const parsedContent = await callGeminiAPI(parsePrompt);

    // Parse the JSON response
    let companyData;
    try {
      const jsonMatch = parsedContent.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : parsedContent;
      companyData = JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', parsedContent);
      throw new Error('Invalid JSON response from AI');
    }

    console.log('Successfully parsed company data:', companyData);

    // Extract and upload logo
    let logoUrl = null;
    let isLowQualityLogo = false;
    let extractedLogoUrl = null;
    
    try {
      console.log('Attempting to extract and upload company logo...');
      
      const logoPatterns = [
        { pattern: /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i, quality: 'high' },
        { pattern: /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i, quality: 'high' },
        { pattern: /<link\s+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i, quality: 'low' },
        { pattern: /<link\s+rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i, quality: 'low' },
      ];

      for (const { pattern, quality } of logoPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          extractedLogoUrl = match[1];
          isLowQualityLogo = quality === 'low';
          console.log(`Found ${quality} quality logo URL:`, extractedLogoUrl);
          break;
        }
      }

      if (!extractedLogoUrl) {
        const baseUrl = new URL(url);
        extractedLogoUrl = `${baseUrl.protocol}//${baseUrl.host}/favicon.ico`;
        isLowQualityLogo = true;
        console.log('Trying favicon.ico as fallback');
      }

      if (extractedLogoUrl && !extractedLogoUrl.startsWith('http')) {
        const baseUrl = new URL(url);
        if (extractedLogoUrl.startsWith('//')) {
          extractedLogoUrl = `${baseUrl.protocol}${extractedLogoUrl}`;
        } else if (extractedLogoUrl.startsWith('/')) {
          extractedLogoUrl = `${baseUrl.protocol}//${baseUrl.host}${extractedLogoUrl}`;
        } else {
          extractedLogoUrl = `${baseUrl.protocol}//${baseUrl.host}/${extractedLogoUrl}`;
        }
      }

      // Only upload high-quality logos from website
      if (extractedLogoUrl && !isLowQualityLogo) {
        const logoResponse = await fetch(extractedLogoUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (logoResponse.ok && logoResponse.body) {
          const contentType = logoResponse.headers.get('content-type') || 'image/png';
          const logoBlob = await logoResponse.blob();
          
          if (logoBlob.size <= 2 * 1024 * 1024) {
            const ext = contentType.includes('svg') ? 'svg' 
                      : contentType.includes('png') ? 'png'
                      : contentType.includes('jpg') || contentType.includes('jpeg') ? 'jpg'
                      : contentType.includes('ico') ? 'ico'
                      : 'png';

            const fileName = `company-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
            
            const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
            const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
            
            if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
              const uploadResponse = await fetch(
                `${SUPABASE_URL}/storage/v1/object/company-logos/${fileName}`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': contentType,
                  },
                  body: logoBlob,
                }
              );

              if (uploadResponse.ok) {
                logoUrl = fileName;
                console.log('High-quality logo uploaded successfully, path:', logoUrl);
              } else {
                const uploadError = await uploadResponse.text();
                console.error('Logo upload failed:', uploadResponse.status, uploadError);
              }
            }
          } else {
            console.log('Logo too large (>2MB), skipping');
            isLowQualityLogo = true;
          }
        }
      } else if (isLowQualityLogo) {
        console.log('Low-quality logo detected, will search internet instead');
      }
    } catch (logoError) {
      console.error('Error processing logo:', logoError);
    }

    // If no high-quality logo was found, search the internet for company logo
    if (!logoUrl || isLowQualityLogo) {
      const lowQualityLogoUrl = isLowQualityLogo ? extractedLogoUrl : null;
      console.log('No high-quality logo found on website, searching internet for company logo...');
      
      try {
        const logoSearchPrompt = `Suche auf der offiziellen Website ${url} nach dem hochauflösenden Firmenlogo für "${companyData.name}". 
                
Durchsuche die Website nach Logo-Dateien und gib die DIREKTE URL zu einer hochqualitativen Logo-Bilddatei zurück (PNG, JPG oder SVG):
- Mindestens 200x200px Auflösung
- Vorzugsweise SVG, PNG oder JPG Format
- Nicht: favicon.ico oder apple-touch-icon
- Suche in /assets/, /fileadmin/, /images/, /media/, /wp-content/ etc.

WICHTIG: Gib NUR URLs zurück, die tatsächlich auf der Website ${url} existieren. Erfinde keine URLs.

Antworte NUR mit der direkten URL zum Bild, keine weitere Erklärung.
Falls kein geeignetes Logo gefunden wird, antworte mit "NOT_FOUND".`;

        const foundLogoUrl = await callGeminiAPI(logoSearchPrompt);
        
        if (foundLogoUrl && foundLogoUrl.trim() !== 'NOT_FOUND' && foundLogoUrl.trim().startsWith('http')) {
          console.log('Found logo URL from internet search:', foundLogoUrl.trim());
          
          const logoResponse = await fetch(foundLogoUrl.trim(), {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (logoResponse.ok && logoResponse.body) {
            const contentType = logoResponse.headers.get('content-type') || 'image/png';
            const logoBlob = await logoResponse.blob();
            
            if (logoBlob.size <= 2 * 1024 * 1024) {
              const ext = contentType.includes('svg') ? 'svg' 
                        : contentType.includes('png') ? 'png'
                        : contentType.includes('jpg') || contentType.includes('jpeg') ? 'jpg'
                        : 'png';

              const fileName = `company-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
              
              const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
              const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
              
              if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
                const uploadResponse = await fetch(
                  `${SUPABASE_URL}/storage/v1/object/company-logos/${fileName}`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                      'Content-Type': contentType,
                    },
                    body: logoBlob,
                  }
                );

                if (uploadResponse.ok) {
                  logoUrl = fileName;
                  console.log('Logo from internet search uploaded, path:', logoUrl);
                }
              }
            }
          }
        }
      } catch (logoSearchError) {
        console.error('Error searching for logo on internet:', logoSearchError);
      }
      
      // Fallback: Use low-quality logo if internet search failed
      if (!logoUrl && lowQualityLogoUrl) {
        console.log('Internet search failed, using low-quality logo as fallback');
        try {
          const logoResponse = await fetch(lowQualityLogoUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (logoResponse.ok && logoResponse.body) {
            const contentType = logoResponse.headers.get('content-type') || 'image/png';
            const logoBlob = await logoResponse.blob();
            
            if (logoBlob.size <= 2 * 1024 * 1024) {
              const ext = contentType.includes('svg') ? 'svg' 
                        : contentType.includes('png') ? 'png'
                        : contentType.includes('jpg') || contentType.includes('jpeg') ? 'jpg'
                        : contentType.includes('ico') ? 'ico'
                        : 'png';

              const fileName = `company-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
              
              const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
              const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
              
              if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
                const uploadResponse = await fetch(
                  `${SUPABASE_URL}/storage/v1/object/company-logos/${fileName}`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                      'Content-Type': contentType,
                    },
                    body: logoBlob,
                  }
                );

                if (uploadResponse.ok) {
                  logoUrl = fileName;
                  console.log('Fallback logo uploaded, path:', logoUrl);
                }
              }
            }
          }
        } catch (fallbackError) {
          console.error('Error uploading fallback logo:', fallbackError);
        }
      }
    }

    // Add logo URL to company data
    if (logoUrl) {
      companyData.logo_url = logoUrl;
    }

    // Second call: Enhanced web search for description and benefits
    console.log('Searching web for comprehensive company information...');
    
    try {
      const enhancedPrompt = `Suche im Internet nach umfassenden Informationen über das Unternehmen "${companyData.name}" (Website: ${url}).

Durchsuche verschiedene Quellen wie:
- Kununu, Glassdoor und andere Arbeitgeber-Bewertungsplattformen
- LinkedIn Unternehmensseite  
- Unternehmens-Wikipedia-Einträge
- Karriereportale und aktuelle Jobanzeigen
- News, Pressemitteilungen und Geschäftsberichte
- Unternehmens-Social-Media-Kanäle

Extrahiere und formatiere folgende Informationen:

1. BESCHREIBUNG (description):
Erstelle eine umfassende Firmenbeschreibung IN DEUTSCH (4-5 Sätze) mit:
- Mitarbeiteranzahl (falls verfügbar, sonst "Mitarbeiteranzahl nicht öffentlich bekannt")
- Alle Standorte/Niederlassungen
- Detaillierte Geschäftsbereiche und Spezialisierungen
- Besonderheiten, Innovationen, Erfolge, Unternehmenskultur

2. BENEFITS (benefits):
Liste ALLE verifizierten Mitarbeiter-Benefits auf. Suche nach:
- Arbeitszeit & Flexibilität (Flexible Arbeitszeiten, Gleitzeit, Teilzeit, 4-Tage-Woche)
- Remote Work (Home Office, Remote-Arbeit, mobiles Arbeiten)
- Weiterbildung (Trainings, Kurse, Konferenzen, Budget)
- Gesundheit (Gesundheitsförderung, Fitnessstudio, Vorsorge)
- Sozialleistungen (Pensionskasse, Versicherungen, Boni, Gewinnbeteiligung)
- Work-Life-Balance (Ferientage, Sabbatical, Elternzeit)
- Team & Kultur (Team-Events, Firmenevents, Teambuilding, Teamausflüge)
- Infrastruktur (Moderne Büros, kostenlose Getränke/Snacks, Parkplätze, ÖV-Abo)
- Zusatzleistungen (Essenszulagen, Mitarbeiterrabatte, etc.)

Formatiere als Bullet-Points getrennt durch " • " AUF DEUTSCH.

ANTWORTFORMAT (als JSON):
{
  "description": "Vollständige Beschreibung hier...",
  "benefits": "Benefit 1 • Benefit 2 • Benefit 3 • ..."
}

Falls keine verlässlichen Informationen gefunden werden, verwende die bereits extrahierten Daten.
Gib NUR das JSON-Objekt zurück, keine Erklärungen.`;

      const enhancedContent = await callGeminiAPI(enhancedPrompt);
      
      if (enhancedContent) {
        try {
          const jsonMatch = enhancedContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            if (parsed.description && parsed.description.length > 200) {
              console.log('Found enhanced description from web');
              companyData.description = parsed.description;
            }
            
            if (parsed.benefits && parsed.benefits !== 'null' && !parsed.benefits.toLowerCase().includes('keine')) {
              console.log('Found enhanced benefits from web');
              companyData.benefits = parsed.benefits;
            }
          }
        } catch (parseError) {
          console.error('Error parsing enhanced data:', parseError);
        }
      }
    } catch (enhancedError) {
      console.error('Error fetching enhanced data:', enhancedError);
    }

    const responseData = { success: true, data: companyData };

    // === CACHE WRITE ===
    const ttl30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await serviceClient.from('ai_cache').upsert({
      function_name: 'parse-company-website',
      cache_key: cacheKey,
      response_data: responseData,
      expires_at: ttl30Days,
    }, { onConflict: 'function_name,cache_key' });
    console.log('✅ Cached parse-company-website result');

    return new Response(
      JSON.stringify(responseData),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in parse-company-website:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
