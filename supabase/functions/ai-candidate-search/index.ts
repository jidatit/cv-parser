import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callGeminiAPI(prompt: string) {
  const GOOGLE_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("No authorization header");
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
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

    const { query } = await req.json();
    
    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Processing AI search query:", query);

    const prompt = `Du bist ein Experte für die Kandidatensuche in einer Recruiting-Datenbank. 
Analysiere die Suchanfrage des Benutzers und extrahiere relevante Suchkriterien.

Verfügbare Kandidatenfelder:
- name (string)
- position (string) - aktuelle oder gewünschte Position
- skills (array) - Fähigkeiten
- industry (string) - Branche
- location (string) - Standort
- experience (string) - Berufserfahrung
- education (jsonb) - Ausbildung
- desired_salary (string) - Wunschgehalt
- status (string) - Active, Interview, Placed, Inactive, Archived
- recruiting_status (string)

Suchanfrage: ${query}

Antworte NUR mit diesem JSON-Format (keine Erklärung):
{
  "keywords": ["Allgemeine Suchbegriffe"],
  "skills": ["Spezifische Skills"],
  "industry": "Branche oder null",
  "position": "Position oder null",
  "location": "Standort oder null",
  "experience_level": "Junior/Senior/etc oder null"
}`;

    try {
      const content = await callGeminiAPI(prompt);

      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON in AI response:", content);
        return new Response(
          JSON.stringify({ error: "Could not parse search criteria" }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const criteria = JSON.parse(jsonMatch[0]);
      console.log("Extracted criteria:", criteria);

      // Fetch all candidates and filter in-memory for better flexibility
      const { data: allCandidates, error } = await supabase
        .from('candidates')
        .select('*')
        .limit(200);

      if (error) {
        console.error("Database error:", error);
        return new Response(
          JSON.stringify({ error: 'Database query failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Score and filter candidates based on criteria
      const scoredCandidates = (allCandidates || []).map(candidate => {
        let score = 0;
        const matchDetails: string[] = [];

        // Check keywords in multiple fields
        if (criteria.keywords && criteria.keywords.length > 0) {
          criteria.keywords.forEach((keyword: string) => {
            const kw = keyword.toLowerCase();
            
            if (candidate.name?.toLowerCase().includes(kw)) {
              score += 3;
              matchDetails.push(`Name match: ${keyword}`);
            }
            if (candidate.position?.toLowerCase().includes(kw)) {
              score += 3;
              matchDetails.push(`Position match: ${keyword}`);
            }
            if (candidate.summary?.toLowerCase().includes(kw)) {
              score += 2;
              matchDetails.push(`Summary match: ${keyword}`);
            }
            
            // Search in work experience (JSONB)
            if (candidate.work_experience) {
              const workExpStr = JSON.stringify(candidate.work_experience).toLowerCase();
              if (workExpStr.includes(kw)) {
                score += 2;
                matchDetails.push(`Work experience match: ${keyword}`);
              }
            }
          });
        }

        // Check skills
        if (criteria.skills && criteria.skills.length > 0 && candidate.skills) {
          const matchingSkills = criteria.skills.filter((skill: string) => 
            candidate.skills?.some((cs: string) => cs.toLowerCase().includes(skill.toLowerCase()))
          );
          if (matchingSkills.length > 0) {
            score += matchingSkills.length * 2;
            matchDetails.push(`Skills match: ${matchingSkills.join(', ')}`);
          }
        }

        // Check industry
        if (criteria.industry && candidate.industry?.toLowerCase().includes(criteria.industry.toLowerCase())) {
          score += 3;
          matchDetails.push(`Industry match: ${criteria.industry}`);
        }

        // Check position
        if (criteria.position) {
          const posMatch = candidate.position?.toLowerCase().includes(criteria.position.toLowerCase()) ||
                          candidate.desired_position?.toLowerCase().includes(criteria.position.toLowerCase());
          if (posMatch) {
            score += 3;
            matchDetails.push(`Position match: ${criteria.position}`);
          }
        }

        // Check location
        if (criteria.location && candidate.location?.toLowerCase().includes(criteria.location.toLowerCase())) {
          score += 2;
          matchDetails.push(`Location match: ${criteria.location}`);
        }

        // Check experience level
        if (criteria.experience_level && candidate.experience?.toLowerCase().includes(criteria.experience_level.toLowerCase())) {
          score += 2;
          matchDetails.push(`Experience match: ${criteria.experience_level}`);
        }

        return { candidate, score, matchDetails };
      });

      // Filter candidates with score > 0 and sort by score
      const candidates = scoredCandidates
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
        .map(item => ({
          ...item.candidate,
          _matchScore: item.score,
          _matchDetails: item.matchDetails
        }));

      console.log(`Found ${candidates?.length || 0} candidates`);

      return new Response(
        JSON.stringify({ 
          candidates: candidates || [],
          criteria,
          query 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error("API error:", error);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error("Error in ai-candidate-search:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
