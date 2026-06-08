import { supabase } from "@/integrations/supabase/client";

const LEGAL_FORMS: Record<string, string> = {
  'ag': 'AG', 'gmbh': 'GmbH', 'sa': 'SA', 'se': 'SE',
  'kg': 'KG', 'ohg': 'OHG', 'ltd': 'Ltd', 'inc': 'Inc',
  'plc': 'PLC', 'llc': 'LLC', 'co': 'Co', 'corp': 'Corp',
  'gbr': 'GbR', 'ug': 'UG', 'sarl': 'SARL', 'sàrl': 'Sàrl', 'sia': 'SIA',
};

const LOWERCASE_WORDS = new Set([
  'und', 'and', 'de', 'von', 'van', 'der', 'die', 'das',
  'für', 'for', 'of', 'the', 'la', 'le', 'et', 'del',
]);

const KNOWN_ACRONYMS = new Set([
  'IT', 'HR', 'SAP', 'ERP', 'CRM', 'CEO', 'CTO', 'CFO', 'COO',
  'BIM', 'CAD', 'KV', 'QS', 'QM', 'PM', 'BI', 'AI', 'ML',
  'CNC', 'PLC', 'SPS', 'HLK', 'HVAC', 'MES', 'PLM', 'BPO',
]);

/**
 * Kapitalisiert einen Firmennamen korrekt (Rechtsformen, Akronyme, etc.)
 */
export function capitalizeCompanyName(name: string): string {
  if (!name) return '';
  return name.trim().split(/\s+/).map((word, idx) => {
    const lower = word.toLowerCase();
    if (LEGAL_FORMS[lower]) return LEGAL_FORMS[lower];
    if (KNOWN_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
    if (idx > 0 && LOWERCASE_WORDS.has(lower)) return lower;
    if (word.length <= 4 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Normalisiert einen Firmennamen für besseres Matching
 * Entfernt nur Sonderzeichen, behält aber Rechtsformen
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase()
    .replace(/\b(ag|gmbh|sa|sàrl|sarl|ltd|inc|se|kg|co|ohg|plc|llc|corp|ug|gbr|sia)\b/gi, '')
    .replace(/[.,\-+&\/\\()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wortbasiertes Fuzzy-Matching für Firmennamen.
 * Prüft ob alle signifikanten Wörter des kürzeren Namens als exakte Wörter
 * im längeren Namen vorkommen. Verhindert false positives wie "Brugg Lifting" → "Ruggli AG".
 */
export function fuzzyCompanyMatch(nameA: string, nameB: string): boolean {
  const wordsA = normalizeCompanyName(nameA).split(/\s+/).filter(w => w.length >= 3);
  const wordsB = normalizeCompanyName(nameB).split(/\s+/).filter(w => w.length >= 3);
  
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  if (wordsA.length < 2 || wordsB.length < 2) return false;
  
  // The shorter word list must be fully contained in the longer one
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  const longerSet = new Set(longer);
  
  return shorter.every(word => longerSet.has(word));
}

/**
 * Sucht nach einer Firma in der Datenbank oder erstellt sie automatisch
 * @param companyName Name der Firma
 * @param userId ID des Benutzers
 * @returns client_id der gefundenen oder erstellten Firma, oder null bei Fehler
 */
export async function matchOrCreateCompany(
  companyName: string, 
  userId: string
): Promise<string | null> {
  if (!companyName?.trim()) return null;

  try {
    // Normalisiere den Eingabe-Namen
    const normalizedInput = normalizeCompanyName(companyName);
    
    // Hole alle Firmen des Users (für besseres Matching)
    const { data: existingClients, error: searchError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', userId);

    if (searchError) {
      console.error('Error searching for companies:', searchError);
      return null;
    }

    // Suche nach exakter Übereinstimmung (normalisiert)
    if (existingClients && existingClients.length > 0) {
      for (const client of existingClients) {
        const normalizedExisting = normalizeCompanyName(client.name);
        
        // Exakte Übereinstimmung nach Normalisierung
        if (normalizedExisting === normalizedInput) {
          console.log(`Found exact match: ${client.name} (${client.id}) for input: ${companyName}`);
          return client.id;
        }
      }
      
      // Word-based fuzzy matching (prevents false positives like "Brugg Lifting" → "Ruggli AG")
      for (const client of existingClients) {
        if (fuzzyCompanyMatch(companyName, client.name)) {
          console.log(`Found fuzzy match: ${client.name} (${client.id}) for input: ${companyName}`);
          return client.id;
        }
      }
    }

    // Keine Übereinstimmung gefunden → Erstelle neue Firma
    const { data: newClient, error: createError } = await supabase
      .from('clients')
      .insert({
        user_id: userId,
        name: capitalizeCompanyName(companyName),
        status: 'Active',
      })
      .select('id')
      .single();

    if (createError) {
      console.error('Error creating company:', createError);
      return null;
    }

    console.log(`Created new company: ${companyName} (${newClient.id})`);
    return newClient.id;
  } catch (error) {
    console.error('Error in matchOrCreateCompany:', error);
    return null;
  }
}

/**
 * Verarbeitet ein Array von Berufserfahrungen und fügt client_ids hinzu
 * @param workExperiences Array der Berufserfahrungen
 * @param userId ID des Benutzers
 * @returns Array mit hinzugefügten client_ids
 */
export async function processWorkExperienceCompanies(
  workExperiences: Array<{
    company?: string;
    position?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>,
  userId: string
): Promise<Array<{
  company?: string;
  position?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  client_id?: string;
}>> {
  const processedExperiences = [];

  for (const exp of workExperiences) {
    const client_id = exp.company 
      ? await matchOrCreateCompany(exp.company, userId)
      : null;

    processedExperiences.push({
      ...exp,
      client_id: client_id || undefined,
    });
  }

  return processedExperiences;
}
