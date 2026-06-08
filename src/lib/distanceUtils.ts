/**
 * Haversine distance estimation — pure client-side, no API calls.
 */

const R = 6371; // Earth radius in km

export function estimateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Parse max_commute string (e.g. "30 km", "45", "60km") into a number in km.
 * Returns null if unparseable.
 */
export function parseMaxCommuteKm(maxCommute: string | null | undefined): number | null {
  if (!maxCommute) return null;
  const match = maxCommute.match(/(\d+)/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  // If it looks like minutes (common pattern), rough conversion: 1 min ≈ 1 km
  // But most entries are in km, so return as-is
  return value > 0 ? value : null;
}

/**
 * Check if a job is within acceptable commute range.
 * Uses 1.5x multiplier on max_commute to account for air vs road distance.
 * Returns true if within range or if data is missing (don't filter).
 */
export function isWithinCommuteRange(
  candidateLat: number | null,
  candidateLng: number | null,
  jobLat: number | null,
  jobLng: number | null,
  maxCommuteKm: number | null
): { withinRange: boolean; estimatedKm: number | null } {
  if (!candidateLat || !candidateLng || !jobLat || !jobLng) {
    return { withinRange: true, estimatedKm: null };
  }

  const estimatedKm = Math.round(estimateDistanceKm(candidateLat, candidateLng, jobLat, jobLng));

  if (!maxCommuteKm) {
    return { withinRange: true, estimatedKm };
  }

  // 1.5x tolerance: air distance is shorter than road distance
  const withinRange = estimatedKm <= maxCommuteKm * 1.5;
  return { withinRange, estimatedKm };
}
