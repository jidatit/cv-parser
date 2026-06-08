import { useState, useCallback, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2, RefreshCw, Sparkles, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Note {
  id?: string;
  content?: string;
  text?: string;
  author?: string;
  timestamp?: string;
}

interface PlacementProbabilityProps {
  notes: Note[];
  stage: string;
}

interface ProbabilityResult {
  probability: number;
  trend: 'positive' | 'negative' | 'neutral';
  summary: string;
  key_signals?: string[];
  confidence: number;
  stage_base_score?: number;
}

export function PlacementProbability({ notes, stage }: PlacementProbabilityProps) {
  const [result, setResult] = useState<ProbabilityResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const analyzeProbability = useCallback(async () => {
    if (notes.length === 0) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-placement-probability', {
        body: { notes, stage }
      });

      if (error) throw error;
      setResult(data);
      setHasAnalyzed(true);
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [notes, stage]);

  const handleButtonClick = () => {
    if (!hasAnalyzed && notes.length > 0 && !isExpanded) {
      analyzeProbability();
    }
    setIsExpanded(!isExpanded);
  };

  const getTrendConfig = () => {
    if (!result) return null;

    switch (result.trend) {
      case 'positive':
        return { icon: TrendingUp, label: 'Positiv', color: 'text-green-500', bgColor: 'bg-green-500/10' };
      case 'negative':
        return { icon: TrendingDown, label: 'Negativ', color: 'text-red-500', bgColor: 'bg-red-500/10' };
      default:
        return { icon: Minus, label: 'Neutral', color: 'text-muted-foreground', bgColor: 'bg-muted/30' };
    }
  };

  const getProbabilityColor = (prob: number) => {
    if (prob >= 70) return 'text-green-500';
    if (prob >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getProgressColor = (prob: number) => {
    if (prob >= 70) return 'bg-green-500';
    if (prob >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getBackgroundColor = (prob: number) => {
    if (prob >= 70) return 'bg-green-500/10';
    if (prob >= 40) return 'bg-yellow-500/10';
    return 'bg-red-500/10';
  };

  const config = getTrendConfig();

  if (notes.length === 0) {
    return (
      <>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-medium opacity-50" disabled>
          <Sparkles className="h-3 w-3" />
          <span>Sentiment</span>
        </Button>
      </>
    );
  }

  return (
    <>
      {/* Button - rendered in header */}
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-7 gap-1.5 text-xs font-medium transition-all",
          result && getBackgroundColor(result.probability)
        )}
        onClick={handleButtonClick}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Analysiere...</span>
          </>
        ) : result ? (
          <>
            <Gauge className={cn("h-3 w-3", getProbabilityColor(result.probability))} />
            <span className={getProbabilityColor(result.probability)}>{result.probability}%</span>
            {config && <config.icon className={cn("h-3 w-3", config.color)} />}
          </>
        ) : (
          <>
            <Sparkles className="h-3 w-3" />
            <span>Sentiment</span>
          </>
        )}
      </Button>

      {/* Analysis Content - rendered via portal pattern in parent */}
      {isExpanded && (
        <div 
          className={cn(
            "fixed invisible pointer-events-none",
          )}
          data-sentiment-content="true"
        >
          <SentimentContent 
            result={result}
            config={config}
            isLoading={isLoading}
            getProbabilityColor={getProbabilityColor}
            getProgressColor={getProgressColor}
            getBackgroundColor={getBackgroundColor}
            onRefresh={analyzeProbability}
          />
        </div>
      )}
    </>
  );
}

// Separate exported component for the analysis content
interface SentimentContentProps {
  result: ProbabilityResult | null;
  config: { icon: any; label: string; color: string; bgColor: string } | null;
  isLoading: boolean;
  getProbabilityColor: (prob: number) => string;
  getProgressColor: (prob: number) => string;
  getBackgroundColor: (prob: number) => string;
  onRefresh: () => void;
}

function SentimentContent({ result, config, isLoading, getProbabilityColor, getProgressColor, getBackgroundColor, onRefresh }: SentimentContentProps) {
  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2",
      result ? getBackgroundColor(result.probability) : 'bg-muted/20'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("text-xl font-bold", result ? getProbabilityColor(result.probability) : 'text-muted-foreground')}>
            {result ? `${result.probability}%` : '--'}
          </span>
          {config && (
            <span className={cn("text-xs flex items-center gap-1", config.color)}>
              <config.icon className="h-3 w-3" />
              {config.label}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
        </Button>
      </div>

      {result && (
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div 
            className={cn("h-full transition-all duration-500", getProgressColor(result.probability))}
            style={{ width: `${result.probability}%` }}
          />
        </div>
      )}

      {result?.summary && (
        <p className="text-xs text-muted-foreground">{result.summary}</p>
      )}

      {result?.key_signals && result.key_signals.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Signale:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {result.key_signals.map((signal, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className={config?.color}>•</span>
                {signal}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Hook for using placement probability with separated button and content
export function usePlacementProbability(notes: Note[], stage: string, placementId?: string) {
  const [result, setResult] = useState<ProbabilityResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(false);

  // Reset state and load existing sentiment data when placementId changes
  useEffect(() => {
    // Reset all state when placementId changes
    setResult(null);
    setIsLoading(false);
    setIsExpanded(false);
    setHasAnalyzed(false);
    
    if (placementId) {
      loadExistingSentiment();
    }
  }, [placementId]);

  const loadExistingSentiment = async () => {
    if (!placementId) return;
    
    setIsLoadingFromDb(true);
    try {
      const { data: placement, error } = await supabase
        .from('placements')
        .select('sentiment_probability, sentiment_trend, sentiment_summary, sentiment_key_signals, sentiment_confidence, sentiment_analyzed_at')
        .eq('id', placementId)
        .maybeSingle();

      if (error) throw error;

      // If we have saved sentiment data, load it
      if (placement?.sentiment_analyzed_at && placement?.sentiment_probability !== null) {
        const keySignals = Array.isArray(placement.sentiment_key_signals) 
          ? (placement.sentiment_key_signals as string[]) 
          : [];
        
        setResult({
          probability: placement.sentiment_probability,
          trend: (placement.sentiment_trend as 'positive' | 'negative' | 'neutral') || 'neutral',
          summary: placement.sentiment_summary || '',
          key_signals: keySignals,
          confidence: placement.sentiment_confidence || 0,
        });
        setHasAnalyzed(true);
        setIsExpanded(true); // Auto-expand if we have saved data
      }
    } catch (error) {
      console.error('Error loading sentiment data:', error);
    } finally {
      setIsLoadingFromDb(false);
    }
  };

  const saveSentimentToDb = async (sentimentData: ProbabilityResult) => {
    if (!placementId) return;
    
    try {
      // Convert confidence to integer (0-100 scale)
      const confidenceInt = Math.round((sentimentData.confidence || 0) * 100);
      
      await supabase
        .from('placements')
        .update({
          sentiment_probability: sentimentData.probability,
          sentiment_trend: sentimentData.trend,
          sentiment_summary: sentimentData.summary,
          sentiment_key_signals: sentimentData.key_signals || [],
          sentiment_confidence: confidenceInt,
          sentiment_analyzed_at: new Date().toISOString()
        })
        .eq('id', placementId);
    } catch (error) {
      console.error('Error saving sentiment data:', error);
    }
  };

  const analyzeProbability = useCallback(async () => {
    if (notes.length === 0) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-placement-probability', {
        body: { notes, stage }
      });

      if (error) throw error;
      setResult(data);
      setHasAnalyzed(true);
      
      // Save to database
      if (placementId && data) {
        await saveSentimentToDb(data);
      }
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [notes, stage, placementId]);

  const handleToggle = () => {
    if (!hasAnalyzed && notes.length > 0 && !isExpanded) {
      analyzeProbability();
    }
    setIsExpanded(!isExpanded);
  };

  const getTrendConfig = () => {
    if (!result) return null;

    switch (result.trend) {
      case 'positive':
        return { icon: TrendingUp, label: 'Positiv', color: 'text-green-500', bgColor: 'bg-green-500/10' };
      case 'negative':
        return { icon: TrendingDown, label: 'Negativ', color: 'text-red-500', bgColor: 'bg-red-500/10' };
      default:
        return { icon: Minus, label: 'Neutral', color: 'text-muted-foreground', bgColor: 'bg-muted/30' };
    }
  };

  const getProbabilityColor = (prob: number) => {
    if (prob >= 70) return 'text-green-500';
    if (prob >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getProgressColor = (prob: number) => {
    if (prob >= 70) return 'bg-green-500';
    if (prob >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getBackgroundColor = (prob: number) => {
    if (prob >= 70) return 'bg-green-500/10';
    if (prob >= 40) return 'bg-yellow-500/10';
    return 'bg-red-500/10';
  };

  return {
    result,
    isLoading: isLoading || isLoadingFromDb,
    isExpanded,
    hasAnalyzed,
    config: getTrendConfig(),
    handleToggle,
    analyzeProbability,
    getProbabilityColor,
    getProgressColor,
    getBackgroundColor,
  };
}

// Button component for header
interface SentimentButtonProps {
  notes: Note[];
  isLoading: boolean;
  isExpanded: boolean;
  result: ProbabilityResult | null;
  config: { icon: any; label: string; color: string; bgColor: string } | null;
  getProbabilityColor: (prob: number) => string;
  getBackgroundColor: (prob: number) => string;
  onToggle: () => void;
}

export function SentimentButton({ notes, isLoading, result, config, getProbabilityColor, getBackgroundColor, onToggle }: SentimentButtonProps) {
  if (notes.length === 0) {
    return (
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-medium opacity-50" disabled>
        <Sparkles className="h-3 w-3" />
        <span>Sentiment</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "h-7 gap-1.5 text-xs font-medium transition-all",
        result && getBackgroundColor(result.probability)
      )}
      onClick={onToggle}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Analysiere...</span>
        </>
      ) : result ? (
        <>
          <Gauge className={cn("h-3 w-3", getProbabilityColor(result.probability))} />
          <span className={getProbabilityColor(result.probability)}>{result.probability}%</span>
          {config && <config.icon className={cn("h-3 w-3", config.color)} />}
        </>
      ) : (
        <>
          <Sparkles className="h-3 w-3" />
          <span>Sentiment</span>
        </>
      )}
    </Button>
  );
}

// Analysis panel component for notes area
interface SentimentPanelProps {
  isExpanded: boolean;
  result: ProbabilityResult | null;
  config: { icon: any; label: string; color: string; bgColor: string } | null;
  isLoading: boolean;
  getProbabilityColor: (prob: number) => string;
  getProgressColor: (prob: number) => string;
  getBackgroundColor: (prob: number) => string;
  onRefresh: () => void;
}

export function SentimentPanel({ isExpanded, result, config, isLoading, getProbabilityColor, getProgressColor, getBackgroundColor, onRefresh }: SentimentPanelProps) {
  if (!isExpanded) return null;

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2 mb-3",
      result ? getBackgroundColor(result.probability) : 'bg-muted/20'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("text-xl font-bold", result ? getProbabilityColor(result.probability) : 'text-muted-foreground')}>
            {result ? `${result.probability}%` : '--'}
          </span>
          {config && (
            <span className={cn("text-xs flex items-center gap-1", config.color)}>
              <config.icon className="h-3 w-3" />
              {config.label}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
        </Button>
      </div>

      {result && (
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div 
            className={cn("h-full transition-all duration-500", getProgressColor(result.probability))}
            style={{ width: `${result.probability}%` }}
          />
        </div>
      )}

      {result?.summary && (
        <p className="text-xs text-muted-foreground">{result.summary}</p>
      )}

      {result?.key_signals && result.key_signals.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Signale:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {result.key_signals.map((signal, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className={config?.color}>•</span>
                {signal}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
