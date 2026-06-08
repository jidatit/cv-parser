import { serve } from "https://deno.land/std@0.219.1/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

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
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { rawText, fileName } = await req.json();
    if (!rawText || rawText.length < 50)
      return new Response(JSON.stringify({ error: "No valid text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY)
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    console.log(
      `Parsing ${fileName} (${rawText.length} chars) with Google Gemini...`,
    );

    const systemPrompt = `You extract structured CV data (English/German) and MUST strictly follow these rules:
HARD VALIDATION RULES (YOU MUST SELF-CORRECT BEFORE RETURNING JSON):
EXPERIENCE ORDER:
YOU MUST extract all experiences first, parse their dates, then explicitly sort the experience array in strict reverse-chronological order (newest to oldest based on end dates).
Step-by-step sorting process YOU MUST follow:
a. For each experience, parse start and end dates into YYYY-MM format for comparison. Convert month names to numbers (e.g., Jan=01, Feb=02, ..., Dec=12). For German months: Januar=01, Februar=02, März=03, April=04, Mai=05, Juni=06, Juli=07, August=08, September=09, Oktober=10, November=11, Dezember=12.
b. Treat "Present", "Current", or similar as the current date: 2025-12 (December 2025). For German, treat "heute", "aktuell", "bis jetzt", or similar as present.
c. If dates are damaged/missing, infer from context (e.g., adjacent entries or total years mentioned) and correct them.
d. Sort the array by end date descending (highest YYYY-MM first). If end dates are equal, sort by start date descending. Use a stable sort if needed.
e. Regardless of the order in the input text (even if oldest first), YOU MUST reorder to newest first in the output.
Example 1: Input has Job A (Jan 2010 - Dec 2015), Job B (Mar 2020 - Present), Job C (Feb 2016 - Jan 2020). Parsed ends: A=2015-12, B=2025-12, C=2020-01. Sorted output: [Job B, Job C, Job A].
Example 2: Input has Intern (Jul 2024 - Aug 2024), Developer (Oct 2025 - Present). Parsed ends: Intern=2024-08, Developer=2025-12. Sorted output: [Developer, Intern].
Example 3: Input has Bar Manager St Tropez (May 2020 - March 2021), Bar Manager Gladstone (January 2012 - February 2020). Parsed ends: St Tropez=2021-03, Gladstone=2020-02. Sorted output: [St Tropez, Gladstone].

EDUCATION ORDER:
YOU MUST extract all education entries first, parse dates, then sort the education array in strict reverse-chronological order (newest to oldest based on end dates), using the exact same parsing and sorting steps as experiences.
If out of order in input, YOU MUST reorder. Correct any OCR-damaged dates (e.g., "January 2016 — January 2016" for a cert might be a short course).
Handle timeline formats where dates may be reversed due to reverse-chronological presentation (e.g., '07/2019 - 09/2014' means end=07/2019, start=09/2014 because 2019 > 2014; swap to logical start-end order '09/2014 - 07/2019' for output and parsing). Always ensure parsed start < end; if first date > second, swap them.

EDUCATION DATES:
Extract full start/end dates as strings, preserving original format (e.g., "January 2019 — March 2021").
If OCR damaged (e.g., missing months, reversed order, or partial dates), YOU MUST reconstruct based on context, but keep the output strings as close to original as possible.
If only one date is provided, infer if it's start or end based on context (e.g., for high school/Matura, treat as end date, infer start as 4-5 years earlier; for ongoing degrees, treat as start and end as 'present' or projected). Use adjacent entries to infer (e.g., high school end ≈ university start - 1-3 months; assume standard durations: high school 4-5 years, bachelor 3-4 years, master 1-2 years). If completely missing, infer from sequence (e.g., Matura before bachelor, start = bachelor start - 5 years, end = bachelor start - 1 month). Output inferred dates with note if needed, but prefer original format.

FULL ADDRESS:
1. Search the ENTIRE CV document systematically for address/location information in this order:
   - Contact/header section (top of page)
   - Signature/footer section (bottom of page, near date/signature)
   - Employment history (company locations)
   - Education section (university/school locations)
   
2. When extracting address, ALWAYS check for multi-line addresses:
   - Look for street name/number on line ABOVE postal code
   - Look for city on line BELOW postal code
   - Combine ALL consecutive address-related lines into single string
   - Example: "Nieder-Ramstädter-Str.185A" + "64285 Darmstadt" → "Nieder-Ramstädter-Str.185A, 64285 Darmstadt"

3. Extract complete address verbatim if found (street, postal code, city, country with special characters like ä).

4. If only city/region found (e.g., "Zurich", "Vienna", "Austria"):
   - Infer country from context: Zurich→Switzerland, Vienna→Austria, Darmstadt→Germany
   - Return as "City, Country" format
   
5. If location is embedded in text (e.g., "Zurich, 03.03.2024" or "Location: Vienna"):
   - Extract the city/country and format properly

BIRTHDATE:
1. Search for birthdate/date of birth/Geburtsdatum in CV
2. Look for patterns like "Born: DD.MM.YYYY", "Date of Birth: DD/MM/YYYY", "Geburtsdatum: DD.MM.YYYY", or standalone dates near personal info
3. Convert to YYYY-MM-DD format (e.g., "15.05.1990" → "1990-05-15")
4. If not found, return null
   
6. Priority: Use most specific location found (full address > city+country > country only)

7. If NO location anywhere, return: "Location not specified"

Do NOT fabricate details. ALWAYS combine multi-line addresses into complete single string.

BULLET POINTS:
YOU MUST preserve bullet points exactly as in the CV.
Do NOT merge, summarize, or alter them.
If bullets exist, return description as a single string where EACH bullet starts with "• " and bullets are separated using "\\n". If no bullets, use the paragraph as-is.

FINAL CHECK:
Before generating the JSON, YOU MUST perform this explicit self-verification step-by-step in your thinking (but not in output):
✔ List all parsed end dates for experiences and confirm sorted descending.
✔ List all parsed end dates for education and confirm sorted descending.
✔ Confirm bullet formatting is preserved with "• " and \\n.
✔ Confirm education dates are complete and corrected (no 'Unknown'; inferred if missing).
✔ Confirm address is fully extracted verbatim, including street, postal code, city, and country.
If ANY rule is violated, FIX IT internally and re-check until all pass. Do not output invalid JSON.

Return ONLY valid JSON matching the specified schema. No other text.`;

    const userPrompt = `Extract structured CV data following all rules. Keep bullets intact and enforce reverse-chronological order.
${rawText}`;

    const functionDeclaration = {
      name: "extract_cv_structure",
      description: "Extract structured CV data",
      parameters: {
        type: "object",
        properties: {
          person: {
            type: "object",
            properties: {
              full_name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              location: { type: "string" },
              linkedin: { type: "string" },
              github: { type: "string" },
              birthdate: {
                type: "string",
                description:
                  "Birthdate in YYYY-MM-DD format, e.g. 1990-05-15. Return null if not found.",
              },
            },
            required: ["full_name"],
          },
          summary: { type: "string" },
          skills: { type: "array", items: { type: "string" } },
          languages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
          },
          experience: {
            type: "array",
            items: {
              type: "object",
              properties: {
                company: { type: "string" },
                title: { type: "string" },
                start: { type: "string" },
                end: { type: "string" },
                description: { type: "string" },
              },
              required: ["company", "title"],
            },
          },
          education: {
            type: "array",
            items: {
              type: "object",
              properties: {
                institution: { type: "string" },
                degree: { type: "string" },
                start: { type: "string" },
                end: { type: "string" },
                grade: { type: "string" },
              },
              required: ["institution", "degree"],
            },
          },
          certifications: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                issuer: { type: "string" },
                date: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
        required: [
          "person",
          "skills",
          "languages",
          "experience",
          "education",
          "certifications",
        ],
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: systemPrompt + "\n\n" + userPrompt }],
            },
          ],
          tools: [
            {
              functionDeclarations: [functionDeclaration],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: "ANY",
              allowedFunctionNames: ["extract_cv_structure"],
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Google Gemini HTTP ${response.status}: ${errText}`);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded, please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(
        `AI failed: ${response.status} - ${errText.substring(0, 200)}`,
      );
    }

    const data = await response.json();

    // Extract function call from Gemini response
    const functionCall =
      data.candidates?.[0]?.content?.parts?.[0]?.functionCall;

    if (!functionCall?.args) {
      console.error("Gemini response:", JSON.stringify(data, null, 2));
      throw new Error("No structured data returned from AI");
    }

    const structuredData = functionCall.args;

    console.log(
      `✅ Parsed for ${structuredData.person?.full_name || "Unknown"}`,
    );

    return new Response(
      JSON.stringify({ success: true, data: structuredData }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("Full error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
