const SHY = "\u00AD";

// Common German compound word parts (prefixes/infixes) sorted longest-first
const COMPOUND_PARTS = [
  "kommunikations", "informations", "qualitaets", "qualitäts",
  "sicherheits", "produktions", "buchhaltungs", "entwicklungs",
  "bewirtschaft", "liegenschaft", "verantwortlich",
  "immobilien", "geschaefts", "geschäfts", "ingenieur",
  "technologie", "verwaltung", "abteilung",
  "betriebs", "gewerbe", "projekt", "personal", "finanz",
  "verkaufs", "verkauf", "beratung", "leitung",
  "management", "marketing", "controlling",
  "software", "hardware", "infrastruktur",
  "logistik", "einkauf", "vertrieb",
  "objekt", "bau", "haus",
];

function hyphenateWord(word: string): string {
  if (word.length < 8) return word;

  const lower = word.toLowerCase();
  let result = word;
  let offset = 0;

  // Try to find compound parts from left to right
  let pos = 0;
  while (pos < lower.length) {
    let matched = false;
    for (const part of COMPOUND_PARTS) {
      if (lower.startsWith(part, pos) && pos + part.length < lower.length) {
        // Insert soft hyphen after this compound part
        const insertPos = pos + part.length + offset;
        result = result.slice(0, insertPos) + SHY + result.slice(insertPos);
        offset += 1;
        pos += part.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      pos++;
    }
  }

  return result;
}

export function hyphenateGerman(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part) => (/\s/.test(part) ? part : hyphenateWord(part)))
    .join("");
}
