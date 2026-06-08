import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('parse-job-pdf called, method:', req.method);
  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('Missing or invalid Authorization header');
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
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      throw new Error('No file provided');
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    }

    console.log('Processing PDF file:', file.name, 'Size:', file.size);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    console.log('File converted to base64, sending to Gemini...');

    // Use Gemini's file processing capability with inline data
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: file.type || 'application/pdf',
                  data: base64Data
                }
              },
              {
                text: `Du bist ein Experte für das Extrahieren von strukturierten Daten aus Stellenanzeigen.

WICHTIGE REGELN:
1. Extrahiere NUR Informationen, die tatsächlich im Dokument vorhanden sind
2. Wenn eine Information NICHT im Dokument gefunden wird, setze den Wert auf null oder einen leeren String ""
3. ERFINDE KEINE Informationen - lieber leer lassen als raten
4. Formatiere Aufgaben und Anforderungen als Bullet Points mit "•" am Anfang jeder Zeile
5. Bullet Points enden NIE mit einem Punkt

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

BENEFITS EXTRAHIEREN:
- Extrahiere Benefits/Vorteile wenn vorhanden
- Maximal 5-7 Punkte, jeder Punkt 4-7 Wörter
- Formuliere ANSPRECHEND und INTERESSANT, nicht langweilig

Analysiere das PDF-Dokument und extrahiere alle verfügbaren Informationen:

Antworte NUR mit diesem JSON-Format (keine Erklärung):
{
  "title": "Jobtitel/Position (oder null wenn nicht gefunden)",
  "company": "Firmenname (oder null wenn nicht gefunden)",
  "location": "Arbeitsort/Standort mit PLZ wenn vorhanden (oder null wenn nicht gefunden)",
  "employment_type": "Vollzeit, Teilzeit, Freelance oder Remote - WICHTIG: 80-100% oder 100% = IMMER Vollzeit (oder null wenn nicht gefunden)",
  "salary": "Gehaltsangabe/Lohnspanne wenn vorhanden (oder null wenn nicht gefunden)",
  "description": "Allgemeine Beschreibung der Position und des Unternehmens (oder null wenn nicht gefunden)",
  "responsibilities": "Aufgaben und Tätigkeiten WORTGETREU aus dem Original als Bullet Points mit • - KEINE Umformulierung (oder null wenn nicht gefunden)",
  "requirements": "Anforderungen und Qualifikationen WORTGETREU aus dem Original als Bullet Points mit • - KEINE Umformulierung (oder null wenn nicht gefunden)",
  "benefits": "Benefits als ansprechende Bullet Points mit • - maximal 5-7 Punkte, je 4-7 Wörter, interessant formuliert (oder null wenn nicht gefunden)",
  "experience_level": "Junior, Mid-Level, Senior, Lead etc. (oder null wenn nicht gefunden)",
  "skills": ["Skill1", "Skill2"] oder [] wenn keine gefunden,
  "company_website": "Website/Homepage des Unternehmens wenn im Dokument erwähnt (oder null wenn nicht gefunden) - NUR die Firmen-Website"
}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
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
    console.log('Google Gemini response received');

    // Extract the content from Gemini response format
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      console.error('Unexpected Gemini response structure:', JSON.stringify(data));
      throw new Error('No structured data extracted from job posting PDF');
    }

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsedData = JSON.parse(jsonMatch[0]);

    // Swiss German: replace ß with ss
    // Gemini sometimes returns arrays instead of strings — handle both safely
    const safeReplace = (val: unknown): string | undefined => {
      if (Array.isArray(val)) val = val.join('\n');
      if (typeof val === 'string') return val.replace(/ß/g, 'ss');
      return val as string | undefined;
    };
    if (parsedData.description) parsedData.description = safeReplace(parsedData.description);
    if (parsedData.responsibilities) parsedData.responsibilities = safeReplace(parsedData.responsibilities);
    if (parsedData.requirements) parsedData.requirements = safeReplace(parsedData.requirements);
    if (parsedData.benefits) parsedData.benefits = safeReplace(parsedData.benefits);

    console.log('Successfully parsed job posting from PDF:', parsedData.title);

    // If no website found but company name exists, do a second Gemini call to find website
    if ((!parsedData.company_website || parsedData.company_website === '') && parsedData.company) {
      console.log('No website found in PDF, searching for company website via Gemini:', parsedData.company);
      try {
        const websiteResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{
                text: `Finde die offizielle Website/Homepage für das Unternehmen "${parsedData.company}". Antworte NUR mit der URL (z.B. https://example.com). Falls nicht findbar, antworte mit NOT_FOUND.`
              }]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 256 }
          }),
        });

        if (websiteResponse.ok) {
          const websiteData = await websiteResponse.json();
          const websiteText = websiteData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (websiteText && websiteText !== 'NOT_FOUND' && websiteText.startsWith('http')) {
            // Clean up - take only the URL part (remove trailing punctuation etc.)
            const urlMatch = websiteText.match(/https?:\/\/[^\s"'<>]+/);
            if (urlMatch) {
              parsedData.company_website = urlMatch[0];
              console.log('Found company website via Gemini:', parsedData.company_website);
            }
          } else {
            console.log('Gemini could not find website for:', parsedData.company);
          }
        }
      } catch (err) {
        console.error('Error searching for company website:', err);
      }
    }

    // Search for company in clients table (do NOT create - frontend will handle that)
    let clientId = null;
    let clientName = null;
    let companyMatchStatus: 'found' | 'new' = 'new';
    
    if (parsedData.company) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        let userId = data?.user?.id || null;

        if (userId) {
          console.log('Searching for company:', parsedData.company);
          
          // Normalize function for better matching (strip legal forms, special chars, whitespace)
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
          
          // Get all clients for better matching
          const { data: existingClients, error: searchError } = await supabase
            .from('clients')
            .select('id, name');

          if (searchError) {
            console.error('Error searching for client:', searchError);
          } else if (existingClients && existingClients.length > 0) {
            console.log('Found', existingClients.length, 'existing clients to check');
            
            // First try exact normalized match
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
            
            // Word-based fuzzy matching (prevents false positives like "Brugg Lifting" → "Ruggli AG")
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
    }

    const responseData = {
      ...parsedData,
      client_id: clientId,
      client_name: clientName,
      company_match_status: companyMatchStatus
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in parse-job-pdf function:', error);
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
