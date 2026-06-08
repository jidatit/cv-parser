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

async function callGeminiAPI(systemPrompt: string, userPrompt: string) {
  const GOOGLE_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
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

// === Swiss location detection ===
const SWISS_CITIES = [
  'zürich', 'zurich', 'zuerich', 'bern', 'basel', 'luzern', 'lucerne', 'st. gallen', 'st.gallen',
  'winterthur', 'biel', 'thun', 'aarau', 'frauenfeld', 'schaffhausen', 'chur', 'arbon',
  'lausanne', 'genf', 'genève', 'geneva', 'lugano', 'fribourg', 'freiburg', 'solothurn',
  'olten', 'baden', 'wil', 'kreuzlingen', 'rapperswil', 'dietikon', 'wetzikon', 'uster',
  'dübendorf', 'horgen', 'thalwil', 'zug', 'schwyz', 'sion', 'sitten', 'neuchâtel',
  'neuenburg', 'liestal', 'münchenstein', 'reinach', 'allschwil', 'pratteln', 'muttenz',
  'rheinfelden', 'wohlen', 'brugg', 'lenzburg', 'rorschach', 'gossau', 'herisau',
  'appenzell', 'davos', 'interlaken', 'bellinzona', 'locarno', 'nyon', 'morges', 'vevey',
  'montreux', 'yverdon', 'delémont', 'brig', 'visp', 'langenthal', 'burgdorf', 'steffisburg',
  'köniz', 'ostermundigen', 'muri bei bern', 'emmen', 'kriens', 'horw', 'weinfelden',
  'amriswil', 'romanshorn', 'buchs', 'sargans', 'glarus', 'stans', 'sarnen', 'altdorf',
];

const SWISS_KEYWORDS = ['schweiz', 'switzerland', 'suisse', 'svizzera', 'swiss', 'ch-'];

const SWISS_CANTONS = [
  'aargau', 'appenzell', 'bern', 'basel', 'freiburg', 'genf', 'glarus', 'graubünden',
  'jura', 'luzern', 'neuenburg', 'nidwalden', 'obwalden', 'schaffhausen', 'schwyz',
  'solothurn', 'st. gallen', 'thurgau', 'tessin', 'ticino', 'uri', 'waadt', 'vaud',
  'wallis', 'valais', 'zug', 'zürich',
];

function isSwissLocation(location: string | null | undefined): boolean {
  if (!location) return false;
  const loc = location.toLowerCase().trim();
  
  if (SWISS_KEYWORDS.some(kw => loc.includes(kw))) return true;
  if (/\b\d{4}\b/.test(loc) && !loc.includes('deutschland') && !loc.includes('germany')) return true; // Swiss PLZ = 4 digits
  if (SWISS_CITIES.some(city => loc.includes(city))) return true;
  if (SWISS_CANTONS.some(canton => loc.includes(canton))) return true;
  
  return false;
}

function estimateJobSalary(job: any): string {
  if (job?.salary_range || job?.salary) {
    return job.salary_range || job.salary;
  }
  
  const title = (job?.title || '').toLowerCase();
  const level = (job?.experience_level || '').toLowerCase();
  const swiss = isSwissLocation(job?.location);
  
  if (swiss) {
    if (title.includes('director') || title.includes('direktor') || title.includes('head') || title.includes('leitung') || title.includes('leiter')) {
      return '130.000 - 180.000 CHF (geschätzt, Schweiz)';
    }
    if (title.includes('senior') || title.includes('lead') || level.includes('senior')) {
      return '110.000 - 150.000 CHF (geschätzt, Schweiz)';
    }
    if (title.includes('manager') || title.includes('projektleiter') || title.includes('teamleiter')) {
      return '100.000 - 140.000 CHF (geschätzt, Schweiz)';
    }
    if (level.includes('mid') || level.includes('experienced') || title.includes('spezialist') || title.includes('fachspezialist')) {
      return '80.000 - 110.000 CHF (geschätzt, Schweiz)';
    }
    if (title.includes('junior') || title.includes('trainee') || level.includes('junior') || level.includes('entry')) {
      return '60.000 - 80.000 CHF (geschätzt, Schweiz)';
    }
    return '80.000 - 120.000 CHF (geschätzt, Schweiz)';
  }
  
  // EUR estimates (Germany/Austria)
  if (title.includes('senior') || title.includes('lead') || title.includes('leiter') || title.includes('head') || level.includes('senior')) {
    if (title.includes('director') || title.includes('direktor') || title.includes('head')) {
      return '90.000 - 130.000 € (geschätzt)';
    }
    return '70.000 - 95.000 € (geschätzt)';
  }
  if (title.includes('manager') || title.includes('projektleiter') || title.includes('teamleiter')) {
    return '65.000 - 90.000 € (geschätzt)';
  }
  if (level.includes('mid') || level.includes('experienced') || title.includes('spezialist')) {
    return '50.000 - 70.000 € (geschätzt)';
  }
  if (title.includes('junior') || title.includes('trainee') || level.includes('junior') || level.includes('entry')) {
    return '38.000 - 50.000 € (geschätzt)';
  }
  return '50.000 - 75.000 € (geschätzt)';
}

// === Helper functions ===
function extractEducationRequirements(job: any): string {
  const requirements = (job?.requirements || '').toLowerCase();
  const title = (job?.title || '').toLowerCase();
  const level = (job?.experience_level || '').toLowerCase();
  
  const educationKeywords = [];
  
  if (requirements.includes('studium') || requirements.includes('bachelor') || requirements.includes('master') || 
      requirements.includes('diplom') || requirements.includes('abgeschlossenes') || requirements.includes('hochschul')) {
    educationKeywords.push('Studium erforderlich (explizit genannt)');
  }
  if (requirements.includes('ausbildung') || requirements.includes('berufsausbildung') || requirements.includes('lehre')) {
    educationKeywords.push('Berufsausbildung erforderlich');
  }
  if (requirements.includes('wirtschaft') || requirements.includes('bwl') || requirements.includes('betriebswirt')) {
    educationKeywords.push('Wirtschaftlicher Hintergrund');
  }
  if (requirements.includes('informatik') || requirements.includes('it') || requirements.includes('ingenieur') || 
      requirements.includes('technik') || requirements.includes('mint')) {
    educationKeywords.push('Technischer/IT Hintergrund');
  }
  if (requirements.includes('kaufm') || requirements.includes('büro')) {
    educationKeywords.push('Kaufmännischer Hintergrund');
  }
  
  if (educationKeywords.length === 0) {
    if (title.includes('manager') || title.includes('leiter') || title.includes('head') || 
        title.includes('director') || level.includes('senior')) {
      return 'Nicht explizit angegeben - Studium empfohlen für Führungsposition (geschätzt)';
    }
    if (title.includes('spezialist') || title.includes('expert') || title.includes('consultant')) {
      return 'Nicht explizit angegeben - Studium oder relevante Ausbildung empfohlen (geschätzt)';
    }
    if (title.includes('junior') || title.includes('trainee') || title.includes('praktik')) {
      return 'Nicht explizit angegeben - Studium/Ausbildung in Vorbereitung akzeptabel (geschätzt)';
    }
    return 'Nicht explizit angegeben - Relevante Ausbildung oder Studium empfohlen (geschätzt)';
  }
  
  return educationKeywords.join(', ');
}

function formatWorkExperience(exp: any[]): string {
  if (!Array.isArray(exp) || !exp.length) return '-';
  return exp.slice(0, 5).map(e => {
    const duration = e.duration || (e.startDate ? `seit ${e.startDate}` : '?');
    const tasks = e.tasks || e.responsibilities || e.description || '';
    return `• ${e.position || '?'} @ ${e.company || '?'} (${duration})${tasks ? ` - ${tasks.substring(0, 100)}` : ''}`;
  }).join('\n');
}

function formatEducation(edu: any[]): string {
  if (!Array.isArray(edu) || !edu.length) return '-';
  return edu.slice(0, 2).map(e => `${e.degree || '?'} ${e.field || ''} - ${e.institution || '?'}`).join('; ');
}

function formatLanguages(lang: any[]): string {
  if (!Array.isArray(lang) || !lang.length) return '-';
  return lang.map(l => `${l.language}: ${l.level}`).join(', ');
}

function formatFurtherEducation(items: any[]): string {
  if (!Array.isArray(items) || !items.length) return '-';
  return items.slice(0, 3).map(c => c.name).join(', ');
}

function formatNotes(notes: any[]): string {
  if (!Array.isArray(notes) || !notes.length) return '-';
  return notes.slice(-5).map(n => `[${n.author || '?'}] ${n.text || n.content || ''}`).join(' | ');
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
    const { candidate, job, client, notes, stage, commuteData, forceRefresh } = await req.json();

    console.log("Comprehensive match analysis for:", candidate?.name, "->", job?.title, "| forceRefresh:", !!forceRefresh);

    // === CACHE SETUP ===
    const cacheInput = JSON.stringify({ candidate_id: candidate?.id, job_id: job?.id, stage });
    const cacheKey = await hashKey(cacheInput);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // === FORCE REFRESH: Delete old cache ===
    if (forceRefresh) {
      console.log('🔄 Force refresh requested - deleting cached result');
      await serviceClient
        .from('ai_cache')
        .delete()
        .eq('function_name', 'analyze-match')
        .eq('cache_key', cacheKey);
    } else {
      // === CACHE CHECK (only if not force refresh) ===
      const { data: cached } = await serviceClient
        .from('ai_cache')
        .select('response_data')
        .eq('function_name', 'analyze-match')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cached) {
        console.log('✅ Cache hit for analyze-match');
        return new Response(JSON.stringify(cached.response_data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    console.log('Running fresh AI analysis...');

    // Detect Swiss context
    const jobIsSwiss = isSwissLocation(job?.location);
    const candidateIsSwiss = isSwissLocation(candidate?.location);
    const isSwissContext = jobIsSwiss || candidateIsSwiss;

    // Estimate job salary if not provided
    const estimatedSalary = estimateJobSalary(job);

    const currencyHint = isSwissContext ? `
WICHTIG - SCHWEIZER KONTEXT:
- Diese Stelle und/oder der Kandidat ist in der SCHWEIZ
- Gehaltsangaben in CHF bewerten (NICHT mit EUR vergleichen!)
- Schweizer Gehälter sind ca. 40-60% höher als deutsche Gehälter - das ist normal und korrekt
- Ein Gehalt von 120.000-150.000 CHF für eine Führungsposition in der Schweiz ist absolut marktüblich
- Bewerte den Wohnort des Kandidaten relativ zum Arbeitsort (Pendelweg innerhalb der Schweiz)
- Berücksichtige Schweizer Lebenshaltungskosten bei der Gehaltsbewertung
` : '';

    const systemPrompt = `Du bist ein erfahrener Recruiting-Experte. Führe eine präzise Match-Analyse durch.

WICHTIG: Verwende Schweizer Hochdeutsch - kein "ß" (scharfes S), immer "ss" stattdessen (z.B. "gross" statt "groß", "Strasse" statt "Straße"). UMLAUTE IMMER VERWENDEN: Schreibe ä, ö, ü, Ä, Ö, Ü - niemals ae, oe, ue als Ersatz (z.B. "Führungskraft" nicht "Fuehrungskraft", "können" nicht "koennen").
${currencyHint}
WICHTIGSTE BEWERTUNGSKRITERIEN (diese haben höchste Priorität):
1. **salary_score** (SEHR WICHTIG): Übereinstimmung Gehaltsvorstellung vs. Angebot
   - Falls kein Gehalt bei der Stelle angegeben ist, nutze die Schätzung basierend auf Position/Branche/Erfahrungslevel
   - Bewerte wie realistisch die Gehaltsvorstellung des Kandidaten zur Stelle passt
   - WICHTIG: CHF und EUR nicht direkt vergleichen! Schweizer Gehälter sind deutlich höher als deutsche
   
2. **commute_score** (SEHR WICHTIG): Arbeitsweg-Bewertung
   - REGEL: Wenn Umzugsbereitschaft = "Ja" → commute_score = 95-100, Arbeitsweg ist IRRELEVANT
   - Nur bei "Nein" oder "-": Pendelzeit und max. Pendelbereitschaft bewerten
   - Bei "Bedingt": commute_score leicht reduzieren, aber Arbeitsweg nicht als Hindernis werten

3. **requirements_score** (SEHR WICHTIG): Erfüllung der Stellenanforderungen
   - Wie gut erfüllt der Kandidat die MUSS-Anforderungen?
   - Werden die geforderten Skills/Qualifikationen mitgebracht?
   - Passt das Erfahrungslevel zu den Anforderungen?

4. **career_fit_score** (SEHR WICHTIG): Karriereweg-Passung
   - Passt der bisherige Karriereweg logisch zur Stelle?
   - Ist die Position ein sinnvoller nächster Karriereschritt?
   - Passen Branchen-Erfahrung und bisherige Rollen?

5. **education_score** (SEHR WICHTIG): Ausbildungsanforderungen-Match
   - Hat der Kandidat die geforderte Ausbildung/Studium für die Stelle?
   - Passt der Bildungsabschluss (Bachelor, Master, Ausbildung) zu den Anforderungen?
   - Ist das Studienfach/Ausbildungsbereich relevant für die Position?
   - Bei fehlenden expliziten Anforderungen: Passt die Ausbildung generell zur Stelle?

6. **skills_score**: Übereinstimmung der technischen/fachlichen Skills

ANALYSE-REGELN:
- Kurze, prägnante Bullet Points (max 15 Wörter)
- KEINE Punkte am Ende der Bullet Points
- Erkenne Risiken aus Notizen und Prozessdaten
- Bei fehlenden Gehaltsdaten: Nutze die Schätzung für die Bewertung
- Bei fehlenden Ausbildungsanforderungen: Schätze basierend auf Position/Branche

Antworte NUR mit diesem JSON:
{
  "score": <Gesamt 0-100, gewichteter Durchschnitt mit Fokus auf die wichtigsten Kriterien>,
  "salary_score": <0-100>,
  "commute_score": <0-100>,
  "requirements_score": <0-100>,
  "career_fit_score": <0-100>,
  "education_score": <0-100>,
  "skills_score": <0-100>,
  "summary": "<1-2 Sätze mit Fokus auf die wichtigsten Match-Faktoren>",
  "strengths": ["<kurz>", "<kurz>"],
  "gaps": ["<kurz>", "<kurz>"],
  "risks": ["<kurz>"],
  "reasons": ["<kurz>", "<kurz>"]
}`;

    const candidateInfo = `
KANDIDAT: ${candidate?.name || 'Unbekannt'}
- Status: ${candidate?.status || '-'} | Recruiting: ${candidate?.recruiting_status || '-'}
- Aktuelle Position: ${candidate?.position || '-'} → Wunschposition: ${candidate?.desired_position || '-'}
- Erfahrung: ${candidate?.experience || '-'} | Branche: ${candidate?.industry || '-'}
- Skills: ${Array.isArray(candidate?.skills) ? candidate.skills.join(', ') : '-'}
- Aktuelles Gehalt: ${candidate?.current_salary || '-'} → Wunschgehalt: ${candidate?.desired_salary || '-'}
- Standort: ${candidate?.location || '-'}${candidateIsSwiss ? ' (Schweiz)' : ''}
- Max. Pendelzeit: ${candidate?.max_commute || '-'}
- Umzugsbereitschaft: ${candidate?.willing_to_relocate || '-'}
- Workload: ${candidate?.workload || '-'}
- Wechselgrund: ${candidate?.reason_for_change || '-'}

Berufserfahrung (WICHTIG für Karriereweg-Bewertung):
${formatWorkExperience(candidate?.work_experience)}

Ausbildung:
${formatEducation(candidate?.education)}

Sprachen: ${formatLanguages(candidate?.languages)}
Zertifikate/Weiterbildungen: ${formatFurtherEducation(candidate?.further_education)}
`;

    // Extract education requirements from job
    const educationRequirements = extractEducationRequirements(job);

    const jobInfo = `
STELLE: ${job?.title || 'Unbekannt'}
- Status: ${job?.status || '-'} | Art: ${job?.employment_type || '-'} | Level: ${job?.experience_level || '-'}
- Standort: ${job?.location || '-'}${jobIsSwiss ? ' (Schweiz)' : ''}
- Gehalt (angegeben): ${job?.salary_range || job?.salary || 'Nicht angegeben'}
- Gehalt (geschätzt): ${estimatedSalary}
- Geforderte Skills: ${Array.isArray(job?.skills) ? job.skills.join(', ') : '-'}

AUSBILDUNGSANFORDERUNGEN (WICHTIG - detailliert prüfen):
${educationRequirements}

ANFORDERUNGEN (WICHTIG - detailliert prüfen):
${job?.requirements || '-'}

Aufgaben/Verantwortlichkeiten:
${job?.responsibilities || job?.description || '-'}
`;

    const clientInfo = client ? `
FIRMA: ${client.name || '-'}
- Status: ${client.status || '-'} | Branche: ${client.industry || '-'}
- Beschreibung: ${client.description || '-'}
- Benefits: ${client.benefits || '-'}
- Notizen: ${client.notes || '-'}
` : '';

    const commuteInfo = commuteData ? `
ARBEITSWEG (WICHTIG):
- Auto: ${commuteData.auto?.duration || 'Nicht berechnet'} (${commuteData.auto?.distance || '-'})
- ÖPNV: ${commuteData.oepnv?.duration || 'Nicht berechnet'} (${commuteData.oepnv?.distance || '-'})
- Kandidat max. Pendelzeit: ${candidate?.max_commute || 'Nicht angegeben'}
- Umzugsbereitschaft: ${candidate?.willing_to_relocate || 'Nicht angegeben'}
` : `
ARBEITSWEG: Nicht berechnet (Adressen fehlen oder keine Route gefunden)
- Kandidat max. Pendelzeit: ${candidate?.max_commute || 'Nicht angegeben'}
- Umzugsbereitschaft: ${candidate?.willing_to_relocate || 'Nicht angegeben'}
`;

    const processInfo = `
PROZESS: Stage ${stage || '-'}
Notizen: ${formatNotes(notes)}
`;

    const userPrompt = candidateInfo + jobInfo + clientInfo + commuteInfo + processInfo;

    let content;
    try {
      content = await callGeminiAPI(systemPrompt, userPrompt);
    } catch (error) {
      console.error("API call failed:", error);
      return new Response(JSON.stringify({ 
        score: 75, salary_score: 70, commute_score: 75, requirements_score: 75, career_fit_score: 75, education_score: 70, skills_score: 70,
        summary: "AI-Analyse temporär nicht verfügbar",
        reasons: ["API Fehler"], strengths: [], gaps: [], risks: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch (parseError) {
      result = {
        score: 75, salary_score: 70, commute_score: 75, requirements_score: 75, career_fit_score: 75, education_score: 70, skills_score: 70,
        summary: "Analyse konnte nicht verarbeitet werden",
        reasons: ["Parse-Fehler"], strengths: [], gaps: [], risks: []
      };
    }

    // Normalize scores
    result.score = Math.max(0, Math.min(100, result.score || 75));
    result.salary_score = Math.max(0, Math.min(100, result.salary_score || 70));
    result.commute_score = Math.max(0, Math.min(100, result.commute_score || 75));
    result.requirements_score = Math.max(0, Math.min(100, result.requirements_score || 75));
    result.career_fit_score = Math.max(0, Math.min(100, result.career_fit_score || 75));
    result.education_score = Math.max(0, Math.min(100, result.education_score || 70));
    result.skills_score = Math.max(0, Math.min(100, result.skills_score || 70));

    // Map to existing frontend fields for backwards compatibility
    result.experience_score = result.career_fit_score;

    // Clean text
    const clean = (t: string) => t.replace(/\.+$/, '').trim();
    if (Array.isArray(result.reasons)) result.reasons = result.reasons.map(clean);
    if (Array.isArray(result.strengths)) result.strengths = result.strengths.map(clean);
    if (Array.isArray(result.gaps)) result.gaps = result.gaps.map(clean);
    if (Array.isArray(result.risks)) result.risks = result.risks.map(clean);

    // === CACHE WRITE ===
    const ttl3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await serviceClient.from('ai_cache').upsert({
      function_name: 'analyze-match',
      cache_key: cacheKey,
      response_data: result,
      expires_at: ttl3Days,
    }, { onConflict: 'function_name,cache_key' });
    console.log('✅ Cached analyze-match result');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ 
      score: 75, salary_score: 70, commute_score: 75, requirements_score: 75, career_fit_score: 75, education_score: 70, skills_score: 70,
      summary: "Fehler bei der Analyse",
      reasons: ["Analyse-Fehler"], strengths: [], gaps: [], risks: []
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
