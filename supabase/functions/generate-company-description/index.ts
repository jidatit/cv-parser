import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// 12 writing styles for maximum variation
const WRITING_STYLES = [
  { name: 'Zahlen-fokussiert', instruction: 'Beginne mit einer beeindruckenden Zahl (Mitarbeitende, Standorte, Umsatz, Jahre). Beispiel-Einstieg: "Mit 1\'200 Mitarbeitenden an 14 Standorten..."' },
  { name: 'Storytelling', instruction: 'Erzähle die Entstehungsgeschichte oder einen Wendepunkt. Beispiel-Einstieg: "Was 1987 als Zwei-Mann-Büro begann..."' },
  { name: 'Projekt-Highlight', instruction: 'Starte mit einem konkreten, bekannten Projekt oder Produkt. Beispiel-Einstieg: "Die neue Limmattalbahn fährt dank ihrer Steuerungstechnik..."' },
  { name: 'Branchenperspektive', instruction: 'Ordne das Unternehmen in seinen Markt ein. Beispiel-Einstieg: "Im Schweizer Fintech-Markt zählt kaum ein Name so oft wie..."' },
  { name: 'Kultur-fokussiert', instruction: 'Beschreibe die Arbeitskultur oder Werte. Beispiel-Einstieg: "Wer hier arbeitet, merkt schnell: Hierarchien sind flach..."' },
  { name: 'Technologie-Fokus', instruction: 'Hebe den Tech-Stack oder technologische Innovation hervor. Beispiel-Einstieg: "Kubernetes, Terraform, GitOps – hier ist das keine Wunschliste..."' },
  { name: 'Geografie/Standort', instruction: 'Beginne mit dem Standort und seiner Bedeutung. Beispiel-Einstieg: "Direkt am Zürcher Paradeplatz, mit Blick auf den See..."' },
  { name: 'Kundenperspektive', instruction: 'Starte aus der Sicht eines bekannten Kunden. Beispiel-Einstieg: "Wenn die Migros ihre Lieferkette optimiert, sitzt dieses Team am Tisch..."' },
  { name: 'Vergleich/Kontrast', instruction: 'Stelle das Unternehmen in Kontrast zu Wettbewerbern oder Branchenstandards. Beispiel-Einstieg: "Während andere noch Excel-Tabellen pflegen, automatisiert dieses Team..."' },
  { name: 'Insider-Wissen', instruction: 'Enthülle etwas Überraschendes oder wenig Bekanntes. Beispiel-Einstieg: "Was Aussenstehende nicht sehen: Hinter dem schlichten Logo steckt..."' },
  { name: 'Wachstums-Story', instruction: 'Fokussiere auf Dynamik und Expansion. Beispiel-Einstieg: "Drei Standorte in fünf Jahren – das Tempo bei [Name] überrascht..."' },
  { name: 'Produkt-im-Alltag', instruction: 'Zeige den Alltagsimpact des Unternehmens. Beispiel-Einstieg: "Wer in Zürich die Tram nimmt, nutzt täglich ihre Software..."' },
];

// Focus elements for rotation (pick 2 random per generation)
const FOCUS_ELEMENTS = [
  { name: 'Mitarbeiteranzahl', instruction: 'Mitarbeiteranzahl NUR erwähnen, wenn in den recherchierten Fakten eine konkrete (nicht geschätzte) Zahl vorliegt. Wenn "Unbekannt", diesen Fokus KOMPLETT weglassen und stattdessen ein anderes Merkmal hervorheben.' },
  { name: 'Gründungsjahr/Tradition', instruction: 'Gründungsjahr/Tradition einbauen – NIEMALS mit "Seit..." beginnen! Alternativen: "Gegründet [Jahr]", "[Jahr] legte den Grundstein", "Die Geschichte beginnt [Jahr]", oder das Jahr beiläufig einbauen' },
  { name: 'Konkretes Projekt/Kunde', instruction: 'EIN konkretes Projekt, bekannter Kunde oder Referenz nennen (z.B. "Verantwortlich für die IT-Infrastruktur der SBB...")' },
  { name: 'Standorte/Präsenz', instruction: 'Standorte, Niederlassungen oder geografische Präsenz hervorheben' },
  { name: 'Technologie/Spezialisierung', instruction: 'Technologische Besonderheiten oder Spezialisierungen betonen' },
];

// Subpage paths to look for
const SUBPAGE_PATTERNS = [
  '/ueber-uns', '/about', '/about-us', '/uber-uns',
  '/referenzen', '/projekte', '/projects', '/references', '/portfolio',
  '/team', '/unternehmen', '/company',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { createClient: createAuthClient } = await import('https://esm.sh/@supabase/supabase-js@2.76.1');
  const authClient = createAuthClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { client_id } = await req.json();
    
    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 1. Load client data
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

    // 2. Load jobs for this client
    const { data: jobs } = await supabase
      .from('jobs')
      .select('title, description, location, skills, benefits')
      .eq('client_id', client_id);

    // 3. Multi-page website scraping
    const websitePages = await scrapeMultiplePages(client.website);

    // 4. AI fact research
    const researchedFacts = await researchFacts(client, websitePages, GEMINI_API_KEY);

    // 5. Select random style
    const selectedStyle = WRITING_STYLES[Math.floor(Math.random() * WRITING_STYLES.length)];

    // 6. Build context and generate
    const context = buildRichContext(client, jobs || [], websitePages, researchedFacts, selectedStyle);
    const temperature = 0.8 + Math.random() * 0.2;

    // Pick 2 random focus elements
    const shuffledFocus = [...FOCUS_ELEMENTS].sort(() => Math.random() - 0.5);
    const selectedFocus = shuffledFocus.slice(0, 2);

    const focusInstructions = selectedFocus.map((f, i) => `${i + 1}. ${f.instruction}`).join('\n');

    const prompt = `Du bist ein erfahrener Copywriter für Unternehmensprofile im Headhunting-Bereich.

AUFGABE:
Erstelle eine einzigartige, interessante Firmenbeschreibung für ein Job-Exposé.
Diese Beschreibung wird an Kandidaten in der Schweiz verschickt, um sie für das Unternehmen zu begeistern.

STRIKTE REGELN:
- NIEMALS Fakten erfinden oder schätzen. Verwende NUR Informationen, die in den verfügbaren Daten EXPLIZIT belegt sind.
- Wenn Mitarbeiteranzahl, Umsatz oder andere Zahlen als "Unbekannt" markiert sind, lasse sie KOMPLETT weg. Erwähne sie NICHT.
- Lieber weniger konkrete Zahlen als falsche Zahlen. Keine erfundenen Statistiken.
- Exakt 80-90 Wörter (Zielwert: 85 Wörter)
- Dritte Person verwenden ("[Firmenname] ist..." oder "Das Unternehmen...")
- SCHWEIZER HOCHDEUTSCH: Kein "ß" verwenden, IMMER "ss" (z.B. "gross" statt "groß", "Strasse" statt "Straße"). Prüfe den Text am Ende nochmals auf korrekte Grammatik, Satzbau und Rechtschreibung. Kein ß darf im Text vorkommen.
- Schreibe die Beschreibung als durchgehenden Fliesstext OHNE Absätze. Alles in einem einzigen Absatz. Keine Zeilenumbrüche.
- UMLAUTE IMMER VERWENDEN: ä, ö, ü, Ä, Ö, Ü (NIEMALS ae, oe, ue)
- Authentisch und informativ, kein Marketing-Sprech
- Am Ende KEIN Punkt bei Aufzählungen
- KEINE direkten Benefits erwähnen (z.B. "flexible Arbeitszeiten", "Home Office", "Weiterbildung")
- KEIN Call-to-Action (z.B. "Werden Sie Teil...", "Bewerben Sie sich...")
- KEINE rhetorischen Fragen verwenden (z.B. "Was macht [Firma] besonders?")
- KEINE Gedankenstriche (– oder —) im Fliesstext verwenden. Verwende stattdessen Beistriche (Kommas) oder formuliere den Satz um. Bindestriche in zusammengesetzten Woertern (z.B. "IT-Infrastruktur") sind erlaubt.

GEWÄHLTER SCHREIBSTIL: ${selectedStyle.name}
${selectedStyle.instruction}

FOKUS-ELEMENTE (diese 2 Schwerpunkte MÜSSEN enthalten sein, wenn Daten verfügbar):
${focusInstructions}

OPTIONAL (wenn Platz und Daten vorhanden):
- Umsatz oder Wachstum
- Auszeichnungen (KEINE ISO-Zertifizierungen)

SATZLÄNGEN-VARIATION (WICHTIG):
- Nutze mindestens einen kurzen Satz (max. 4 Wörter) für Impact
- Nutze 1-2 mittellange Sätze (8-15 Wörter) für Kernaussagen
- Nutze optional einen längeren Satz (16-20 Wörter) für Kontext, aber NICHT MEHR als 1-2
- Vermeide repetitive Satzstrukturen, variiere zwischen Aussagesätzen, Aufzählungen und Andeutungen

VERBOTEN:
- "Seit [Jahr]..." als Satzanfang
- "Seit über [Zahl] Jahren..."
- "Führendes Unternehmen" ohne konkreten Beleg
- "Diverse Projekte", immer konkret benennen
- "Vielfältige Kunden", 1-2 namentlich nennen wenn möglich
- Generische Floskeln ohne Substanz
- "Das Unternehmen ist ein [Adjektiv] [Branche]-Unternehmen"
- "[Name] gehört zu den führenden..."
- "Als innovatives Unternehmen..."
- "Mit Sitz in [Stadt]..."
- Aufzählungen mit mehr als 3 Komma-getrennten Begriffen
- ISO-Zertifizierungen oder Normen (z.B. ISO 9001, ISO 14001, ISO 27001)
- Gedankenstriche (–, —) als Satzzeichen im Fliesstext, verwende stattdessen Beistriche

ANTI-MONOTONIE:
Kandidaten erhalten 3-7 Exposés gleichzeitig. Deine Beschreibung wird neben anderen stehen. Sie MUSS sich im Aufbau und Tonfall deutlich unterscheiden.
Beginne mit dem UNERWARTETSTEN Fakt. Was würden Kandidaten NICHT erwarten? Das kommt zuerst.

${context}

Antworte NUR mit der Beschreibung selbst, ohne Erklärungen oder Anführungszeichen.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 420 },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      const status = geminiResponse.status === 429 ? 429 : 500;
      const message = geminiResponse.status === 429 
        ? 'API-Rate-Limit erreicht. Bitte versuche es in einer Minute erneut.' 
        : 'AI generation failed';
      return new Response(
        JSON.stringify({ error: message }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResponse.json();
    const description = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!description) {
      return new Response(
        JSON.stringify({ error: 'No description generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanDescription = description.replace(/^["']|["']$/g, '').trim();
    console.log(`Generated (style: ${selectedStyle.name}, temp: ${temperature.toFixed(2)}) for ${client.name}:`, cleanDescription);

    return new Response(
      JSON.stringify({ description: cleanDescription }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating company description:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// --- Helper Functions ---

async function fetchPage(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CompanyParser/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) return '';
    const html = await response.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.origin === new URL(baseUrl).origin) {
        links.push(url.href);
      }
    } catch { /* skip invalid URLs */ }
  }
  return [...new Set(links)];
}

async function scrapeMultiplePages(website: string | null): Promise<Record<string, string>> {
  const pages: Record<string, string> = {};
  if (!website) return pages;

  let baseUrl = website.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }

  // Fetch main page (raw HTML for link extraction)
  try {
    const mainResponse = await fetch(baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CompanyParser/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!mainResponse.ok) return pages;

    const mainHtml = await mainResponse.text();
    const mainText = mainHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages['Hauptseite'] = mainText.slice(0, 5000);

    // Extract links and find relevant subpages
    const allLinks = extractLinks(mainHtml, baseUrl);
    const relevantLinks: string[] = [];

    for (const link of allLinks) {
      const path = new URL(link).pathname.toLowerCase();
      if (SUBPAGE_PATTERNS.some(p => path.includes(p)) && relevantLinks.length < 4) {
        relevantLinks.push(link);
      }
    }

    // Also try direct subpage URLs if not found in links
    for (const pattern of SUBPAGE_PATTERNS) {
      if (relevantLinks.length >= 4) break;
      const directUrl = new URL(pattern, baseUrl).href;
      if (!relevantLinks.includes(directUrl)) {
        relevantLinks.push(directUrl);
      }
    }

    // Fetch subpages in parallel (max 4)
    const subpageResults = await Promise.allSettled(
      relevantLinks.slice(0, 4).map(async (url) => {
        const text = await fetchPage(url);
        const path = new URL(url).pathname;
        return { path, text: text.slice(0, 3000) };
      })
    );

    for (const result of subpageResults) {
      if (result.status === 'fulfilled' && result.value.text.length > 100) {
        const label = result.value.path.replace(/^\//, '').replace(/\//g, ' > ') || 'Unterseite';
        pages[label] = result.value.text;
      }
    }
  } catch (e) {
    console.log('Error scraping website:', e);
  }

  return pages;
}

async function researchFacts(client: any, websitePages: Record<string, string>, apiKey: string): Promise<string> {
  try {
    const websiteExcerpt = Object.values(websitePages).join('\n').slice(0, 8000);
    const hasWebsiteContent = websiteExcerpt.trim().length > 100;

    // If no website content available, use Gemini with Google Search Grounding
    if (!hasWebsiteContent) {
      console.log(`No website content for "${client.name}", using Gemini Search Grounding for fact research`);
      return await researchFactsWithGrounding(client, apiKey);
    }

    const researchPrompt = `Analysiere die folgenden Informationen über das Unternehmen "${client.name}" und extrahiere KONKRETE FAKTEN.

KRITISCHE REGEL – ANTI-HALLUZINATION:
- Erfinde KEINE Fakten. Wenn eine Information nicht EXPLIZIT im Text steht, antworte mit "Unbekannt".
- Schätze KEINE Zahlen. Nenne NUR exakte Zahlen, die WÖRTLICH im Text vorkommen.
- Bei Mitarbeiteranzahl: NUR angeben, wenn eine konkrete Zahl auf der Website oder in den Daten steht. NIEMALS schätzen oder ableiten.
- Bei Umsatz/Wachstum: NUR angeben, wenn explizit im Text genannt. KEINE Schätzungen.
- Wenn du dir bei einem Fakt nicht 100% sicher bist, schreibe "Unbekannt".
- LIEBER "Unbekannt" als eine möglicherweise falsche Information.

VERFÜGBARE DATEN:
Branche: ${client.industry || 'Unbekannt'}
Standort: ${client.address || 'Unbekannt'}
Website: ${client.website || 'Keine'}
Vorhandene Beschreibung: ${client.description || 'Keine'}
Notizen: ${client.notes || 'Keine'}

WEBSITE-INHALTE:
${websiteExcerpt}

EXTRAHIERE FOLGENDE FAKTEN (antworte mit "Unbekannt" wenn nicht EXPLIZIT im Text auffindbar):
1. Exakte Mitarbeiteranzahl (NUR wenn eine konkrete Zahl im Text steht, NICHT schätzen)
2. Gründungsjahr (NUR wenn explizit genannt)
3. Bekannte Kunden (NUR namentlich genannte)
4. Bekannte Projekte oder Referenzen (NUR konkret beschriebene)
5. Auszeichnungen, Awards (KEINE ISO-Zertifizierungen, NUR explizit genannte)
6. Umsatz oder Wachstumszahlen (NUR explizit genannte Zahlen)
7. Anzahl Standorte/Niederlassungen (NUR wenn konkret genannt)
8. Besondere Innovationen oder Alleinstellungsmerkmale
9. Technologien oder Spezialisierungen

Antworte in diesem Format:
Mitarbeiteranzahl: [Zahl oder Unbekannt]
Gründungsjahr: [Jahr oder Unbekannt]
Bekannte Kunden: [Namen oder Unbekannt]
Bekannte Projekte: [Beschreibung oder Unbekannt]
Auszeichnungen: [Liste oder Unbekannt]
Umsatz/Wachstum: [Zahlen oder Unbekannt]
Standorte: [Anzahl/Orte oder Unbekannt]
Alleinstellungsmerkmale: [Beschreibung oder Unbekannt]
Technologien: [Liste oder Unbekannt]`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: researchPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
        }),
      }
    );

    if (!response.ok) {
      console.error('Fact research failed:', await response.text());
      return 'Keine recherchierten Fakten verfügbar.';
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Keine recherchierten Fakten verfügbar.';
  } catch (e) {
    console.error('Fact research error:', e);
    return 'Keine recherchierten Fakten verfügbar.';
  }
}

// Research facts using Gemini with Google Search Grounding (real search, not hallucination)
async function researchFactsWithGrounding(client: any, apiKey: string): Promise<string> {
  try {
    const locationHint = client.address || '';
    const industryHint = client.industry || '';
    const prompt = `Recherchiere Fakten über das Unternehmen "${client.name}"${locationHint ? ` in ${locationHint}` : ''}${industryHint ? ` (Branche: ${industryHint})` : ''}.

Finde und berichte NUR BELEGBARE FAKTEN aus den Suchergebnissen:
1. Exakte Mitarbeiteranzahl (nur wenn in Suchergebnissen belegt)
2. Gründungsjahr
3. Bekannte Kunden oder Referenzprojekte
4. Standorte und Niederlassungen
5. Spezialisierungen und Kernkompetenzen
6. Auszeichnungen oder Awards (KEINE ISO-Zertifizierungen)
7. Umsatz oder Wachstumszahlen (nur wenn öffentlich verfügbar)
8. Besondere Alleinstellungsmerkmale
9. Technologien oder Fachgebiete

WICHTIG: Antworte mit "Unbekannt" wenn ein Fakt NICHT in den Suchergebnissen gefunden wurde. Erfinde NICHTS.

Antworte in diesem Format:
Mitarbeiteranzahl: [Zahl oder Unbekannt]
Gründungsjahr: [Jahr oder Unbekannt]
Bekannte Kunden: [Namen oder Unbekannt]
Bekannte Projekte: [Beschreibung oder Unbekannt]
Auszeichnungen: [Liste oder Unbekannt]
Umsatz/Wachstum: [Zahlen oder Unbekannt]
Standorte: [Anzahl/Orte oder Unbekannt]
Alleinstellungsmerkmale: [Beschreibung oder Unbekannt]
Technologien: [Liste oder Unbekannt]`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
        }),
      }
    );

    if (!response.ok) {
      console.error('Grounding fact research failed:', await response.text());
      return 'Keine recherchierten Fakten verfügbar (Grounding fehlgeschlagen).';
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log(`Grounding research result for "${client.name}":`, text?.slice(0, 200));
    return text || 'Keine recherchierten Fakten verfügbar.';
  } catch (e) {
    console.error('Grounding fact research error:', e);
    return 'Keine recherchierten Fakten verfügbar (Grounding-Fehler).';
  }
}

function buildRichContext(client: any, jobs: any[], websitePages: Record<string, string>, researchedFacts: string, style: { name: string }): string {
  const jobsContext = jobs.length > 0
    ? jobs.map(j => `
Position: ${j.title}
Standort: ${j.location || 'k.A.'}
Skills: ${j.skills?.join(', ') || 'k.A.'}
Beschreibung: ${j.description?.slice(0, 300) || 'k.A.'}
Benefits: ${j.benefits || 'k.A.'}`).join('\n---\n')
    : 'Keine offenen Stellen';

  const websiteContext = Object.entries(websitePages)
    .map(([label, content]) => `WEBSITE-INHALTE (${label}):\n${content}`)
    .join('\n\n');

  return `
=== VERFÜGBARE INFORMATIONEN ===

UNTERNEHMENSDATEN:
Name: ${client.name}
Branche: ${client.industry || 'Nicht angegeben'}
Standort: ${client.address || 'Nicht angegeben'}
Website: ${client.website || 'Keine'}

VORHANDENE BESCHREIBUNG (als Basis/Ergänzung):
${client.description || 'Keine vorhanden'}

BENEFITS (zeigen Unternehmenskultur):
${client.benefits || 'Keine angegeben'}

NOTIZEN VOM RECRUITER:
${client.notes || 'Keine'}

RECHERCHIERTE FAKTEN:
${researchedFacts}

OFFENE STELLEN (${jobs.length} Positionen):
${jobsContext}

${websiteContext}

GEWÄHLTER STIL: ${style.name}
`;
}
