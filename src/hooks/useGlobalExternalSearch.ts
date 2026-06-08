import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SearchResult {
  results: any[];
  query: string;
  is_cached: boolean;
  cached_at: string | null;
  queries_used: string[];
  algo_version: string | null;
  scrapeStats: { scraped: number; new: number; existing: number; filtered: number } | null;
  total: number;
}

interface SearchJobRow {
  id: string;
  status: string;
  progress_message: string | null;
  results: any;
  stats: any;
  error: string | null;
  updated_at: string;
  created_at: string;
}

type CompletionCallback = (result: SearchResult | null, error: Error | null) => void;
type ProgressCallback = (message: string) => void;

// Module-level state — survives component unmounts
const activeSearches = new Map<string, string>(); // candidateId -> searchJobId
const subscribers = new Map<string, Set<CompletionCallback>>();
const progressSubscribers = new Map<string, Set<ProgressCallback>>();
const pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();

function notifySubscribers(candidateId: string, result: SearchResult | null, error: Error | null) {
  const subs = subscribers.get(candidateId);
  if (subs) {
    subs.forEach(cb => cb(result, error));
    subscribers.delete(candidateId);
  }
}

function notifyProgress(candidateId: string, message: string) {
  const subs = progressSubscribers.get(candidateId);
  if (subs) {
    subs.forEach(cb => cb(message));
  }
}

export function isSearchRunning(candidateId: string): boolean {
  return activeSearches.has(candidateId);
}

export function subscribeToCompletion(candidateId: string, callback: CompletionCallback): () => void {
  if (!subscribers.has(candidateId)) {
    subscribers.set(candidateId, new Set());
  }
  subscribers.get(candidateId)!.add(callback);
  return () => {
    subscribers.get(candidateId)?.delete(callback);
  };
}

export function subscribeToProgress(candidateId: string, callback: ProgressCallback): () => void {
  if (!progressSubscribers.has(candidateId)) {
    progressSubscribers.set(candidateId, new Set());
  }
  progressSubscribers.get(candidateId)!.add(callback);
  return () => {
    progressSubscribers.get(candidateId)?.delete(callback);
  };
}

function stopPolling(candidateId: string) {
  const interval = pollingIntervals.get(candidateId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(candidateId);
  }
  activeSearches.delete(candidateId);
}

function startPolling(candidateId: string, searchJobId: string, candidateName: string) {
  // Clear any existing polling for this candidate
  stopPolling(candidateId);
  activeSearches.set(candidateId, searchJobId);

  const poll = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("external_search_jobs")
        .select("id, status, progress_message, results, stats, error, updated_at, created_at")
        .eq("id", searchJobId)
        .single();

      if (error || !data) {
        console.warn("[poll] Failed to fetch search job:", error?.message);
        return;
      }

      const row = data as SearchJobRow;

      // Notify progress
      if (row.progress_message) {
        notifyProgress(candidateId, row.progress_message);
      }

      // Timeout check: if stuck for >5 minutes, mark as failed
      if ((row.status === "running" || row.status === "pending") && row.updated_at) {
        const updatedAt = new Date(row.updated_at).getTime();
        const now = Date.now();
        const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

        if (now - updatedAt > TIMEOUT_MS) {
          await (supabase as any)
            .from("external_search_jobs")
            .update({ status: "failed", error: "Timeout: Suche hat nicht innerhalb von 5 Minuten geantwortet" })
            .eq("id", searchJobId);

          stopPolling(candidateId);
          toast({
            title: "Externe Suche abgebrochen",
            description: `Timeout nach 5 Min für ${candidateName}. Bitte erneut starten.`,
            variant: "destructive",
          });
          notifySubscribers(candidateId, null, new Error("Timeout"));
          return;
        }
      }

      if (row.status === "completed") {
        stopPolling(candidateId);

        const stats = row.stats || {};
        const result: SearchResult = {
          results: row.results || [],
          query: stats.query || "",
          is_cached: stats.is_cached || false,
          cached_at: stats.cached_at || null,
          queries_used: stats.queries_used || [],
          algo_version: stats.algo_version || null,
          scrapeStats: {
            scraped: stats.jobs_scraped || 0,
            new: stats.jobs_new || 0,
            existing: stats.jobs_existing || 0,
            filtered: stats.jobs_filtered_agencies || 0,
          },
          total: stats.total || (row.results || []).length,
        };

        // Save to sessionStorage
        const storageKey = `ext-search-${candidateId}`;
        try {
          const existing = sessionStorage.getItem(storageKey);
          const parsed = existing ? JSON.parse(existing) : {};
          sessionStorage.setItem(storageKey, JSON.stringify({
            ...parsed,
            results: result.results,
            searchQuery: result.query,
            hasSearched: true,
            isCached: result.is_cached,
            cachedAt: result.cached_at,
            queriesUsed: result.queries_used,
            algoVersion: result.algo_version,
            scrapeStats: result.scrapeStats,
          }));
        } catch (e) {
          console.warn("Failed to save search results to sessionStorage", e);
        }

        toast({
          title: `Externe Suche abgeschlossen`,
          description: result.is_cached
            ? `Ergebnisse aus Cache für ${candidateName}`
            : `${result.total} Ergebnisse für ${candidateName}`,
        });

        notifySubscribers(candidateId, result, null);
      } else if (row.status === "failed") {
        stopPolling(candidateId);

        const err = new Error(row.error || "Search failed");
        toast({
          title: "Externe Suche fehlgeschlagen",
          description: `${candidateName}: ${err.message}`,
          variant: "destructive",
        });

        notifySubscribers(candidateId, null, err);
      }
    } catch (e) {
      console.warn("[poll] Polling error:", e);
    }
  };

  // Poll immediately, then every 5 seconds
  poll();
  pollingIntervals.set(candidateId, setInterval(poll, 5000));
}

export async function startBackgroundSearch(
  candidateId: string,
  candidateName: string,
  params: { candidate: any; force_refresh: boolean; pensum_min: number; pensum_max: number },
): Promise<void> {
  // If already running, don't start another
  if (activeSearches.has(candidateId)) {
    return;
  }

  try {
    // 1. Create search job row in DB
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: searchJob, error: insertError } = await (supabase as any)
      .from("external_search_jobs")
      .insert({
        candidate_id: candidateId,
        user_id: user.id,
        status: "pending",
        progress_message: "Suche wird gestartet…",
        search_params: params,
      })
      .select("id")
      .single();

    if (insertError || !searchJob) {
      throw new Error(insertError?.message || "Failed to create search job");
    }

    const searchJobId = searchJob.id;

    // 2. Start polling BEFORE invoking the edge function
    startPolling(candidateId, searchJobId, candidateName);

    // 3. Invoke edge function (fire-and-forget — we don't await the full response)
    // Use a timeout to avoid blocking on the HTTP response
    const invokePromise = supabase.functions.invoke("external-job-search", {
      body: { ...params, search_job_id: searchJobId },
    });

    // Race with a 30s timeout — if the function takes longer, we rely on polling
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
    
    const raceResult = await Promise.race([invokePromise, timeoutPromise]);
    
    if (raceResult === null) {
      console.log(`[startBackgroundSearch] HTTP timeout for ${candidateName} — continuing with polling`);
      // Polling will pick up the results when the edge function finishes
    } else {
      // Edge function returned within 30s — but polling will still handle it
      // since the edge function updates the DB row
      console.log(`[startBackgroundSearch] Edge function returned for ${candidateName}`);
    }
  } catch (error) {
    stopPolling(candidateId);
    const err = error instanceof Error ? error : new Error("Search failed");
    toast({
      title: "Externe Suche fehlgeschlagen",
      description: `${candidateName}: ${err.message}`,
      variant: "destructive",
    });
    notifySubscribers(candidateId, null, err);
  }
}

// Check for any running searches on page load (e.g., after browser refresh)
export async function resumeRunningSearches(candidateId: string, candidateName: string) {
  try {
    const { data } = await (supabase as any)
      .from("external_search_jobs")
      .select("id, status")
      .eq("candidate_id", candidateId)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const searchJob = data[0];
      if (!activeSearches.has(candidateId)) {
        startPolling(candidateId, searchJob.id, candidateName);
      }
      return true;
    }
  } catch (e) {
    console.warn("[resumeRunningSearches] Error:", e);
  }
  return false;
}
