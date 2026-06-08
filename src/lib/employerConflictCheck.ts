export interface WorkExperience {
  company?: string;
  position?: string;
  startDate?: string;
  start_date?: string;  // DB format
  endDate?: string;
  end_date?: string;    // DB format
}

export interface EmployerConflictResult {
  hasConflict: boolean;
  isCurrentEmployer: boolean;
  matchedCompanyName: string | null;
  matchedPosition: string | null;
}

// Words to ignore in matching (too generic)
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

/**
 * Normalizes company names for comparison by removing legal suffixes
 * and special characters
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*(ag|gmbh|sa|ltd|inc|gruppe|group|holding|co|kg|ohg|se|plc|corp|corporation|llc|llp)\s*/gi, '')
    .replace(/[.,\-|&()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if two company names share significant words
 * This catches cases like "WSP Switzerland" vs "WSP | BG Ingenieure"
 */
function hasSignificantWordMatch(name1: string, name2: string): boolean {
  const words1 = name1.split(' ').filter(w => w.length >= 5 && !IGNORE_WORDS.has(w) && !GENERIC_COMPANY_WORDS.has(w));
  const words2 = name2.split(' ').filter(w => w.length >= 5 && !IGNORE_WORDS.has(w) && !GENERIC_COMPANY_WORDS.has(w));
  
  // Check if any significant word appears in both
  for (const word1 of words1) {
    for (const word2 of words2) {
      // Exact match or prefix match (at least 3 chars)
      if (word1 === word2 || 
          (word1.length >= 5 && word2.startsWith(word1)) ||
          (word2.length >= 5 && word1.startsWith(word2))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if the employment is current based on end date
 */
function isCurrentEmployment(endDate?: string): boolean {
  if (!endDate) return true; // No end date = currently employed
  
  const normalized = endDate.toLowerCase().trim();
  
  // Check for "present" indicators
  const currentIndicators = [
    'heute', 'present', 'aktuell', 'current', 'now', 
    'bis heute', 'to present', 'ongoing', 'laufend'
  ];
  
  if (currentIndicators.some(indicator => normalized.includes(indicator))) {
    return true;
  }
  
  // Check if date is in the past (format: MM/YYYY)
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  // Try MM/YYYY format
  const mmYYYY = normalized.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYYYY) {
    const [, month, year] = mmYYYY;
    const endYear = parseInt(year);
    const endMonth = parseInt(month);
    
    // If end date is in the past, not current
    if (endYear < currentYear || (endYear === currentYear && endMonth < currentMonth)) {
      return false;
    }
    return true; // End date is in future or current month
  }
  
  // Try YYYY-MM format
  const yyyyMM = normalized.match(/^(\d{4})-(\d{1,2})$/);
  if (yyyyMM) {
    const [, year, month] = yyyyMM;
    const endYear = parseInt(year);
    const endMonth = parseInt(month);
    
    if (endYear < currentYear || (endYear === currentYear && endMonth < currentMonth)) {
      return false;
    }
    return true;
  }
  
  // If we have an end date but couldn't parse it, assume not current
  return false;
}

/**
 * Checks if a candidate has an employer conflict with a given client
 * Returns conflict details if the candidate currently works or has worked
 * at the specified company
 */
export function checkEmployerConflict(
  workExperience: WorkExperience[],
  clientName: string
): EmployerConflictResult {
  if (!clientName || !workExperience || workExperience.length === 0) {
    return { 
      hasConflict: false, 
      isCurrentEmployer: false, 
      matchedCompanyName: null, 
      matchedPosition: null 
    };
  }

  const normalizedClient = normalizeCompanyName(clientName);
  
  // Skip very short normalized names to avoid false positives
  if (normalizedClient.length < 2) {
    return { 
      hasConflict: false, 
      isCurrentEmployer: false, 
      matchedCompanyName: null, 
      matchedPosition: null 
    };
  }

  for (const exp of workExperience) {
    if (!exp.company) continue;
    
    const normalizedExp = normalizeCompanyName(exp.company);
    
    // Skip very short normalized names
    if (normalizedExp.length < 2) continue;
    
    // Check for substring match in both directions
    // OR significant word match (handles "WSP Switzerland" vs "WSP | BG Ingenieure")
    const hasMatch = 
      normalizedExp.includes(normalizedClient) || 
      normalizedClient.includes(normalizedExp) ||
      hasSignificantWordMatch(normalizedExp, normalizedClient);
    
    if (hasMatch) {
      const endDate = exp.endDate || exp.end_date;
      return {
        hasConflict: true,
        isCurrentEmployer: isCurrentEmployment(endDate),
        matchedCompanyName: exp.company,
        matchedPosition: exp.position || null
      };
    }
  }

  return { 
    hasConflict: false, 
    isCurrentEmployer: false, 
    matchedCompanyName: null, 
    matchedPosition: null 
  };
}
