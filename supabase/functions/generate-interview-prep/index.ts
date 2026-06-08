import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// V3 Content Structure with Red Thread - Phase-Specific Content
interface PrepContentV3 {
  introduction: {
    greeting: string;
    documentPurpose: string;
    howToUse: string[];
    recruiterNote: string;
    recruiterContact: string;
  };
  candidateProfile: {
    matchReason: string;
    strengths: string[];
    relevantExperience: string;
  };
  weaknessesAndGaps: Array<{
    gap: string;
    situation: string;
    mitigation: string;
  }>;
  careerStepAnalysis?: {
    currentLevel: string;
    targetLevel: string;
    gapAnalysis: string;
    transferableSkills: string[];
    keyCompetencies: string[];
    talkingPoints: string[];
    expectedQuestions: string[];
  };
  salaryNegotiation?: {
    strategy: string;
    marketContext: string;
    argumentPoints: string[];
    timing: string;
  };
  // Interview 1 specific - Full company & position info
  company?: {
    briefing: string;
    culture: string;
    values: string[];
    highlights: string[];
    teamInfo: string;
  };
  position?: {
    overview: string;
    dailyWork: string;
    keyPoints: string[];
    growthPath: string;
  };
  // Interview 2 specific - Manager & technical depth
  secondRound?: {
    companyReminder: string;
    managerProfile: string;
    managerExpectations: string[];
    technicalFocus: string[];
    expectedCases: string[];
    projectExamples: string[];
    positionSummary: string;
  };
  // Trial Day specific - Team & practical tips
  trialDay?: {
    daySchedule: string;
    teamMembers: string;
    processesToObserve: string[];
    practicalTasks: string[];
    officeEtiquette: string[];
    dresscode: string;
    lunchInfo: string;
  };
  interviewPrep: {
    whatToExpect: string;
    tips: string[];
    bodyLanguage: string[];
    dosAndDonts: {
      dos: string[];
      donts: string[];
    };
  };
  yourPreparation: {
    questionsToAsk: string[];
    checklist: string[];
    followUpInfo: string;
  };
}

interface FocusAreaConfig {
  id: string;
  label: string;
  promptAddition: string;
}

const FOCUS_AREA_PROMPTS: Record<string, FocusAreaConfig> = {
  weaknesses: {
    id: 'weaknesses',
    label: 'Schwächen betonen',
    promptAddition: 'Betone besonders die Entwicklungsbereiche und Schwächen des Kandidaten. Identifiziere 3-4 Lücken im Lebenslauf oder fehlende Skills und gib für jede konkrete Tipps in der "situation" (wann könnte es aufkommen?) und "mitigation" (wie damit umgehen?).'
  },
  salary: {
    id: 'salary',
    label: 'Gehaltsverhandlung',
    promptAddition: 'Füge einen umfangreichen Abschnitt zur Gehaltsverhandlung hinzu (salaryNegotiation). Basierend auf dem aktuellen und gewünschten Gehalt, entwickle eine Verhandlungsstrategie mit marketContext (Marktsituation), timing (wann ansprechen?) und 3-4 konkreten Argumentationspunkten.'
  },
  technical: {
    id: 'technical',
    label: 'Fachliche Tiefe',
    promptAddition: 'Fokussiere auf technische und fachliche Tiefe in den interviewTips. Liste spezifische Fachbegriffe und technische Konzepte auf, die relevant sein könnten. Füge technische Fragen zu questionsToAsk hinzu.'
  },
  culture: {
    id: 'culture',
    label: 'Kulturelle Passung',
    promptAddition: 'Lege besonderen Wert auf die kulturelle Passung. Erweitere company.culture und company.values. Gib Tipps in bodyLanguage wie der Kandidat authentisch wirken kann.'
  },
  leadership: {
    id: 'leadership',
    label: 'Führungsposition',
    promptAddition: 'Bereite den Kandidaten speziell auf Führungsfragen vor. Fokussiere in talkingPoints auf Führungsstil, Mitarbeiterentwicklung, Konfliktmanagement. Füge Leadership-Fragen zu expectedQuestions hinzu.'
  }
};

function sanitizeFileName(name: string): string {
  return name
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

async function callGeminiAPI(systemPrompt: string, userPrompt: string) {
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 12000 }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Detect if this is a career step up
function detectCareerStep(candidatePosition: string, jobTitle: string): { isCareerStep: boolean; prompt: string } {
  const candidatePos = (candidatePosition || '').toLowerCase();
  const jobPos = (jobTitle || '').toLowerCase();
  
  const progressions = [
    { from: ['bauzeichner', 'technischer zeichner', 'cad'], to: ['bauleiter', 'projektleiter', 'teamleiter', 'leiter'] },
    { from: ['entwickler', 'developer', 'engineer', 'programmierer'], to: ['senior', 'lead', 'architect', 'manager', 'principal'] },
    { from: ['sachbearbeiter', 'assistant', 'mitarbeiter'], to: ['teamleiter', 'abteilungsleiter', 'manager', 'leiter'] },
    { from: ['berater', 'consultant'], to: ['senior consultant', 'manager', 'partner', 'director'] },
    { from: ['verkäufer', 'sales', 'account'], to: ['sales manager', 'key account', 'vertriebsleiter', 'head of'] },
    { from: ['analyst', 'junior'], to: ['senior', 'lead', 'manager', 'head'] },
  ];
  
  for (const prog of progressions) {
    const fromMatch = prog.from.some(f => candidatePos.includes(f));
    const toMatch = prog.to.some(t => jobPos.includes(t));
    if (fromMatch && toMatch) {
      return {
        isCareerStep: true,
        prompt: `
WICHTIG - KARRIERESCHRITT ERKANNT:
Der Kandidat bewirbt sich von "${candidatePosition}" auf "${jobTitle}" - das ist ein Karriereschritt!

Fülle careerStepAnalysis vollständig aus:
- currentLevel: Aktuelle Position kurz beschreiben
- targetLevel: Zielposition und was sie erfordert
- gapAnalysis: 2-3 Sätze was dem Kandidaten noch fehlt
- transferableSkills: 3-4 übertragbare Fähigkeiten
- keyCompetencies: 4-5 neue Kompetenzen für die Zielposition
- talkingPoints: 5-6 konkrete Punkte für das Gespräch
- expectedQuestions: 3-4 Fragen die zum "Sprung" gestellt werden könnten`
      };
    }
  }
  
  return { isCareerStep: false, prompt: '' };
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
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { 
      candidate, job, client, matchData, commuteData, stage, 
      focusAreas, customInstructions, language, 
      placementId, userId, recruiterInfo, returnJson, prepContent: existingContent 
    } = await req.json();
    
    console.log('Generate interview prep V3 - Stage:', stage, 'ReturnJson:', returnJson);
    
    const isEnglish = language === 'en';
    const swissGermanRule = 'Verwende Schweizer Hochdeutsch - kein "ß", immer "ss". UMLAUTE IMMER VERWENDEN (ä, ö, ü). Bulletpoints enden NIE mit einem Punkt.';
    
    let content: PrepContentV3;
    
    if (existingContent && !returnJson) {
      content = existingContent;
    } else {
      const focusAreaAdditions = (focusAreas || [])
        .map((areaId: string) => FOCUS_AREA_PROMPTS[areaId]?.promptAddition)
        .filter(Boolean)
        .join('\n\n');
      
      const careerStepInfo = detectCareerStep(
        candidate?.position || candidate?.desired_position, 
        job?.title
      );
      
      const includeSalary = focusAreas?.includes('salary') && 
        (candidate?.desired_salary || candidate?.current_salary);
      
      const stageContext = getStageContext(stage, isEnglish);
      const recruiterName = recruiterInfo?.full_name || 'Dein Recruiter';
      const recruiterContact = recruiterInfo?.phone || recruiterInfo?.email || '';
      
      const systemPrompt = `Du bist ein erfahrener Karriereberater für eine Headhunting-Agentur namens "Beckett Stone".
Erstelle ein professionelles, personalisiertes Interview-Vorbereitungs-Handout mit VIEL Text und konkreten, hilfreichen Inhalten.

${isEnglish ? 'Create ALL content in ENGLISH.' : swissGermanRule}

STAGE: ${stage}
${stageContext}

WICHTIG - ROTER FADEN:
Das Dokument soll den Kandidaten wie ein persönlicher Coach durch die Vorbereitung führen:
1. Einleitung: Persönliche Anrede, erkläre was das Dokument ist und wie man es nutzt
2. Profil: Warum wurde der Kandidat ausgewählt? Was sind seine Stärken?
3. Herausforderungen: Ehrliche Analyse von Schwachpunkten MIT konkreten Lösungen
4. Unternehmen & Position: Alles was der Kandidat wissen muss
5. Tipps: Phasen-spezifische, praktische Ratschläge
6. Vorbereitung: Konkrete Checkliste und clevere Fragen

${focusAreaAdditions ? `FOKUS-BEREICHE:\n${focusAreaAdditions}` : ''}

${careerStepInfo.isCareerStep ? careerStepInfo.prompt : ''}

${customInstructions ? `ZUSÄTZLICHE ANWEISUNGEN VOM RECRUITER:\n${customInstructions}` : ''}

STIL:
- Schreibe persönlich und ermutigend, aber professionell
- Sei konkret und spezifisch, keine generischen Floskeln
- Jeder Tipp sollte sofort umsetzbar sein
- Verwende "du" für direkte Ansprache

Antworte NUR mit validem JSON ohne Markdown-Formatierung.`;

      const userPrompt = `Erstelle ein umfassendes Interview-Vorbereitungs-Handout:

KANDIDAT:
- Name: ${candidate?.name || 'Unbekannt'}
- Aktuelle Position: ${candidate?.position || 'Nicht angegeben'}
- Gewünschte Position: ${candidate?.desired_position || 'Nicht angegeben'}
- Skills: ${candidate?.skills?.join(', ') || 'Keine'}
- Erfahrung: ${candidate?.experience || 'Nicht angegeben'}
- Wechselgrund: ${candidate?.reason_for_change || 'Nicht angegeben'}
- Aktuelles Gehalt: ${candidate?.current_salary || 'Nicht angegeben'}
- Wunschgehalt: ${candidate?.desired_salary || 'Nicht angegeben'}
- Sprachen: ${JSON.stringify(candidate?.languages) || 'Keine'}
- Stärken laut Match: ${matchData?.strengths?.join(', ') || 'Keine'}
- Lücken laut Match: ${matchData?.gaps?.join(', ') || 'Keine'}

JOB:
- Titel: ${job?.title || 'Unbekannt'}
- Standort: ${job?.location || 'Nicht angegeben'}
- Gehaltsspanne: ${job?.salary_range || 'Nicht angegeben'}
- Beschreibung: ${job?.description || 'Keine'}
- Anforderungen: ${job?.requirements || 'Keine'}
- Aufgaben: ${job?.responsibilities || 'Keine'}
- Skills: ${job?.skills?.join(', ') || 'Keine'}

UNTERNEHMEN:
- Name: ${client?.name || job?.company || 'Unbekannt'}
- Branche: ${client?.industry || 'Nicht angegeben'}
- Beschreibung: ${client?.description || 'Keine'}
- Benefits: ${client?.benefits || 'Keine'}
- Website: ${client?.website || 'Nicht angegeben'}

RECRUITER: ${recruiterName}
KONTAKT: ${recruiterContact}

MATCH-SCORE: ${matchData?.score || 'N/A'}%
PENDELZEIT: Auto ${commuteData?.auto?.duration || '?'} / ÖPNV ${commuteData?.oepnv?.duration || '?'}

Erstelle folgendes JSON${isEnglish ? ' (all in English)' : ''}:
{
  "introduction": {
    "greeting": "Hallo ${candidate?.name?.split(' ')[0] || 'Name'},",
    "documentPurpose": "2-3 Sätze was dieses Dokument ist und warum es erstellt wurde für ${stage}",
    "howToUse": ["3-4 Bullet-Points wie man das Dokument am besten nutzt"],
    "recruiterNote": "Persönliche Nachricht vom Recruiter mit Ermutigung",
    "recruiterContact": "${recruiterContact}"
  },
  "candidateProfile": {
    "matchReason": "2-3 Sätze warum dieser Kandidat für diese Stelle ausgewählt wurde, basierend auf Match-Score ${matchData?.score}%",
    "strengths": ["5-6 konkrete Stärken die zur Stelle passen, je 1 Satz Erklärung"],
    "relevantExperience": "2-3 Sätze Zusammenfassung der relevanten Erfahrung"
  },
  "weaknessesAndGaps": [
    {
      "gap": "Potenzielle Schwäche/Lücke",
      "situation": "Wann/wie könnte das im Gespräch aufkommen?",
      "mitigation": "Konkrete Strategie wie man das positiv adressiert"
    }
  ],
  ${careerStepInfo.isCareerStep ? `"careerStepAnalysis": {
    "currentLevel": "Aktuelle Position beschreiben",
    "targetLevel": "Zielposition und Anforderungen",
    "gapAnalysis": "Was fehlt dem Kandidaten noch?",
    "transferableSkills": ["3-4 übertragbare Fähigkeiten"],
    "keyCompetencies": ["4-5 Kompetenzen für Zielposition"],
    "talkingPoints": ["5-6 Punkte für das Gespräch"],
    "expectedQuestions": ["3-4 erwartete Fragen zum Karriereschritt"]
  },` : ''}
  ${includeSalary ? `"salaryNegotiation": {
    "strategy": "2-3 Sätze Verhandlungsstrategie",
    "marketContext": "1-2 Sätze zur Marktsituation",
    "argumentPoints": ["3-4 konkrete Argumente"],
    "timing": "Wann im Prozess ansprechen?"
  },` : ''}
  ${stage === 'Interview 1' ? `"company": {
    "briefing": "4-5 ausführliche Sätze über das Unternehmen, Geschichte, Marktposition, was macht sie besonders",
    "culture": "2-3 Sätze zur Unternehmenskultur und Arbeitsatmosphäre",
    "values": ["4-5 Kernwerte des Unternehmens mit kurzer Erklärung"],
    "highlights": ["5-6 wichtige Fakten die der Kandidat unbedingt wissen sollte"],
    "teamInfo": "2-3 Sätze zum Team falls bekannt"
  },
  "position": {
    "overview": "3-4 ausführliche Sätze zur Position und ihrer Bedeutung",
    "dailyWork": "2-3 Sätze was man in dieser Rolle täglich macht",
    "keyPoints": ["5-6 wichtige Punkte zur Rolle"],
    "growthPath": "2-3 Sätze zu Entwicklungsmöglichkeiten in dieser Position"
  },` : ''}
  ${stage === 'Interview 2' ? `"secondRound": {
    "companyReminder": "Ein kurzer Satz zur Erinnerung an das Unternehmen ${client?.name || 'das Unternehmen'}",
    "managerProfile": "2-3 Sätze: Wer könnte der potenzielle Vorgesetzte sein basierend auf der Position ${job?.title}? Was ist solchen Führungskräften typischerweise wichtig?",
    "managerExpectations": ["4-5 Dinge die Führungskräfte in dieser Branche/Position typischerweise von Kandidaten erwarten"],
    "technicalFocus": ["5-6 fachliche Themen die im zweiten Gespräch wahrscheinlich vertieft werden"],
    "expectedCases": ["3-4 mögliche Case-Fragen oder Problemlösungs-Szenarien basierend auf der Stelle"],
    "projectExamples": ["4-5 konkrete Beispiele aus der Erfahrung des Kandidaten die er nennen sollte um seine Kompetenz zu zeigen"],
    "positionSummary": "1-2 Sätze Kurzusammenfassung der Rolle als Erinnerung"
  },` : ''}
  ${stage === 'Trial Day' ? `"trialDay": {
    "daySchedule": "3-4 Sätze: Wie sieht ein typischer Probetag aus? Zeitlicher Ablauf von Ankunft bis Ende",
    "teamMembers": "2-3 Sätze: Was erwartet den Kandidaten bezüglich des Teams? Wie kann er sich gut integrieren?",
    "processesToObserve": ["5-6 konkrete Dinge worauf der Kandidat im Laufe des Tages achten soll"],
    "practicalTasks": ["4-5 mögliche Aufgaben oder Situationen an denen er teilnehmen/arbeiten könnte"],
    "officeEtiquette": ["5-6 praktische Tipps für professionelles Verhalten im Büro"],
    "dresscode": "1-2 Sätze zum Dresscode (meist lockerer als bei Interviews)",
    "lunchInfo": "1-2 Sätze zur Mittagspause und sozialen Aspekten"
  },` : ''}
  "interviewPrep": {
    "whatToExpect": "2-3 Sätze was den Kandidaten in diesem ${stage} konkret erwartet",
    "tips": ["6-8 ${stage === 'Interview 1' ? 'Tipps für den Ersteindruck und das Kennenlernen' : stage === 'Interview 2' ? 'Tipps für fachliche Tiefe und das Gespräch mit dem Vorgesetzten' : 'praktische Tipps für den ganzen Probetag'}"],
    "bodyLanguage": ["3-4 Körpersprache-Tipps${stage === 'Trial Day' ? ' für den ganzen Tag' : stage === 'Interview 1' ? ', Video vs. Präsenz beachten' : ' für das Gespräch mit dem Vorgesetzten'}"],
    "dosAndDonts": {
      "dos": ["4-5 konkrete Do's für ${stage}"],
      "donts": ["4-5 konkrete Don'ts für ${stage}"]
    }
  },
  "yourPreparation": {
    "questionsToAsk": ["5-6 clevere Fragen ${stage === 'Interview 1' ? 'zum Unternehmen und der Rolle' : stage === 'Interview 2' ? 'an den Vorgesetzten zu Team, Projekten, Erwartungen' : 'zum Team, zu Prozessen und zum Arbeitsalltag'}"],
    "checklist": ["5-6 praktische Vorbereitungspunkte für ${stage}"],
    "followUpInfo": "Was passiert nach ${stage === 'Trial Day' ? 'dem Probetag' : 'diesem Gespräch'}?"
  }
}`;

      console.log('Calling Gemini API for V3 content...');
      let contentText;
      try {
        contentText = await callGeminiAPI(systemPrompt, userPrompt);
      } catch (error) {
        console.error('AI API error:', error);
        return new Response(JSON.stringify({ error: 'AI-Analyse temporär nicht verfügbar' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      try {
        contentText = contentText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        content = JSON.parse(contentText);
      } catch (e) {
        console.error('Failed to parse AI response:', e);
        content = getFallbackContentV3(stage, candidate, job, client, matchData, recruiterName, recruiterContact, isEnglish);
      }
    }
    
    if (returnJson) {
      return new Response(JSON.stringify(content), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('Generating PDF V3...');
    const pdfBytes = await generatePdfV3(content, candidate, job, client, stage, commuteData, isEnglish);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = sanitizeFileName(candidate?.name || 'Kandidat');
    const sanitizedStage = sanitizeFileName(stage);
    const fileName = `Interview-Vorbereitung_${sanitizedName}_${sanitizedStage}_${timestamp}.pdf`;
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (placementId && userId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const storagePath = `${placementId}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('interview-prep')
          .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false });
        
        if (!uploadError) {
          const { data: signedData } = await supabase.storage.from('interview-prep').createSignedUrl(storagePath, 86400);
          
          await supabase.from('interview_prep_documents').insert({
            placement_id: placementId,
            file_url: signedData?.signedUrl || storagePath,
            file_name: fileName,
            focus_areas: focusAreas || [],
            custom_instructions: customInstructions || null,
            language: language || 'de',
            created_by: userId
          });
        }
      } catch (storageError) {
        console.error('Error saving PDF:', storageError);
      }
    }
    
    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unbekannter Fehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function generatePdfV3(
  content: PrepContentV3, 
  candidate: any, 
  job: any, 
  client: any, 
  stage: string,
  commuteData: any,
  isEnglish: boolean
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 35;
  const contentWidth = pageWidth - 2 * margin;
  const columnWidth = (contentWidth - 15) / 2;
  
  // === PAGE 1 ===
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let currentColumn: 'left' | 'right' = 'left';
  let columnY = y;
  
  const getX = () => currentColumn === 'left' ? margin : margin + columnWidth + 15;
  const getMaxWidth = () => columnWidth;
  
  const drawText = (text: string, size: number, isBold = false, color = rgb(0, 0, 0), maxWidth = contentWidth, xOffset = 0) => {
    const selectedFont = isBold ? boldFont : font;
    const lines = wrapText(text, maxWidth, size, selectedFont);
    for (const line of lines) {
      if (y < margin + 20) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin + xOffset, y, size, font: selectedFont, color });
      y -= size * 1.25;
    }
  };
  
  const drawColumnText = (text: string, size: number, isBold = false, color = rgb(0, 0, 0), indent = 0) => {
    const selectedFont = isBold ? boldFont : font;
    const maxW = getMaxWidth() - indent;
    const lines = wrapText(text, maxW, size, selectedFont);
    for (const line of lines) {
      page.drawText(line, { x: getX() + indent, y: columnY, size, font: selectedFont, color });
      columnY -= size * 1.2;
    }
  };
  
  const drawSection = (title: string, yPos: number) => {
    page.drawText(title, { x: margin, y: yPos, size: 9, font: boldFont, color: rgb(0.1, 0.4, 0.7) });
    return yPos - 12;
  };
  
  const drawColumnSection = (title: string) => {
    columnY -= 6;
    page.drawText(title, { x: getX(), y: columnY, size: 8, font: boldFont, color: rgb(0.1, 0.4, 0.7) });
    columnY -= 10;
  };
  
  // Header
  drawText(isEnglish ? 'INTERVIEW PREPARATION' : 'INTERVIEW-VORBEREITUNG', 14, true, rgb(0.1, 0.4, 0.7));
  y -= 2;
  drawText(`${stage} • ${new Date().toLocaleDateString('de-CH')}`, 8, false, rgb(0.5, 0.5, 0.5));
  y -= 4;
  
  // Candidate info line
  drawText(`${candidate?.name || 'Kandidat'} → ${job?.title || 'Position'} bei ${client?.name || job?.company || 'Unternehmen'}`, 9, true);
  y -= 8;
  
  // Introduction Box
  page.drawRectangle({
    x: margin,
    y: y - 55,
    width: contentWidth,
    height: 55,
    color: rgb(0.95, 0.97, 1),
    borderColor: rgb(0.8, 0.85, 0.95),
    borderWidth: 0.5,
  });
  y -= 8;
  drawText(content.introduction.greeting, 8, true, rgb(0.1, 0.3, 0.6));
  y -= 2;
  drawText(content.introduction.documentPurpose, 7, false, rgb(0.3, 0.3, 0.3));
  y -= 4;
  drawText(content.introduction.recruiterNote, 7, false, rgb(0.4, 0.4, 0.4));
  if (content.introduction.recruiterContact) {
    y -= 2;
    drawText(`📞 ${content.introduction.recruiterContact}`, 7, false, rgb(0.3, 0.3, 0.3));
  }
  y -= 20;
  
  // Line
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 12;
  
  // Two Column Layout starts here
  const columnStartY = y;
  columnY = columnStartY;
  currentColumn = 'left';
  
  // LEFT COLUMN - Profile & Strengths
  drawColumnSection(isEnglish ? 'YOUR PROFILE' : 'DEIN PROFIL');
  
  // Match Reason
  page.drawRectangle({
    x: getX(),
    y: columnY - 30,
    width: columnWidth,
    height: 30,
    color: rgb(0.9, 0.97, 0.9),
  });
  columnY -= 5;
  drawColumnText(content.candidateProfile.matchReason, 7, false, rgb(0.2, 0.4, 0.2));
  columnY -= 8;
  
  // Strengths
  page.drawText(isEnglish ? 'Your Strengths:' : 'Deine Stärken:', { x: getX(), y: columnY, size: 7, font: boldFont, color: rgb(0.2, 0.4, 0.2) });
  columnY -= 9;
  for (const strength of content.candidateProfile.strengths) {
    drawColumnText(`✓ ${strength}`, 6.5, false, rgb(0.2, 0.4, 0.2), 0);
    columnY -= 1;
  }
  
  // Weaknesses Section
  columnY -= 8;
  drawColumnSection(isEnglish ? 'CHALLENGES' : 'HERAUSFORDERUNGEN');
  
  for (const item of content.weaknessesAndGaps) {
    page.drawRectangle({
      x: getX(),
      y: columnY - 28,
      width: columnWidth,
      height: 28,
      color: rgb(1, 0.97, 0.9),
    });
    columnY -= 5;
    drawColumnText(item.gap, 7, true, rgb(0.6, 0.4, 0.1));
    columnY -= 1;
    drawColumnText(`→ ${item.mitigation}`, 6, false, rgb(0.5, 0.35, 0.1), 6);
    columnY -= 6;
  }
  
  // RIGHT COLUMN
  currentColumn = 'right';
  columnY = columnStartY;
  
  // Career Step Analysis or Relevant Experience
  if (content.careerStepAnalysis) {
    drawColumnSection(isEnglish ? 'CAREER STEP' : 'KARRIERESCHRITT');
    
    page.drawRectangle({
      x: getX(),
      y: columnY - 75,
      width: columnWidth,
      height: 75,
      color: rgb(0.92, 0.95, 1),
    });
    columnY -= 5;
    drawColumnText(`${content.careerStepAnalysis.currentLevel} → ${content.careerStepAnalysis.targetLevel}`, 7, true, rgb(0.1, 0.3, 0.6));
    columnY -= 3;
    drawColumnText(content.careerStepAnalysis.gapAnalysis, 6, false, rgb(0.2, 0.3, 0.5));
    columnY -= 5;
    
    page.drawText(isEnglish ? 'Key Points:' : 'Im Gespräch betonen:', { x: getX() + 3, y: columnY, size: 6, font: boldFont, color: rgb(0.1, 0.3, 0.6) });
    columnY -= 8;
    for (const point of content.careerStepAnalysis.talkingPoints.slice(0, 4)) {
      drawColumnText(`→ ${point}`, 6, false, rgb(0.2, 0.3, 0.5), 3);
    }
    columnY -= 8;
  } else {
    drawColumnSection(isEnglish ? 'EXPERIENCE' : 'ERFAHRUNG');
    drawColumnText(content.candidateProfile.relevantExperience, 7, false, rgb(0.3, 0.3, 0.3));
    columnY -= 10;
  }
  
  // Salary Negotiation (if present)
  if (content.salaryNegotiation) {
    columnY -= 5;
    drawColumnSection(isEnglish ? 'SALARY' : 'GEHALT');
    
    page.drawRectangle({
      x: getX(),
      y: columnY - 45,
      width: columnWidth,
      height: 45,
      color: rgb(0.9, 0.97, 0.92),
    });
    columnY -= 5;
    drawColumnText(content.salaryNegotiation.strategy, 6.5, false, rgb(0.1, 0.4, 0.2));
    columnY -= 3;
    for (const point of content.salaryNegotiation.argumentPoints.slice(0, 3)) {
      drawColumnText(`€ ${point}`, 6, false, rgb(0.2, 0.4, 0.25), 0);
    }
    columnY -= 3;
    drawColumnText(`⏰ ${content.salaryNegotiation.timing}`, 6, false, rgb(0.3, 0.4, 0.3), 0);
  }
  
  // Footer Page 1
  page.drawText(isEnglish ? 'Page 1 of 2' : 'Seite 1 von 2', { x: margin, y: margin - 5, size: 6, font, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Beckett Stone', { x: pageWidth - margin - 50, y: margin - 5, size: 6, font, color: rgb(0.6, 0.6, 0.6) });
  
  // === PAGE 2 ===
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  y = pageHeight - margin;
  
  // Header Page 2
  drawText(`${candidate?.name} • ${stage}`, 9, true, rgb(0.1, 0.4, 0.7));
  y -= 2;
  drawText(client?.name || job?.company || '', 7, false, rgb(0.5, 0.5, 0.5));
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 12;
  
  // Two Column Layout Page 2
  columnY = y;
  currentColumn = 'left';
  
  // LEFT COLUMN - Phase-specific content
  if (stage === 'Interview 1' && content.company) {
    // Interview 1: Company & Position
    drawColumnSection(isEnglish ? 'THE COMPANY' : 'DAS UNTERNEHMEN');
    drawColumnText(content.company.briefing, 7, false, rgb(0.3, 0.3, 0.3));
    columnY -= 5;
    
    // Culture
    page.drawRectangle({
      x: getX(),
      y: columnY - 20,
      width: columnWidth,
      height: 20,
      color: rgb(0.95, 0.95, 0.98),
    });
    columnY -= 5;
    drawColumnText(`Kultur: ${content.company.culture}`, 6, false, rgb(0.3, 0.3, 0.4));
    columnY -= 8;
    
    // Values
    if (content.company.values && content.company.values.length > 0) {
      page.drawText(isEnglish ? 'Values:' : 'Werte:', { x: getX(), y: columnY, size: 6, font: boldFont, color: rgb(0.3, 0.3, 0.4) });
      columnY -= 8;
      drawColumnText(content.company.values.join(' • '), 6, false, rgb(0.4, 0.4, 0.5));
      columnY -= 5;
    }
    
    // Highlights
    if (content.company.highlights) {
      for (const highlight of content.company.highlights.slice(0, 4)) {
        drawColumnText(`• ${highlight}`, 6, false, rgb(0.3, 0.3, 0.3));
      }
    }
    
    if (content.company.teamInfo) {
      columnY -= 3;
      drawColumnText(`👥 ${content.company.teamInfo}`, 6, false, rgb(0.3, 0.4, 0.5));
    }
    
    // Position Section
    if (content.position) {
      columnY -= 10;
      drawColumnSection(isEnglish ? 'THE POSITION' : 'DIE POSITION');
      drawColumnText(content.position.overview, 7, false, rgb(0.3, 0.3, 0.3));
      columnY -= 5;
      
      page.drawRectangle({
        x: getX(),
        y: columnY - 18,
        width: columnWidth,
        height: 18,
        color: rgb(0.95, 0.95, 0.98),
      });
      columnY -= 5;
      drawColumnText(content.position.dailyWork, 6, false, rgb(0.35, 0.35, 0.4));
      columnY -= 8;
      
      if (content.position.keyPoints) {
        for (const point of content.position.keyPoints.slice(0, 4)) {
          drawColumnText(`• ${point}`, 6, false, rgb(0.3, 0.3, 0.3));
        }
      }
      
      columnY -= 3;
      drawColumnText(`📈 ${content.position.growthPath}`, 6, false, rgb(0.3, 0.4, 0.3));
    }
  } else if (stage === 'Interview 2' && content.secondRound) {
    // Interview 2: Manager & Technical Focus
    
    // Company Reminder
    page.drawRectangle({
      x: getX(),
      y: columnY - 15,
      width: columnWidth,
      height: 15,
      color: rgb(0.95, 0.95, 0.98),
    });
    columnY -= 5;
    drawColumnText(content.secondRound.companyReminder, 6, false, rgb(0.4, 0.4, 0.5));
    columnY -= 12;
    
    // Manager Profile
    drawColumnSection(isEnglish ? 'YOUR POTENTIAL MANAGER' : 'DEIN VORGESETZTER');
    page.drawRectangle({
      x: getX(),
      y: columnY - 35,
      width: columnWidth,
      height: 35,
      color: rgb(0.92, 0.95, 1),
    });
    columnY -= 5;
    drawColumnText(content.secondRound.managerProfile, 6.5, false, rgb(0.2, 0.3, 0.5));
    columnY -= 12;
    
    // Manager Expectations
    if (content.secondRound.managerExpectations && content.secondRound.managerExpectations.length > 0) {
      page.drawText(isEnglish ? 'What they look for:' : 'Was sie suchen:', { x: getX(), y: columnY, size: 6, font: boldFont, color: rgb(0.1, 0.3, 0.6) });
      columnY -= 8;
      for (const exp of content.secondRound.managerExpectations.slice(0, 4)) {
        drawColumnText(`→ ${exp}`, 6, false, rgb(0.2, 0.3, 0.5));
      }
    }
    
    // Technical Focus
    columnY -= 10;
    drawColumnSection(isEnglish ? 'TECHNICAL DEEP DIVE' : 'FACHLICHE VERTIEFUNG');
    if (content.secondRound.technicalFocus) {
      for (const topic of content.secondRound.technicalFocus.slice(0, 5)) {
        drawColumnText(`🎯 ${topic}`, 6, false, rgb(0.3, 0.3, 0.3));
      }
    }
    
    // Position Summary
    if (content.secondRound.positionSummary) {
      columnY -= 8;
      page.drawRectangle({
        x: getX(),
        y: columnY - 15,
        width: columnWidth,
        height: 15,
        color: rgb(0.95, 0.95, 0.98),
      });
      columnY -= 5;
      drawColumnText(`📋 ${content.secondRound.positionSummary}`, 5.5, false, rgb(0.4, 0.4, 0.5));
    }
  } else if (stage === 'Trial Day' && content.trialDay) {
    // Trial Day: Schedule, Team & Practical
    
    // Day Schedule
    drawColumnSection(isEnglish ? 'YOUR TRIAL DAY' : 'DEIN PROBETAG');
    page.drawRectangle({
      x: getX(),
      y: columnY - 40,
      width: columnWidth,
      height: 40,
      color: rgb(0.92, 0.95, 1),
    });
    columnY -= 5;
    drawColumnText(content.trialDay.daySchedule, 6.5, false, rgb(0.2, 0.3, 0.5));
    columnY -= 15;
    
    // Team
    columnY -= 8;
    drawColumnSection(isEnglish ? 'THE TEAM' : 'DAS TEAM');
    page.drawRectangle({
      x: getX(),
      y: columnY - 25,
      width: columnWidth,
      height: 25,
      color: rgb(0.9, 0.97, 0.9),
    });
    columnY -= 5;
    drawColumnText(content.trialDay.teamMembers, 6, false, rgb(0.2, 0.4, 0.2));
    columnY -= 12;
    
    // Processes to Observe
    columnY -= 8;
    drawColumnSection(isEnglish ? 'PAY ATTENTION TO' : 'WORAUF ACHTEN');
    if (content.trialDay.processesToObserve) {
      for (const process of content.trialDay.processesToObserve.slice(0, 4)) {
        drawColumnText(`👁 ${process}`, 6, false, rgb(0.3, 0.3, 0.3));
      }
    }
    
    // Practical Tasks
    columnY -= 8;
    if (content.trialDay.practicalTasks && content.trialDay.practicalTasks.length > 0) {
      page.drawText(isEnglish ? 'Possible Tasks:' : 'Mögliche Aufgaben:', { x: getX(), y: columnY, size: 6, font: boldFont, color: rgb(0.1, 0.4, 0.7) });
      columnY -= 8;
      for (const task of content.trialDay.practicalTasks.slice(0, 3)) {
        drawColumnText(`✓ ${task}`, 6, false, rgb(0.3, 0.3, 0.3));
      }
    }
  } else {
    // Fallback for any other stage - show generic content
    drawColumnSection(isEnglish ? 'PREPARATION' : 'VORBEREITUNG');
    drawColumnText(isEnglish ? 'Review all previous materials and prepare thoughtful questions.' : 'Überprüfe alle bisherigen Materialien und bereite durchdachte Fragen vor.', 7, false, rgb(0.3, 0.3, 0.3));
  }
  
  // RIGHT COLUMN - Phase-specific content & Tips
  currentColumn = 'right';
  columnY = y;
  
  // Interview 2: Expected Cases & Project Examples
  if (stage === 'Interview 2' && content.secondRound) {
    // Expected Cases
    if (content.secondRound.expectedCases && content.secondRound.expectedCases.length > 0) {
      drawColumnSection(isEnglish ? 'EXPECTED CASES' : 'MÖGLICHE CASE-FRAGEN');
      page.drawRectangle({
        x: getX(),
        y: columnY - 30,
        width: columnWidth,
        height: 30,
        color: rgb(1, 0.97, 0.9),
      });
      columnY -= 5;
      for (const caseQ of content.secondRound.expectedCases.slice(0, 3)) {
        drawColumnText(`❓ ${caseQ}`, 6, false, rgb(0.5, 0.35, 0.1));
      }
      columnY -= 8;
    }
    
    // Project Examples
    if (content.secondRound.projectExamples && content.secondRound.projectExamples.length > 0) {
      columnY -= 5;
      drawColumnSection(isEnglish ? 'EXAMPLES TO MENTION' : 'BEISPIELE NENNEN');
      page.drawRectangle({
        x: getX(),
        y: columnY - 35,
        width: columnWidth,
        height: 35,
        color: rgb(0.9, 0.97, 0.9),
      });
      columnY -= 5;
      for (const example of content.secondRound.projectExamples.slice(0, 4)) {
        drawColumnText(`→ ${example}`, 6, false, rgb(0.2, 0.4, 0.2));
      }
      columnY -= 10;
    }
  }
  
  // Trial Day: Office Etiquette, Dresscode, Lunch
  if (stage === 'Trial Day' && content.trialDay) {
    // Office Etiquette
    if (content.trialDay.officeEtiquette && content.trialDay.officeEtiquette.length > 0) {
      drawColumnSection(isEnglish ? 'OFFICE ETIQUETTE' : 'VERHALTEN IM BÜRO');
      for (const tip of content.trialDay.officeEtiquette.slice(0, 4)) {
        drawColumnText(`✓ ${tip}`, 6, false, rgb(0.3, 0.3, 0.3));
      }
      columnY -= 8;
    }
    
    // Dresscode & Lunch in two small boxes
    if (content.trialDay.dresscode || content.trialDay.lunchInfo) {
      const boxHeight = 20;
      const boxWidth = (columnWidth - 5) / 2;
      
      // Dresscode box
      if (content.trialDay.dresscode) {
        page.drawRectangle({
          x: getX(),
          y: columnY - boxHeight,
          width: boxWidth,
          height: boxHeight,
          color: rgb(0.95, 0.95, 0.98),
        });
        page.drawText('👔 Dresscode', { x: getX() + 3, y: columnY - 6, size: 5, font: boldFont, color: rgb(0.3, 0.3, 0.4) });
        const dressLines = wrapText(content.trialDay.dresscode, boxWidth - 6, 5, font);
        let dY = columnY - 12;
        for (const line of dressLines.slice(0, 2)) {
          page.drawText(line, { x: getX() + 3, y: dY, size: 5, font, color: rgb(0.4, 0.4, 0.5) });
          dY -= 6;
        }
      }
      
      // Lunch box
      if (content.trialDay.lunchInfo) {
        page.drawRectangle({
          x: getX() + boxWidth + 5,
          y: columnY - boxHeight,
          width: boxWidth,
          height: boxHeight,
          color: rgb(0.95, 0.95, 0.98),
        });
        page.drawText('🍽️ Mittag', { x: getX() + boxWidth + 8, y: columnY - 6, size: 5, font: boldFont, color: rgb(0.3, 0.3, 0.4) });
        const lunchLines = wrapText(content.trialDay.lunchInfo, boxWidth - 6, 5, font);
        let lY = columnY - 12;
        for (const line of lunchLines.slice(0, 2)) {
          page.drawText(line, { x: getX() + boxWidth + 8, y: lY, size: 5, font, color: rgb(0.4, 0.4, 0.5) });
          lY -= 6;
        }
      }
      columnY -= boxHeight + 8;
    }
  }
  
  drawColumnSection(isEnglish ? `TIPS FOR ${stage.toUpperCase()}` : `TIPPS FÜR ${stage.toUpperCase()}`);
  
  // What to expect
  page.drawRectangle({
    x: getX(),
    y: columnY - 20,
    width: columnWidth,
    height: 20,
    color: rgb(0.95, 0.97, 1),
  });
  columnY -= 5;
  drawColumnText(content.interviewPrep.whatToExpect, 6, false, rgb(0.2, 0.3, 0.5));
  columnY -= 8;
  
  // Tips
  for (const tip of content.interviewPrep.tips.slice(0, 5)) {
    drawColumnText(`💡 ${tip}`, 6, false, rgb(0.3, 0.3, 0.3));
    columnY -= 1;
  }
  
  // Body Language
  if (content.interviewPrep.bodyLanguage.length > 0) {
    columnY -= 5;
    page.drawRectangle({
      x: getX(),
      y: columnY - 22,
      width: columnWidth,
      height: 22,
      color: rgb(0.97, 0.94, 0.98),
    });
    columnY -= 5;
    page.drawText(isEnglish ? 'Body Language:' : 'Körpersprache:', { x: getX() + 3, y: columnY, size: 6, font: boldFont, color: rgb(0.4, 0.2, 0.5) });
    columnY -= 8;
    for (const item of content.interviewPrep.bodyLanguage.slice(0, 2)) {
      drawColumnText(`👁 ${item}`, 5.5, false, rgb(0.4, 0.3, 0.5), 3);
    }
    columnY -= 3;
  }
  
  // Do's & Don'ts
  columnY -= 5;
  const dosY = columnY;
  const halfCol = (columnWidth - 5) / 2;
  
  // Do's box
  page.drawRectangle({
    x: getX(),
    y: columnY - 40,
    width: halfCol,
    height: 40,
    color: rgb(0.9, 0.97, 0.9),
  });
  page.drawText("✓ Do's", { x: getX() + 3, y: columnY - 8, size: 6, font: boldFont, color: rgb(0.2, 0.5, 0.2) });
  let doY = columnY - 16;
  for (const item of content.interviewPrep.dosAndDonts.dos.slice(0, 3)) {
    const lines = wrapText(item, halfCol - 8, 5, font);
    for (const line of lines) {
      page.drawText(line, { x: getX() + 5, y: doY, size: 5, font, color: rgb(0.2, 0.4, 0.2) });
      doY -= 6;
    }
  }
  
  // Don'ts box
  page.drawRectangle({
    x: getX() + halfCol + 5,
    y: dosY - 40,
    width: halfCol,
    height: 40,
    color: rgb(1, 0.92, 0.92),
  });
  page.drawText("✗ Don'ts", { x: getX() + halfCol + 8, y: dosY - 8, size: 6, font: boldFont, color: rgb(0.6, 0.2, 0.2) });
  let dontY = dosY - 16;
  for (const item of content.interviewPrep.dosAndDonts.donts.slice(0, 3)) {
    const lines = wrapText(item, halfCol - 8, 5, font);
    for (const line of lines) {
      page.drawText(line, { x: getX() + halfCol + 8, y: dontY, size: 5, font, color: rgb(0.5, 0.2, 0.2) });
      dontY -= 6;
    }
  }
  
  columnY -= 48;
  
  // Questions to Ask
  drawColumnSection(isEnglish ? 'QUESTIONS TO ASK' : 'FRAGEN STELLEN');
  for (const q of content.yourPreparation.questionsToAsk.slice(0, 4)) {
    drawColumnText(`? ${q}`, 6, false, rgb(0.3, 0.3, 0.3));
  }
  
  // Checklist
  columnY -= 8;
  drawColumnSection(isEnglish ? 'CHECKLIST' : 'CHECKLISTE');
  page.drawRectangle({
    x: getX(),
    y: columnY - 35,
    width: columnWidth,
    height: 35,
    color: rgb(0.97, 0.97, 0.97),
  });
  columnY -= 5;
  for (const item of content.yourPreparation.checklist.slice(0, 4)) {
    drawColumnText(`☐ ${item}`, 6, false, rgb(0.3, 0.3, 0.3), 3);
  }
  
  // Follow-up info
  columnY -= 8;
  drawColumnText(content.yourPreparation.followUpInfo, 6, false, rgb(0.4, 0.4, 0.4));
  
  // Footer Page 2
  page.drawText(isEnglish ? 'Page 2 of 2 • Good luck! 🍀' : 'Seite 2 von 2 • Viel Erfolg! 🍀', { 
    x: margin, y: margin - 5, size: 6, font, color: rgb(0.6, 0.6, 0.6) 
  });
  
  return await pdfDoc.save();
}

function getStageContext(stage: string, isEnglish: boolean): string {
  if (isEnglish) {
    switch (stage) {
      case 'Interview 1':
        return `FIRST INTERVIEW - GETTING TO KNOW EACH OTHER:
This is the first meeting. The candidate knows little about the company yet.

CONTENT STRUCTURE:
- Fill "company" section COMPLETELY and THOROUGHLY (briefing, culture, values, highlights, teamInfo)
- Fill "position" section COMPLETELY (overview, dailyWork, keyPoints, growthPath)
- Focus on first impressions, motivation, and personality
- DO NOT fill "secondRound" or "trialDay" - leave them null/undefined

The candidate needs detailed company and position information as this is their first exposure.`;
      case 'Interview 2':
        return `SECOND INTERVIEW - GOING INTO DETAILS:
The candidate has already completed Interview 1 and knows the basics about the company.

CONTENT STRUCTURE:
- DO NOT fill "company" and "position" sections (candidate already knows this!)
- Fill "secondRound" section COMPLETELY:
  * companyReminder: One brief sentence reminder about the company
  * managerProfile: Information about who they might meet (based on industry/position)
  * managerExpectations: 3-4 things managers typically look for
  * technicalFocus: 4-5 technical/professional topics that will be discussed in depth
  * expectedCases: 3-4 possible case questions or problem-solving scenarios
  * projectExamples: 3-4 examples from the candidate's experience they should mention
  * positionSummary: Brief 1-2 sentence summary of the role (as reminder)

Focus on technical depth, specific experiences, and meeting the potential supervisor.`;
      case 'Trial Day':
        return `TRIAL DAY - EXPERIENCING TEAM & PROCESSES:
The candidate has completed Interview 1 & 2 - they already know the company and position well.

CONTENT STRUCTURE:
- DO NOT fill "company" and "position" sections (candidate knows all this!)
- DO NOT fill "secondRound" section
- Fill "trialDay" section COMPLETELY:
  * daySchedule: What a typical trial day looks like, timeline
  * teamMembers: Information about the team they will meet
  * processesToObserve: 4-5 things to pay attention to during the day
  * practicalTasks: 3-4 possible tasks they might work on
  * officeEtiquette: 4-5 tips for professional behavior in the office
  * dresscode: What to wear (usually more casual than interviews)
  * lunchInfo: Lunch break info, social aspects

Focus on practical tips, team integration, demonstrating skills hands-on, and showing initiative.`;
      default:
        return `Prepare for the ${stage} phase appropriately.`;
    }
  }
  
  // German versions
  switch (stage) {
    case 'Interview 1':
      return `ERSTES INTERVIEW - GEGENSEITIGES KENNENLERNEN:
Dies ist das erste Treffen. Der Kandidat weiss noch wenig über das Unternehmen.

INHALTSSTRUKTUR:
- Fülle "company" Abschnitt VOLLSTÄNDIG und AUSFÜHRLICH aus (briefing, culture, values, highlights, teamInfo)
- Fülle "position" Abschnitt VOLLSTÄNDIG aus (overview, dailyWork, keyPoints, growthPath)
- Fokus auf Ersteindruck, Motivation und Persönlichkeit
- NICHT "secondRound" oder "trialDay" ausfüllen - leer lassen

Der Kandidat braucht detaillierte Firmen- und Positionsinformationen, da dies sein erster Kontakt ist.`;
    case 'Interview 2':
      return `ZWEITES INTERVIEW - INS DETAIL GEHEN:
Der Kandidat hat Interview 1 bereits absolviert und kennt die Basics über das Unternehmen.

INHALTSSTRUKTUR:
- NICHT "company" und "position" Abschnitte ausfüllen (kennt der Kandidat schon!)
- Fülle "secondRound" Abschnitt VOLLSTÄNDIG aus:
  * companyReminder: Ein kurzer Satz Erinnerung an das Unternehmen
  * managerProfile: Infos zum potenziellen Vorgesetzten (basierend auf Branche/Position)
  * managerExpectations: 3-4 Dinge die Führungskräfte typischerweise suchen
  * technicalFocus: 4-5 fachliche Themen die vertieft werden
  * expectedCases: 3-4 mögliche Case-Fragen oder Problemlösungs-Szenarien
  * projectExamples: 3-4 Beispiele aus der Erfahrung des Kandidaten die er nennen sollte
  * positionSummary: Kurze 1-2 Satz Zusammenfassung der Rolle (als Erinnerung)

Fokus auf fachliche Tiefe, konkrete Erfahrungen und Kennenlernen des Vorgesetzten.`;
    case 'Trial Day':
      return `PROBETAG - TEAM & PROZESSE ERLEBEN:
Der Kandidat hat Interview 1 & 2 absolviert - er kennt Firma und Position bereits gut.

INHALTSSTRUKTUR:
- NICHT "company" und "position" Abschnitte ausfüllen (weiss der Kandidat alles!)
- NICHT "secondRound" Abschnitt ausfüllen
- Fülle "trialDay" Abschnitt VOLLSTÄNDIG aus:
  * daySchedule: Wie sieht ein typischer Probetag aus, Zeitplan
  * teamMembers: Infos über das Team das er kennenlernen wird
  * processesToObserve: 4-5 Dinge worauf er im Laufe des Tages achten soll
  * practicalTasks: 3-4 mögliche Aufgaben an denen er arbeiten könnte
  * officeEtiquette: 4-5 Tipps für professionelles Verhalten im Büro
  * dresscode: Was anziehen (meist lockerer als bei Interviews)
  * lunchInfo: Mittagspause, soziale Aspekte

Fokus auf praktische Tipps, Team-Integration, Skills praktisch zeigen und Initiative.`;
    default:
      return `Bereite dich auf ${stage} entsprechend vor.`;
  }
}

function getFallbackContentV3(stage: string, candidate: any, job: any, client: any, matchData: any, recruiterName: string, recruiterContact: string, isEnglish: boolean): PrepContentV3 {
  const name = candidate?.name?.split(' ')[0] || 'Kandidat';
  
  if (isEnglish) {
    return {
      introduction: {
        greeting: `Hello ${name},`,
        documentPurpose: `This handout was created specifically for you to optimally prepare for your upcoming ${stage} at ${client?.name || 'the company'}.`,
        howToUse: ['Read through completely (15-20 min)', 'Note key points', 'Prepare your own questions', 'Contact recruiter if questions arise'],
        recruiterNote: 'I believe in you! You have been selected because you fit this position well.',
        recruiterContact: recruiterContact
      },
      candidateProfile: {
        matchReason: `You were selected because your profile matches the requirements well. Your experience and skills make you an interesting candidate.`,
        strengths: ['Relevant industry experience', 'Strong technical skills', 'Good communication abilities', 'Team player mentality'],
        relevantExperience: 'Your career shows relevant experience that you can apply in this role.'
      },
      weaknessesAndGaps: [
        { gap: 'Limited experience in specific area', situation: 'May come up when discussing requirements', mitigation: 'Emphasize willingness to learn and transferable skills' }
      ],
      company: {
        briefing: `${client?.name || 'The company'} operates in the ${client?.industry || 'industry'} sector and is known for quality and innovation.`,
        culture: 'Professional but collegial atmosphere with focus on teamwork.',
        values: ['Quality', 'Teamwork', 'Innovation'],
        highlights: ['Growing company', 'Strong market position', 'Good work-life balance', 'Development opportunities'],
        teamInfo: 'You would be joining a motivated team.'
      },
      position: {
        overview: `The ${job?.title || 'position'} is a key role in the team.`,
        dailyWork: 'Daily work includes project work, team collaboration, and client interaction.',
        keyPoints: ['Team collaboration', 'Technical expertise', 'Project responsibility', 'Client contact'],
        growthPath: 'Career development and advancement opportunities available.'
      },
      interviewPrep: {
        whatToExpect: `In ${stage}, expect a mix of behavioral and technical questions.`,
        tips: ['Research the company', 'Prepare concrete examples', 'Ask thoughtful questions', 'Be authentic', 'Arrive on time'],
        bodyLanguage: ['Maintain eye contact', 'Confident posture', 'Friendly expression'],
        dosAndDonts: {
          dos: ['Be prepared', 'Show interest', 'Ask questions', 'Be honest'],
          donts: ['Be late', 'Speak negatively about past employers', 'Be unprepared', 'Interrupt']
        }
      },
      yourPreparation: {
        questionsToAsk: ['What does success look like?', 'How is the team structured?', 'What are immediate priorities?'],
        checklist: ['Print CV copies', 'Plan route', 'Prepare outfit', 'Get good sleep', 'Eat breakfast'],
        followUpInfo: 'After the interview, you will hear from us within a few days.'
      }
    };
  }
  
  return {
    introduction: {
      greeting: `Hallo ${name},`,
      documentPurpose: `Dieses Handout wurde speziell für dich erstellt, um dich optimal auf dein bevorstehendes ${stage} bei ${client?.name || 'dem Unternehmen'} vorzubereiten.`,
      howToUse: ['Komplett durchlesen (15-20 Min)', 'Wichtige Punkte notieren', 'Eigene Fragen vorbereiten', 'Bei Unklarheiten Recruiter kontaktieren'],
      recruiterNote: 'Ich glaube an dich! Du wurdest ausgewählt, weil du gut zu dieser Position passt.',
      recruiterContact: recruiterContact
    },
    candidateProfile: {
      matchReason: `Du wurdest ausgewählt, weil dein Profil gut zu den Anforderungen passt. Deine Erfahrung und Skills machen dich zu einem interessanten Kandidaten.`,
      strengths: ['Relevante Branchenerfahrung', 'Starke fachliche Fähigkeiten', 'Gute Kommunikationsfähigkeiten', 'Teamfähigkeit'],
      relevantExperience: 'Dein Werdegang zeigt relevante Erfahrung, die du in dieser Rolle einbringen kannst.'
    },
    weaknessesAndGaps: [
      { gap: 'Begrenzte Erfahrung in spezifischem Bereich', situation: 'Könnte bei Diskussion der Anforderungen aufkommen', mitigation: 'Betone Lernbereitschaft und übertragbare Skills' }
    ],
    company: {
      briefing: `${client?.name || 'Das Unternehmen'} ist in der ${client?.industry || 'Branche'} tätig und bekannt für Qualität und Innovation.`,
      culture: 'Professionelle aber kollegiale Atmosphäre mit Fokus auf Teamarbeit.',
      values: ['Qualität', 'Teamwork', 'Innovation'],
      highlights: ['Wachsendes Unternehmen', 'Starke Marktposition', 'Gute Work-Life-Balance', 'Entwicklungsmöglichkeiten'],
      teamInfo: 'Du würdest in ein motiviertes Team kommen.'
    },
    position: {
      overview: `Die ${job?.title || 'Position'} ist eine Schlüsselrolle im Team.`,
      dailyWork: 'Die tägliche Arbeit umfasst Projektarbeit, Teamkollaboration und Kundenkontakt.',
      keyPoints: ['Teamarbeit', 'Fachliche Expertise', 'Projektverantwortung', 'Kundenkontakt'],
      growthPath: 'Karriereentwicklung und Aufstiegsmöglichkeiten vorhanden.'
    },
    interviewPrep: {
      whatToExpect: `Im ${stage} erwarten dich eine Mischung aus Verhaltens- und Fachfragen.`,
      tips: ['Firma recherchieren', 'Konkrete Beispiele vorbereiten', 'Durchdachte Fragen stellen', 'Authentisch sein', 'Pünktlich sein'],
      bodyLanguage: ['Blickkontakt halten', 'Selbstbewusste Haltung', 'Freundlicher Ausdruck'],
      dosAndDonts: {
        dos: ['Vorbereitet sein', 'Interesse zeigen', 'Fragen stellen', 'Ehrlich sein'],
        donts: ['Zu spät kommen', 'Negativ über Ex-Arbeitgeber sprechen', 'Unvorbereitet sein', 'Unterbrechen']
      }
    },
    yourPreparation: {
      questionsToAsk: ['Wie sieht Erfolg in dieser Rolle aus?', 'Wie ist das Team aufgestellt?', 'Was sind die unmittelbaren Prioritäten?'],
      checklist: ['Lebenslauf-Kopien drucken', 'Route planen', 'Outfit vorbereiten', 'Gut schlafen', 'Frühstücken'],
      followUpInfo: 'Nach dem Gespräch hörst du innerhalb weniger Tage von uns.'
    }
  };
}

function wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
  if (!text) return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}
