import { serve } from "https://deno.land/std@0.219.1/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { pdfBase64, fileName } = await req.json();

    if (!pdfBase64 || pdfBase64.length < 100) {
      return new Response(JSON.stringify({ error: "No valid PDF data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const systemPrompt = `You are a CV data extraction expert. Extract structured CV data from German and English CVs.

CRITICAL EXTRACTION RULES:

1. CONTACT INFO (EMAIL, PHONE, ADDRESS) - CRITICAL - SEARCH EVERYWHERE
   You MUST extract email, phone, and address if they appear ANYWHERE in the CV.
   
   WHERE TO LOOK (check ALL of these):
   - Left sidebar or right sidebar (very common: "KONTAKT", "CONTACT", "Kontakt")
   - Header or footer of any page
   - Under the candidate's name
   - First page, top section
   - Any box or column labeled "KONTAKT", "CONTACT", "Adresse", "Kontaktdaten"
   - All pages of the PDF (contact is often on page 1 in a sidebar)
   
   EMAIL: Any text containing "@" (e.g., "veronique.vogel@bluewin.ch", "dennis.denzler@daesi-bm.com"). Return null ONLY if no @ appears in the entire document.
   PHONE: Any phone number - patterns like "+41 76 527 19 51", "0797237185", "078 228 03 61", "0041 79 123 45 67". Return null ONLY if no phone number exists anywhere.
   ADDRESS/LOCATION: Full address when present (e.g., "Speetelacherstrasse 35, 5422 Birrhard", "Schlossgasse 4e, 8466 Trüllikon"). Often next to email/phone in contact block.
   
   DOB: Convert "19 Feb, 1992" to "1992-02-19", "11.Oktober 1994" to "1994-10-11". Extract from "geb.", "Born", "DOB", "Geburtsdatum".
   Driving License, Relocation, Commute: extract when stated.

2. SALARY
   Keywords: "SALARY", "Gehalt", "Desired Salary", "Gehaltsvorstellung", "Salärvorstellung"
   CRITICAL: ONLY extract if there is an ACTUAL AMOUNT with currency
   Example: "CHF 120,000" or "€95,000" or "USD 130,000"
   Return NULL if no salary amount found (do NOT return just "SALARY" heading)

3. SUMMARY/PROFILE - SEARCH ALL POSSIBLE HEADINGS - CRITICAL
   English: "EXECUTIVE SUMMARY", "PROFILE", "SUMMARY", "PROFESSIONAL SUMMARY", "ABOUT ME", "INTRODUCTION", "OBJECTIVE", "CAREER SUMMARY"
   German: "PROFIL", "ZUSAMMENFASSUNG", "ÜBER MICH", "KURZPROFIL", "BERUFSPROFIL", "KARRIEREPROFIL"
   
   EXTRACTION LOCATIONS:
   - Look at top of CV (first page, header area)
   - Look for paragraphs describing candidate's experience
   - Look for text under "KOMPETENZEN" that describes the person
   - Extract FULL paragraph in original language
   - Example from CV: "Erfahrener Bauleiter Hochbau mit umfassendem Wissen in Bauprojektmanagement. Nachweislicher Erfolg in der Leitung von Bauprojekten, Einhaltung von Zeitplänen und Budgets. Lösungsorientiert, teamfähig und zielstrebig."
   
   If found, extract complete text without modification

4. PERSONAL SECTION - STORE IN growth_potential
   Headings: "PERSÖNLICH", "PERSONAL", "PERSONAL INFORMATION", "ÜBER MICH", "PRIVATE INFORMATIONEN"
   Extract: ALL content (hobbies, interests, family, volunteering, personal attributes)
   Example: "Verheiratet, 2 Kinder | Hobbys: Fußball, Wandern"
   STORE THIS IN: growth_potential variable

5. ACHIEVEMENTS
   Keywords: "MEINE STÄRKEN", "SIGNATURE ACHIEVEMENTS", "KEY ACHIEVEMENTS", "ERFOLGE", "LEISTUNGEN"

6. MOST PROUD OF
   Keywords: "Most Proud Of", "Besonders stolz auf", "Stolz auf"

7. RISKS
   Keywords: "POTENTIAL RISKS", "Potenzielle Risiken", "Herausforderungen"

8. INSIGHTS - CRITICAL
   Keywords: "BECKETT STONE INSIGHT NOTES", "RECRUITER NOTES", "ASSESSMENT NOTES", "Bewertung", "INSIGHTS"
   CRITICAL: Return NULL if no insights section exists
   DO NOT return placeholder text like "No specific insights or recruiter notes available"
   ONLY extract if actual insights content exists in CV

9. VALUES - COMPREHENSIVE EXTRACTION
   SEARCH ALL HEADINGS:
   - English: "VALUES", "PERSONAL VALUES", "CORE VALUES", "PRINCIPLES", "CORE PRINCIPLES", "BELIEFS"
   - German: "WERTE", "MEINE WERTE", "KERNWERTE", "GRUNDWERTE", "PRINZIPIEN", "ÜBERZEUGUNGEN"
   
   EXTRACTION LOCATIONS:
   - Dedicated "VALUES" or "WERTE" section
   - Summary/profile section mentioning values
   - Personal section listing values
   - End of CV in "What drives me" sections
   
   FORMATS TO EXTRACT:
   Format A - Bullet list:
   • Integrity
   • Teamwork
   • Innovation
   → Extract: ["Integrity", "Teamwork", "Innovation"]
   
   Format B - Comma-separated:
   Ehrlichkeit, Zuverlässigkeit, Teamgeist
   → Extract: ["Ehrlichkeit", "Zuverlässigkeit", "Teamgeist"]
   
   Format C - Descriptive paragraph:
   "I value integrity, teamwork, and continuous learning"
   → Extract: ["Integrity", "Teamwork", "Continuous learning"]
   
   Extract 3-8 core values if section exists
   Return empty array if not found

10. LANGUAGES WITH PROFICIENCY - CRITICAL FORMATTING
    Format: German A1 A2 B1 B2 C1 C2 M (one highlighted)
    CRITICAL: Extract ONLY from "Sprachen" or "SPRACHKENNTNISSE" or "Languages" section
    DO NOT extract languages from "EDV" or technical skills sections
    
    PROFICIENCY EXTRACTION:
    - Look for checkboxes, highlights, or underlines to determine level
    - German formats: "Muttersprache", "Fortgeschritten", "Grundkenntnisse", "Fließend", "Konversationssicher"
    - English formats: "Native", "Fluent", "Advanced", "Intermediate", "Basic", "Conversational"
    
    CRITICAL FORMATTING RULE:
    Return proficiency as SINGLE LINE (not multi-line)
    Example: {"name": "Deutsch", "proficiency": "Muttersprache"}
    NOT: {"name": "Deutsch", "proficiency": "Mutter\nsprache"}
11. EDUCATION vs FURTHER EDUCATION - CRITICAL DECISION LOGIC:
   
   STEP 1: Identify ALL section HEADINGS in the PDF (not course names).
   - Look for a heading that says "AUSBILDUNG" or "EDUCATION" (often in a colored box, larger font, or separate block).
   - Look for a SEPARATE heading that says "WEITERBILDUNG" or "FURTHER EDUCATION" (again as its own header, not part of a course title).
   
   STEP 2: Decide where each item goes based on which HEADING it appears under.
   
   Scenario A: ONE heading only (e.g. only "AUSBILDUNG", no "WEITERBILDUNG" header)
   "AUSBILDUNG
    - Item 1
    - Item 2
    - Item 3"
   → education: [Item 1, Item 2, Item 3]
   → further_education: [] (EMPTY)
   
   Scenario B: TWO separate headings (e.g. "AUSBILDUNG" then later "WEITERBILDUNG")
   "AUSBILDUNG
    - Item 1
    - Item 2
    
    WEITERBILDUNG
    - Item 3
    - Item 4"
   → education: [Item 1, Item 2]  (ONLY items under AUSBILDUNG)
   → further_education: [Item 3, Item 4]  (ONLY items under WEITERBILDUNG)
   
   CRITICAL: Items under "WEITERBILDUNG" must go in further_education ONLY. Do NOT put them in education.
   CRITICAL: "WEITERBILDUNG" as part of a course name (e.g. "WEITERBILDUNG GEBÄUDETECHNIK") is NOT a section heading; that course goes under whichever section it is listed in.
   
   BEFORE RETURNING: If you saw two distinct section headers (AUSBILDUNG and WEITERBILDUNG), confirm items under WEITERBILDUNG are in further_education, not in education.
12. SKILLS/EXPERTISE - SEARCH ALL HEADINGS AND FORMATS
    Keywords: "EXPERTISE", "FACHKENNTNISSE", "SKILLS", "KOMPETENZEN", "TECHNICAL SKILLS", "FÄHIGKEITEN", "KENNTNISSE", "WEITERE KENNTNISSE", "EDV", "IT-KENNTNISSE", "SOFTWARE", "TOOLS", "TECHNOLOGIEN", "COMPUTER SKILLS"
    
    CRITICAL: Extract from MULTIPLE possible formats:
    
    Format A - Bullet list:
    • Excel
    • SAP R/3
    • Python
    
    Format B - Comma-separated:
    Tririga, Abacus, Cognos, Proffix, Bexio, Sage, Doublecount, BI
    
    Format C - Skill categories with items:
    Baubuchhaltung
    Baugewerbe
    Kostenkontrolle
    → Extract each as separate skill
    
    Format D - With descriptions/levels (extract software name AND specifics):
    MS Office: sehr gute Kenntnisse insbesondere Excel
    → Extract: "MS Office", "Excel"
    
    SAP R/3: sehr gute Kenntnisse FI/CO/MM
    → Extract: "SAP R/3", "SAP FI", "SAP CO", "SAP MM"
    
    Format E - Under "EDV" or "Weitere Kenntnisse" heading:
    EDV: MS Office, SAP, Excel
    → Extract each item separately
    
    Format F - Software/Program lists:
    Adobe: InDesign, Photoshop
    Caad: ArchiCAD (2D & 3D), AutoCAD (2D)
    Office: Excel, Word
    → Extract: "Adobe InDesign", "Adobe Photoshop", "ArchiCAD", "AutoCAD", "Excel", "Word"
    
    EXTRACTION RULES:
    - Search for "EDV", "IT-Kenntnisse", "Software", "WEITERE KENNTNISSE", "Programme" subsections
    - Look under "Weitere Kenntnisse" section for "EDV" subsection
    - Extract software names from descriptions
    - Split comma-separated lists: "A, B, C" → ["A", "B", "C"]
    - Extract modules: "SAP FI/CO/MM" → ["SAP R/3", "SAP FI", "SAP CO", "SAP MM"]
    - Include specific tools mentioned: "insbesondere Excel" → also add "Excel"
    - DO NOT include: "Kenntnisse", "Erfahrung", "sehr gute", "gute", "Grundkenntnisse"
    - DO NOT include: "Sprachen", "Languages" or language proficiency (A1-C2, M)
    - DO NOT include: dates, years, or German prepositions
    
    Examples:
    Input: "MS Office: sehr gute Kenntnisse insbesondere Excel"
    Output: ["MS Office", "Excel"]
    
    Input: "SAP R/3: sehr gute Kenntnisse FI/CO/MM"
    Output: ["SAP R/3", "SAP FI", "SAP CO", "SAP MM"]
    
    Input: "Tririga, Abacus, Cognos, Proffix, Bexio, Sage, Doublecount, BI"
    Output: ["Tririga", "Abacus", "Cognos", "Proffix", "Bexio", "Sage", "Doublecount", "BI"]
    
    Input: "Adobe: InDesign, Photoshop"
    Output: ["Adobe InDesign", "Adobe Photoshop"]
    
    Extract ALL: software, tools, technologies, domain knowledge, programming languages

13. CERTIFICATES - SEARCH ALL POSSIBLE HEADINGS
    English: "CERTIFICATES", "CERTIFICATIONS", "ZERTIFIKATE", "LICENSES", "CREDENTIALS"
    German: "Zertifikate & Weiterbildungen", "Zertifizierungen", "Bescheinigungen", "Lizenzen"
    Combined: "Certificates & Continuing Education", "Zertifikate und Qualifikationen"
    Extract ALL certificates/certifications found

14. AWARDS & PUBLICATIONS - SEARCH ALL HEADINGS - CRITICAL FIX
    English: "AWARDS", "PUBLICATIONS", "HONORS", "RECOGNITIONS", "ACHIEVEMENTS", "ENGAGEMENT"
    German: "AUSZEICHNUNGEN", "PUBLIKATIONEN", "EHRUNGEN", "ANERKENNUNGEN"
    Combined: "Awards, Publications & Engagement", "Awards / Publications", "Auszeichnungen / Publikationen"
    
    CRITICAL EXTRACTION LOCATIONS:
    - Look for dedicated "ENGAGEMENT" section
    - Look for "Auszeichnungen" section
    - Look for "Lehrveranstaltungen" (teaching activities)
    - Look for "Vorträge" (presentations/talks)
    - Look for "Ausstellungen" (exhibitions)
    - Look for "Preisträger" (prize winner)
    - Look for "Förderung" (funding/grants)
    - Look for "Stipendium" (scholarship)
    
    EXAMPLES:
    - "Projektförderung, Stadt Wien, 2021"
    - "Preisträger Pfann-Ohmann-Preis, TU Wien, 2019"
    - "Förderstipendium, TU Wien, 2020"
    - "Leistungsstipendium, TU Wien, 2016"
    - Teaching assignments with dates
    - Presentations with dates and locations
    - Exhibitions with dates and locations
    
    Extract ALL awards, publications, honors, engagement activities, scholarships, grants

15. EDUCATION - ITEMS UNDER "AUSBILDUNG" / "EDUCATION" ONLY
    Headings: "AUSBILDUNG", "EDUCATION", "BILDUNG", "AUS- UND WEITERBILDUNG" (when it is ONE combined section)
    
    CRITICAL: Put in education array ONLY items that appear under the "AUSBILDUNG" or "EDUCATION" section.
    If the CV has a SEPARATE section "WEITERBILDUNG" or "FURTHER EDUCATION", do NOT put those items here—put them in further_education.
    When there is only one section (e.g. just "AUSBILDUNG"), put all its items in education.
    
    BULLET POINT EXTRACTION:
    Apply the SAME bullet point extraction rules as experience:
    - Detect ANY bullet character (•, ●, ○, ▪, ▸, —, -, *, etc.)
    - Normalize to standard format
    - Clean all text
    
    EXAMPLES:
    Input under "AUSBILDUNG":
    "AUSBILDUNG ZUM KÄLTEMONTEUR EFZ (2007-2011)
     PAT SEMINAR GERÄTEPRÜFUNG (März 2023)
     PRÜFUNG ANSCHLUSSBEWILLIGUNG (Dezember 2022)
     DANFOS TURBOCOR SCHULUNG (Dezember 2022)
     WEITERBILDUNG GEBÄUDETECHNIK (2018-2019)
     KURS ENERGY EFFICIENCY (Juni 2019)"
    
    Output: ALL 6 items go into education array
    
    When there is a SEPARATE "WEITERBILDUNG" section, those items go in further_education only (see rule 11 and 16).

16. FURTHER EDUCATION - ONLY IF SEPARATE SECTION EXISTS - CRITICAL
    
    CRITICAL: This array should be EMPTY in most cases
    
    ONLY extract here if CV has BOTH:
    1. A section titled "AUSBILDUNG" or "EDUCATION" 
    2. A SEPARATE section titled "WEITERBILDUNG" or "FURTHER EDUCATION"
    
    DETECTION RULES:
    
    ❌ DO NOT extract to further_education if:
    - All items listed under ONE heading "AUSBILDUNG"
    - Heading says "AUS- UND WEITERBILDUNG" (combined)
    - No second heading present
    - Items mention "weiterbildung" in their NAME but are listed under "AUSBILDUNG"
    
    ✓ ONLY extract to further_education if:
    - CV clearly has TWO separate sections
    - Example structure:
      "AUSBILDUNG
       - Degree A
       - Degree B
       
       WEITERBILDUNG  ← SEPARATE HEADING
       - Course A
       - Course B"
    
    EXAMPLES:
    
    Example A - ONE section (COMMON):
    "AUSBILDUNG
     - Kältemonteur EFZ
     - PAT Seminar
     - Turbocor Schulung
     - Weiterbildung Gebäudetechnik"
    
    Result:
    education: [ALL 4 items]  ← Everything goes here
    further_education: []      ← EMPTY
    
    Example B - TWO sections (RARE):
    "AUSBILDUNG
     - Kältemonteur EFZ
     
     WEITERBILDUNG  ← This is a SECOND HEADING
     - PAT Seminar
     - Turbocor Schulung"
    
    Result:
    education: [Kältemonteur EFZ]
    further_education: [PAT Seminar, Turbocor Schulung]
    
    DEFAULT: If unsure, put EVERYTHING in education and return EMPTY further_education array

CRITICAL FORMATTING RULES:

1. SPACING PRESERVATION:
   - Preserve ALL spacing between job titles, companies, dates
   - Keep proper spacing in addresses, phone numbers, emails
   - Maintain line breaks between sections
   - Do NOT concatenate words that should be separate

2. BULLET POINTS - HIERARCHY PRESERVATION - CRITICAL FIX:
   
   CRITICAL - EXPERIENCE DESCRIPTIONS: If the CV shows experience/role descriptions as a list with ANY type of bullet (including a simple hyphen "-" at the start of a line), you MUST extract them as bullet points: each point on its own line, prefixed with "• ", joined by \\n. Do NOT output experience descriptions as one continuous paragraph when the source has bullets.
   
   CRITICAL BULLET POINT CHARACTER ENCODING:
   - PDF may contain special Unicode bullet characters
   - Convert ALL bullet-like characters to standard ASCII bullets
   - Use "• " (U+2022 + space) for main bullets
   - Use "  ○ " (2 spaces + U+25CB + space) for sub-bullets
   
   MAIN BULLETS - Convert these characters to "• " (hyphen "-" at line start is VERY common in CVs):
   - • (U+2022 - bullet)
   - ● (U+25CF - black circle)
   - ∙ (U+2219 - bullet operator)
   - · (U+00B7 - middle dot)
   - ⋅ (U+22C5 - dot operator)
   - ▪ (U+25AA - black small square)
   - ▫ (U+25AB - white small square)
   - - (dash/hyphen when used as bullet)
   - * (asterisk when used as bullet)
   
   SUB-BULLETS - Convert these to "  ○ ":
   - ○ (U+25CB - white circle)
   - ◦ (U+25E6 - white bullet)
   - ▹ (U+25B9 - white right-pointing triangle)
   - › (U+203A - single right-pointing angle quotation mark)
   
   EXTRACTION PROCESS:
   
   IF CV HAS BULLET POINTS:
   
   A) Identify main bullets:
      - Look for lines starting with bullet characters
      - Convert to "• " prefix
      - Example: "• Betriebliches RW und Controlling"
   
   B) Identify sub-bullets:
      - Look for indented lines or lines with smaller bullets
      - Convert to "  ○ " prefix (exactly 2 spaces + ○ + space)
      - Example: "  ○ Mitarbeit im Controlling der Shared Service Bereiche"
   
   C) Join all lines with \\n (newline character)
   
   D) Complete example with hierarchy:
      "• Erfolgreiche Leitung von Bauprojekten in den Bereichen Wohn- und Gewerbebau\\n• Erfahrung in Budgetplanung, Kostenkontrolle und Ausschreibungsverfahren\\n• Aktives Mitglied in Stabstellen zur Verbesserung der Firmenprozesse und Mitarbeiterzufriedenheit"
   
   IF CV HAS NO BULLET POINTS (plain paragraphs):
   - Extract paragraphs as-is
   - Do NOT add artificial bullets
   - Example: "Managed projects and coordinated teams across departments"
   
   CRITICAL: Clean all extracted text:
   - Remove any strange Unicode characters
   - Remove control characters
   - Keep only readable text
   - Preserve intentional formatting (bullets, newlines)

3. LOCATION IN EXPERIENCE:
   - Company name should include location if present in CV
   - Example: "Allreal-Gruppe. Zürich" → extract as "Allreal-Gruppe, Zürich"
   - Example: "smzh ag, Zürich (CH)" → extract as "smzh ag, Zürich"
   - Title field: ONLY job title (e.g., "EIDG. DIPL. BAULEITER", "Projektarchitekt")

4. DATE EXTRACTION - CRITICAL FIX:
   CRITICAL: Extract dates EXACTLY as shown in CV
   
   German formats:
   - "März 2023 - aktuell" → start: "März 2023", end: "aktuell"
   - "Nov 2017" → "Nov 2017"
   - "04.2024 – AKTUELL" → start: "04.2024", end: "AKTUELL"
   - "SS 2021" → "SS 2021" (Sommersemester)
   - "WS 2019/20" → "WS 2019/20" (Wintersemester)
   
   English formats:
   - "March 2023 - present" → start: "March 2023", end: "present"
   - "Nov 2017" → "Nov 2017"
   
   DO NOT convert to other formats
   DO NOT return "undefined"
   Extract EXACTLY as written in CV

5. REVERSE CHRONOLOGICAL ORDER:
   - ALWAYS sort experience: newest → oldest
   - ALWAYS sort education: newest → oldest
   - ALWAYS sort further_education: newest → oldest
   - Use end dates for primary sorting
   - If end dates equal, use start dates

FINAL CHECKLIST:
✓ Email, Phone, Address: search sidebar, KONTAKT/CONTACT, header, all pages—extract if present anywhere
✓ DOB (YYYY-MM-DD), License, Relocation, Commute
✓ Salary (ONLY if amount exists, otherwise NULL)
✓ Summary (search ALL heading variations + top of CV + KOMPETENZEN section)
✓ Personal → STORE IN growth_potential
✓ Achievements, Proud Of, Risks, Values
✓ Insights (NULL if not found, no placeholders)
✓ Languages (SINGLE LINE proficiency, ONLY from Sprachen/Languages section)
✓ Skills (ALL heading variations including KOMPETENZEN, EDV, Programme, all formats)
✓ Education: ONLY items under AUSBILDUNG/EDUCATION; if separate WEITERBILDUNG section exists, those items go in further_education only
✓ Further Education: items under WEITERBILDUNG/FURTHER EDUCATION when that is a separate section (REVERSE CHRONOLOGICAL)
✓ Certificates (ALL heading variations)
✓ Awards & Publications (ALL heading variations + ENGAGEMENT + teaching + presentations + exhibitions + scholarships)
✓ Experience (with CLEAN bullets, dates as shown, REVERSE CHRONOLOGICAL)
✓ Values (ALL heading variations, check summary/personal sections too)
Return ONLY valid JSON.`;

    const userPrompt = `Extract ALL CV data from this PDF.

CRITICAL EXTRACTION REQUIREMENTS:

1. SPACING: Preserve all spacing between words
   ✓ "Projektleiter und Fachingenieur" (NOT "ProjektleiterundFachingenieur")
   ✓ "SBB AG Energie, Zollikofen" (NOT "SBBAGEnergie,Zollikofen")

2. BULLET POINTS - UNIVERSAL EXTRACTION - CRITICAL FIX:
   
   CRITICAL: For experience/role descriptions—if the CV has ANY type of bullet (including simple hyphen "-" at line start), you MUST output as bullet points (each line "• " + text, joined by \\n). Do NOT output experience as one paragraph when the CV shows a bulleted list.
   
   CRITICAL: PDFs contain MANY different bullet characters and symbols
   
   STEP 1 - DETECT ANY LINE-START SYMBOL:
   Identify lines starting with ANY of these characters (and more):
   
   MAIN BULLETS (convert ALL to "• "):
   - • (U+2022 - bullet)
   - ● (U+25CF - black circle)
   - ○ (U+25CB - white circle)
   - ◦ (U+25E6 - white bullet)
   - ∙ (U+2219 - bullet operator)
   - · (U+00B7 - middle dot)
   - ⋅ (U+22C5 - dot operator)
   - ▪ (U+25AA - black small square)
   - ▫ (U+25AB - white small square)
   - ■ (U+25A0 - black square)
   - □ (U+25A1 - white square)
   - ▸ (U+25B8 - black right-pointing triangle)
   - ▹ (U+25B9 - white right-pointing triangle)
   - ► (U+25BA - black right-pointing pointer)
   - ▻ (U+25BB - white right-pointing pointer)
   - ◆ (U+25C6 - black diamond)
   - ◇ (U+25C7 - white diamond)
   - ★ (U+2605 - black star)
   - ☆ (U+2606 - white star)
   - ✓ (U+2713 - check mark)
   - ✔ (U+2714 - heavy check mark)
   - ➢ (U+27A2 - three-d top-lighted rightwards arrowhead)
   - ➣ (U+27A3 - three-d bottom-lighted rightwards arrowhead)
   - ➤ (U+27A4 - black rightwards arrowhead)
   - → (U+2192 - rightwards arrow)
   - ⇒ (U+21D2 - rightwards double arrow)
   - — (U+2014 - em dash when used as bullet)
   - – (U+2013 - en dash when used as bullet)
   - - (U+002D - hyphen-minus when used as bullet)
   - * (U+002A - asterisk when used as bullet)
   - + (U+002B - plus sign when used as bullet)
   - > (U+003E - greater-than when used as bullet)
   
   SUB-BULLETS (convert ALL to "  ○ "):
   - Lines that are indented + have any symbol above
   - Lines starting with 2+ spaces + symbol
   - Lines with smaller/hollow versions of main bullets
   
   STEP 2 - NORMALIZE TO STANDARD FORMAT:
   A) For MAIN bullets:
      - Remove the original bullet character
      - Add standard "• " at the start
      - Preserve all text after the bullet
      - Example: "▪ Project management" → "• Project management"
   
   B) For SUB-bullets:
      - Remove original bullet/symbol
      - Add exactly "  ○ " (2 spaces + ○ + space)
      - Preserve all text after
      - Example: "  ▸ Cost control" → "  ○ Cost control"
   
   C) For NUMBERED lists (1., 2., a), b), i., ii.):
      - Keep the number/letter as-is
      - Example: "1. First item" → "1. First item"
      - Example: "a) Sub item" → "a) Sub item"
   
   STEP 3 - CLEAN ALL TEXT:
   - Remove control characters (keep only newlines)
   - Remove any remaining unusual Unicode
   - Preserve intentional spacing between words
   - Keep proper word boundaries
   
   STEP 4 - JOIN WITH NEWLINES:
   - Each bullet/line separated by \n
   - No blank lines between bullets (unless in original)
   
   EXAMPLE TRANSFORMATIONS:
   
   Input (various bullets):
   "▪ Sicherstellen der speditiven Bearbeitung
   ▸ Erstellen von Offerten
   — Bearbeitung von Service-projekten
   ○ Anspruchsvolle Servicearbeiten"
   
   Output (normalized):
   "• Sicherstellen der speditiven Bearbeitung\n• Erstellen von Offerten\n• Bearbeitung von Service-projekten\n• Anspruchsvolle Servicearbeiten"
   
   Input (with hierarchy):
   "• Main point one
     ○ Sub point
     ○ Another sub
   • Main point two"
   
   Output:
   "• Main point one\n  ○ Sub point\n  ○ Another sub\n• Main point two"
   
   CRITICAL RULES:
   - If CV has ANY list with symbols → convert to standard bullets
   - If CV has plain paragraphs (no symbols) → keep as plain text
   - NEVER add bullets where none existed
   - ALWAYS preserve the hierarchical structure
   - ALWAYS clean strange characters while preserving content

3. DATES - EXTRACT EXACTLY AS SHOWN:
   - "März 2023 - aktuell" → start: "März 2023", end: "aktuell"
   - "04.2024 – AKTUELL" → start: "04.2024", end: "AKTUELL"
   - "Nov 2017" → "Nov 2017"
   - "SS 2021" → "SS 2021"
   - DO NOT return "undefined"
   - DO NOT convert formats

4. CHRONOLOGICAL ORDER - CRITICAL:
   - Experience: NEWEST first (aktuell/present before 2022 before 2017)
   - Education: NEWEST first (2024 before 2021 before 2013)
   - Further Education: NEWEST first

5. SUMMARY EXTRACTION - CRITICAL:
   - Look at top of CV first page
   - Look under "KOMPETENZEN" heading
   - Look for descriptive paragraphs about candidate
   - Example: "Erfahrener Bauleiter Hochbau mit umfassendem Wissen in Bauprojektmanagement..."
   - Extract complete text if found

6. SKILLS EXTRACTION - ALL FORMATS:
   Format A - Category list:
   Baubuchhaltung
   Baugewerbe
   Kostenkontrolle
   → Extract: ["Baubuchhaltung", "Baugewerbe", "Kostenkontrolle"]
   
   Format B - Program list with categories:
   Adobe: InDesign, Photoshop
   Office: Excel, Word
   → Extract: ["Adobe InDesign", "Adobe Photoshop", "Excel", "Word"]
   
   Format C - Comma separated:
   Tririga, Abacus, Cognos
   → Extract: ["Tririga", "Abacus", "Cognos"]

7. LANGUAGES - SINGLE LINE PROFICIENCY:
   Input: "Deutsch | Muttersprache"
   Output: {"name": "Deutsch", "proficiency": "Muttersprache"}
   
   Input: "Englisch | Fortgeschritten"
   Output: {"name": "Englisch", "proficiency": "Fortgeschritten"}
   
   NOT multi-line like "Mutter\\nsprache"

8. AWARDS & PUBLICATIONS - COMPREHENSIVE SEARCH:
   - Search "ENGAGEMENT" section
   - Search "Auszeichnungen" section
   - Search for teaching activities (Lehrveranstaltungen)
   - Search for presentations (Vorträge)
   - Search for exhibitions (Ausstellungen)
   - Search for prizes (Preisträger)
   - Search for scholarships (Stipendium, Förderung)
   
   Example entries:
   - "Projektförderung, Stadt Wien, 2021"
   - "Preisträger Pfann-Ohmann-Preis, TU Wien, 2019"
   - Teaching assignment with dates
   - Presentation with location and date

9. INSIGHTS - NO PLACEHOLDERS:
   - ONLY extract if actual insights exist
   - Return NULL if no insights section
   - DO NOT return placeholder text

10. SALARY - AMOUNT REQUIRED:
    - ONLY extract if amount with currency exists
    - Example: "CHF 120,000"
    - Return NULL if no amount found
    - DO NOT return just "SALARY" heading
11. SECTION HEADER DETECTION - EDUCATION vs WEITERBILDUNG:
   
   FIRST: Scan the PDF for section headers (not course names). Look for "AUSBILDUNG" and "WEITERBILDUNG" as separate headings (e.g. in colored boxes, larger font, with spacing between blocks).
   
   If you see TWO headers (e.g. [AUSBILDUNG] then list A, B — then [WEITERBILDUNG] then list C, D):
   → education = [A, B] only
   → further_education = [C, D] only
   Do NOT put C, D in education.
   
   If you see ONE header only (e.g. just [AUSBILDUNG] with all items):
   → education = [all items]
   → further_education = []
   
   Before returning: If the CV had both AUSBILDUNG and WEITERBILDUNG as separate sections, verify items under WEITERBILDUNG are in further_education.`;
    const functionDeclaration = {
      name: "extract_cv_structure",
      description: "Extract structured CV data from German or English CVs",
      parameters: {
        type: "object",
        properties: {
          person: {
            type: "object",
            properties: {
              full_name: {
                type: "string",
                description: "Full name with proper spacing",
              },
              email: {
                type: "string",
                description:
                  "CRITICAL: Extract email from ANYWHERE in the CV. Search: sidebar, KONTAKT/CONTACT section, header, under name, all pages. Any string containing @ is an email (e.g. 'veronique.vogel@bluewin.ch', 'dennis.denzler@daesi-bm.com'). Return null ONLY if no @ appears in the entire document.",
              },
              phone: {
                type: "string",
                description:
                  "CRITICAL: Extract phone from ANYWHERE in the CV. Search: sidebar, KONTAKT/CONTACT section, header, under name, all pages. Look for +41, 0xx, spaces between digit groups (e.g. '+41 76 527 19 51', '0797237185'). Return null ONLY if no phone number exists in the document.",
              },
              location: {
                type: "string",
                description:
                  "CRITICAL: Extract full address when present. Often in same block as email/phone (KONTAKT, CONTACT, Adresse). Examples: 'Speetelacherstrasse 35, 5422 Birrhard', 'Schlossgasse 4e, 8466 Trüllikon'. Return null only if no address appears.",
              },
              linkedin: {
                type: "string",
                description:
                  "LinkedIn URL if present. Example: 'https://www.linkedin.com/Dennis-Denzler'",
              },
              github: { type: "string" },
              birthdate: {
                type: "string",
                description:
                  "Birthdate in YYYY-MM-DD format. Convert '19 Feb, 1992' to '1992-02-19'. Convert '11.Oktober 1994' to '1994-10-11'",
              },
              driving_license: {
                type: "string",
                description:
                  "Driving license. Example: 'Yes (B)', 'Class B', 'No', 'Schweiz'. Return NULL if not found.",
              },
            },
            required: ["full_name"],
          },
          summary: {
            type: "string",
            description:
              "Professional summary from ANY of these headings: EXECUTIVE SUMMARY, PROFILE, SUMMARY, PROFESSIONAL SUMMARY, ABOUT ME, PROFIL, ZUSAMMENFASSUNG, ÜBER MICH, KURZPROFIL. ALSO look at top of CV and under KOMPETENZEN section for descriptive paragraphs. Extract full paragraph in original language with proper spacing. Example: 'Erfahrener Bauleiter Hochbau mit umfassendem Wissen in Bauprojektmanagement. Nachweislicher Erfolg in der Leitung von Bauprojekten, Einhaltung von Zeitplänen und Budgets. Lösungsorientiert, teamfähig und zielstrebig. Die optimale Ergänzung für Ihr Hochleistungsteam'. Return NULL if not found.",
          },
          ai_summary: {
            type: "string",
            description:
              "Generiere eine professionelle Zusammenfassung in Schweizer Hochdeutsch (ss statt ß) als FLIESSENDEN ABSATZ von 2-3 Sätzen (max 40 Wörter). KEINE Aufzählungszeichen, Sterne (*), Bindestriche (-) oder Bullet Points. Der Text soll Berufserfahrung, Kernkompetenz und eine Stärke des Kandidaten in der dritten Person beschreiben. Beispiel: 'Stefan Müller überzeugt als erfahrener Projektleiter im Bauwesen mit umfassender Expertise in Verkehrsplanung und fundiertem Methodenwissen in der Raumplanung.'",
          },
          desired_position: {
            type: "string",
            description:
              "ONLY extract if CV explicitly states desired position. Search for: 'Gewünschte Position', 'Zielposition', 'Desired Position', 'Target Role', 'Position gesucht', or if subtitle/header shows target role (e.g., 'Projektleiterin / Bauleiterin im Tiefbau'). Extract exact text with proper spacing. Return null if not found.",
          },
          desired_industry: {
            type: "string",
            description:
              "ONLY extract if explicitly stated. Search for: 'Branche', 'Industrie', 'Industry', 'Sector', 'Bereich', 'Gewünschte Branche'. Return null if not found.",
          },
          years_of_experience: {
            type: "string",
            description:
              "ONLY extract if explicitly stated in CV (e.g., '10+ years experience', '15 Jahre Erfahrung'). Do NOT calculate. Return null if not explicitly stated.",
          },
          current_salary: {
            type: "string",
            description:
              "ONLY extract if explicitly stated. Search for: 'Aktuelles Gehalt', 'Current Salary', 'Derzeitiges Gehalt'. MUST include currency (CHF, EUR, USD) and amount. Return null if not found.",
          },
          desired_salary: {
            type: "string",
            description:
              "CRITICAL: Extract DESIRED/EXPECTED salary ONLY if explicitly stated with AMOUNT and CURRENCY.\n\n" +
              "SEARCH KEYWORDS:\n" +
              "- German: 'Gewünschtes Gehalt', 'Gehaltsvorstellung', 'Salärvorstellung', 'Wunschgehalt', 'Erwartetes Gehalt'\n" +
              "- English: 'Desired Salary', 'Expected Salary', 'Salary Expectations', 'Target Salary'\n\n" +
              "EXTRACTION RULES:\n" +
              "- MUST include currency (CHF, EUR, USD, £, $) AND amount\n" +
              "- Valid examples: 'CHF 120,000', 'EUR 95,000 - 105,000', 'From USD 130,000'\n" +
              "- INVALID: Just heading 'SALARY' without amount → return NULL\n" +
              "- INVALID: 'Negotiable' without amount → return NULL\n" +
              "- INVALID: Current salary → skip, only extract DESIRED/EXPECTED\n\n" +
              "Return NULL if no desired salary amount found.",
          },
          workload: {
            type: "string",
            description:
              "ONLY extract if explicitly stated. Search for: 'Arbeitspensum', 'Workload', 'Pensum', 'Vollzeit', 'Teilzeit', 'Full-time', 'Part-time', '80%', '100%'. Return null if not found.",
          },
          willing_to_relocate: {
            type: "string",
            description:
              "CRITICAL: ONLY extract if CV explicitly mentions willingness/readiness to relocate.\n\n" +
              "SEARCH KEYWORDS:\n" +
              "- German: 'Umzugsbereitschaft', 'Bereit umzuziehen', 'Mobil', 'Flexibel für Umzug'\n" +
              "- English: 'Willing to relocate', 'Open to relocation', 'Relocation: Yes', 'Willing to move'\n\n" +
              "EXTRACTION RULES:\n" +
              "✓ Extract if found: 'Ja' / 'Yes' / 'Oui'\n" +
              "✓ Extract if found: 'Nein' / 'No' / 'Non'\n" +
              "✓ Extract if conditional: 'Within Switzerland' / 'Innerhalb der Schweiz' / 'Yes to Zürich area'\n" +
              "✓ Extract if qualified: 'Nach Absprache' / 'Negotiable' / 'Depends on opportunity'\n\n" +
              "✗ DO NOT extract location alone: If CV only shows 'Schweiz' or 'Zürich' under location → return NULL\n" +
              "✗ DO NOT extract address: If only address is shown → return NULL\n" +
              "✗ DO NOT assume: If section missing → return NULL\n\n" +
              "EXAMPLES:\n" +
              "- CV shows 'Umzugsbereitschaft: Ja' → Extract: 'Ja'\n" +
              "- CV shows 'Willing to relocate within Switzerland' → Extract: 'Within Switzerland'\n" +
              "- CV shows 'Standort: Zürich' (no relocation mention) → Extract: NULL\n" +
              "- CV shows 'Wohnort: Schweiz' (no relocation mention) → Extract: NULL\n\n" +
              "Return NULL if willingness to relocate is not explicitly stated.",
          },
          max_commute: {
            type: "string",
            description:
              "ONLY extract if explicitly stated. Search for: 'Maximaler Pendelweg', 'Pendelweg', 'Maximum Commute', 'Commute distance', 'Commute (PT / Car)'. Return with unit (km, minutes, hours). Return null if not stated.",
          },
          notice_period: {
            type: "string",
            description:
              "ONLY extract if explicitly stated. Search for: 'Kündigungsfrist', 'Notice Period', 'Verfügbarkeit', 'Availability', 'Verfügbar ab', 'Available from'. Return null if not found.",
          },
          reason_for_change: {
            type: "string",
            description:
              "ONLY extract if explicitly stated. Search for: 'Wechselgrund', 'Auf der Suche nach', 'Reason for Leaving', 'Looking for', 'Seeking', 'Motivation'. Return null if not found.",
          },
          signature_achievements: {
            type: "array",
            items: { type: "string" },
            description:
              "Extract from sections with these headings: MEINE STÄRKEN, SIGNATURE ACHIEVEMENTS, KEY ACHIEVEMENTS, ERFOLGE, LEISTUNGEN. Preserve proper spacing in each achievement. Return empty array if section not found.",
          },
          most_proud_of: {
            type: "string",
            description:
              "Extract from sections: Most Proud Of, Besonders stolz auf, Stolz auf. Return null if not found.",
          },
          candidate_values: {
            type: "array",
            items: { type: "string" },
            description:
              "Extract from sections: Values, Werte, Prinzipien. Return empty array if not found.",
          },
          growth_potential: {
            type: "array",
            items: { type: "string" },
            description:
              "CRITICAL: Extract ALL content from 'PERSÖNLICH' or 'PERSONAL' section. Include: hobbies, interests, family status, volunteering, personal attributes. If section found, convert content to array of strings. Example: ['Verheiratet, 2 Kinder', 'Hobbys: Fußball, Wandern', 'Ehrenamtlich: Jugendtrainer']. Return empty array if not found.",
          },
          potential_risks: {
            type: "array",
            items: { type: "string" },
            description:
              "Extract from: POTENTIAL RISKS, Potenzielle Risiken, Herausforderungen",
          },
          insights_notes: {
            type: "string",
            description:
              "CRITICAL: Extract from: BECKETT STONE INSIGHT NOTES, RECRUITER NOTES, ASSESSMENT NOTES, Bewertung, INSIGHTS. Return NULL if no insights section exists in CV. DO NOT return placeholder text like 'No specific insights or recruiter notes available'. ONLY extract if actual insights content exists.",
          },
          skills: {
            type: "array",
            items: { type: "string" },
            description:
              "Extract from sections: EXPERTISE, FACHKENNTNISSE, SKILLS, KOMPETENZEN, TECHNICAL SKILLS, FÄHIGKEITEN, KENNTNISSE, WEITERE KENNTNISSE, EDV, IT-KENNTNISSE, SOFTWARE, COMPUTER SKILLS, Programme.\n\nCRITICAL EXTRACTION RULES:\n1. Look for 'KOMPETENZEN', 'Weitere Kenntnisse', 'Programme' sections\n2. Extract from multiple formats:\n   Format A - Category list:\n   'Baubuchhaltung\\nBaugewerbe\\nKostenkontrolle' → ['Baubuchhaltung', 'Baugewerbe', 'Kostenkontrolle']\n   \n   Format B - Program categories:\n   'Adobe: InDesign, Photoshop' → ['Adobe InDesign', 'Adobe Photoshop']\n   'Office: Excel, Word' → ['Excel', 'Word']\n   \n   Format C - Comma separated:\n   'Tririga, Abacus, Cognos' → ['Tririga', 'Abacus', 'Cognos']\n   \n   Format D - With descriptions:\n   'MS Office: sehr gute Kenntnisse insbesondere Excel' → ['MS Office', 'Excel']\n   'SAP R/3: sehr gute Kenntnisse FI/CO/MM' → ['SAP R/3', 'SAP FI', 'SAP CO', 'SAP MM']\n\n3. Split comma-separated values\n4. Extract software names AND specific modules\n5. Remove: 'Kenntnisse', 'Erfahrung', 'sehr gute', 'gute', 'insbesondere'\n6. DO NOT include languages (those go in languages array)\n7. Include ALL tools, technologies, software, domain knowledge",
          },
          languages: {
            type: "array",
            description:
              "CRITICAL: ONLY extract from 'Sprachen', 'SPRACHKENNTNISSE', or 'Languages' section. Extract spoken languages with proficiency. DO NOT extract from EDV, KOMPETENZEN, or technical skills sections.\n\nPROFICIENCY FORMATTING:\n- Return as SINGLE LINE (not multi-line)\n- German: 'Muttersprache', 'Fortgeschritten', 'Grundkenntnisse', 'Fließend', 'Konversationssicher'\n- English: 'Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic', 'Conversational'\n\nExample: {'name': 'Deutsch', 'proficiency': 'Muttersprache'}\nNOT: {'name': 'Deutsch', 'proficiency': 'Mutter\\nsprache'}",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                proficiency: {
                  type: "string",
                  description: "Single line proficiency level (no newlines)",
                },
              },
              required: ["name"],
            },
          },
          experience: {
            type: "array",
            description:
              "CRITICAL: Work experience in STRICT REVERSE CHRONOLOGICAL ORDER (newest first, oldest last). MUST preserve proper spacing and extract bullets with CLEAN characters.",
            items: {
              type: "object",
              properties: {
                company: {
                  type: "string",
                  description:
                    "Company name WITH location. Examples: 'Allreal-Gruppe, Zürich', 'smzh ag, Zürich', 'Baukontor Architekten AG, Zürich'. Include both company AND city.",
                },
                title: {
                  type: "string",
                  description:
                    "Job title ONLY (no location here). Examples: 'EIDG. DIPL. BAULEITER', 'Projektarchitekt', 'Bauherrenvertreter'",
                },
                start: {
                  type: "string",
                  description:
                    "CRITICAL: Extract start date EXACTLY as shown in CV. Examples: 'Nov 2017', 'März 2023', '04.2024', 'Jan 2014', '05.2022', 'SS 2021', 'WS 2019/20'. DO NOT convert format. DO NOT return 'undefined'.",
                },
                end: {
                  type: "string",
                  description:
                    "CRITICAL: Extract end date EXACTLY as shown in CV. Examples: 'Aktuell', 'aktuell', 'AKTUELL', 'present', 'heute', '03.2024', 'Okt 2022', 'Oktober 2021'. DO NOT convert format. DO NOT return 'undefined'.",
                },
                description: {
                  type: "string",
                  description:
                    "CRITICAL: If the CV shows bullet points in the role description (including hyphen '-' at line start), output MUST be bullet format: each point as '• ' + text, lines joined by \\n. Do NOT merge into one paragraph.\n\n" +
                    "STEP 1: Detect ANY line-start symbol (including hyphen '-')\n" +
                    "Look for lines starting with: •, ●, ○, ◦, ∙, ·, ⋅, ▪, ▫, ■, □, ▸, ▹, ►, ▻, ◆, ◇, ★, ☆, ✓, ✔, ➢, ➣, ➤, →, ⇒, —, –, -, *, +, >\n\n" +
                    "STEP 2: Normalize ALL to standard format\n" +
                    "- Main bullets (any symbol) → '• '\n" +
                    "- Sub-bullets (indented + symbol) → '  ○ '\n" +
                    "- Numbers/letters (1., a), i.) → keep as-is\n\n" +
                    "STEP 3: Clean text, preserve word spacing\n" +
                    "STEP 4: Join with \\n (one bullet per line)\n\n" +
                    "OUTPUT FORMAT when bullets exist: '• First point\\n• Second point\\n• Third point'\n" +
                    "If NO bullets/symbols exist → extract as plain paragraphs",
                },
              },
              required: ["company", "title"],
            },
          },
          education: {
            type: "array",
            description:
              "CRITICAL: ONLY entries that appear under the 'AUSBILDUNG' or 'EDUCATION' section header.\n\n" +
              "If the CV has a SEPARATE section 'WEITERBILDUNG' or 'FURTHER EDUCATION', do NOT put those items here—put them in further_education.\n\n" +
              "1. Extract ONLY entries from under 'AUSBILDUNG' / 'EDUCATION'\n" +
              "2. Sort by end date: newest → oldest (reverse chronological)\n\n" +
              "Example when CV has two sections: AUSBILDUNG (Technische Berufsmittelschule, Zeichner EFZ) and WEITERBILDUNG (Techniker HF, Fachhochschule) → education = [Technische Berufsmittelschule, Zeichner EFZ]; further_education = [Techniker HF, Fachhochschule].",
            items: {
              type: "object",
              properties: {
                institution: {
                  type: "string",
                  description:
                    "School/institution/company WITH PROPER SPACING. Examples: 'HSLU Hochschule Luzern', 'BBZ Baugewerblich Berufsschule, Zürich', 'TU Wien'",
                },
                degree: {
                  type: "string",
                  description:
                    "Degree/course/program WITH PROPER SPACING. Examples: 'CAS KOMMUNIKATION UND FÜHRUNG', 'EIDG. DIPL. BAULEITER HOCHBAU', 'Bachelor- und Masterstudium Architektur', 'MAURER EFZ'",
                },
                start: {
                  type: "string",
                  description:
                    "Start year/date. Examples: '2024', 'Nov 2017', '08.2012', '2005'",
                },
                end: {
                  type: "string",
                  description:
                    "End year/date. Examples: 'Aktuell', '2024', 'Sep 2024', 'Okt 2021', '2013'",
                },
                grade: {
                  type: "string",
                  description:
                    "CRITICAL UNIVERSAL BULLET EXTRACTION:\n\n" +
                    "Additional details like major, thesis, specialization, honors, coursework, achievements.\n\n" +
                    "BULLET POINT HANDLING:\n" +
                    "STEP 1: Detect ANY line-start symbol\n" +
                    "Look for lines starting with: •, ●, ○, ◦, ∙, ·, ⋅, ▪, ▫, ■, □, ▸, ▹, ►, ▻, ◆, ◇, ★, ☆, ✓, ✔, ➢, ➣, ➤, →, ⇒, —, –, -, *, +, >\n\n" +
                    "STEP 2: Normalize ALL to standard format\n" +
                    "- Main bullets (any symbol) → '• '\n" +
                    "- Sub-bullets (indented + symbol) → '  ○ '\n" +
                    "- Numbers/letters (1., a), i.) → keep as-is\n\n" +
                    "STEP 3: Clean text\n" +
                    "- Remove control characters (except \\n)\n" +
                    "- Remove strange Unicode\n" +
                    "- Preserve word spacing\n\n" +
                    "STEP 4: Join with \\n\n\n" +
                    "EXAMPLES:\n" +
                    "Input: '▪ Major: Innovation Management\\n— Thesis: AI in Construction\\n○ Graduated with honors'\n" +
                    "Output: '• Major: Innovation Management\\n• Thesis: AI in Construction\\n• Graduated with honors'\n\n" +
                    "Input: 'Studienabschluss mit Auszeichnung' (no bullets)\n" +
                    "Output: 'Studienabschluss mit Auszeichnung'\n\n" +
                    "If NO bullets/symbols exist → extract as plain text\n" +
                    "If bullets exist → normalize to standard format",
                },
              },
              required: ["institution", "degree"],
            },
          },
          further_education: {
            type: "array",
            description:
              "CRITICAL: Items that appear under the 'WEITERBILDUNG' or 'FURTHER EDUCATION' section ONLY.\n\n" +
              "STEP 1: Detect if the CV has TWO separate section headers.\n" +
              "Look for: (1) 'AUSBILDUNG' or 'EDUCATION' and (2) 'WEITERBILDUNG' or 'FURTHER EDUCATION' as distinct headers (e.g. in colored boxes, larger font, separate blocks).\n\n" +
              "STEP 2: If TWO headers exist:\n" +
              "  → Items under 'AUSBILDUNG' → education array only\n" +
              "  → Items under 'WEITERBILDUNG' → this further_education array only (do NOT put them in education)\n\n" +
              "If ONLY one header exists (e.g. just 'AUSBILDUNG') or combined 'AUS- UND WEITERBILDUNG':\n" +
              "  → further_education = [] (EMPTY); all items go in education.\n\n" +
              "VISUAL CLUES: Same style header boxes, horizontal lines, spacing between blocks. Example: left column with [AUSBILDUNG] then list, then [WEITERBILDUNG] then another list = two sections, split the arrays.",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Course/program name. Examples: 'Techniker HF', 'Fachhochschule'",
                },
                institution: {
                  type: "string",
                  description:
                    "Provider. Examples: 'IBZ', 'Fachrichtung Bauingenieur'",
                },
                date: {
                  type: "string",
                  description:
                    "Date range. Examples: '2016-2024', '2005-2007', 'August 2018 bis Juli 2019'",
                },
                description: {
                  type: "string",
                  description:
                    "Additional details. Examples: '2 Semester', 'Bauplanung Ingenieurbau'",
                },
              },
              required: ["name"],
            },
          },
          certifications: {
            type: "array",
            description:
              "CRITICAL: Search ALL headings: CERTIFICATES, CERTIFICATIONS, ZERTIFIKATE, Zertifikate & Weiterbildungen, Certificates & Continuing Education, LICENSES, CREDENTIALS, Zertifizierungen, Bescheinigungen, Lizenzen. Extract ALL certificates found.",
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
          awards_publications: {
            type: "array",
            description:
              "CRITICAL: Search ALL these sections and headings:\n\n1. ENGAGEMENT section - extract ALL entries:\n   - Lehrveranstaltungen (teaching activities)\n   - Vorträge (presentations/talks)\n   - Ausstellungen (exhibitions)\n   \n2. AUSZEICHNUNGEN / AWARDS section:\n   - Projektförderung (project funding)\n   - Preisträger (prize winner)\n   - Förderstipendium (scholarship)\n   - Leistungsstipendium (performance scholarship)\n   - Studienabschluss mit Auszeichnung (graduated with honors)\n   \n3. Other headings:\n   - PUBLICATIONS\n   - HONORS\n   - RECOGNITIONS\n   - ACHIEVEMENTS\n   \nEXAMPLE ENTRIES:\n- Teaching: 'P. Funke, I. Brnić, U. Huhs: Approximation: Sakralbau, TU Wien, SS 2021'\n- Presentation: 'P. Funke: Exerzitien der Leere, Stephansdom Wien, 23.10.2019'\n- Exhibition: 'Du im Raum – Architektur des Unermesslichen, Votivkirche, 26.05.2021 - 16.06.2021'\n- Award: 'Projektförderung, Stadt Wien, 2021'\n- Award: 'Preisträger Pfann-Ohmann-Preis, TU Wien, 2019'\n- Award: 'Förderstipendium, TU Wien, 2020'\n- Award: 'Leistungsstipendium, TU Wien, 2016'\n\nExtract ALL awards, publications, honors, teaching activities, presentations, exhibitions, scholarships, grants.",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Name/title of award, publication, teaching activity, presentation, or exhibition",
                },
                issuer: {
                  type: "string",
                  description:
                    "Organization/institution (e.g., 'Stadt Wien', 'TU Wien', 'Stephansdom')",
                },
                date: {
                  type: "string",
                  description:
                    "Date or date range (e.g., '2021', 'SS 2021', '23.10.2019', '26.05.2021 - 16.06.2021')",
                },
                description: {
                  type: "string",
                  description:
                    "Additional details (e.g., co-authors, location, topic)",
                },
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
          "further_education",
          "certifications",
          "ai_summary",
        ],
      },
    };

    // Provider router: Gemini primary (with retry/backoff), OpenRouter fallback on retryable errors.
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const OPENROUTER_MODEL_CV =
      Deno.env.get("OPENROUTER_MODEL_CV") || "openai/gpt-4o";
    const FALLBACK_ENABLED =
      Deno.env.get("AI_CV_FALLBACK_ENABLED") !== "false";

    let structuredData: any = null;
    let providerUsed: "gemini" | "openrouter" = "gemini";

    const geminiResult = await callGemini({
      pdfBase64,
      systemPrompt,
      userPrompt,
      functionDeclaration,
      apiKey: GOOGLE_GEMINI_API_KEY,
    });

    if (geminiResult.ok && geminiResult.structuredData) {
      structuredData = geminiResult.structuredData;
    } else if (
      geminiResult.retryable &&
      FALLBACK_ENABLED &&
      OPENROUTER_API_KEY
    ) {
      console.log(
        `Gemini failed (status=${geminiResult.status}, retries=${geminiResult.retries}). Falling back to OpenRouter (${OPENROUTER_MODEL_CV}).`,
      );
      const orResult = await callOpenRouter({
        pdfBase64,
        fileName: fileName || "cv.pdf",
        systemPrompt,
        userPrompt,
        model: OPENROUTER_MODEL_CV,
        apiKey: OPENROUTER_API_KEY,
      });

      if (orResult.ok && orResult.structuredData) {
        structuredData = orResult.structuredData;
        providerUsed = "openrouter";
      } else {
        console.error(
          `OpenRouter fallback failed: status=${orResult.status} err=${(orResult.errText || "").substring(0, 400)}`,
        );
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "AI providers unavailable. Both Gemini and OpenRouter failed.",
            providers: {
              gemini: {
                status: geminiResult.status,
                retries: geminiResult.retries,
                errTextSnippet: (geminiResult.errText || "").substring(0, 250),
              },
              openrouter: {
                status: orResult.status,
                model: OPENROUTER_MODEL_CV,
                errTextSnippet: (orResult.errText || "").substring(0, 400),
              },
            },
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else {
      // Non-retryable Gemini error or fallback disabled / not configured.
      if (geminiResult.status === 429) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Rate limit exceeded (Gemini). Please retry later.",
            gemini: {
              status: 429,
              errTextSnippet: (geminiResult.errText || "").substring(0, 250),
            },
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(
        `AI failed: ${geminiResult.status} - ${(geminiResult.errText || "").substring(0, 200)}`,
      );
    }

    console.log(
      `CV parser provider used: ${providerUsed} (gemini retries: ${geminiResult.retries})`,
    );

    // POST-PROCESSING: Clean and validate data
    structuredData = cleanAndValidateData(structuredData);
    // VALIDATION: Check if further_education was incorrectly populated or missed
    if (
      structuredData.further_education &&
      structuredData.further_education.length > 0
    ) {
      console.log(
        `⚠️  WARNING: further_education has ${structuredData.further_education.length} items. Validating...`,
      );

      // If education only has 1-2 items and further_education has many, likely incorrect split
      if (
        structuredData.education.length <= 2 &&
        structuredData.further_education.length >= 5
      ) {
        console.log(
          `🔧 AUTO-FIX: Moving all further_education items to education (likely single section CV)`,
        );
        structuredData.education = [
          ...structuredData.education,
          ...structuredData.further_education.map((item: any) => ({
            institution: item.institution || null,
            degree: item.name,
            start: item.date?.includes(" bis ")
              ? item.date.split(" bis ")[0]
              : item.date?.includes("-")
                ? item.date.split("-")[0].trim()
                : item.date,
            end: item.date?.includes(" bis ")
              ? item.date.split(" bis ")[1]
              : item.date?.includes("-")
                ? item.date.split("-")[1].trim()
                : item.date,
            grade: item.description,
          })),
        ];
        structuredData.further_education = [];

        // Re-sort education
        const sortByEndDateDesc = (items: any[]): any[] => {
          const monthMap: { [key: string]: string } = {
            januar: "01",
            februar: "02",
            märz: "03",
            april: "04",
            mai: "05",
            juni: "06",
            juli: "07",
            august: "08",
            september: "09",
            oktober: "10",
            november: "11",
            dezember: "12",
            jan: "01",
            feb: "02",
            mär: "03",
            apr: "04",
            jun: "06",
            jul: "07",
            aug: "08",
            sep: "09",
            okt: "10",
            nov: "11",
            dez: "12",
          };

          const parseDate = (dateStr: string | null | undefined): number => {
            if (!dateStr) return 999999;
            const normalized = dateStr.toLowerCase().trim();
            if (
              normalized.includes("aktuell") ||
              normalized.includes("present")
            )
              return 999999;
            const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
            if (!yearMatch) return 0;
            const year = parseInt(yearMatch[0]);
            let month = "12";
            for (const [key, value] of Object.entries(monthMap)) {
              if (normalized.includes(key)) {
                month = value;
                break;
              }
            }
            return parseInt(`${year}${month}`);
          };

          return [...items].sort((a, b) => {
            const endA = parseDate(a.end || a.date || "");
            const endB = parseDate(b.end || b.date || "");
            if (endB !== endA) return endB - endA;
            const startA = parseDate(a.start || "");
            const startB = parseDate(b.start || "");
            return startB - startA;
          });
        };

        structuredData.education = sortByEndDateDesc(structuredData.education);
      }
    }
    console.log(
      `✅ Parsed CV for ${structuredData.person?.full_name || "Unknown"} | ` +
        `📧 Email: ${structuredData.person?.email || "NOT FOUND"} | ` +
        `📞 Phone: ${structuredData.person?.phone || "NOT FOUND"} | ` +
        `📍 Address: ${structuredData.person?.location || "NOT FOUND"} | ` +
        `🚗 License: ${structuredData.person?.driving_license || "N/A"} | ` +
        `💰 Salary: ${structuredData.desired_salary || "N/A"} | ` +
        `📝 Summary: ${structuredData.summary ? "✓" : "✗"} | ` +
        `👤 Personal: ${
          structuredData.growth_potential?.length || 0
        } items | ` +
        `💼 Exp: ${structuredData.experience?.length || 0} | ` +
        `🎓 Edu: ${structuredData.education?.length || 0} | ` +
        `📚 Further Edu: ${structuredData.further_education?.length || 0} | ` +
        `🏆 Achievements: ${
          structuredData.signature_achievements?.length || 0
        } | ` +
        `🗣️ Languages: ${structuredData.languages?.length || 0} | ` +
        `💻 Skills: ${structuredData.skills?.length || 0} | ` +
        `📜 Certs: ${structuredData.certifications?.length || 0} | ` +
        `🏅 Awards: ${structuredData.awards_publications?.length || 0}`,
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

function cleanAndValidateData(data: any): any {
  // Clean text function to remove strange Unicode characters
  const cleanText = (text: string | null | undefined): string | null => {
    if (!text) return null;

    // Remove control characters except newlines and tabs
    let cleaned = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, "");

    // Normalize whitespace but preserve newlines
    cleaned = cleaned.replace(/[^\S\n]+/g, " ");

    // Remove any remaining weird Unicode characters that aren't printable
    cleaned = cleaned.replace(/[^\x20-\x7E\xA0-\xFF\u0100-\uFFFF\n]/g, "");

    return cleaned.trim() || null;
  };

  // Clean arrays
  const cleanArray = (arr: any[] | null | undefined): any[] => {
    if (!arr || !Array.isArray(arr)) return [];
    return arr.filter(
      (item) => item !== null && item !== undefined && item !== "",
    );
  };

  // Ensure reverse chronological order
  const monthMap: { [key: string]: string } = {
    jan: "01",
    january: "01",
    januar: "01",
    feb: "02",
    february: "02",
    februar: "02",
    mar: "03",
    march: "03",
    märz: "03",
    mär: "03",
    apr: "04",
    april: "04",
    may: "05",
    mai: "05",
    jun: "06",
    june: "06",
    juni: "06",
    jul: "07",
    july: "07",
    juli: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    oktober: "10",
    okt: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
    dezember: "12",
    dez: "12",
  };
  const parseDate = (dateStr: string | null | undefined): number => {
    if (!dateStr) return 999999; // ← FIXED: null/undefined means current, so return high number

    const normalized = dateStr.toLowerCase().trim();

    // Handle current/ongoing entries
    if (
      normalized.includes("present") ||
      normalized.includes("current") ||
      normalized.includes("heute") ||
      normalized.includes("aktuell") ||
      normalized.includes("now") ||
      normalized.includes("jetzt")
    ) {
      return 999999;
    }

    // Extract year
    const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
    if (!yearMatch) return 0;

    const year = parseInt(yearMatch[0]);
    let month = "12";

    // Try to find month
    for (const [key, value] of Object.entries(monthMap)) {
      if (normalized.includes(key)) {
        month = value;
        break;
      }
    }

    // Parse MM.YYYY or YYYY-MM format
    const dotMatch = normalized.match(/(\d{2})\.(\d{4})/);
    if (dotMatch) {
      month = dotMatch[1];
    }

    const dashMatch = normalized.match(/(\d{4})-(\d{2})/);
    if (dashMatch) {
      month = dashMatch[2];
    }

    return parseInt(`${year}${month}`);
  };
  const sortByEndDateDesc = (items: any[]): any[] => {
    return [...items].sort((a, b) => {
      const endA = parseDate(a.end || a.date || "");
      const endB = parseDate(b.end || b.date || "");

      if (endB !== endA) return endB - endA;

      const startA = parseDate(a.start || "");
      const startB = parseDate(b.start || "");
      return startB - startA;
    });
  };

  // Clean person data
  if (data.person) {
    data.person.full_name = cleanText(data.person.full_name);
    data.person.email = cleanText(data.person.email);
    data.person.phone = cleanText(data.person.phone);
    data.person.location = cleanText(data.person.location);
    data.person.linkedin = cleanText(data.person.linkedin);
    data.person.birthdate = cleanText(data.person.birthdate);
    data.person.driving_license = cleanText(data.person.driving_license);
  }

  // Clean summary
  data.summary = cleanText(data.summary);
  data.ai_summary = cleanText(data.ai_summary);

  // Clean optional fields
  data.desired_salary = cleanText(data.desired_salary);
  data.willing_to_relocate = cleanText(data.willing_to_relocate);
  data.insights_notes = cleanText(data.insights_notes);
  data.most_proud_of = cleanText(data.most_proud_of);

  // Clean and validate arrays
  data.skills = cleanArray(data.skills)
    .map((s) => cleanText(s))
    .filter(Boolean);
  data.signature_achievements = cleanArray(data.signature_achievements)
    .map((s) => cleanText(s))
    .filter(Boolean);
  data.candidate_values = cleanArray(data.candidate_values)
    .map((s) => cleanText(s))
    .filter(Boolean);
  data.growth_potential = cleanArray(data.growth_potential)
    .map((s) => cleanText(s))
    .filter(Boolean);
  data.potential_risks = cleanArray(data.potential_risks)
    .map((s) => cleanText(s))
    .filter(Boolean);

  // Clean languages and ensure single-line proficiency
  if (data.languages && Array.isArray(data.languages)) {
    data.languages = data.languages
      .map((lang: any) => ({
        name: cleanText(lang.name),
        proficiency: cleanText(lang.proficiency?.replace(/\n/g, " ")), // Remove newlines from proficiency
      }))
      .filter((lang: any) => lang.name);
  }

  // Clean experience
  if (data.experience && Array.isArray(data.experience)) {
    data.experience = data.experience
      .map((exp: any) => ({
        company: cleanText(exp.company),
        title: cleanText(exp.title),
        start: cleanText(exp.start),
        end: cleanText(exp.end),
        description: cleanText(exp.description),
      }))
      .filter((exp: any) => exp.company && exp.title);

    data.experience = sortByEndDateDesc(data.experience);
  }

  // Clean education
  if (data.education && Array.isArray(data.education)) {
    data.education = data.education
      .map((edu: any) => ({
        institution: cleanText(edu.institution),
        degree: cleanText(edu.degree),
        start: cleanText(edu.start),
        end: cleanText(edu.end),
        grade: cleanText(edu.grade),
      }))
      .filter((edu: any) => edu.institution && edu.degree);

    data.education = sortByEndDateDesc(data.education);
  }

  // Clean further education
  if (data.further_education && Array.isArray(data.further_education)) {
    data.further_education = data.further_education
      .map((edu: any) => ({
        name: cleanText(edu.name),
        institution: cleanText(edu.institution),
        date: cleanText(edu.date),
        description: cleanText(edu.description),
      }))
      .filter((edu: any) => edu.name);

    data.further_education = sortByEndDateDesc(data.further_education);
  }

  // Clean certifications
  if (data.certifications && Array.isArray(data.certifications)) {
    data.certifications = data.certifications
      .map((cert: any) => ({
        name: cleanText(cert.name),
        issuer: cleanText(cert.issuer),
        date: cleanText(cert.date),
      }))
      .filter((cert: any) => cert.name);
  }

  // Clean awards and publications
  if (data.awards_publications && Array.isArray(data.awards_publications)) {
    data.awards_publications = data.awards_publications
      .map((award: any) => ({
        name: cleanText(award.name),
        issuer: cleanText(award.issuer),
        date: cleanText(award.date),
        description: cleanText(award.description),
      }))
      .filter((award: any) => award.name);
  }

  return data;
}

type GeminiCallResult = {
  ok: boolean;
  structuredData?: any;
  status: number;
  errText?: string;
  retryable: boolean;
  retries: number;
};

async function callGemini({
  pdfBase64,
  systemPrompt,
  userPrompt,
  functionDeclaration,
  apiKey,
}: {
  pdfBase64: string;
  systemPrompt: string;
  userPrompt: string;
  functionDeclaration: any;
  apiKey: string;
}): Promise<GeminiCallResult> {
  const maxAttempts = 3;
  let lastStatus = 0;
  let lastErrText = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inline_data: {
                      mime_type: "application/pdf",
                      data: pdfBase64,
                    },
                  },
                  { text: systemPrompt + "\n\n" + userPrompt },
                ],
              },
            ],
            tools: [{ functionDeclarations: [functionDeclaration] }],
            toolConfig: {
              functionCallingConfig: {
                mode: "ANY",
                allowedFunctionNames: ["extract_cv_structure"],
              },
            },
          }),
        },
      );

      lastStatus = response.status;

      if (response.ok) {
        const data = await response.json();
        const functionCall =
          data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
        if (!functionCall?.args) {
          return {
            ok: false,
            status: 200,
            errText: "No structured data returned from Gemini",
            retryable: false,
            retries: attempt,
          };
        }
        return {
          ok: true,
          structuredData: functionCall.args,
          status: 200,
          retryable: false,
          retries: attempt,
        };
      }

      lastErrText = await response.text();
      console.error(
        `Gemini HTTP ${response.status} (attempt ${attempt + 1}/${maxAttempts}): ${lastErrText.substring(0, 200)}`,
      );

      const isRetryable =
        response.status === 429 ||
        response.status === 503 ||
        response.status >= 500;

      if (isRetryable && attempt < maxAttempts - 1) {
        const delay =
          Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return {
        ok: false,
        status: response.status,
        errText: lastErrText,
        retryable: isRetryable,
        retries: attempt,
      };
    } catch (err: any) {
      lastErrText = err?.message || String(err);
      console.error(
        `Gemini network error (attempt ${attempt + 1}/${maxAttempts}): ${lastErrText}`,
      );
      if (attempt < maxAttempts - 1) {
        const delay =
          Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return {
        ok: false,
        status: 0,
        errText: lastErrText,
        retryable: true,
        retries: attempt,
      };
    }
  }

  return {
    ok: false,
    status: lastStatus,
    errText: lastErrText,
    retryable: true,
    retries: maxAttempts,
  };
}

type OpenRouterCallResult = {
  ok: boolean;
  structuredData?: any;
  status: number;
  errText?: string;
};

async function callOpenRouter({
  pdfBase64,
  fileName,
  systemPrompt,
  userPrompt,
  model,
  apiKey,
}: {
  pdfBase64: string;
  fileName: string;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  apiKey: string;
}): Promise<OpenRouterCallResult> {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    systemPrompt +
                    "\n\n" +
                    userPrompt +
                    "\n\nReturn ONLY a single valid JSON object that matches the requested schema. No markdown fences, no explanations, no additional text.",
                },
                {
                  type: "file",
                  file: {
                    filename: fileName,
                    file_data: `data:application/pdf;base64,${pdfBase64}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(
        `OpenRouter HTTP ${response.status}: ${errText.substring(0, 200)}`,
      );
      return { ok: false, status: response.status, errText };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return {
        ok: false,
        status: 200,
        errText: "OpenRouter returned no content",
      };
    }

    let parsed: any;
    try {
      if (typeof content === "string") {
        // Strip optional code fences just in case
        const stripped = content
          .trim()
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "");
        parsed = JSON.parse(stripped);
      } else {
        parsed = content;
      }
    } catch (e: any) {
      return {
        ok: false,
        status: 200,
        errText: `Failed to parse OpenRouter JSON: ${e?.message || e}`,
      };
    }

    return { ok: true, structuredData: parsed, status: 200 };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      errText: err?.message || String(err),
    };
  }
}
