export interface HonorarBracket {
  id: string;
  min: number;
  max: number | null;
  percentage: number;
}

export const defaultHonorarStructure: HonorarBracket[] = [
  { id: "1", min: 0, max: 80000, percentage: 16 },
  { id: "2", min: 80001, max: 100000, percentage: 18 },
  { id: "3", min: 100001, max: 120000, percentage: 20 },
  { id: "4", min: 120001, max: 140000, percentage: 22 },
  { id: "5", min: 140001, max: 160000, percentage: 25 },
  { id: "6", min: 160001, max: null, percentage: 30 },
];

/**
 * Extracts the lower value from a salary string
 * e.g., "80000-100000" => 80000, "CHF 80.000 - 100.000" => 80000
 */
export function extractLowerSalary(salaryString: string | null | undefined): number | null {
  if (!salaryString) return null;
  
  // Remove all whitespace and currency symbols (CHF, EUR, USD, etc.)
  let cleaned = salaryString.replace(/\s+/g, '').replace(/[A-Za-z]+/g, '');
  
  // Remove thousand separators (dots, commas, apostrophes)
  // Assuming salary is always in whole numbers (no decimal places)
  cleaned = cleaned.replace(/[.,']/g, '');
  
  // Try to find a range (with dash)
  const rangeMatch = cleaned.match(/(\d+)-/);
  if (rangeMatch) {
    return parseInt(rangeMatch[1], 10);
  }
  
  // Otherwise take the first number found
  const singleMatch = cleaned.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10);
  }
  
  return null;
}

/**
 * Calculates the honorar based on salary and structure
 */
export function calculateHonorar(
  salary: number,
  structure: HonorarBracket[] = defaultHonorarStructure
): { percentage: number; amount: number } | null {
  const bracket = structure.find(b => {
    if (b.max === null) {
      return salary >= b.min;
    }
    return salary >= b.min && salary <= b.max;
  });

  if (!bracket) return null;

  return {
    percentage: bracket.percentage,
    amount: salary * (bracket.percentage / 100),
  };
}

/**
 * Formats a number as CHF currency
 */
export function formatCHF(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
