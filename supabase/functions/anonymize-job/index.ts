import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-language',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { job_ids, anonymization_level = 'medium', language = 'de' } = await req.json();

    if (!job_ids || !Array.isArray(job_ids) || job_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'job_ids required' }), { status: 400, headers: corsHeaders });
    }

    const geminiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), { status: 500, headers: corsHeaders });
    }

    const { data: blacklist } = await supabase.from('publication_blacklist').select('client_id');
    const blacklistedIds = new Set((blacklist || []).map((b: any) => b.client_id));

    // Load active publication rules
    const { data: activeRules } = await supabase.from('publication_rules').select('*').eq('is_active', true);
    const rules = activeRules || [];

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*, clients(name, industry)')
      .in('id', job_ids);

    if (jobsError || !jobs) {
      return new Response(JSON.stringify({ error: 'Failed to fetch jobs' }), { status: 500, headers: corsHeaders });
    }

    const results = [];

    for (const job of jobs) {
      if (job.client_id && blacklistedIds.has(job.client_id)) {
        results.push({ id: job.id, skipped: true, reason: 'blacklisted' });
        continue;
      }

      // Check if any active rule matches this job and override anonymization_level
      let effectiveLevel = anonymization_level;
      let shouldAutoPublish = false;
      const clientName = (job as any).clients?.name || 'Unbekannt';
      const clientIndustry = (job as any).clients?.industry || '';

      for (const rule of rules) {
        const cond = rule.conditions || {};
        const industryMatch = !cond.industry || clientIndustry.toLowerCase().includes(cond.industry.toLowerCase());
        const locationMatch = !cond.location || (job.location || '').toLowerCase().includes(cond.location.toLowerCase());
        if (industryMatch && locationMatch) {
          if (rule.anonymization_level) effectiveLevel = rule.anonymization_level;
          if (rule.auto_publish) shouldAutoPublish = true;
          break;
        }
      }

      await supabase.from('jobs').update({ publication_status: 'ai_processing' }).eq('id', job.id);

      const langMap: Record<string, string> = { de: 'Deutsch', en: 'Englisch', fr: 'Franzoesisch' };
      const outputLanguage = langMap[language] || 'Deutsch';

      // Generate SEO slug from title + location
      const slugBase = `${job.title} ${job.location || ''}`.toLowerCase()
        .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      const prompt = `Du bist ein erfahrener Headhunter und Marketing-Experte fuer eine Personalberatungsagentur. Deine Aufgabe: Erstelle ZWEI komplett unterschiedliche Stellenanzeigen-Varianten fuer A/B-Testing.

## STRIKTE ANONYMISIERUNGSREGELN
- KEINE Formulierung darf dem Original aehneln. Schreibe ALLES komplett neu
- Ersetze "${clientName}" durch generische Begriffe (z.B. "ein fuehrendes Unternehmen der ${clientIndustry || 'Branche'}")
- Verschleiere Standorthinweise, Produkte, Projektnamen, spezifische Tools
- Wenn Tools/Systeme genannt werden, verallgemeinere sie (z.B. "SAP S/4HANA" -> "ein marktfuehrendes ERP-System")

## PERSPEKTIVE (ZWINGEND)
- IMMER aus der Perspektive der Personalberatungsagentur
- VERBOTEN: "Wir", "Unser Team", "Bei uns" (aus Firmensicht)
- STATTDESSEN: "Unser Klient", "Das Unternehmen", "Der Arbeitgeber"

## VARIANTE A - "Der Verkäufer" (AIDA-Framework)
Struktur: Attention → Interest → Desire → Action
- Attention: Packende Eroeffnung mit einer starken Aussage
- Interest: Hard Facts, Zahlen, Marktposition des Unternehmens
- Desire: Konkrete Benefits, Gehalt, Karrierepfade
- Action: Klarer Call-to-Action
- Tonalitaet: "Sie"-Form, professionell und serioes
- Stil: Faktenbasiert, ueberzeugend, strukturiert

## VARIANTE B - "Der Psychologe" (PAS-Framework)
Struktur: Problem → Agitation → Solution
- Problem: Pain-Points der Zielgruppe ansprechen (z.B. "Kennen Sie das: endlose Meetings ohne Entscheidungen?")
- Agitation: Das Problem verstaerken, Emotionen wecken
- Solution: Die Stelle als perfekte Loesung praesentieren
- Tonalitaet: "Du"-Form (falls branchenpassend, sonst "Sie"), emotional und direkt
- Stil: Storytelling, persoenlich, motivierend

## SPRACHE
Schreibe den gesamten Output in: ${outputLanguage}
Verwende Schweizer Hochdeutsch: KEIN scharfes S (ß) — immer "ss" verwenden (z.B. "Strasse", "grosse", "massgeblich"). Umlaute (ä, ö, ü) sind korrekt. Bulletpoints enden NICHT mit einem Punkt.

## ORIGINAL-DATEN (NUR ALS INHALTLICHE REFERENZ!)
Titel: ${job.title}
Beschreibung: ${job.description || 'Keine Beschreibung'}
Aufgaben: ${job.responsibilities || 'Keine Aufgaben angegeben'}
Anforderungen: ${job.requirements || 'Keine Anforderungen angegeben'}
Benefits: ${job.benefits || 'Keine Benefits angegeben'}
Standort: ${job.location || 'Nicht angegeben'}
Branche: ${clientIndustry || 'Nicht angegeben'}

## OUTPUT-FORMAT (striktes JSON)
{
  "variant_a": {
    "title": "Anonymisierter, professioneller Jobtitel",
    "summary": "1-2 Saetze Zusammenfassung fuer Variante A",
    "description": "<p>AIDA-basierte Beschreibung...</p>",
    "responsibilities": "<ul><li>Aufgabe 1</li></ul>",
    "requirements": "<ul><li>Anforderung 1</li></ul>",
    "benefits": "<ul><li>Benefit 1</li></ul>",
    "framework": "AIDA"
  },
  "variant_b": {
    "title": "Emotionaler, ansprechender Jobtitel",
    "summary": "1-2 Saetze Zusammenfassung fuer Variante B",
    "description": "<p>PAS-basierte Beschreibung...</p>",
    "responsibilities": "<ul><li>Aufgabe 1</li></ul>",
    "requirements": "<ul><li>Anforderung 1</li></ul>",
    "benefits": "<ul><li>Benefit 1</li></ul>",
    "framework": "PAS"
  },
  "seo_slug": "${slugBase}",
  "meta_description": "SEO Beschreibung (max 160 Zeichen)",
  "seo_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

Antworte NUR mit dem JSON-Objekt, ohne zusaetzlichen Text.`;

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.9 },
          }),
        }
      );

      const geminiData = await geminiResponse.json();
      const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      let parsed: any = {};
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error('Failed to parse Gemini response:', e);
        // Fallback: try old format
        parsed = {
          variant_a: { title: job.title, description: responseText, framework: 'AIDA' },
          variant_b: { title: job.title, description: '', framework: 'PAS' },
        };
      }

      const va = parsed.variant_a || {};
      const vb = parsed.variant_b || {};

      // Swiss German: replace ß with ss as safety net
      const replaceEszett = (s: string) => s ? s.replace(/ß/g, 'ss') : s;
      for (const key of ['title', 'summary', 'description', 'responsibilities', 'requirements', 'benefits']) {
        if (va[key]) va[key] = replaceEszett(va[key]);
        if (vb[key]) vb[key] = replaceEszett(vb[key]);
      }
      if (parsed.meta_description) parsed.meta_description = replaceEszett(parsed.meta_description);

      const updateData: any = {
        // Variant A fields (also backfill legacy fields)
        public_title: va.title || job.title,
        public_title_a: va.title || job.title,
        public_summary_a: va.summary || null,
        framework_a: va.framework || 'AIDA',
        public_description: va.description || '',
        public_responsibilities: va.responsibilities || null,
        public_requirements: va.requirements || null,
        public_benefits: va.benefits || null,
        // Variant B fields
        public_title_variant_b: vb.title || null,
        public_title_b: vb.title || null,
        public_summary_b: vb.summary || null,
        framework_b: vb.framework || 'PAS',
        public_description_b: vb.description || null,
        public_responsibilities_b: vb.responsibilities || null,
        public_requirements_b: vb.requirements || null,
        public_benefits_b: vb.benefits || null,
        // Control fields
        active_variant: 'split',
        auto_optimize: true,
        winner_variant: null,
        // SEO
        seo_slug: parsed.seo_slug || slugBase,
        meta_description: parsed.meta_description || null,
        seo_meta_title: va.title || null,
        seo_meta_description: parsed.meta_description || null,
        seo_keywords: parsed.seo_keywords || [],
        // Status
        publication_status: shouldAutoPublish ? 'live' : 'review',
        is_published: shouldAutoPublish,
        published_at: shouldAutoPublish ? new Date().toISOString() : null,
        publication_expires_at: shouldAutoPublish ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
        anonymized_at: new Date().toISOString(),
        anonymization_level: effectiveLevel,
        publication_language: language,
      };

      await supabase.from('jobs').update(updateData).eq('id', job.id);

      await supabase.from('publication_audit_log').insert({
        job_id: job.id,
        user_id: userId,
        action: 'regenerated',
        details: { anonymization_level, language, ab_testing: true, frameworks: ['AIDA', 'PAS'] },
      });

      results.push({ id: job.id, success: true, public_title_a: va.title, public_title_b: vb.title });
    }

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
