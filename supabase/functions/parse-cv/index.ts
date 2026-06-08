import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { pdfBase64, fileName } = await req.json();
    
    if (!pdfBase64) {
      throw new Error('No PDF data provided');
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    }

    console.log('📄 Starting CV parsing with Google Gemini:', fileName);

    const prompt = `Du bist ein CV-Parser. Extrahiere strukturierte Informationen aus CV-Texten.

WICHTIG:
- Der Text wurde aus einem PDF extrahiert
- Kann kleine Fehler enthalten
- Rekonstruiere logische Informationen
- Suche nach Mustern: E-Mails (@), Telefon (+, 0), Firmen (GmbH, AG, Ltd)

REGELN:
1. Name ist PFLICHT - meist am Anfang
2. Bei Unsicherheit: leeres Feld
3. Datum: "MM/YYYY" oder "YYYY"
4. Berufserfahrung ≠ Ausbildung
5. Awards/Publikationen: Achte auf Abschnitte wie "Auszeichnungen", "Awards", "Publikationen", "Publications", "Veröffentlichungen", "Papers"

Analysiere diesen CV und extrahiere alle Informationen.

Antworte NUR mit diesem JSON-Format (keine Erklärung):
{
  "person": {
    "full_name": "Vollständiger Name",
    "current_role": "Aktuelle Position",
    "email": "E-Mail",
    "phone": "Telefonnummer",
    "location": "Wohnort",
    "links": ["URLs"]
  },
  "skills": ["Skill1", "Skill2"],
  "languages": [{"name": "Sprache", "level": "Level"}],
  "experiences": [{"company_name": "Firma", "role_title": "Position", "start_date": "MM/YYYY", "end_date": "MM/YYYY", "description": "Beschreibung"}],
  "education": [{"institution": "Institution", "degree": "Abschluss", "start_date": "MM/YYYY", "end_date": "MM/YYYY"}],
  "certifications": [{"name": "Zertifikat", "issuer": "Aussteller", "date": "MM/YYYY"}],
  "awards_publications": [{"title": "Titel", "type": "award oder publication", "year": "YYYY", "publisher": "Herausgeber/Verlag", "description": "Beschreibung"}]
}`;

    // Use Gemini API with PDF
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } }
          ]
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API Fehler: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ No JSON found in response:', content);
      throw new Error('AI konnte keine strukturierten Daten extrahieren.');
    }

    const parsedData = JSON.parse(jsonMatch[0]);
    
    // Validate name
    if (!parsedData.person?.full_name?.trim()) {
      console.error('❌ Missing name in:', JSON.stringify(parsedData.person, null, 2));
      throw new Error('Kein Name gefunden. Bitte stellen Sie sicher, dass der CV einen deutlich sichtbaren Namen enthält.');
    }
    
    console.log(`✅ CV erfolgreich geparst: ${parsedData.person.full_name}`);
    console.log(`   📧 ${parsedData.person.email || 'n/a'}`);
    console.log(`   📱 ${parsedData.person.phone || 'n/a'}`);
    console.log(`   💼 ${parsedData.skills?.length || 0} Skills`);
    console.log(`   🏢 ${parsedData.experiences?.length || 0} Erfahrungen`);
    console.log(`   🎓 ${parsedData.education?.length || 0} Ausbildungen`);
    console.log(`   🏆 ${parsedData.awards_publications?.length || 0} Awards/Publikationen`);

    return new Response(JSON.stringify(parsedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('💥 Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
