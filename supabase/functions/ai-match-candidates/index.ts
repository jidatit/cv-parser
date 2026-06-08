import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-language',
};

// Configuration
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 3000;
const MIN_JOB_QUALITY_SCORE = 60;
const RETRY_DELAYS = [30000, 60000, 120000];

// ============================================================
// COMPANY NAME NORMALIZATION & EMPLOYER CONFLICT
// ============================================================

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*(ag|gmbh|sa|ltd|inc|gruppe|group|holding|co|kg|ohg|se|plc|corp|corporation|llc|llp)\s*/gi, '')
    .replace(/[.,\-|&()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const IGNORE_WORDS = new Set([
  'und', 'and', 'the', 'de', 'von', 'van', 'der', 'die', 'das',
  'für', 'for', 'in', 'im', 'zu', 'zur', 'zum', 'of', 'la', 'le',
  'ingenieure', 'ingenieur', 'berater', 'beratung', 'consulting',
  'services', 'service', 'solutions', 'technology', 'technologies'
]);

// Generic words that cause false positive company matches (Müller-Problem)
const GENERIC_COMPANY_WORDS = new Set([
  'bau', 'swiss', 'tech', 'partner', 'management', 'projekt', 'plan',
  'construction', 'group', 'holding', 'system', 'systems', 'global',
  'international', 'engineering', 'design', 'concept', 'energy',
]);

function hasSignificantWordMatch(name1: string, name2: string): boolean {
  const words1 = name1.split(' ').filter(w => w.length >= 5 && !IGNORE_WORDS.has(w) && !GENERIC_COMPANY_WORDS.has(w));
  const words2 = name2.split(' ').filter(w => w.length >= 5 && !IGNORE_WORDS.has(w) && !GENERIC_COMPANY_WORDS.has(w));
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || (w1.length >= 5 && w2.startsWith(w1)) || (w2.length >= 5 && w1.startsWith(w2))) {
        return true;
      }
    }
  }
  return false;
}

function hasEmployerConflict(workExperience: any[], clientName: string): boolean {
  if (!clientName || !workExperience || workExperience.length === 0) return false;
  const normalizedClient = normalizeCompanyName(clientName);
  if (normalizedClient.length < 2) return false;

  for (const exp of workExperience) {
    if (!exp.company) continue;
    const normalizedExp = normalizeCompanyName(exp.company);
    if (normalizedExp.length < 2) continue;
    if (normalizedExp.includes(normalizedClient) || normalizedClient.includes(normalizedExp) || hasSignificantWordMatch(normalizedExp, normalizedClient)) {
      return true;
    }
  }
  return false;
}

// ============================================================
// SENIORITY LEVEL DETERMINATION (Swiss Standard, 6-Level)
// ============================================================

interface SeniorityResult {
  level: number;
  reason: string;
  yearsOnCurrentLevel?: number;
}

const TITLE_LEVEL_MAP: Record<number, string[]> = {
  1: ['praktikant', 'lehrling', 'junior', 'trainee', 'auszubildender', 'azubi', 'intern', 'apprentice', 'werkstudent'],
  2: ['sachbearbeiter', 'assistenz', 'mitarbeiter', 'angestellter', 'clerk', 'assistant', 'associate', 'employee', 'facharbeiter', 'monteur', 'techniker'],
  3: ['buchhalter', 'treuhänder', 'spezialist', 'senior', 'fachkraft', 'experte', 'projektleiter', 'specialist', 'expert', 'accountant', 'planer', 'ingenieur', 'engineer', 'berater', 'consultant', 'bauführer', 'polier', 'meister'],
  4: ['teamleiter', 'gruppenleiter', 'supervisor', 'team lead', 'group lead', 'teamlead', 'stellvertretender leiter', 'stv. leiter'],
  5: ['abteilungsleiter', 'manager', 'head of', 'bereichsleiter', 'niederlassungsleiter', 'department head', 'division lead', 'leiter', 'gesamtleiter', 'betriebsleiter'],
  6: ['direktor', 'geschäftsführer', 'ceo', 'cfo', 'cto', 'coo', 'vorstand', 'vr', 'director', 'managing director', 'partner', 'inhaber', 'geschäftsleitung'],
};

const EDUCATION_ANCHORS: { keywords: string[]; minLevel: number; label: string }[] = [
  { keywords: ['eidg. diplom', 'eidgenössisches diplom', 'hfp', 'höhere fachprüfung'], minLevel: 4, label: 'Eidg. Diplom (HFP)' },
  { keywords: ['eidg. fachausweis', 'eidgenössischer fachausweis', 'berufsprüfung', 'bp'], minLevel: 3, label: 'Eidg. Fachausweis (BP)' },
  { keywords: ['dipl. techniker hf', 'höhere fachschule', 'hf', 'techniker hf', 'dipl. hf'], minLevel: 3, label: 'Dipl. HF' },
  { keywords: ['master', 'mba', 'msc', 'ma ', 'mag.', 'emba', 'mas ', 'cas ', 'das '], minLevel: 3, label: 'Master/MBA' },
  { keywords: ['bachelor', 'bsc', 'ba ', 'b.a.', 'b.sc.', 'fh', 'fachhochschule', 'universität', 'uni ', 'eth'], minLevel: 2, label: 'Bachelor/FH/Uni' },
  { keywords: ['efz', 'lehre', 'berufslehre', 'lehrabschluss', 'berufsausbildung', 'grundbildung'], minLevel: 1, label: 'EFZ/Lehre' },
];

function getTitleLevel(title: string): number {
  if (!title) return 0;
  const lower = title.toLowerCase();
  for (let level = 6; level >= 1; level--) {
    if (TITLE_LEVEL_MAP[level].some(kw => lower.includes(kw))) return level;
  }
  return 0;
}

function getEducationLevel(education: any[]): { level: number; label: string } {
  if (!education || education.length === 0) return { level: 0, label: '' };
  let bestLevel = 0;
  let bestLabel = '';
  for (const edu of education) {
    const searchText = [edu.degree, edu.field, edu.institution].filter(Boolean).join(' ').toLowerCase();
    for (const anchor of EDUCATION_ANCHORS) {
      if (anchor.keywords.some(kw => searchText.includes(kw))) {
        if (anchor.minLevel > bestLevel) {
          bestLevel = anchor.minLevel;
          bestLabel = anchor.label;
        }
        break;
      }
    }
  }
  return { level: bestLevel, label: bestLabel };
}

function calculateTotalYears(workExperience: any[]): number {
  if (!workExperience || workExperience.length === 0) return 0;
  let totalMonths = 0;
  const now = new Date();
  for (const exp of workExperience) {
    const startStr = exp.startDate || exp.start_date;
    const endStr = exp.endDate || exp.end_date;
    if (!startStr) continue;
    let startDate: Date | null = null;
    let endDate: Date = now;
    try {
      const parsed = new Date(startStr);
      if (!isNaN(parsed.getTime())) startDate = parsed;
    } catch { /* ignore */ }
    if (!startDate) {
      const yearMatch = startStr.match(/(\d{4})/);
      if (yearMatch) startDate = new Date(parseInt(yearMatch[1]), 0);
    }
    if (!startDate) continue;
    if (endStr && !['present', 'heute', 'aktuell', 'current', 'laufend', 'bis heute'].some(kw => endStr.toLowerCase().includes(kw))) {
      try {
        const parsed = new Date(endStr);
        if (!isNaN(parsed.getTime())) endDate = parsed;
      } catch { /* ignore */ }
      if (endDate.getTime() === now.getTime()) {
        const yearMatch = endStr.match(/(\d{4})/);
        if (yearMatch) endDate = new Date(parseInt(yearMatch[1]), 11);
      }
    }
    totalMonths += Math.max(0, (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()));
  }
  return Math.round(totalMonths / 12);
}

function estimateYearsOnCurrentLevel(workExperience: any[], currentLevel: number): number {
  if (!workExperience || workExperience.length === 0) return 0;
  const now = new Date();
  const sorted = [...workExperience].sort((a, b) => {
    const aDate = a.startDate || a.start_date || '';
    const bDate = b.startDate || b.start_date || '';
    return bDate.localeCompare(aDate);
  });
  for (const exp of sorted) {
    const title = exp.position || exp.role_title || '';
    const expLevel = getTitleLevel(title);
    if (expLevel === 0 || expLevel === currentLevel) {
      const startStr = exp.startDate || exp.start_date;
      if (!startStr) continue;
      let startDate: Date | null = null;
      try {
        const parsed = new Date(startStr);
        if (!isNaN(parsed.getTime())) startDate = parsed;
      } catch { /* ignore */ }
      if (!startDate) {
        const yearMatch = startStr.match(/(\d{4})/);
        if (yearMatch) startDate = new Date(parseInt(yearMatch[1]), 0);
      }
      if (startDate) {
        return Math.round((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
      }
      break;
    } else {
      break;
    }
  }
  return 0;
}

function determineCandidateLevel(candidate: any): SeniorityResult {
  const reasons: string[] = [];
  const eduResult = getEducationLevel(candidate.education || []);
  let eduLevel = eduResult.level;
  if (eduLevel > 0) reasons.push(eduResult.label);

  const totalYears = calculateTotalYears(candidate.work_experience || []);

  // Master/MBA Boost: With >3 years experience, upgrade to L4
  if (eduResult.label === 'Master/MBA' && totalYears > 3) {
    eduLevel = Math.max(eduLevel, 4);
    reasons.push('Master/MBA + >3J → L4 Boost');
  }

  let expLevel = 0;
  if (totalYears > 0) reasons.push(`${totalYears}J Erfahrung`);

  const hasLeadershipTitle = (candidate.work_experience || []).some((exp: any) => {
    const title = (exp.position || exp.role_title || '').toLowerCase();
    return ['leiter', 'lead', 'manager', 'head', 'direktor', 'vorstand', 'geschäftsführer'].some(kw => title.includes(kw));
  });

  if (totalYears > 15 && hasLeadershipTitle) expLevel = 5;
  else if (totalYears > 10) expLevel = 3;
  else if (totalYears > 5) expLevel = Math.max(expLevel, 2);

  const titleLevel = getTitleLevel(candidate.position || '');
  const finalLevel = Math.max(eduLevel, expLevel, titleLevel, 1);
  const yearsOnCurrent = estimateYearsOnCurrentLevel(candidate.work_experience || [], finalLevel);

  const levelLabels: Record<number, string> = {
    1: 'Junior/Einstieg', 2: 'Sachbearbeiter/Facharbeiter', 3: 'Spezialist/Senior',
    4: 'Teamleiter/Gruppenleiter', 5: 'Abteilungsleiter/Manager', 6: 'Geschäftsleitung/Direktor',
  };

  return {
    level: finalLevel,
    reason: `L${finalLevel} (${levelLabels[finalLevel] || 'Unbekannt'}): ${reasons.join(' + ') || 'Titel-basiert'}`,
    yearsOnCurrentLevel: yearsOnCurrent,
  };
}

function determineJobLevel(job: any): SeniorityResult {
  const reasons: string[] = [];
  const titleLevel = getTitleLevel(job.title || '');

  let expFieldLevel = 0;
  const expLevel = (job.experience_level || '').toLowerCase();
  if (expLevel.includes('junior') || expLevel.includes('entry')) expFieldLevel = 1;
  else if (expLevel.includes('mid') || expLevel.includes('mittel')) expFieldLevel = 2;
  else if (expLevel.includes('senior') || expLevel.includes('erfahren')) expFieldLevel = 3;
  else if (expLevel.includes('lead') || expLevel.includes('leitung')) expFieldLevel = 4;
  else if (expLevel.includes('director') || expLevel.includes('management')) expFieldLevel = 5;

  let reqLevel = 0;
  const reqText = (job.requirements || '').toLowerCase();
  if (reqText.includes('eidg. fachausweis') || reqText.includes('fachausweis')) reqLevel = 3;
  if (reqText.includes('eidg. diplom') || reqText.includes('hfp')) reqLevel = Math.max(reqLevel, 4);
  if (reqText.includes('führungserfahrung') || reqText.includes('personalverantwortung')) reqLevel = Math.max(reqLevel, 4);

  const finalLevel = Math.max(titleLevel, expFieldLevel, reqLevel, 1);
  if (titleLevel > 0) reasons.push(`Titel "${job.title}"`);
  if (expFieldLevel > 0) reasons.push(`Experience-Level: ${job.experience_level}`);
  if (reqLevel > 0) reasons.push('Anforderungen');

  const levelLabels: Record<number, string> = {
    1: 'Einstieg', 2: 'Fachkraft', 3: 'Spezialist/Senior',
    4: 'Teamleitung', 5: 'Management', 6: 'Geschäftsleitung',
  };

  return {
    level: finalLevel,
    reason: `L${finalLevel} (${levelLabels[finalLevel] || '?'}): ${reasons.join(' + ') || 'Standard'}`,
  };
}

// ============================================================
// INDUSTRY DETECTION & PRE-FILTERING
// ============================================================

type IndustrySector = 'hochbau' | 'tiefbau' | 'gebaeudetechnik' | 'other';

const HOCHBAU_KEYWORDS = ['hochbau', 'wohnungsbau', 'geschäftsbau', 'industriebau', 'fassade', 'rohbau', 'ausbau', 'architektur', 'architekt'];
const TIEFBAU_KEYWORDS = ['tiefbau', 'strassenbau', 'tunnelbau', 'brückenbau', 'wasserbau', 'kanalbau', 'leitungsbau', 'spezialtiefbau'];
const GEBAEUDETECHNIK_KEYWORDS = ['hlks', 'heizung', 'lüftung', 'klima', 'sanitär', 'elektro', 'gebäudeautomation', 'haustechnik', 'installateur', 'servicetechniker'];

function detectSector(texts: string[]): IndustrySector {
  const combined = texts.filter(Boolean).join(' ').toLowerCase();
  const hasHochbau = HOCHBAU_KEYWORDS.some(kw => combined.includes(kw));
  const hasTiefbau = TIEFBAU_KEYWORDS.some(kw => combined.includes(kw));
  const hasGT = GEBAEUDETECHNIK_KEYWORDS.some(kw => combined.includes(kw));
  if (hasGT) return 'gebaeudetechnik';
  if (hasTiefbau && !hasHochbau) return 'tiefbau';
  if (hasHochbau && !hasTiefbau) return 'hochbau';
  return 'other';
}

function areSectorsCompatible(candidateSector: IndustrySector, jobSector: IndustrySector, candidateLevel: number): boolean {
  if (candidateSector === 'other' || jobSector === 'other') return true;
  if (candidateSector === jobSector) return true;
  // Bau vs Gebäudetechnik: L3+ allowed with penalty (handled in prompt), L1-L2 strictly incompatible
  if ((candidateSector !== 'gebaeudetechnik' && jobSector === 'gebaeudetechnik') ||
      (candidateSector === 'gebaeudetechnik' && jobSector !== 'gebaeudetechnik')) {
    if (candidateLevel >= 3) return true; // Allow for L3+ (prompt applies 0.75 multiplier)
    return false;
  }
  // Hochbau vs Tiefbau: compatible only for L3+
  if (candidateLevel >= 3) return true;
  return false;
}

// ============================================================
// HAVERSINE DISTANCE (for fallback when no commute cache)
// ============================================================

const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseMaxCommuteKm(maxCommute: string | null | undefined): number | null {
  if (!maxCommute) return null;
  const match = maxCommute.match(/(\d+)/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return value > 0 ? value : null;
}

// ============================================================
// COMMUTE PRE-FILTERING
// ============================================================

function parseMinutes(durationStr: string): number | null {
  if (!durationStr) return null;
  const lower = durationStr.toLowerCase();
  let totalMin = 0;
  const hourMatch = lower.match(/(\d+)\s*h/);
  const minMatch = lower.match(/(\d+)\s*min/);
  if (hourMatch) totalMin += parseInt(hourMatch[1]) * 60;
  if (minMatch) totalMin += parseInt(minMatch[1]);
  if (totalMin === 0 && !hourMatch && !minMatch) return null;
  return totalMin;
}

function parseMaxCommute(maxCommute: string): number | null {
  if (!maxCommute) return null;
  const match = maxCommute.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function getToleranceLimit(maxMin: number): number {
  if (maxMin <= 20) return maxMin * 1.30;
  if (maxMin <= 35) return maxMin * 1.25;
  if (maxMin <= 60) return maxMin * 1.15;
  return maxMin * 1.10;
}

// ============================================================
// WORK EXPERIENCE COMPRESSION
// ============================================================

function compressWorkExperience(workExp: any[]): any[] {
  if (!workExp || workExp.length === 0) return [];
  return workExp.map((exp, index) => {
    const startStr = exp.startDate || exp.start_date;
    const endStr = exp.endDate || exp.end_date;
    const isCurrent = !endStr || ['present', 'heute', 'aktuell', 'current', 'laufend', 'bis heute'].some(kw => (endStr || '').toLowerCase().includes(kw));
    
    // Calculate duration
    let duration = '';
    if (startStr) {
      let startDate: Date | null = null;
      try { const p = new Date(startStr); if (!isNaN(p.getTime())) startDate = p; } catch {}
      if (!startDate) { const m = startStr.match(/(\d{4})/); if (m) startDate = new Date(parseInt(m[1]), 0); }
      if (startDate) {
        let endDate = new Date();
        if (!isCurrent && endStr) {
          try { const p = new Date(endStr); if (!isNaN(p.getTime())) endDate = p; } catch {}
        }
        const years = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
        duration = `${years}J`;
      }
    }

    const compressed: any = {
      company: exp.company || '',
      role: exp.position || exp.role_title || '',
      duration,
      current: isCurrent,
    };

    // Keep first 200 chars of the most recent position's description for context
    if (index === 0 && exp.description) {
      compressed.context = exp.description.substring(0, 200);
    }

    return compressed;
  });
}

// ============================================================
// PRE-FILTER JOBS FOR A CANDIDATE BATCH
// ============================================================

async function preFilterJobsForBatch(
  candidates: any[],
  jobs: any[],
  commuteCache: Map<string, { auto_duration: string | null }>,
): Promise<Map<string, any[]>> {
  // Returns a map: candidateId -> filtered jobs
  const result = new Map<string, any[]>();

  for (const candidate of candidates) {
    const candidateSeniority = determineCandidateLevel(candidate);
    const candidateSector = detectSector([
      candidate.industry || '',
      candidate.position || '',
      candidate.desired_position || '',
      ...(candidate.work_experience || []).map((e: any) => e.position || e.role_title || ''),
    ]);
    const candidateWorkExp = candidate.work_experience || [];
    const maxCommuteMin = parseMaxCommute(candidate.max_commute || '');
    const willingToRelocate = (candidate.willing_to_relocate || '').toLowerCase();

    const filteredJobs = jobs.filter(job => {
      const clientName = job.clients?.name || '';

      // 1. Employer conflict
      if (clientName && hasEmployerConflict(candidateWorkExp, clientName)) return false;

      // 2. Seniority distance check
      const jobSeniority = determineJobLevel(job);
      const distance = jobSeniority.level - candidateSeniority.level;
      if (distance >= 3 || distance <= -2) return false;

      // 3. Industry compatibility
      const jobSector = detectSector([
        job.title || '',
        job.description || '',
        job.requirements || '',
      ]);
      if (!areSectorsCompatible(candidateSector, jobSector, candidateSeniority.level)) return false;

      // 4. Commute pre-filter (cache-based OR haversine fallback)
      if (maxCommuteMin && candidate.location && job.location) {
        const cacheKey = `${candidate.location.trim().toLowerCase()}|${job.location.trim().toLowerCase()}`;
        const cached = commuteCache.get(cacheKey);
        if (cached?.auto_duration) {
          const commuteMin = parseMinutes(cached.auto_duration);
          if (commuteMin !== null) {
            const tolerance = getToleranceLimit(maxCommuteMin);
            if (commuteMin > tolerance && willingToRelocate !== 'ja' && willingToRelocate !== 'yes') {
              return false; // Zone C + no relocation = definite exclusion
            }
          }
        } else {
          // Haversine fallback: filter by air distance when no cache exists
          const maxKm = parseMaxCommuteKm(candidate.max_commute);
          if (maxKm && candidate.location_lat && candidate.location_lng && job.location_lat && job.location_lng) {
            const airDistKm = haversineDistanceKm(
              candidate.location_lat, candidate.location_lng,
              job.location_lat, job.location_lng
            );
            // Air distance * 2.0 tolerance (road is always longer than air)
            if (airDistKm > maxKm * 2.0 && willingToRelocate !== 'ja' && willingToRelocate !== 'yes') {
              console.log(`[Haversine filter] ${candidate.name} → ${job.title}: ${Math.round(airDistKm)}km air > ${maxKm * 2}km limit, EXCLUDED`);
              return false;
            }
          }
        }
      }

      return true;
    });

    result.set(candidate.id, filteredJobs);
  }

  return result;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

class RateLimitError extends Error {
  constructor(message: string) { super(message); this.name = 'RateLimitError'; }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateJobQualityScore(job: any): number {
  let score = 0;
  if (job.title && job.title.trim().length > 3) score += 10;
  if (job.description && job.description.trim().length > 50) score += 25;
  else if (job.description && job.description.trim().length > 0) score += 10;
  if (job.location && job.location.trim().length > 3) score += 15;
  if (job.requirements && job.requirements.trim().length > 50) score += 20;
  else if (job.requirements && job.requirements.trim().length > 0) score += 10;
  if (job.responsibilities && job.responsibilities.trim().length > 50) score += 15;
  else if (job.responsibilities && job.responsibilities.trim().length > 0) score += 7;
  if (job.skills && job.skills.length >= 3) score += 10;
  else if (job.skills && job.skills.length > 0) score += 5;
  if (job.salary_range && job.salary_range.trim().length > 0) score += 5;
  return Math.min(score, 100);
}

function sortByPriority(candidates: any[]): any[] {
  const priorityOrder: Record<string, number> = { 'High': 0, 'Medium': 1, 'Low': 2, 'None': 3 };
  return [...candidates].sort((a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4));
}

// ============================================================
// GEMINI API
// ============================================================

async function callGeminiAPIWithRetry(prompt: string, retryCount = 0): Promise<string> {
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_GEMINI_API_KEY is not configured');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error: ${response.status}`, errorText);
      if (response.status === 429) {
        if (retryCount < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[retryCount];
          console.log(`Rate limit hit, retrying in ${delay/1000}s (attempt ${retryCount + 1}/${RETRY_DELAYS.length})`);
          await sleep(delay);
          return callGeminiAPIWithRetry(prompt, retryCount + 1);
        }
        throw new RateLimitError('Das AI-Kontingent ist erschöpft. Bitte versuchen Sie es später erneut.');
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    throw error;
  }
}

// ============================================================
// PROMPT BUILDER (SINGLE GERMAN PROMPT — no duplicate EN)
// ============================================================

function buildMatchPrompt(candidates: any[], jobs: any[]): string {
  const candidatesForAI = candidates.map(c => {
    const seniority = determineCandidateLevel(c);
    return {
      id: c.id,
      name: c.name,
      position: c.position,
      desired_position: c.desired_position,
      location: c.location,
      skills: c.skills || [],
      experience: c.experience,
      current_salary: c.current_salary,
      desired_salary: c.desired_salary,
      workload: c.workload,
      max_commute: c.max_commute,
      willing_to_relocate: c.willing_to_relocate,
      industry: c.industry,
      // COMPRESSED: no raw education or work_experience descriptions
      work_history: compressWorkExperience(c.work_experience || []),
      seniority_level: `L${seniority.level}`,
      seniority_reason: seniority.reason,
      years_on_current_level: seniority.yearsOnCurrentLevel || 0,
    };
  });

  const jobsForAI = jobs.map(j => {
    const seniority = determineJobLevel(j);
    return {
      id: j.id,
      title: j.title,
      company: j.clients?.name || 'Unknown',
      location: j.location,
      skills: j.skills || [],
      experience_level: j.experience_level,
      salary_range: j.salary_range,
      employment_type: j.employment_type,
      description: j.description?.substring(0, 500),
      requirements: j.requirements?.substring(0, 500),
      seniority_level: `L${seniority.level}`,
      seniority_reason: seniority.reason,
    };
  });

  return `Du bist ein STRENGER Recruiting-Experte. Erstelle NUR hochqualitative Matches (>= 70%).

WICHTIGE REGELN:
1. EXPLIZITE Berufserfahrung in dem Bereich erforderlich
2. Anforderungen GENAU prüfen
3. Passende Ausbildung prüfen
4. Skills müssen übereinstimmen

5. ARBEITSWEG PRÜFEN:
   - max_commute gibt die maximale akzeptable Fahrtzeit/Distanz an
   - WICHTIG: Erfinde KEINE Fahrtzeiten! Wenn keine Commute-Daten vorliegen, bewerte den Arbeitsweg als "unbekannt" und gib einen neutralen Score (70-75)
   - Nutze NUR die Standort-Informationen zur groben Einschätzung ob die Distanz plausibel ist
   - Berechne die TOLERANZGRENZE nach dieser Staffelung:
     * max_commute <= 20min: Toleranzgrenze = max_commute × 1.30
     * max_commute 21-35min: Toleranzgrenze = max_commute × 1.25
     * max_commute 36-60min: Toleranzgrenze = max_commute × 1.15
     * max_commute > 60min: Toleranzgrenze = max_commute × 1.10

6. ARBEITSWEG-SCORING (3 Zonen):
   ZONE A — Fahrtzeit ≤ max_commute:
     → Kein Malus, volle Punktzahl.
   
   ZONE B — Fahrtzeit > max_commute UND ≤ Toleranzgrenze:
     → willing_to_relocate = "Nein": Pendel-Multiplikator = 0.85 bis 0.95
     → willing_to_relocate = "Ja": Pendel-Multiplikator = 0.92 bis 0.97
   
   ZONE C — Fahrtzeit > Toleranzgrenze:
     → willing_to_relocate = "Nein": KEIN MATCH erstellen! (Multiplikator = 0)
     → willing_to_relocate = "Ja": Pendel-Multiplikator = 0.80 bis 0.85

7. WICHTIG: Zone C + "Nein" = absoluter Ausschluss. Kein Score kann das retten.

8. SENIORITÄTS-MATCHING (VORBERECHNET - NICHT NEU BERECHNEN!):
   Jeder Kandidat und jeder Job hat ein vorberechnetes seniority_level (L1-L6).
   VERWENDE DIESE WERTE DIREKT, berechne sie NICHT neu!
   
   KARRIERE-HIERARCHIE:
   L1: Junior/Einstieg | L2: Sachbearbeiter/Facharbeiter | L3: Spezialist/Senior
   L4: Teamleiter/Gruppenleiter | L5: Abteilungsleiter/Manager | L6: Geschäftsleitung/Direktor
   
   SCORING-REGELN nach Level-Distanz (Job-Level minus Kandidat-Level):
   ✅ Distanz 0 (exakter Match): Volle Punktzahl, kein Abzug
   ✅ Distanz +1 (Aufstieg): Score × 0.85 (AUSNAHME: years_on_current_level > 4 → Score × 0.90)
   ⚠️ Distanz +2 (Stretch): Score × 0.60 — nur bei exzellenten Skills
   ❌ Distanz +3 oder mehr: KEIN MATCH erstellen!
   ⚠️ Distanz -1 (leicht überqualifiziert): Score × 0.75
   ❌ Distanz -2 oder weniger: KEIN MATCH erstellen!
   
   WICHTIG: Füge die Senioritäts-Bewertung in match_reasons ein!

9. ARBEITGEBER-KONFLIKT PRÜFEN (STRIKT - KEIN MATCH):
   - Vergleiche work_history.company mit job.company
   - Bei Match (aktuell oder früher): KEIN MATCH erstellen!

10. BRANCHEN-MATCHING (STRIKT):
    A) BAUWESEN vs. GEBÄUDETECHNIK:
       L1-L2: NIEMALS mischen! KEIN MATCH.
       L3+: Branchenwechsel ERLAUBT mit Branchen-Multiplikator = 0.75 (härter als Hochbau↔Tiefbau)
    B) HOCHBAU vs. TIEFBAU:
       L1-L2: Strikt getrennt!
       L3+: Branchenwechsel ERLAUBT mit Branchen-Multiplikator = 0.80
    C) Weitere Inkompatibilitäten (Bautechnik↔Haustechnik, etc.): KEIN MATCH

11. MULTIPLIKATIVE SCORE-BERECHNUNG:
    Score_final = Score_basis × Seniorität_Multiplikator × Pendel_Multiplikator × Branchen_Multiplikator
    Wenn EIN Multiplikator = 0: KEIN MATCH erstellen!
    Runde auf ganze Zahl.

SCORING:
- 90-100%: Perfekter Match
- 80-89%: Sehr guter Match
- 70-79%: Guter Match
- 65-69%: Grenzfall (trotzdem zurückgeben!)
- Unter 65%: NICHT MATCHEN

KANDIDATEN:
${JSON.stringify(candidatesForAI, null, 2)}

JOBS:
${JSON.stringify(jobsForAI, null, 2)}

Antworte NUR mit einem JSON-Array:
[{"candidate_id": "uuid", "job_id": "uuid", "match_score": 85, "match_reasons": ["Skills: Python, SQL", "Seniorität: L3 → L3 (exakter Match)", "Fahrtzeit: ~25min, max 30min ✓"], "missing_skills": ["BIM", "Kostenplanung"]}]

WICHTIG: "missing_skills" enthält die 1-5 wichtigsten Skills/Qualifikationen, die dem Kandidaten für den Job FEHLEN. Leeres Array wenn keine fehlen.

Bei keinen Matches: []`;
}

// ============================================================
// PARSE AI RESPONSE
// ============================================================

function parseAIResponse(aiContent: string): any[] {
  let jsonStr = aiContent.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) jsonStr = arrayMatch[0];
  try {
    const matches = JSON.parse(jsonStr);
    if (!Array.isArray(matches)) return [];
    return matches;
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    return [];
  }
}

// ============================================================
// JOB PROGRESS
// ============================================================

async function updateJobProgress(supabaseAdmin: any, jobId: string, updates: any): Promise<void> {
  const { error } = await supabaseAdmin
    .from('ai_matching_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) console.error('Error updating job progress:', error);
}

// ============================================================
// LOAD COMMUTE CACHE
// ============================================================

async function loadCommuteCache(supabaseAdmin: any): Promise<Map<string, { auto_duration: string | null }>> {
  const cache = new Map<string, { auto_duration: string | null }>();
  const { data, error } = await supabaseAdmin
    .from('commute_cache')
    .select('origin, destination, auto_duration')
    .gt('expires_at', new Date().toISOString());
  if (error) {
    console.error('Failed to load commute cache:', error);
    return cache;
  }
  for (const row of (data || [])) {
    const key = `${row.origin}|${row.destination}`;
    cache.set(key, { auto_duration: row.auto_duration });
  }
  console.log(`Loaded ${cache.size} commute cache entries`);
  return cache;
}

// ============================================================
// EMBEDDING-BASED PRE-SELECTION (Semantic Matching)
// ============================================================

async function getEmbeddingPreSelectedCandidateIds(
  supabaseAdmin: any,
  jobs: any[],
  limit: number = 100
): Promise<Set<string> | null> {
  // Get job embeddings
  const jobIds = jobs.map(j => j.id);
  const { data: jobsWithEmb, error } = await supabaseAdmin
    .from('jobs')
    .select('id, embedding')
    .in('id', jobIds)
    .not('embedding', 'is', null);

  if (error || !jobsWithEmb?.length) {
    console.log('No job embeddings available, skipping semantic pre-selection');
    return null; // Fallback: use all candidates
  }

  console.log(`Found ${jobsWithEmb.length}/${jobs.length} jobs with embeddings`);

  // For each job with an embedding, find top candidates by cosine similarity
  const candidateIds = new Set<string>();

  for (const job of jobsWithEmb) {
    try {
      // Use raw SQL via RPC for vector similarity search
      const { data: similar, error: simError } = await supabaseAdmin.rpc('match_candidates_by_embedding', {
        job_embedding: job.embedding,
        match_limit: limit,
        similarity_threshold: 0.3
      });

      if (simError) {
        console.error(`Similarity search failed for job ${job.id}:`, simError);
        continue;
      }

      for (const row of (similar || [])) {
        candidateIds.add(row.id);
      }
    } catch (e) {
      console.error(`Embedding search error for job ${job.id}:`, e);
    }
  }

  if (candidateIds.size === 0) {
    console.log('No candidates found via embedding, falling back to all candidates');
    return null;
  }

  console.log(`Embedding pre-selection: ${candidateIds.size} unique candidates across ${jobsWithEmb.length} jobs`);
  return candidateIds;
}

// ============================================================
// BACKGROUND PROCESSING
// ============================================================

async function processMatchingJob(
  jobId: string, userId: string, authHeader: string, candidateId?: string
): Promise<void> {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  try {
    // Fetch candidates
    let allCandidates: any[] | null = null;
    if (candidateId) {
      const { data, error } = await supabaseClient.from('candidates').select('*').eq('id', candidateId);
      if (error) throw new Error('Failed to fetch candidate');
      allCandidates = data;
      console.log(`Single candidate mode: ${allCandidates?.[0]?.name || candidateId}`);
    } else {
      const { data, error } = await supabaseClient.from('candidates').select('*').in('status', ['Active', 'Passive']);
      if (error) throw new Error('Failed to fetch candidates');
      allCandidates = data;
    }

    // Fetch jobs
    const { data: allJobs, error: jobsError } = await supabaseClient
      .from('jobs').select('*, clients(name)').eq('status', 'Active');
    if (jobsError) throw new Error('Failed to fetch jobs');

    const qualifiedJobs = (allJobs || []).filter(job => calculateJobQualityScore(job) >= MIN_JOB_QUALITY_SCORE);

    // EMBEDDING PRE-SELECTION: Use semantic similarity to narrow candidates
    if (!candidateId && qualifiedJobs.length > 0 && (allCandidates?.length || 0) > 50) {
      const embeddingCandidateIds = await getEmbeddingPreSelectedCandidateIds(supabaseAdmin, qualifiedJobs, 100);
      if (embeddingCandidateIds) {
        const beforeCount = allCandidates?.length || 0;
        allCandidates = (allCandidates || []).filter(c => embeddingCandidateIds.has(c.id));
        console.log(`Embedding pre-selection: ${beforeCount} → ${allCandidates.length} candidates`);
      }
    }

    // Load commute cache for pre-filtering
    const commuteCache = await loadCommuteCache(supabaseAdmin);

    // Get existing matches & placements in parallel
    const [matchesResult, placementsResult] = await Promise.all([
      supabaseClient.from('ai_matches').select('candidate_id, job_id, created_at, status').eq('user_id', userId),
      supabaseAdmin.from('placements').select('candidate_id, job_id'),
    ]);

    if (placementsResult.error) {
      console.error('CRITICAL: Failed to fetch placements:', placementsResult.error);
      throw new Error('Cannot generate matches without placement data');
    }

    const existingMatches = matchesResult.data || [];
    const existingPlacements = placementsResult.data || [];
    console.log(`Loaded ${existingPlacements.length} placements, ${existingMatches.length} existing matches`);

    // Build exclusion set
    const excludedPairsSet = new Set<string>();
    existingPlacements.forEach(p => excludedPairsSet.add(`${p.candidate_id}-${p.job_id}`));
    let rejectedCount = 0;
    existingMatches.forEach(m => {
      if (m.status === 'rejected' || m.status === 'accepted') {
        excludedPairsSet.add(`${m.candidate_id}-${m.job_id}`);
        rejectedCount++;
      }
    });
    console.log(`Excluding ${excludedPairsSet.size} pairs (${existingPlacements.length} placements + ${rejectedCount} rejected/accepted)`);

    const existingMatchMap = new Map<string, { created_at: string }>();
    existingMatches.forEach(m => {
      if (m.status === 'new') existingMatchMap.set(`${m.candidate_id}-${m.job_id}`, { created_at: m.created_at });
    });

    // Filter candidates needing match
    const candidatesNeedingMatch = (allCandidates || []).filter(candidate => {
      const hasExistingMatch = Array.from(existingMatchMap.keys()).some(key => key.startsWith(candidate.id));
      if (!hasExistingMatch) return true;
      const candidateUpdated = new Date(candidate.updated_at || candidate.created_at);
      const matchKeys = Array.from(existingMatchMap.keys()).filter(k => k.startsWith(candidate.id));
      for (const key of matchKeys) {
        const match = existingMatchMap.get(key);
        if (match && new Date(match.created_at) < candidateUpdated) return true;
      }
      return false;
    });

    const sortedCandidates = sortByPriority(candidatesNeedingMatch);

    await updateJobProgress(supabaseAdmin, jobId, {
      total_candidates: sortedCandidates.length,
      stats: {
        totalCandidates: allCandidates?.length || 0,
        candidatesToProcess: sortedCandidates.length,
        totalJobs: allJobs?.length || 0,
        qualifiedJobs: qualifiedJobs.length
      }
    });

    if (!sortedCandidates.length || !qualifiedJobs.length) {
      const reasons: string[] = [];
      if ((allCandidates?.length || 0) === 0) reasons.push('Keine aktiven Kandidaten gefunden');
      else if (sortedCandidates.length === 0) reasons.push('Alle Kandidaten bereits analysiert');
      if (qualifiedJobs.length === 0) reasons.push('Keine qualifizierten Jobs gefunden');
      await updateJobProgress(supabaseAdmin, jobId, {
        status: 'completed', progress: 100,
        message: reasons.join('. ') || 'Keine neuen Matches erforderlich',
        total_matches: existingMatches.length || 0
      });
      return;
    }

    // Process in batches
    const allNewMatches: any[] = [];
    const candidateBatches: any[][] = [];
    for (let i = 0; i < sortedCandidates.length; i += BATCH_SIZE) {
      candidateBatches.push(sortedCandidates.slice(i, i + BATCH_SIZE));
    }
    console.log(`Processing ${sortedCandidates.length} candidates in ${candidateBatches.length} batches`);

    let totalJobsFiltered = 0;

    for (let batchIndex = 0; batchIndex < candidateBatches.length; batchIndex++) {
      const batch = candidateBatches[batchIndex];
      const progress = Math.round(((batchIndex + 1) / candidateBatches.length) * 90);
      console.log(`Processing batch ${batchIndex + 1}/${candidateBatches.length}`);

      try {
        // Pre-filter jobs for this batch
        const candidateJobMap = await preFilterJobsForBatch(batch, qualifiedJobs, commuteCache);
        
        // Collect the union of all relevant jobs for this batch
        const relevantJobIds = new Set<string>();
        for (const [, jobs] of candidateJobMap) {
          for (const job of jobs) relevantJobIds.add(job.id);
        }
        const batchJobs = qualifiedJobs.filter(j => relevantJobIds.has(j.id));
        
        const filteredOut = qualifiedJobs.length - batchJobs.length;
        totalJobsFiltered += filteredOut;
        console.log(`Batch ${batchIndex + 1}: ${batchJobs.length}/${qualifiedJobs.length} jobs relevant (${filteredOut} pre-filtered)`);

        if (batchJobs.length === 0) {
          console.log(`Batch ${batchIndex + 1}: No relevant jobs, skipping Gemini call`);
          await updateJobProgress(supabaseAdmin, jobId, {
            progress, processed_candidates: (batchIndex + 1) * BATCH_SIZE,
            new_matches: allNewMatches.length,
            message: `Batch ${batchIndex + 1}/${candidateBatches.length}: Keine relevanten Jobs`
          });
          continue;
        }

        const prompt = buildMatchPrompt(batch, batchJobs);
        const aiContent = await callGeminiAPIWithRetry(prompt);
        const batchMatches = parseAIResponse(aiContent);

        const validMatches = batchMatches.filter(m => {
          if (m.match_score < 65) return false;
          const candidateExists = batch.some(c => c.id === m.candidate_id);
          const jobExists = batchJobs.some(j => j.id === m.job_id);
          if (!candidateExists || !jobExists) {
            console.log(`Skipping match with invalid IDs: candidate=${m.candidate_id}, job=${m.job_id}`);
            return false;
          }
          return true;
        });
        allNewMatches.push(...validMatches);

        await updateJobProgress(supabaseAdmin, jobId, {
          progress, processed_candidates: (batchIndex + 1) * BATCH_SIZE,
          new_matches: allNewMatches.length,
          message: `Batch ${batchIndex + 1}/${candidateBatches.length} verarbeitet...`
        });

        if (batchIndex < candidateBatches.length - 1) await sleep(BATCH_DELAY_MS);
      } catch (error) {
        console.error(`Error processing batch ${batchIndex + 1}:`, error);
        if (error instanceof RateLimitError) {
          await updateJobProgress(supabaseAdmin, jobId, {
            status: 'rate_limited',
            message: 'Rate Limit erreicht. Teilweise Ergebnisse gespeichert.',
            error: (error as Error).message
          });
          break;
        }
        continue;
      }
    }

    console.log(`Total jobs pre-filtered across all batches: ${totalJobsFiltered}`);

    // Filter excluded pairs
    const trulyNewMatches = allNewMatches.filter(m => !excludedPairsSet.has(`${m.candidate_id}-${m.job_id}`));

    // Post-validation: employer conflict safety net
    const employerValidatedMatches = trulyNewMatches.filter(match => {
      const candidate = sortedCandidates.find(c => c.id === match.candidate_id);
      const job = qualifiedJobs.find(j => j.id === match.job_id);
      if (!candidate || !job || !job.clients?.name) return true;
      if (hasEmployerConflict(candidate.work_experience || [], job.clients.name)) {
        console.log(`Blocked match: ${candidate.name} employer conflict with ${job.clients.name}`);
        return false;
      }
      return true;
    });

    console.log(`Post-filter: ${allNewMatches.length} total → ${trulyNewMatches.length} after exclusion → ${employerValidatedMatches.length} after employer check`);

    // BATCH INSERT instead of individual inserts
    const matchesToInsert = employerValidatedMatches.map(m => {
      const score = Math.min(100, Math.max(0, m.match_score));
      // Encode missing_skills into match_reasons for storage (no schema change needed)
      const reasons = [...(m.match_reasons || [])];
      if (m.missing_skills && m.missing_skills.length > 0) {
        reasons.push(`__missing_skills__:${JSON.stringify(m.missing_skills)}`);
      }
      return {
        user_id: userId,
        candidate_id: m.candidate_id,
        job_id: m.job_id,
        match_score: score,
        match_reasons: reasons,
        status: score >= 70 ? 'new' : 'review', // 65-69 = review status
      };
    });

    let insertedCount = 0;
    if (matchesToInsert.length > 0) {
      // Batch insert in chunks of 50
      const INSERT_CHUNK_SIZE = 50;
      for (let i = 0; i < matchesToInsert.length; i += INSERT_CHUNK_SIZE) {
        const chunk = matchesToInsert.slice(i, i + INSERT_CHUNK_SIZE);
        const { error: insertError, count } = await supabaseAdmin
          .from('ai_matches')
          .insert(chunk);
        if (insertError) {
          console.error(`Batch insert error (chunk ${i / INSERT_CHUNK_SIZE + 1}):`, insertError);
          // Fallback to individual inserts for this chunk
          for (const match of chunk) {
            const { error: singleError } = await supabaseAdmin.from('ai_matches').insert(match);
            if (!singleError) insertedCount++;
            else console.error(`Individual insert error (candidate=${match.candidate_id}, job=${match.job_id}):`, singleError);
          }
        } else {
          insertedCount += chunk.length;
        }
      }
      console.log(`Inserted ${insertedCount}/${matchesToInsert.length} matches`);
    }

    const { count: totalMatches } = await supabaseAdmin
      .from('ai_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    await updateJobProgress(supabaseAdmin, jobId, {
      status: 'completed', progress: 100,
      processed_candidates: sortedCandidates.length,
      new_matches: insertedCount,
      total_matches: totalMatches || 0,
      message: `${insertedCount} neue Matches erstellt. ${totalMatches || 0} insgesamt.`
    });

  } catch (error) {
    console.error('Background processing error:', error);
    await updateJobProgress(supabaseAdmin, jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================
// SERVE
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let candidateId: string | undefined;
    try {
      const body = await req.json();
      candidateId = body?.candidate_id;
    } catch { /* no body */ }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: job, error: jobError } = await supabaseAdmin
      .from('ai_matching_jobs')
      .insert({
        user_id: user.id, status: 'processing', progress: 0,
        message: candidateId ? 'Einzelanalyse wird gestartet...' : 'Analyse wird gestartet...'
      })
      .select().single();

    if (jobError || !job) throw new Error('Failed to create processing job');

    // @ts-ignore - EdgeRuntime available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processMatchingJob(job.id, user.id, authHeader, candidateId));

    return new Response(JSON.stringify({
      job_id: job.id, status: 'processing',
      message: candidateId ? 'Einzelanalyse gestartet...' : 'Matching-Analyse gestartet. Bitte warten...'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-match-candidates:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
