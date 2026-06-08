import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callGeminiAPI(messages: Array<{role: string, content: string}>) {
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
  }

  // Combine system and user messages for Gemini
  const combinedPrompt = messages.map(m => m.content).join('\n\n');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Keine Antwort erhalten.';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("No authorization header");
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      console.error("Auth error:", authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Authenticated user:", user.id);

    const { query, conversationHistory = [] } = await req.json();

    // Initialize Supabase client with service role for data access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all relevant data for comprehensive analysis
    const [
      { data: candidates },
      { data: jobs },
      { data: clients },
      { data: placements },
      { data: tasks },
      { data: profiles },
    ] = await Promise.all([
      supabase.from('candidates').select('*'),
      supabase.from('jobs').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('placements').select('*'),
      supabase.from('tasks').select('*'),
      supabase.from('profiles').select('*'),
    ]);

    // Calculate KPIs per user
    const userKPIs: Record<string, any> = {};
    profiles?.forEach((profile: any) => {
      userKPIs[profile.id] = {
        name: profile.full_name || profile.email,
        email: profile.email,
        candidates: 0,
        jobs: 0,
        clients: 0,
        placements: 0,
        tasksCompleted: 0,
        tasksOpen: 0,
      };
    });

    candidates?.forEach((c: any) => {
      if (userKPIs[c.user_id]) userKPIs[c.user_id].candidates++;
    });
    jobs?.forEach((j: any) => {
      if (userKPIs[j.user_id]) userKPIs[j.user_id].jobs++;
    });
    clients?.forEach((c: any) => {
      if (userKPIs[c.user_id]) userKPIs[c.user_id].clients++;
    });
    placements?.forEach((p: any) => {
      if (p.stage === 'Placed' && userKPIs[p.user_id]) userKPIs[p.user_id].placements++;
    });
    tasks?.forEach((t: any) => {
      if (userKPIs[t.user_id]) {
        if (t.completed) userKPIs[t.user_id].tasksCompleted++;
        else userKPIs[t.user_id].tasksOpen++;
      }
    });

    // Calculate pipeline statistics
    const pipelineStats: Record<string, number> = {
      'Ready2Send': 0,
      'Sent': 0,
      'Interview': 0,
      'Offer': 0,
      'Placed': 0,
      'Rejected': 0,
    };
    placements?.forEach((p: any) => {
      const stage = p.stage || 'Ready2Send';
      if (pipelineStats[stage] !== undefined) pipelineStats[stage]++;
    });

    // Calculate conversion rates
    const totalCandidates = candidates?.length || 0;
    const placedCount = pipelineStats['Placed'] || 0;
    const totalPlacements = placedCount;
    const overallConversionRate = totalCandidates > 0 ? (placedCount / totalCandidates * 100).toFixed(2) : 0;

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentCandidates = candidates?.filter((c: any) => new Date(c.created_at) >= thirtyDaysAgo).length || 0;
    const recentJobs = jobs?.filter((j: any) => new Date(j.created_at) >= thirtyDaysAgo).length || 0;
    const recentPlacements = placements?.filter((p: any) => new Date(p.created_at) >= thirtyDaysAgo).length || 0;

    const systemPrompt = `Du bist der interne Controller und Business Analyst von **Beckett Stone**, einer Premium-Headhunting-Agentur mit Sitz in Zürich. 

ÜBER BECKETT STONE:
- Spezialisiert auf die Vermittlung von Fach- und Führungskräften an Schweizer Unternehmen
- Zielmarkt: Schweiz (primär), gelegentlich Kandidaten aus Deutschland und Österreich
- Fokus auf qualitativ hochwertige Placements und langfristige Kundenbeziehungen

DEINE ROLLE ALS CONTROLLER:
Du analysierst alle CRM-Daten aus der Perspektive eines erfahrenen Headhunting-Experten:
- Identifiziere Trends und Muster in der Recruiting-Pipeline
- Berechne branchenrelevante KPIs (Time-to-Fill, Conversion Rates, Source of Hire)
- Vergleiche die Performance der einzelnen Recruiter/Consultants
- Erkenne Engpässe in der Pipeline (wo verlieren wir Kandidaten?)
- Analysiere Kundenakquise und -bindung

BRANCHENSPEZIFISCHE EMPFEHLUNGEN:
Gib immer konkrete, auf die Headhunting-Branche zugeschnittene Massnahmen:
- Pipeline-Optimierung: Wie können wir mehr Kandidaten durch die Stages bewegen?
- Sourcing-Strategien: Wo sollten wir mehr Kandidaten suchen?
- Kundenmanagement: Wie verbessern wir die Auftragslage?
- Candidate Experience: Wie reduzieren wir Drop-offs?
- Marktpositionierung: Wie können wir uns im Schweizer Markt besser positionieren?

AKTUELLE CRM-DATEN:

📊 ÜBERSICHT:
- Gesamt Kandidaten: ${totalCandidates}
- Gesamt Jobs: ${jobs?.length || 0} (davon ${jobs?.filter((j: any) => j.status === 'Open').length || 0} offen)
- Gesamt Klienten: ${clients?.length || 0}
- Gesamt Placements: ${totalPlacements}
- Conversion Rate (Kandidat → Placed): ${overallConversionRate}%

📈 PIPELINE STATUS:
${Object.entries(pipelineStats).map(([stage, count]) => `- ${stage}: ${count}`).join('\n')}

👥 NUTZER-KPIs:
${Object.entries(userKPIs).map(([id, data]: [string, any]) => 
  `- ${data.name}: ${data.candidates} Kandidaten, ${data.placements} Placements, ${data.tasksCompleted}/${data.tasksCompleted + data.tasksOpen} Tasks erledigt`
).join('\n')}

📅 LETZTE 30 TAGE:
- Neue Kandidaten: ${recentCandidates}
- Neue Jobs: ${recentJobs}
- Neue Placements: ${recentPlacements}

SCHWEIZER HOCHDEUTSCH: Kein "ß" (immer "ss"), aber IMMER korrekte Umlaute (ä, ö, ü, Ä, Ö, Ü) verwenden - niemals ae, oe, ue als Ersatz!

Antworte auf Deutsch (Schweizer Kontext), strukturiert mit Markdown. Gib konkrete Zahlen, Prozentsätze und Vergleiche an. Schliesse immer mit 2-3 konkreten, umsetzbaren Massnahmen ab, die spezifisch für die Headhunting-Branche und den Schweizer Markt relevant sind.`;

    // Build conversation messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(0, -1).map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: query }
    ];

    try {
      const answer = await callGeminiAPI(messages);

      return new Response(
        JSON.stringify({ answer }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('AI API error:', error);
      return new Response(
        JSON.stringify({ error: 'AI-Analyse temporär nicht verfügbar' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in analytics-ai function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
