import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EnrichmentProgress {
  done: number;
  total: number;
  failed: number;
  skipped: number;
}

interface EnrichmentContextType {
  enriching: boolean;
  enrichProgress: EnrichmentProgress | null;
  startEnrichment: () => void;
}

const EnrichmentContext = createContext<EnrichmentContextType | null>(null);

export function EnrichmentProvider({ children }: { children: ReactNode }) {
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<EnrichmentProgress | null>(null);
  const runningRef = useRef(false);

  const startEnrichment = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setEnriching(true);
    setEnrichProgress(null);

    (async () => {
      try {
        let totalSuccess = 0, totalFailed = 0, totalSkipped = 0, remaining = 0;
        let hasMore = true;
        let round = 0;
        let total = 0;
        const maxRounds = 100;
        let lastRemaining = -1;
        let stallCount = 0;

        while (hasMore && round < maxRounds) {
          round++;
          const { data, error } = await supabase.functions.invoke('batch-enrich-jobs');
          if (error) throw error;
          if (!data?.success) throw new Error(data?.error || 'Unbekannter Fehler');

          totalSuccess += data.stats.success;
          totalFailed += data.stats.failed;
          totalSkipped += data.stats.skipped || 0;
          remaining = data.stats.remaining || 0;

          // Detect stall: if remaining doesn't decrease, stop after 2 tries
          if (remaining >= lastRemaining && lastRemaining >= 0) {
            stallCount++;
            if (stallCount >= 2) {
              console.warn('Enrichment stalled: remaining not decreasing, stopping loop');
              hasMore = false;
            }
          } else {
            stallCount = 0;
          }
          lastRemaining = remaining;

          // Recalculate total every round to stay accurate
          const done = totalSuccess + totalFailed + totalSkipped;
          total = done + remaining;
          if (hasMore) {
            hasMore = remaining > 0 && data.stats.success > 0;
          }
          setEnrichProgress({ done, total, failed: totalFailed, skipped: totalSkipped });
        }

        if (remaining > 0) {
          toast.warning("Maximale Durchläufe erreicht", {
            description: `${totalSuccess} erfolgreich, ${totalSkipped} übersprungen, ${totalFailed} fehlgeschlagen, ${remaining} verbleibend`,
            duration: 8000,
          });
        } else {
          toast.success("Anreicherung abgeschlossen", {
            description: `${totalSuccess} erfolgreich, ${totalSkipped} übersprungen, ${totalFailed} fehlgeschlagen`,
            duration: 6000,
          });
        }
      } catch (err) {
        console.error('Batch enrich error:', err);
        toast.error("Anreicherung fehlgeschlagen");
      } finally {
        runningRef.current = false;
        setEnriching(false);
      }
    })();
  }, []);

  return (
    <EnrichmentContext.Provider value={{ enriching, enrichProgress, startEnrichment }}>
      {children}
    </EnrichmentContext.Provider>
  );
}

export function useEnrichment() {
  const ctx = useContext(EnrichmentContext);
  if (!ctx) throw new Error("useEnrichment must be used within EnrichmentProvider");
  return ctx;
}
