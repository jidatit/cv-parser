import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Global polling hook that checks for running market radar scans
 * and shows a toast notification when they complete — on ANY page.
 */
export function useGlobalScanPolling() {
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackedScanIdRef = useRef<string | null>(null);

  useEffect(() => {
    const checkForRunningScans = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: runningScans } = await supabase
        .from("market_radar_scans")
        .select("id, status")
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1);

      if (runningScans && runningScans.length > 0) {
        startPolling(runningScans[0].id);
      }
    };

    checkForRunningScans();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const startPolling = (scanId: string) => {
    if (trackedScanIdRef.current === scanId) return; // already tracking
    trackedScanIdRef.current = scanId;

    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      const { data: scan } = await supabase
        .from("market_radar_scans")
        .select("id, status, total_new, total_scraped, total_existing, total_filtered, duration_ms")
        .eq("id", scanId)
        .single();

      if (!scan) {
        clearInterval(pollingRef.current!);
        trackedScanIdRef.current = null;
        return;
      }

      if (scan.status === "completed") {
        clearInterval(pollingRef.current!);
        trackedScanIdRef.current = null;
        toast.success("Markt-Radar Scan abgeschlossen", {
          description: `${scan.total_new} neue Stellen gefunden (${scan.total_scraped} gescannt, ${((scan.duration_ms || 0) / 1000).toFixed(1)}s)`,
          duration: 8000,
        });
      } else if (scan.status === "failed") {
        clearInterval(pollingRef.current!);
        trackedScanIdRef.current = null;
        toast.error("Markt-Radar Scan fehlgeschlagen");
      }
    }, 3000);
  };
}
