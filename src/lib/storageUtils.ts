import { supabase } from "@/integrations/supabase/client";

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Extracts the storage path from a logo_url value.
 * Handles both old full public URLs and new plain paths.
 */
function extractStoragePath(logoUrl: string): string {
  // Already a plain filename/path (new format)
  if (!logoUrl.startsWith("http")) {
    return logoUrl;
  }

  // Old format: full public URL like https://xxx.supabase.co/storage/v1/object/public/company-logos/filename.png
  const publicMarker = "/object/public/company-logos/";
  const idx = logoUrl.indexOf(publicMarker);
  if (idx !== -1) {
    let path = logoUrl.substring(idx + publicMarker.length);
    // Remove query params like ?t=123
    const qIdx = path.indexOf("?");
    if (qIdx !== -1) path = path.substring(0, qIdx);
    return path;
  }

  // Fallback: try to extract after /company-logos/
  const marker = "/company-logos/";
  const mIdx = logoUrl.indexOf(marker);
  if (mIdx !== -1) {
    let path = logoUrl.substring(mIdx + marker.length);
    const qIdx = path.indexOf("?");
    if (qIdx !== -1) path = path.substring(0, qIdx);
    return path;
  }

  // Can't parse — return as-is (might be an external URL)
  return logoUrl;
}

/**
 * Returns a signed URL for a company logo stored in the private bucket.
 * Uses an in-memory cache (1h TTL) to avoid redundant API calls.
 * Returns null if the input is falsy.
 */
export async function getSignedLogoUrl(
  logoUrl: string | null | undefined
): Promise<string | null> {
  if (!logoUrl) return null;

  // If it's an external URL (not from our storage), return as-is
  const isSupabaseUrl = logoUrl.includes("supabase.co") || logoUrl.includes("/company-logos/");
  const isPlainPath = !logoUrl.startsWith("http");

  if (!isSupabaseUrl && !isPlainPath) {
    return logoUrl;
  }

  const storagePath = extractStoragePath(logoUrl);

  // Check cache
  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Create signed URL (1 hour)
  const { data, error } = await supabase.storage
    .from("company-logos")
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    console.error("Failed to create signed URL for logo:", storagePath, error);
    return null;
  }

  // Cache it (expire 5 min early to be safe)
  signedUrlCache.set(storagePath, {
    url: data.signedUrl,
    expiresAt: Date.now() + 55 * 60 * 1000,
  });

  return data.signedUrl;
}

/**
 * Batch resolve signed URLs for multiple clients.
 * Returns a map of clientId -> signedUrl.
 */
export async function getSignedLogoUrls(
  clients: Array<{ id: string; logo_url?: string | null }>
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  await Promise.all(
    clients
      .filter((c) => c.logo_url)
      .map(async (c) => {
        const url = await getSignedLogoUrl(c.logo_url);
        if (url) results[c.id] = url;
      })
  );

  return results;
}
