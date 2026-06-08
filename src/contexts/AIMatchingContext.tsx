import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import i18n from "@/i18n";

// If no update for 5 minutes, consider the job stalled
const STALE_JOB_THRESHOLD_MS = 5 * 60 * 1000;

interface MatchingJob {
  id: string;
  status: string;
  progress: number;
  message: string | null;
  new_matches: number | null;
  total_matches: number | null;
  total_candidates: number | null;
  processed_candidates: number | null;
  error: string | null;
  updated_at: string;
  stats: {
    totalCandidates?: number;
    candidatesToProcess?: number;
    totalJobs?: number;
    qualifiedJobs?: number;
  } | null;
}

interface AIMatchingContextType {
  currentJobId: string | null;
  jobProgress: MatchingJob | null;
  isPolling: boolean;
  isGenerating: boolean;
  startMatching: (language?: string) => Promise<void>;
  startMatchingForCandidate: (candidateId: string, candidateName?: string) => Promise<void>;
}

const AIMatchingContext = createContext<AIMatchingContextType | undefined>(undefined);

export function AIMatchingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<MatchingJob | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [matchingCandidateId, setMatchingCandidateId] = useState<string | null>(null);

  // Poll for job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    const { data, error } = await supabase
      .from('ai_matching_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      console.error('Error polling job status:', error);
      return null;
    }

    return data as MatchingJob;
  }, []);

  // Mark a job as stalled in the database
  const markJobAsStalled = useCallback(async (jobId: string, matchCount: number | null) => {
    const { error } = await supabase
      .from('ai_matching_jobs')
      .update({
        status: 'stalled',
        message: `Prozess wurde nach Timeout beendet. ${matchCount || 0} Matches wurden gespeichert.`,
        error: 'Timeout: Keine Updates seit mehr als 5 Minuten',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
    
    if (error) {
      console.error('Error marking job as stalled:', error);
    }
  }, []);

  // Check if a job is stale (no updates for 5+ minutes)
  const isJobStale = useCallback((updatedAt: string): boolean => {
    const lastUpdate = new Date(updatedAt).getTime();
    const now = Date.now();
    return (now - lastUpdate) > STALE_JOB_THRESHOLD_MS;
  }, []);

  // Check for active jobs on mount
  useEffect(() => {
    const checkActiveJobs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('ai_matching_jobs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'processing')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        const job = data as MatchingJob;
        
        // Check if job is stale on startup
        if (isJobStale(job.updated_at)) {
          console.log('Found stale job on startup, marking as stalled:', job.id);
          await markJobAsStalled(job.id, job.new_matches);
          toast.warning(i18n.t('aiMatching.timeoutEnded'), {
            description: i18n.t('aiMatching.timeoutEndedDesc', { count: job.new_matches || 0 }),
            duration: 8000
          });
          queryClient.invalidateQueries({ queryKey: ['ai-matches'] });
          return;
        }
        
        setCurrentJobId(data.id);
        setJobProgress(job);
        setIsPolling(true);
      }
    };

    checkActiveJobs();
  }, [isJobStale, markJobAsStalled, queryClient]);

  // Polling effect
  useEffect(() => {
    if (!currentJobId || !isPolling) return;

    const pollInterval = setInterval(async () => {
      const status = await pollJobStatus(currentJobId);
      
      if (status) {
        // Check for stale job (no updates for 5+ minutes while still "processing")
        if (status.status === 'processing' && isJobStale(status.updated_at)) {
          console.log('Job appears stale, marking as stalled:', currentJobId);
          await markJobAsStalled(currentJobId, status.new_matches);
          
          setIsPolling(false);
          setCurrentJobId(null);
          toast.warning(i18n.t('aiMatching.timeoutEnded'), {
            description: i18n.t('aiMatching.timeoutEndedDesc', { count: status.new_matches || 0 }),
            duration: 8000
          });
          queryClient.invalidateQueries({ queryKey: ['ai-matches'] });
          setTimeout(() => setJobProgress(null), 3000);
          return;
        }
        
        setJobProgress(status);

        if (status.status === 'completed') {
          setIsPolling(false);
          setCurrentJobId(null);
          
          if (status.new_matches && status.new_matches > 0) {
            toast.success(i18n.t('aiMatching.matchesCreated', { count: status.new_matches }), {
              description: i18n.t('aiMatching.matchesTotal', { count: status.total_matches || 0 }),
              duration: 6000,
            });
          } else {
            toast.info(status.message || i18n.t('aiMatching.noNewMatches'), {
              duration: 6000,
              description: status.stats 
                ? `${status.stats.totalCandidates || 0} Kandidaten, ${status.stats.qualifiedJobs || 0} qualifizierte Jobs`
                : undefined
            });
          }
          
          queryClient.invalidateQueries({ queryKey: ['ai-matches'] });
          // Also invalidate candidate-specific matches cache
          if (matchingCandidateId) {
            queryClient.invalidateQueries({ queryKey: ['ai-matches-candidate', matchingCandidateId] });
            setMatchingCandidateId(null);
          }
          
          // Clear progress after a short delay
          setTimeout(() => setJobProgress(null), 3000);
        } else if (status.status === 'failed') {
          setIsPolling(false);
          setCurrentJobId(null);
          toast.error(status.error || i18n.t('aiMatching.analysisError'), {
            duration: 8000,
          });
          setTimeout(() => setJobProgress(null), 3000);
        } else if (status.status === 'rate_limited' || status.status === 'stalled') {
          setIsPolling(false);
          setCurrentJobId(null);
          toast.warning(status.message || i18n.t('aiMatching.processEnded'), {
            duration: 8000
          });
          queryClient.invalidateQueries({ queryKey: ['ai-matches'] });
          if (matchingCandidateId) {
            queryClient.invalidateQueries({ queryKey: ['ai-matches-candidate', matchingCandidateId] });
            setMatchingCandidateId(null);
          }
          setTimeout(() => setJobProgress(null), 3000);
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [currentJobId, isPolling, pollJobStatus, queryClient, isJobStale, markJobAsStalled]);

  const startMatching = useCallback(async (language?: string) => {
    setIsStarting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };
      
      // Pass language preference if provided
      if (language) {
        headers['Accept-Language'] = language;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-match-candidates`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429 || errorData.isRateLimit) {
          throw new Error(errorData.error || i18n.t('aiMatching.rateLimitError'));
        }
        throw new Error(errorData.error || 'Failed to generate matches');
      }

      const data = await response.json();
      
      if (data.job_id) {
        // Background processing mode
        setCurrentJobId(data.job_id);
        setIsPolling(true);
        setJobProgress({
          id: data.job_id,
          status: 'processing',
          progress: 0,
          message: data.message || 'Analyse wird gestartet...',
          new_matches: null,
          total_matches: null,
          total_candidates: null,
          processed_candidates: null,
          error: null,
          updated_at: new Date().toISOString(),
          stats: null
        });
        toast.info(i18n.t('aiMatching.analysisStarted'), {
          description: i18n.t('aiMatching.analysisStartedDesc'),
          duration: 5000,
        });
      } else {
        // Legacy mode (direct response)
        const matchCount = data.newMatches ?? data.matchCount ?? 0;
        
        if (matchCount > 0) {
          toast.success(i18n.t('aiMatching.matchesCreated', { count: matchCount }), {
            description: i18n.t('aiMatching.matchesTotal', { count: data.totalMatches || matchCount }),
          });
        } else if (data.unchanged) {
          toast.info(data.message || i18n.t('aiMatching.noNewMatches'), {
            duration: 8000,
            description: data.stats 
              ? `${data.stats.totalCandidates} Kandidaten, ${data.stats.totalJobs} offene Jobs, ${data.stats.qualifiedJobs} qualifizierte Jobs`
              : undefined
          });
        } else {
          toast.info(i18n.t('aiMatching.noMatchesFound'));
        }
        
        queryClient.invalidateQueries({ queryKey: ['ai-matches'] });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : i18n.t('aiMatching.generateError'));
    } finally {
      setIsStarting(false);
    }
  }, [queryClient]);

  const startMatchingForCandidate = useCallback(async (candidateId: string, candidateName?: string) => {
    setIsStarting(true);
    setMatchingCandidateId(candidateId);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-match-candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ candidate_id: candidateId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate matches');
      }

      const data = await response.json();
      
      if (data.job_id) {
        setCurrentJobId(data.job_id);
        setIsPolling(true);
        setJobProgress({
          id: data.job_id,
          status: 'processing',
          progress: 0,
          message: data.message || `Analyse für ${candidateName || 'Kandidat'} wird gestartet...`,
          new_matches: null,
          total_matches: null,
          total_candidates: null,
          processed_candidates: null,
          error: null,
          updated_at: new Date().toISOString(),
          stats: null
        });
        toast.info(i18n.t('aiMatching.analysisStarted'), {
          description: i18n.t('aiMatching.candidateAnalysisDesc', { name: candidateName || 'Kandidat' }),
          duration: 5000,
        });
      } else {
        // Direct response
        queryClient.invalidateQueries({ queryKey: ['ai-matches'] });
        queryClient.invalidateQueries({ queryKey: ['ai-matches-candidate', candidateId] });
        setMatchingCandidateId(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : i18n.t('aiMatching.generateError'));
      setMatchingCandidateId(null);
    } finally {
      setIsStarting(false);
    }
  }, [queryClient]);

  const isGenerating = isStarting || isPolling;

  return (
    <AIMatchingContext.Provider value={{
      currentJobId,
      jobProgress,
      isPolling,
      isGenerating,
      startMatching,
      startMatchingForCandidate,
    }}>
      {children}
    </AIMatchingContext.Provider>
  );
}

const fallbackContext: AIMatchingContextType = {
  currentJobId: null,
  jobProgress: null,
  isPolling: false,
  isGenerating: false,
  startMatching: async () => {},
  startMatchingForCandidate: async () => {},
};

export function useAIMatching() {
  const context = useContext(AIMatchingContext);
  return context ?? fallbackContext;
}
