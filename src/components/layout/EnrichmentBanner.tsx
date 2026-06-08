import { useEnrichment } from "@/contexts/EnrichmentContext";
import { Progress } from "@/components/ui/progress";
import { Database, X } from "lucide-react";
import { useState, useEffect } from "react";

export function EnrichmentBanner() {
  const { enriching, enrichProgress } = useEnrichment();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed when a new enrichment starts
  useEffect(() => {
    if (enriching) setDismissed(false);
  }, [enriching]);

  if (!enriching || dismissed || !enrichProgress) return null;

  const pct = enrichProgress.total > 0 ? (enrichProgress.done / enrichProgress.total) * 100 : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-card p-3 shadow-lg animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database className="h-3.5 w-3.5 animate-pulse text-primary" />
          Jobs anreichern…
        </div>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Progress value={pct} className="h-1.5 mb-1.5" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{enrichProgress.done} / {enrichProgress.total}</span>
        <div className="flex gap-2">
          {enrichProgress.skipped > 0 && (
            <span className="text-muted-foreground">{enrichProgress.skipped} übersprungen</span>
          )}
          {enrichProgress.failed > 0 && (
            <span className="text-destructive">{enrichProgress.failed} fehlgeschlagen</span>
          )}
        </div>
      </div>
    </div>
  );
}
