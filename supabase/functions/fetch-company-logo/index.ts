import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MAX_IMAGE_SIZE = 500 * 1024;
const FALSE_POSITIVE_PATTERNS = /menu|hamburger|icon-|arrow|close|search|chevron|spinner|loading|toggle|burger/i;

function isFalsePositive(src: string): boolean {
  return FALSE_POSITIVE_PATTERNS.test(src);
}

function resolveUrl(u: string, baseOrigin: string): string | null {
  try {
    return new URL(u, baseOrigin).href;
  } catch {
    return null;
  }
}

function extractLogoImgUrls(html: string): string[] {
  const urls: string[] = [];
  const imgMatches = html.matchAll(/<img[^>]+>/gi);
  for (const m of imgMatches) {
    const tag = m[0];
    const classMatch = tag.match(/class=["']([^"']*)["']/i);
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);
    const idMatch = tag.match(/id=["']([^"']*)["']/i);
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);

    const hasLogoKeyword =
      (classMatch?.[1] && /logo/i.test(classMatch[1])) ||
      (altMatch?.[1] && /logo/i.test(altMatch[1])) ||
      (idMatch?.[1] && /logo/i.test(idMatch[1])) ||
      (srcMatch?.[1] && /logo/i.test(srcMatch[1]));

    if (hasLogoKeyword && srcMatch?.[1] && !srcMatch[1].startsWith('data:') && !isFalsePositive(srcMatch[1])) {
      urls.push(srcMatch[1]);
    }
  }
  return urls;
}

function extractSvgFaviconUrls(html: string): string[] {
  const urls: string[] = [];
  const matches = html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/gi);
  for (const m of matches) {
    const tag = m[0];
    if (/type=["']image\/svg\+xml["']/i.test(tag) && m[1]) {
      urls.push(m[1]);
    }
  }
  const matches2 = html.matchAll(/<link[^>]+href=["']([^"']+\.svg[^"']*)["'][^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi);
  for (const m of matches2) {
    if (m[1] && !urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}

function extractInlineSvgLogo(html: string): string | null {
  const headerNavPattern = /<(?:header|nav)[^>]*>([\s\S]*?)<\/(?:header|nav)>/gi;
  for (const section of html.matchAll(headerNavPattern)) {
    const content = section[1];
    const logoContainerPattern = /<(?:a|div|span|figure)[^>]*(?:class|id)=["'][^"']*logo[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span|figure)>/gi;
    for (const container of content.matchAll(logoContainerPattern)) {
      const svgMatch = container[1].match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) return svgMatch[0];
    }
    const directSvgMatch = content.match(/<svg[^>]*(?:class|id)=["'][^"']*logo[^"']*["'][\s\S]*?<\/svg>/i);
    if (directSvgMatch) return directSvgMatch[0];
  }

  const logoSvgPattern = /<(?:a|div|span|figure)[^>]*(?:class|id)=["'][^"']*logo[^"']*["'][^>]*>[\s\S]*?(<svg[\s\S]*?<\/svg>)[\s\S]*?<\/(?:a|div|span|figure)>/gi;
  const fallbackMatch = logoSvgPattern.exec(html);
  if (fallbackMatch?.[1]) return fallbackMatch[1];

  return null;
}

function extractAppleTouchIcons(html: string): string[] {
  const urls: string[] = [];
  const matches = html.matchAll(/<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/gi);
  for (const m of matches) {
    if (m[1]) urls.push(m[1]);
  }
  return urls;
}

function extractFavicons(html: string): string[] {
  const urls: string[] = [];
  const matches = html.matchAll(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/gi);
  for (const m of matches) {
    if (m[1] && !/\.svg/i.test(m[1])) urls.push(m[1]);
  }
  return urls;
}

function extractOgImage(html: string): string[] {
  const urls: string[] = [];
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch?.[1]) urls.push(ogMatch[1]);
  return urls;
}

async function fetchImage(url: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LogoFetcher/1.0)' },
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const data = await res.arrayBuffer();
    if (data.byteLength < 100 || data.byteLength > MAX_IMAGE_SIZE) return null;
    return { data, contentType: ct.split(';')[0] };
  } catch {
    return null;
  }
}

async function geminiLogoFallback(html: string, websiteUrl: string): Promise<string | null> {
  const apiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!apiKey) return null;

  const truncatedHtml = html.substring(0, 8000);
  const prompt = `Analysiere dieses HTML einer Website (${websiteUrl}) und finde die URL oder den relativen Pfad des Firmenlogos. Das Logo ist typischerweise im Header oder der Navigation. Ignoriere Menu-Icons, Social-Media-Icons und dekorative Bilder. Wenn das Logo ein inline SVG ist, antworte mit "INLINE_SVG". Antworte NUR mit der URL/dem Pfad, nichts anderes. Wenn du kein Logo findest, antworte mit "NONE".\n\nHTML:\n${truncatedHtml}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 200 },
        }),
      }
    );
    if (!response.ok) return null;
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || text === 'NONE' || text === 'INLINE_SVG') return null;
    const cleaned = text.replace(/[`"']/g, '').trim();
    if (cleaned.startsWith('http') || cleaned.startsWith('/')) return cleaned;
    return null;
  } catch {
    return null;
  }
}

// --- NEW: Brandfetch API ---

function extractDomain(websiteUrl: string): string {
  try {
    const hostname = new URL(websiteUrl).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return websiteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

interface BrandfetchResult {
  data: ArrayBuffer;
  contentType: string;
  isDarkTheme: boolean;
  brandColors: string[];
}

async function fetchFromBrandfetch(domain: string): Promise<BrandfetchResult | null> {
  const apiKey = Deno.env.get('BRANDFETCH_API_KEY');
  if (!apiKey) {
    console.log('No BRANDFETCH_API_KEY configured, skipping Brandfetch');
    return null;
  }

  try {
    console.log(`Brandfetch: Fetching logo for domain: ${domain}`);
    const response = await fetch(`https://api.brandfetch.io/v2/brands/${domain}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      console.log(`Brandfetch: API returned ${response.status} for ${domain}`);
      return null;
    }

    const data = await response.json();
    if (!data.logos || data.logos.length === 0) {
      console.log('Brandfetch: No logos in response');
      return null;
    }

    // Extract brand colors from Brandfetch response
    const brandColors: string[] = [];
    if (data.colors && Array.isArray(data.colors)) {
      for (const c of data.colors) {
        if (c.hex) brandColors.push(c.hex);
      }
    }
    console.log('Brandfetch: Brand colors:', brandColors);

    // Select best logo: prefer type="logo", then "symbol", then "icon"
    const typePriority = ['logo', 'symbol', 'icon'];
    let bestLogo: { src: string; format: string; theme?: string } | null = null;
    let isDarkTheme = false;

    for (const type of typePriority) {
      const logosOfType = data.logos.filter((l: any) => l.type === type);
      if (logosOfType.length === 0) continue;

      // Prefer theme="light" for CRM (white backgrounds)
      const lightLogos = logosOfType.filter((l: any) => l.theme === 'light');
      const candidates = lightLogos.length > 0 ? lightLogos : logosOfType;

      // Detect if we're using a dark-theme logo (no light variant available)
      if (lightLogos.length === 0) {
        const selectedTheme = candidates[0]?.theme;
        if (selectedTheme === 'dark') {
          isDarkTheme = true;
          console.log('Brandfetch: Only dark-theme logo available (white/light logo for dark backgrounds)');
        }
      }

      // Pick best format: SVG > PNG > JPEG
      const formatPriority = ['svg', 'png', 'jpeg', 'jpg'];
      for (const fmt of formatPriority) {
        for (const logo of candidates) {
          const formats = logo.formats || [];
          const match = formats.find((f: any) => f.format === fmt && f.src);
          if (match) {
            bestLogo = { src: match.src, format: fmt, theme: logo.theme };
            break;
          }
        }
        if (bestLogo) break;
      }
      if (bestLogo) break;
    }

    if (!bestLogo) {
      console.log('Brandfetch: No suitable logo format found');
      return null;
    }

    console.log(`Brandfetch: Downloading logo: ${bestLogo.src} (${bestLogo.format}, theme: ${bestLogo.theme || 'unknown'}, isDarkTheme: ${isDarkTheme})`);
    const imageResponse = await fetch(bestLogo.src);
    if (!imageResponse.ok) {
      console.log(`Brandfetch: Failed to download logo image: ${imageResponse.status}`);
      return null;
    }

    const contentType = imageResponse.headers.get('content-type') || `image/${bestLogo.format}`;
    const imageData = await imageResponse.arrayBuffer();

    if (imageData.byteLength < 100) {
      console.log('Brandfetch: Logo too small, skipping');
      return null;
    }

    console.log(`Brandfetch: Logo fetched successfully (${imageData.byteLength} bytes)`);
    return { data: imageData, contentType: contentType.split(';')[0], isDarkTheme, brandColors };
  } catch (err) {
    console.error('Brandfetch: Error:', err);
    return null;
  }
}

// --- Pick darkest color from an array of hex colors ---

function pickDarkestColor(colors: string[]): string | null {
  if (colors.length === 0) return null;

  let darkest: string | null = null;
  let lowestLuminance = Infinity;

  for (const hex of colors) {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) continue;

    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;

    // Relative luminance (ITU-R BT.709)
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (luminance < lowestLuminance) {
      lowestLuminance = luminance;
      darkest = hex.startsWith('#') ? hex : `#${hex}`;
    }
  }

  // Only return if dark enough for white logo visibility (luminance < 0.5)
  if (darkest && lowestLuminance < 0.5) {
    console.log(`pickDarkestColor: Selected ${darkest} (luminance: ${lowestLuminance.toFixed(3)})`);
    return darkest;
  }

  console.log(`pickDarkestColor: No sufficiently dark color found (best luminance: ${lowestLuminance.toFixed(3)})`);
  return null;
}

// --- NEW: logo.dev API ---

async function fetchFromLogoDev(domain: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const apiKey = Deno.env.get('LOGO_DEV_API_KEY');
  if (!apiKey) {
    console.log('No LOGO_DEV_API_KEY configured, skipping logo.dev');
    return null;
  }

  try {
    console.log(`logo.dev: Fetching logo for domain: ${domain}`);
    const response = await fetch(`https://img.logo.dev/${domain}?token=${apiKey}&size=200&format=png`, {
      redirect: 'follow',
    });

    if (!response.ok) {
      console.log(`logo.dev: API returned ${response.status} for ${domain}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      console.log(`logo.dev: Non-image content-type: ${contentType}`);
      return null;
    }

    const imageData = await response.arrayBuffer();

    // Placeholder detection: logo.dev returns tiny generic images for unknown domains
    if (imageData.byteLength < 1000) {
      console.log(`logo.dev: Image too small (${imageData.byteLength} bytes), likely placeholder`);
      return null;
    }

    console.log(`logo.dev: Logo fetched successfully (${imageData.byteLength} bytes)`);
    return { data: imageData, contentType: contentType.split(';')[0] };
  } catch (err) {
    console.error('logo.dev: Error:', err);
    return null;
  }
}

// --- Logo background analysis with Gemini ---

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getMimeType(contentType: string): string {
  if (contentType.includes('svg')) return 'image/svg+xml';
  if (contentType.includes('png')) return 'image/png';
  if (contentType.includes('gif')) return 'image/gif';
  if (contentType.includes('webp')) return 'image/webp';
  return 'image/jpeg';
}

async function analyzeLogoAndAddBackground(
  imageData: ArrayBuffer,
  contentType: string,
  _html: string,
): Promise<{ needsBackground: boolean; color: string | null; edgeColor: string | null }> {
  const apiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!apiKey) {
    console.log('No GOOGLE_GEMINI_API_KEY, skipping logo analysis');
    return { needsBackground: false, color: null, edgeColor: null };
  }

  const isSvg = contentType.includes('svg');

  const analysisPrompt = `Analysiere dieses Logo-Bild:
1. Ist es auf weissem Hintergrund (#FFFFFF) gut sichtbar?
2. Was ist die HINTERGRUNDFARBE des Bildes (nicht die Logo-Farbe)?
   Schaue auf die Pixel ganz am Rand/in den Ecken des Bildes.
   Wenn der Hintergrund transparent ist, antworte mit #FFFFFF.
   Wenn der Hintergrund eine Farbe hat (z.B. dunkelgrau, schwarz), gib diese Farbe an.
   WICHTIG: Gib NICHT die Farbe des Logos selbst an, sondern die Farbe HINTER dem Logo.
3. Falls das Logo auf weiss NICHT sichtbar ist: Welche dunkle Farbe
   wuerde als Hintergrund am besten passen?

Antworte NUR in einem dieser Formate:
- OK:#HEXCODE (sichtbar, Hintergrundfarbe des Bildes ist #HEXCODE)
- OK (sichtbar, Hintergrund ist weiss/transparent)
- NEEDS_BG:#HEXCODE (braucht Hintergrund in dieser Farbe)`;

  let requestBody: Record<string, unknown>;

  if (isSvg) {
    const svgText = new TextDecoder().decode(imageData);
    requestBody = {
      contents: [{ parts: [{ text: `${analysisPrompt}\n\nSVG-Logo:\n${svgText}` }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 50 },
    };
  } else {
    const base64 = arrayBufferToBase64(imageData);
    const mimeType = getMimeType(contentType);
    requestBody = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: analysisPrompt },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 50 },
    };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      console.error('Gemini logo analysis error:', response.status, await response.text());
      return { needsBackground: false, color: null, edgeColor: null };
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log('Gemini logo analysis response:', text);

    if (!text) return { needsBackground: false, color: null, edgeColor: null };

    // Parse NEEDS_BG:#HEXCODE
    const needsBgMatch = text.match(/NEEDS_BG:(#[0-9A-Fa-f]{6})/);
    if (needsBgMatch) {
      return { needsBackground: true, color: needsBgMatch[1], edgeColor: null };
    }

    // Parse NEEDS_BG without color
    if (text.includes('NEEDS_BG') || text.includes('NEEDS')) {
      return { needsBackground: true, color: null, edgeColor: null };
    }

    // Parse OK:#HEXCODE (visible, edge color detected)
    const okMatch = text.match(/OK:(#[0-9A-Fa-f]{6})/);
    if (okMatch) {
      return { needsBackground: false, color: null, edgeColor: okMatch[1] };
    }

    // Plain OK (visible, white/transparent edge)
    return { needsBackground: false, color: null, edgeColor: '#FFFFFF' };
  } catch (err) {
    console.error('Gemini logo analysis error:', err);
    return { needsBackground: false, color: null, edgeColor: null };
  }
}

function createCompositeLogoSvg(
  imageData: ArrayBuffer,
  contentType: string,
  brandColor: string,
): Uint8Array {
  const base64 = arrayBufferToBase64(imageData);
  const mimeType = getMimeType(contentType);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="${brandColor}"/>
  <image href="data:${mimeType};base64,${base64}" x="16" y="16" width="168" height="168" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

  return new TextEncoder().encode(svg);
}

function createCompositeInlineSvg(
  inlineSvg: string,
  brandColor: string,
): Uint8Array {
  const innerSvg = inlineSvg
    .replace(/<svg([^>]*)>/, (_match, attrs: string) => {
      let cleaned = attrs.replace(/\s(?:width|height)=["'][^"']*["']/g, '');
      if (!/preserveAspectRatio/i.test(cleaned)) {
        cleaned += ' preserveAspectRatio="xMidYMid meet"';
      }
      return `<svg${cleaned} x="16" y="16" width="168" height="168">`;
    });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="${brandColor}"/>
  ${innerSvg}
</svg>`;

  return new TextEncoder().encode(svg);
}

// --- Fetch website HTML for brand color extraction ---

async function fetchWebsiteHtml(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LogoFetcher/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    return await res.text();
  } catch (err) {
    console.log('fetchWebsiteHtml failed:', err);
    return '';
  }
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.76.1');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { url, clientId } = await req.json();
    if (!url || !clientId) {
      return new Response(JSON.stringify({ error: 'url and clientId are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Fetching logo for:', url);

    let websiteUrl = url.trim();
    if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
      websiteUrl = `https://${websiteUrl}`;
    }

    const { createClient: createServiceClient } = await import('https://esm.sh/@supabase/supabase-js@2.76.1');
    const serviceClient = createServiceClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Helper to upload final logo and update client
    async function uploadLogo(data: Uint8Array | ArrayBuffer, ct: string, fileName: string, bgColor: string | null = null): Promise<Response> {
      const { error: uploadError } = await serviceClient.storage
        .from('company-logos')
        .upload(fileName, data, { contentType: ct, upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Failed to upload logo');
      }

      // Store the storage path (not full public URL) since bucket is now private
      const logoPath = fileName;
      console.log('Logo uploaded, path:', logoPath, 'bgColor:', bgColor);
      await serviceClient.from('clients').update({ logo_url: logoPath, logo_bg_color: bgColor }).eq('id', clientId);
      return new Response(JSON.stringify({ success: true, logo_url: logoPath, logo_bg_color: bgColor }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === STEP 1: Brandfetch API (primary) ===
    const domain = extractDomain(websiteUrl);
    console.log(`Trying API sources for domain: ${domain}`);

    const brandfetchResult = await fetchFromBrandfetch(domain);
    if (brandfetchResult) {
      console.log('Brandfetch: Logo found, analyzing visibility...');

      let needsBg = false;
      let bgColor: string | null = null;

      // Analyze logo image with Gemini
      const analysis = await analyzeLogoAndAddBackground(brandfetchResult.data, brandfetchResult.contentType, '');
      console.log('Brandfetch: Gemini logo analysis result:', analysis);

      if (brandfetchResult.isDarkTheme) {
        // Dark-theme logo: needs a background color for display
        console.log('Brandfetch: Dark-theme logo detected, background required.');
        needsBg = true;
        // Prefer Gemini's detected color, then edgeColor, then brand colors
        bgColor = analysis.color || analysis.edgeColor || pickDarkestColor(brandfetchResult.brandColors) || '#2D3748';
      } else {
        needsBg = analysis.needsBackground;
        bgColor = analysis.color;
        if (needsBg && !bgColor) {
          bgColor = pickDarkestColor(brandfetchResult.brandColors) || '#2D3748';
        }
      }

      // Always upload original logo, store bg color separately
      const ext = brandfetchResult.contentType.includes('svg') ? 'svg' : brandfetchResult.contentType.includes('png') ? 'png' : 'jpg';
      const finalBgColor = needsBg ? bgColor : null;
      console.log('Brandfetch: Uploading original logo, bgColor:', finalBgColor);
      return await uploadLogo(brandfetchResult.data, brandfetchResult.contentType, `${clientId}/logo-auto.${ext}`, finalBgColor);
    }

    // === STEP 2: logo.dev API (secondary) ===
    const logoDevResult = await fetchFromLogoDev(domain);
    if (logoDevResult) {
      console.log('logo.dev: Logo found, analyzing visibility...');
      const analysis = await analyzeLogoAndAddBackground(logoDevResult.data, logoDevResult.contentType, '');
      let bgColor: string | null = null;
      if (analysis.needsBackground) {
        bgColor = analysis.color || '#2D3748';
      } else {
        bgColor = null;
      }
      console.log('logo.dev: Uploading original logo, bgColor:', bgColor);
      return await uploadLogo(logoDevResult.data, logoDevResult.contentType, `${clientId}/logo-auto.png`, bgColor);
    }

    // === STEP 3: Legacy HTML scraping + Gemini fallback ===
    console.log('API sources failed, falling back to HTML scraping...');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let html: string;
    try {
      const response = await fetch(websiteUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LogoFetcher/1.0)' },
        redirect: 'follow',
      });
      html = await response.text();
    } catch (fetchErr) {
      console.error('Failed to fetch website:', fetchErr);
      return new Response(JSON.stringify({ success: false, error: 'Could not reach website' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } finally {
      clearTimeout(timeout);
    }

    const baseUrl = new URL(websiteUrl);

    // Extract candidates by priority
    const logoImgUrls = extractLogoImgUrls(html);
    const svgFaviconUrls = extractSvgFaviconUrls(html);
    const inlineSvg = extractInlineSvgLogo(html);
    const appleTouchUrls = extractAppleTouchIcons(html);
    const faviconUrls = extractFavicons(html);
    const ogUrls = extractOgImage(html);

    console.log('Candidates: img-logo:', logoImgUrls.length, 'svg-favicon:', svgFaviconUrls.length, 'inline-svg:', !!inlineSvg, 'apple:', appleTouchUrls.length, 'favicon:', faviconUrls.length, 'og:', ogUrls.length);

    // Priority 3: Inline SVG
    if (inlineSvg && logoImgUrls.length === 0 && svgFaviconUrls.length === 0) {
      console.log('Using inline SVG logo');
      const svgData = new TextEncoder().encode(inlineSvg);
      if (svgData.byteLength >= 100) {
        const analysis = await analyzeLogoAndAddBackground(svgData.buffer, 'image/svg+xml', html);
        const bgColor = analysis.needsBackground ? (analysis.color || '#2D3748') : (analysis.edgeColor || null);
        return await uploadLogo(svgData, 'image/svg+xml', `${clientId}/logo-auto.svg`, bgColor);
      }
    }

    // Try URL-based candidates in priority order
    const candidateGroups = [
      logoImgUrls,
      svgFaviconUrls,
      appleTouchUrls,
      faviconUrls,
      ['/favicon.ico'],
    ];

    let bestImageData: ArrayBuffer | null = null;
    let bestContentType = 'image/png';
    let bestUrl = '';

    for (const group of candidateGroups) {
      if (bestImageData) break;
      const resolved = group.map(u => resolveUrl(u, baseUrl.origin)).filter(Boolean) as string[];
      for (const candidateUrl of resolved) {
        const result = await fetchImage(candidateUrl);
        if (result) {
          bestImageData = result.data;
          bestContentType = result.contentType;
          bestUrl = candidateUrl;
          break;
        }
      }
    }

    // Gemini AI fallback
    if (!bestImageData) {
      console.log('No logo found via HTML parsing, trying Gemini fallback...');
      const geminiUrl = await geminiLogoFallback(html, websiteUrl);
      if (geminiUrl) {
        const resolved = resolveUrl(geminiUrl, baseUrl.origin);
        if (resolved) {
          const result = await fetchImage(resolved);
          if (result) {
            bestImageData = result.data;
            bestContentType = result.contentType;
            bestUrl = resolved;
          }
        }
      }
    }

    // og:image as last resort
    if (!bestImageData) {
      for (const ogUrl of ogUrls) {
        const resolved = resolveUrl(ogUrl, baseUrl.origin);
        if (resolved) {
          const result = await fetchImage(resolved);
          if (result) {
            bestImageData = result.data;
            bestContentType = result.contentType;
            bestUrl = resolved;
            break;
          }
        }
      }
    }

    if (!bestImageData) {
      console.log('No valid logo image found');
      return new Response(JSON.stringify({ success: false, error: 'No logo found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Best logo found:', bestUrl, bestContentType, bestImageData.byteLength, 'bytes');

    // Analyze logo visibility and determine background color
    const analysis = await analyzeLogoAndAddBackground(bestImageData, bestContentType, '');
    let bgColor: string | null = null;
    if (analysis.needsBackground) {
      bgColor = analysis.color || '#2D3748';
    } else {
      bgColor = null;
    }

    // Upload original logo unchanged, store bg color separately
    const ext = bestContentType.includes('svg') ? 'svg' : bestContentType.includes('png') ? 'png' : bestContentType.includes('gif') ? 'gif' : 'jpg';
    return await uploadLogo(bestImageData, bestContentType, `${clientId}/logo-auto.${ext}`, bgColor);

  } catch (error) {
    console.error('Error in fetch-company-logo:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
