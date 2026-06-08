import i18n from '@/i18n';

// Mapping from German original text to translation key
const REASON_KEY_MAP: Record<string, string> = {
  'Gehaltsvorstellungen passen nicht zusammen': 'salary_mismatch',
  'Fehlende fachliche Qualifikationen': 'missing_qualifications',
  'Standort nicht passend / zu weite Entfernung': 'location_not_suitable',
  'Kandidat ist überqualifiziert für die Position': 'overqualified',
  'Kulturelle Passung nicht gegeben': 'cultural_fit',
  'Andere Kandidaten wurden bevorzugt': 'other_candidates_preferred',
  'Kandidat hat kein Interesse': 'candidate_declined',
  'AGB für Firma nicht passend': 'terms_not_suitable',
  'Kandidat ist nicht mehr verfügbar': 'candidate_not_available',
};

/**
 * Translates a rejection reason to the current language.
 * If the reason matches a known German text, returns the translated version.
 * Otherwise returns the original text.
 */
export function translateRejectionReason(reason: string): string {
  const key = REASON_KEY_MAP[reason];
  if (key) {
    const translated = i18n.t(`settings.reasons.${key}`);
    // If translation exists and is different from the key, return it
    if (translated && translated !== `settings.reasons.${key}`) {
      return translated;
    }
  }
  return reason;
}

/**
 * Gets the translation key for a rejection reason.
 * Returns undefined if the reason is not a known translatable reason.
 */
export function getRejectionReasonKey(reason: string): string | undefined {
  return REASON_KEY_MAP[reason];
}
