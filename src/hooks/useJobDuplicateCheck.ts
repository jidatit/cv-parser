import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DuplicateJob {
  id: string;
  title: string;
  clientName: string | null;
  location: string | null;
  status: string | null;
  matchType: 'title_company_location';
}

/**
 * Extracts a normalized city name from a location string.
 * Removes street addresses, postal codes, and country names.
 */
function extractCity(location: string): string {
  if (!location) return '';

  let cleaned = location.trim().toLowerCase();

  // Remove postal codes (4-5 digit patterns like "8001" or "10115")
  cleaned = cleaned.replace(/\b\d{4,5}\b/g, '');

  // Common country names to strip
  const countries = [
    'schweiz', 'switzerland', 'suisse', 'svizzera',
    'deutschland', 'germany', 'allemagne',
    'österreich', 'austria', 'autriche',
    'france', 'frankreich', 'italien', 'italy', 'italia',
  ];
  for (const country of countries) {
    cleaned = cleaned.replace(new RegExp(`\\b${country}\\b`, 'gi'), '');
  }

  // Split by comma and take the part most likely to be the city
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);

  if (parts.length === 0) return '';

  // If multiple parts, the city is usually the first or second part
  // Heuristic: skip parts that look like street addresses (contain numbers)
  for (const part of parts) {
    const hasNumber = /\d/.test(part);
    if (!hasNumber && part.length >= 2) {
      return part.replace(/\s+/g, ' ').trim();
    }
  }

  // Fallback: return the last non-empty part
  return parts[parts.length - 1].replace(/\s+/g, ' ').trim();
}

function citiesMatch(locationA: string, locationB: string): boolean {
  const cityA = extractCity(locationA);
  const cityB = extractCity(locationB);

  if (!cityA || !cityB) return false;

  return cityA === cityB || cityA.includes(cityB) || cityB.includes(cityA);
}

export function useJobDuplicateCheck() {
  const [duplicates, setDuplicates] = useState<DuplicateJob[]>([]);
  const [checking, setChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkForDuplicates = useCallback(
    (title: string, clientId?: string, companyName?: string, location?: string) => {
      // Clear previous debounce
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!title || title.trim().length < 3) {
        setDuplicates([]);
        return;
      }

      if (!clientId && !companyName?.trim()) {
        setDuplicates([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setChecking(true);
        try {
          const found: DuplicateJob[] = [];

          // Extract significant keywords from title (>= 3 chars)
          const keywords = title
            .trim()
            .split(/\s+/)
            .filter(w => w.length >= 3)
            .slice(0, 3);

          if (keywords.length === 0) {
            setDuplicates([]);
            return;
          }

          if (clientId) {
            // Search by client_id + title keywords
            let query = supabase
              .from('jobs')
              .select('id, title, location, status, client_id, clients(name)')
              .eq('client_id', clientId)
              .neq('status', 'Archived');

            for (const kw of keywords) {
              query = query.ilike('title', `%${kw}%`);
            }

            const { data } = await query.limit(10);

            data?.forEach(job => {
              const clientInfo = job.clients as any;
              const jobClientName = clientInfo?.name || null;

              // Check location
              if (location && job.location) {
                if (citiesMatch(location, job.location)) {
                  found.push({
                    id: job.id,
                    title: job.title,
                    clientName: jobClientName,
                    location: job.location,
                    status: job.status,
                    matchType: 'title_company_location',
                  });
                }
                // Different location = not a duplicate, skip
              } else if (!location && !job.location) {
                // Both have no location — treat as same location
                found.push({
                  id: job.id,
                  title: job.title,
                  clientName: jobClientName,
                  location: job.location,
                  status: job.status,
                  matchType: 'title_company_location',
                });
              }
            });
          } else if (companyName && companyName.trim().length >= 2) {
            // Search by company name + title keywords
            let query = supabase
              .from('jobs')
              .select('id, title, location, status, client_id, clients(name)')
              .neq('status', 'Archived');

            for (const kw of keywords) {
              query = query.ilike('title', `%${kw}%`);
            }

            const { data } = await query.limit(20);

            data?.forEach(job => {
              const clientInfo = job.clients as any;
              const jobClientName = clientInfo?.name || null;

              if (!jobClientName) return;

              // Check if company names match
              const normalizedInput = companyName.trim().toLowerCase();
              const normalizedExisting = jobClientName.toLowerCase();

              if (
                normalizedInput === normalizedExisting ||
                normalizedInput.includes(normalizedExisting) ||
                normalizedExisting.includes(normalizedInput)
              ) {
                // Company matches — now check location
                if (location && job.location) {
                  if (citiesMatch(location, job.location)) {
                    found.push({
                      id: job.id,
                      title: job.title,
                      clientName: jobClientName,
                      location: job.location,
                      status: job.status,
                      matchType: 'title_company_location',
                    });
                  }
                } else if (!location && !job.location) {
                  found.push({
                    id: job.id,
                    title: job.title,
                    clientName: jobClientName,
                    location: job.location,
                    status: job.status,
                    matchType: 'title_company_location',
                  });
                }
              }
            });
          }

          setDuplicates(found);
        } catch (error) {
          console.error('Error checking for job duplicates:', error);
          setDuplicates([]);
        } finally {
          setChecking(false);
        }
      }, 500);
    },
    []
  );

  const clearDuplicates = useCallback(() => {
    setDuplicates([]);
  }, []);

  return { duplicates, checking, checkForDuplicates, clearDuplicates };
}
