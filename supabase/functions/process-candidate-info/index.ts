import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');

interface FieldResult {
  key: string;
  label: string;
  value: any;
  action: 'replace' | 'append' | 'add';
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
    const { instruction, text, images, currentData, analyzeExistingData, extractSkillsOnly } = await req.json();

    // Check if we have either text, images, or instruction with existing data
    const hasTextInput = text && typeof text === 'string' && text.trim();
    const hasImageInput = images && Array.isArray(images) && images.length > 0;
    const hasInstructionWithData = instruction && typeof instruction === 'string' && instruction.trim() && currentData && Object.keys(currentData).length > 0;
    const hasExistingDataToAnalyze = analyzeExistingData && currentData && Object.keys(currentData).length > 0;
    
    if (!hasTextInput && !hasImageInput && !hasExistingDataToAnalyze && !hasInstructionWithData) {
      return new Response(
        JSON.stringify({ error: 'Text, images, or existing data are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!GOOGLE_GEMINI_API_KEY) {
      console.error('GOOGLE_GEMINI_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `Du bist ein hochpräziser Analyse-Assistent für ein Recruiting-CRM. Deine PRIMÄRE Aufgabe ist es, die Anweisungen des Benutzers EXAKT und STRIKT zu befolgen.

## KRITISCHE REGELN (MÜSSEN BEFOLGT WERDEN):

1. **BENUTZERANWEISUNG HAT HÖCHSTE PRIORITÄT**: Wenn der Benutzer eine spezifische Anweisung gibt, führe GENAU diese Anweisung aus. Nicht mehr, nicht weniger.

2. **KEINE INTERPRETATION**: Füge keine Informationen hinzu, die nicht explizit im Text oder Bild vorhanden sind. Erfinde nichts.

3. **PRÄZISE EXTRAKTION**: Extrahiere nur das, was wirklich da steht. Bei Unsicherheit: lieber weglassen als raten.

4. **STRIKTE JSON-AUSGABE**: Antworte NUR mit einem gültigen JSON-Objekt. Keine Erklärungen, kein Markdown, nur JSON.

## TEXTSTANDARD:
- Schweizer Hochdeutsch: kein "ß", immer "ss" (z.B. "gross" statt "groß")
- UMLAUTE VERWENDEN: Verwende IMMER korrekte deutsche Umlaute (ä, ö, ü, Ä, Ö, Ü). Niemals ae/oe/ue stattdessen schreiben!
- Bulletpoints enden NIE mit Punkt

## BENUTZERANWEISUNG (HÖCHSTE PRIORITÄT - GENAU BEFOLGEN):
${instruction ? instruction : 'Extrahiere alle verfügbaren Kandidateninformationen.'}

## VERFÜGBARE FELDER FÜR EXTRAKTION:
- name: Vollständiger Name
- email: E-Mail-Adresse
- phone: Telefonnummer
- location: Standort/Wohnort
- position: Aktuelle Position/Jobtitel
- desired_position: Gewünschte Position
- current_salary: Aktuelles Gehalt
- desired_salary: Gehaltswunsch als Spanne (Format: "MIN-MAX", z.B. "120000-140000"). WICHTIG: Beide Werte MÜSSEN auf volle Tausender gerundet sein! Bei Einzelwert generiere eine realistische Spanne (+/- 10-15%) und runde auf Tausender. "k" bedeutet Tausend (120k = 120000).
- experience: Berufserfahrung in Jahren
- notice_period: Kündigungsfrist
- reason_for_change: Wechselmotivation
- willing_to_relocate: Umzugsbereitschaft (ja/nein/bedingt)
- workload: Gewünschtes Pensum (z.B. "100%", "80-100%")
- max_commute: Maximaler Arbeitsweg
- linkedin_url: LinkedIn URL
- skills: Array von Skills
- languages: Array von {name: "Sprache", level: "Niveau"}
- work_experience: Array von {company: "Firma", position: "Position", start_date: "MM/YYYY", end_date: "MM/YYYY oder heute", location: "Ort", description: "Beschreibung"}. WICHTIG: Verwende IMMER snake_case (start_date, end_date), NIEMALS camelCase!
- education: Array von {institution: "Institution", degree: "Abschluss", field: "Fachrichtung", start_date: "MM/YYYY", end_date: "MM/YYYY", location: "Ort"}. WICHTIG: Verwende IMMER snake_case (start_date, end_date), NIEMALS camelCase!
- further_education: Array von {name: "Kurs/Zertifikat", institution: "Aussteller/Institution", date: "MM/YYYY", description: "Beschreibung"}
- awards_publications: Array von {title: "Titel", type: "award|publication|engagement", year: "YYYY", year_end: "YYYY oder 'heute' (optional, nur bei Zeitspannen)", publisher: "Herausgeber (bei Publikationen)", organization: "Organisation (bei Engagement)", description: "Beschreibung"}. WICHTIG: type muss einer der folgenden Werte sein: "award", "publication" oder "engagement". Bei Auszeichnungen/Preisen: type="award". Bei Publikationen/Veröffentlichungen: type="publication". Bei Vereinen/Engagement/Ehrenamt: type="engagement". Bei Zeitspannen (z.B. "2012-2014", "2018-heute", "seit 2020") extrahiere year als Startjahr und year_end als Endjahr. Wenn ein Engagement bis heute andauert (z.B. "2012-heute", "seit 2018", "aktuell"), setze year_end auf "heute".
- notes: Zusätzliche wichtige Informationen als Text
- summary: Kurze Zusammenfassung (max. 40 Wörter)
- insights_notes: Charakterbezogene Notizen (Motivation, Soft Skills, Persönlichkeit)
- most_proud_of: PRIVATE Meilensteine (Familie, Reisen, Hobbys, persönliche Erfolge - NICHT Karriere!)
- candidate_values: Array von 3 einwortigen Kernwerten
- potential_risks: Potenzielle Risiken/Annahmen

## ARBEITSZEUGNIS-TÄTIGKEITEN MATCHING:
Wenn du Tätigkeiten aus einem Arbeitszeugnis extrahierst und vorhandene Berufserfahrungen existieren:
1. Vergleiche Firmenname (auch Teilübereinstimmungen, z.B. "Implenia" matched "Implenia Schweiz AG")
2. Vergleiche Position (Teilübereinstimmungen erlaubt)
3. Vergleiche Zeitraum (überlappende Perioden)
4. Bei Match: Aktualisiere die description der bestehenden Berufserfahrung
5. Bei keinem Match: Erstelle neuen Eintrag mit allen extrahierten Informationen

Format für description (HTML mit Bulletpoints):
<ul><li>Tätigkeit 1</li><li>Tätigkeit 2</li></ul>

Falls bereits eine description existiert, füge die neuen Tätigkeiten hinzu (ohne Duplikate).

Bei Arbeitszeugnis-Extraktion gib zusätzlich folgende Felder zurück:
- "matched_index": Index der gematchten Berufserfahrung (oder -1 wenn keine gefunden)
- "matched_company": Name der gematchten Firma
- "extracted_tasks": Array der extrahierten Tätigkeiten als einzelne Strings

## AKTIONSLOGIK:
- "replace": Vorhandenes Feld ersetzen (nur wenn neue Daten besser/vollständiger)
- "append": Zu Array hinzufügen (bei bereits vorhandenen Arrays)
- "add": Neues Feld hinzufügen

## AKTUELLE KANDIDATENDATEN (falls vorhanden):
${JSON.stringify(currentData || {}, null, 2)}

## ANTWORTFORMAT (NUR DIESES JSON, NICHTS ANDERES):
{
  "fields": [
    {"key": "feldname", "label": "Anzeigename", "value": "Wert oder Array", "action": "replace|append|add"}
  ]
}`;

    console.log('Calling Google Gemini API with', images?.length || 0, 'images, text length:', text?.length || 0, 'analyzeExistingData:', !!analyzeExistingData);

    // Build the parts array for the request
    const parts: any[] = [{ text: systemPrompt }];

    // If analyzing existing data (e.g., for capitalization fix), add a special prompt
    if (analyzeExistingData && currentData) {
      parts.push({ text: `\n\nAnalysiere und korrigiere die folgenden vorhandenen Kandidatendaten gemäss der Anweisung. Gib NUR die Felder zurück, die tatsächlich geändert wurden:\n\n${JSON.stringify(currentData, null, 2)}` });
    }

    // Add text if provided
    if (text && text.trim()) {
      parts.push({ text: `\n\nAnalysiere folgenden Text:\n\n${text}` });
    }

    // Add images if provided
    if (images && Array.isArray(images) && images.length > 0) {
      parts.push({ text: '\n\nAnalysiere auch die folgenden Screenshots/Bilder:' });
      
      for (const imageBase64 of images) {
        // Extract the base64 data and mime type
        const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          });
        }
      }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts
            }
          ],
          generationConfig: {
            temperature: 0.3,
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('Google Gemini API error:', response.status, errorText);
      throw new Error(`Google Gemini API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI Response:', content);

    // Parse the JSON response
    let parsedContent;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw content:', content);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', fields: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If extractSkillsOnly is true, return the detected_skills format directly
    if (extractSkillsOnly && parsedContent.detected_skills) {
      return new Response(
        JSON.stringify({ detected_skills: parsedContent.detected_skills }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map field keys to German labels
    const labelMap: Record<string, string> = {
      name: 'Name',
      email: 'E-Mail',
      phone: 'Telefon',
      location: 'Standort',
      position: 'Aktuelle Position',
      desired_position: 'Gewünschte Position',
      current_salary: 'Aktuelles Gehalt',
      desired_salary: 'Gehaltswunsch',
      experience: 'Berufserfahrung',
      notice_period: 'Kündigungsfrist',
      reason_for_change: 'Wechselmotivation',
      willing_to_relocate: 'Umzugsbereitschaft',
      workload: 'Pensum',
      max_commute: 'Max. Arbeitsweg',
      linkedin_url: 'LinkedIn',
      skills: 'Skills',
      languages: 'Sprachen',
      work_experience: 'Berufserfahrung',
      education: 'Ausbildung',
      further_education: 'Weiterbildungen',
      awards_publications: 'Awards & Publikationen',
      notes: 'Notizen',
      summary: 'Zusammenfassung',
      insights_notes: 'Persönliche Notizen',
      most_proud_of: 'Worauf stolz',
      candidate_values: 'Kernwerte',
      potential_risks: 'Potenzielle Risiken'
    };

    // Normalize field values to ensure correct field names
    const normalizeArrayEntries = (entries: any[], fieldKey: string): any[] => {
      return entries.map(entry => {
        const normalized: any = { ...entry };
        
        // Convert camelCase to snake_case for date fields
        if (entry.startDate !== undefined) {
          normalized.start_date = entry.startDate;
          delete normalized.startDate;
        }
        if (entry.endDate !== undefined) {
          normalized.end_date = entry.endDate;
          delete normalized.endDate;
        }
        
        // Normalize awards_publications fields
        if (fieldKey === 'awards_publications') {
          // Ensure title exists (map from name if needed)
          if (!normalized.title && normalized.name) {
            normalized.title = normalized.name;
            delete normalized.name;
          }
          // Ensure type is valid, default to 'award'
          if (!normalized.type || !['award', 'publication', 'engagement'].includes(normalized.type)) {
            normalized.type = 'award';
          }
          // Handle date ranges (e.g., "2012-2014", "2018-heute")
          if (!normalized.year && normalized.date) {
            const dateStr = String(normalized.date);
            // Check for date range pattern (e.g., "2012-2014", "2012 - 2014", "2018-heute")
            const rangeMatch = dateStr.match(/(\d{4})\s*[-–]\s*(\d{4}|heute|aktuell|present|ongoing)/i);
            if (rangeMatch) {
              normalized.year = rangeMatch[1];
              const endPart = rangeMatch[2].toLowerCase();
              if (['heute', 'aktuell', 'present', 'ongoing'].includes(endPart)) {
                normalized.year_end = 'heute';
              } else {
                normalized.year_end = rangeMatch[2];
              }
            } else {
              // Single year extraction
              const yearMatch = dateStr.match(/\d{4}/);
              normalized.year = yearMatch ? yearMatch[0] : dateStr;
            }
            delete normalized.date;
          }
          // Handle year range if year itself contains a range
          if (normalized.year && !normalized.year_end) {
            const yearStr = String(normalized.year);
            const rangeMatch = yearStr.match(/(\d{4})\s*[-–]\s*(\d{4}|heute|aktuell|present|ongoing)/i);
            if (rangeMatch) {
              normalized.year = rangeMatch[1];
              const endPart = rangeMatch[2].toLowerCase();
              if (['heute', 'aktuell', 'present', 'ongoing'].includes(endPart)) {
                normalized.year_end = 'heute';
              } else {
                normalized.year_end = rangeMatch[2];
              }
            }
          }
          // Map issuer to publisher/organization based on type
          if (normalized.issuer && !normalized.publisher && !normalized.organization) {
            if (normalized.type === 'publication') {
              normalized.publisher = normalized.issuer;
            } else if (normalized.type === 'engagement') {
              normalized.organization = normalized.issuer;
            } else {
              // For awards, use publisher
              normalized.publisher = normalized.issuer;
            }
            delete normalized.issuer;
          }
        }
        
        return normalized;
      });
    };

    // Ensure proper labels and normalize data
    const arrayFields = ['work_experience', 'education', 'further_education', 'awards_publications'];
    const fields = (parsedContent.fields || []).map((field: FieldResult) => {
      let normalizedValue = field.value;
      
      // Normalize array entries to ensure correct field names
      if (arrayFields.includes(field.key) && Array.isArray(field.value)) {
        normalizedValue = normalizeArrayEntries(field.value, field.key);
      }
      
      return {
        ...field,
        value: normalizedValue,
        label: labelMap[field.key] || field.label || field.key
      };
    });

    return new Response(
      JSON.stringify({ fields }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-candidate-info:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
