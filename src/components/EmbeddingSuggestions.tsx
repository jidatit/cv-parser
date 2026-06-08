import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sparkles, User, ChevronDown, ChevronUp, CheckCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { triggerAutoAnalysis } from "@/lib/autoAnalyzeMatch";
import { checkEmployerConflict } from "@/lib/employerConflictCheck";

interface EmbeddingSuggestionsProps {
  jobId: string;
  jobEmbedding: string | null;
  jobIndustry?: string | null;
  existingCandidateIds: string[];
  onCandidateAdded?: () => void;
}

export function EmbeddingSuggestions({ jobId, jobEmbedding, jobIndustry, existingCandidateIds, onCandidateAdded }: EmbeddingSuggestionsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  // Fetch dismissed suggestions for this job
  const { data: dismissedIds = [] } = useQuery({
    queryKey: ['dismissed-suggestions', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dismissed_suggestions')
        .select('candidate_id')
        .eq('job_id', jobId);
      if (error) {
        console.error('Error fetching dismissed suggestions:', error);
        return [];
      }
      return (data || []).map(d => d.candidate_id);
    },
    enabled: !!jobId,
  });

  // Fetch client name for employer conflict check
  const { data: clientName } = useQuery({
    queryKey: ['job-client-name', jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('client_id, clients(name)')
        .eq('id', jobId)
        .single();
      return (data as any)?.clients?.name || null;
    },
    enabled: !!jobId,
    staleTime: 300_000,
  });

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['embedding-suggestions', jobId, jobEmbedding?.slice(0, 20)],
    queryFn: async () => {
      if (!jobEmbedding) return [];

      const { data, error } = await supabase.rpc('match_candidates_by_embedding', {
        job_embedding: jobEmbedding,
        match_limit: 15,
        similarity_threshold: 0.55,
        filter_industry: jobIndustry || null,
      });

      if (error) {
        console.error('Embedding suggestions error:', error);
        return [];
      }

      const candidateIds = (data || []).map((d: any) => d.id);
      if (candidateIds.length === 0) return [];

      const { data: candidates } = await supabase
        .from('candidates')
        .select('id, name, position, avatar_url, status, location, skills, industry, work_experience')
        .in('id', candidateIds);

      return (candidates || []).map(c => {
        const match = data.find((d: any) => d.id === c.id);
        return { ...c, similarity: match?.similarity || 0 };
      }).sort((a: any, b: any) => b.similarity - a.similarity);
    },
    enabled: !!jobEmbedding,
    staleTime: 60_000,
  });

  const handleAddCandidate = async (candidateId: string, candidateName: string) => {
    setAddingId(candidateId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: placementData, error } = await supabase
        .from('placements')
        .insert({
          candidate_id: candidateId,
          job_id: jobId,
          user_id: user.id,
          stage: 'Ready2Send',
        })
        .select('id')
        .single();

      if (error) throw error;

      if (placementData) {
        triggerAutoAnalysis(placementData.id, candidateId, jobId);
      }

      toast({
        title: t("matches.candidateAdded"),
        description: `${candidateName} ${t("matches.candidateAddedDesc")}`,
      });

      onCandidateAdded?.();
    } catch (error) {
      console.error('Error adding candidate:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.addError"),
        variant: "destructive",
      });
    } finally {
      setAddingId(null);
    }
  };

  const handleDismissCandidate = async (candidateId: string) => {
    setDismissingId(candidateId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('dismissed_suggestions')
        .insert({
          job_id: jobId,
          candidate_id: candidateId,
          user_id: user.id,
        });

      if (error) throw error;

      // Invalidate dismissed query to update UI
      queryClient.invalidateQueries({ queryKey: ['dismissed-suggestions', jobId] });
    } catch (error) {
      console.error('Error dismissing suggestion:', error);
      toast({
        title: t("toast.error"),
        description: "Vorschlag konnte nicht abgelehnt werden",
        variant: "destructive",
      });
    } finally {
      setDismissingId(null);
    }
  };

  if (!jobEmbedding || !suggestions || suggestions.length === 0) return null;

  // Filter out dismissed candidates, but keep matched ones visible
  const visibleSuggestions = suggestions.filter(
    (c: any) => !dismissedIds.includes(c.id)
  ).filter((c: any) => {
    // Filter out candidates who have worked at the job's client company
    if (!clientName || !c.work_experience) return true;
    const workExp = Array.isArray(c.work_experience) ? c.work_experience : [];
    return !checkEmployerConflict(workExp, clientName).hasConflict;
  });

  const pendingCount = visibleSuggestions.filter(
    (c: any) => !existingCandidateIds.includes(c.id)
  ).length;

  if (visibleSuggestions.length === 0) return null;

  const similarityPercent = (similarity: number) => Math.round(similarity * 100);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-500" />
              {t("matches.embeddingSuggestions", "Ähnliche Kandidaten")}
              {pendingCount > 0 && (
                <Badge variant="secondary" className="ml-1">{pendingCount}</Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              {t("matches.embeddingSuggestionsDesc", "Semantisch passende Kandidaten basierend auf Profil-Ähnlichkeit")}
            </CardDescription>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <div className="space-y-2">
            {visibleSuggestions.map((candidate: any) => {
              const isMatched = existingCandidateIds.includes(candidate.id);
              return (
                <div
                  key={candidate.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isMatched ? 'bg-muted/30 opacity-70' : 'hover:bg-accent/50'
                  }`}
                >
                  <Link to={`/candidates/${candidate.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="h-9 w-9">
                      {candidate.avatar_url && <AvatarImage src={candidate.avatar_url} />}
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{candidate.name}</p>
                        {isMatched && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/50 text-green-700 dark:text-green-400">
                            gematcht
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {candidate.position || t("matches.noPosition")}
                        {candidate.industry && <span className="ml-1 text-muted-foreground/70">· {candidate.industry}</span>}
                      </p>
                    </div>
                  </Link>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-xs ${
                      similarityPercent(candidate.similarity) >= 70
                        ? 'border-green-500/50 text-green-700 dark:text-green-400'
                        : similarityPercent(candidate.similarity) >= 50
                          ? 'border-amber-500/50 text-amber-700 dark:text-amber-400'
                          : 'border-muted'
                    }`}
                  >
                    {similarityPercent(candidate.similarity)}%
                  </Badge>
                  {!isMatched && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                        disabled={addingId === candidate.id}
                        onClick={(e) => {
                          e.preventDefault();
                          handleAddCandidate(candidate.id, candidate.name);
                        }}
                        title="Annehmen"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={dismissingId === candidate.id}
                        onClick={(e) => {
                          e.preventDefault();
                          handleDismissCandidate(candidate.id);
                        }}
                        title="Ablehnen"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
