import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Briefcase, ChevronDown, ChevronUp, CheckCircle, X, MapPin } from "lucide-react";
import { SuggestionReviewDialog } from "@/components/SuggestionReviewDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { triggerAutoAnalysis } from "@/lib/autoAnalyzeMatch";
import { isWithinCommuteRange, parseMaxCommuteKm } from "@/lib/distanceUtils";
import { checkEmployerConflict, WorkExperience } from "@/lib/employerConflictCheck";

interface JobEmbeddingSuggestionsProps {
  candidateId: string;
  candidateEmbedding: string | null;
  candidateIndustry?: string | null;
  candidateLocationLat?: number | null;
  candidateLocationLng?: number | null;
  candidateMaxCommute?: string | null;
  candidateWorkExperience?: WorkExperience[];
  existingJobIds: string[];
  onJobAdded?: () => void;
  candidateData?: any;
}
export function JobEmbeddingSuggestions({ candidateId, candidateEmbedding, candidateIndustry, candidateLocationLat, candidateLocationLng, candidateMaxCommute, candidateWorkExperience, existingJobIds, onJobAdded, candidateData }: JobEmbeddingSuggestionsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewInitialIndex, setReviewInitialIndex] = useState(0);

  // Fetch dismissed suggestions for this candidate
  const { data: dismissedIds = [] } = useQuery({
    queryKey: ['dismissed-job-suggestions', candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dismissed_suggestions')
        .select('job_id')
        .eq('candidate_id', candidateId);
      if (error) {
        console.error('Error fetching dismissed job suggestions:', error);
        return [];
      }
      return (data || []).map(d => d.job_id);
    },
    enabled: !!candidateId,
  });

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['job-embedding-suggestions', candidateId, candidateEmbedding?.slice(0, 20)],
    queryFn: async () => {
      if (!candidateEmbedding) return [];

      const { data, error } = await supabase.rpc('match_jobs_by_embedding', {
        candidate_embedding: candidateEmbedding,
        match_limit: 15,
        similarity_threshold: 0.55,
      });

      if (error) {
        console.error('Job embedding suggestions error:', error);
        return [];
      }

      const jobIds = (data || []).map((d: any) => d.id);
      if (jobIds.length === 0) return [];

      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, title, status, location, location_lat, location_lng, skills, client_id, clients(name)')
        .in('id', jobIds);

      return (jobs || []).map((j: any) => {
        const match = data.find((d: any) => d.id === j.id);
        return { ...j, similarity: match?.similarity || 0 };
      }).sort((a: any, b: any) => b.similarity - a.similarity);
    },
    enabled: !!candidateEmbedding,
    staleTime: 60_000,
  });

  const handleAddJob = async (jobId: string, jobTitle: string) => {
    setAddingId(jobId);
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
        title: t("matches.jobAdded", "Stelle hinzugefügt"),
        description: `${jobTitle} ${t("matches.candidateAddedDesc", "wurde als Match hinzugefügt")}`,
      });

      onJobAdded?.();
    } catch (error) {
      console.error('Error adding job:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.addError"),
        variant: "destructive",
      });
    } finally {
      setAddingId(null);
    }
  };

  const handleDismissJob = async (jobId: string) => {
    setDismissingId(jobId);
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

      queryClient.invalidateQueries({ queryKey: ['dismissed-job-suggestions', candidateId] });
    } catch (error) {
      console.error('Error dismissing job suggestion:', error);
      toast({
        title: t("toast.error"),
        description: "Vorschlag konnte nicht abgelehnt werden",
        variant: "destructive",
      });
    } finally {
      setDismissingId(null);
    }
  };

  if (!candidateEmbedding || !suggestions || suggestions.length === 0) return null;

  const maxCommuteKm = parseMaxCommuteKm(candidateMaxCommute);

  const visibleSuggestions = suggestions.filter(
    (j: any) => !dismissedIds.includes(j.id) && !existingJobIds.includes(j.id)
  ).filter((j: any) => {
    // Filter out jobs where candidate has worked at the client company
    if (candidateWorkExperience && j.clients?.name) {
      if (checkEmployerConflict(candidateWorkExperience, j.clients.name).hasConflict) {
        return false;
      }
    }
    // Filter out jobs that are too far away based on max_commute
    const { withinRange } = isWithinCommuteRange(
      candidateLocationLat ?? null, candidateLocationLng ?? null,
      j.location_lat, j.location_lng, maxCommuteKm
    );
    return withinRange;
  });

  const pendingCount = visibleSuggestions.filter(
    (j: any) => !existingJobIds.includes(j.id)
  ).length;

  if (visibleSuggestions.length === 0) return null;

  const similarityPercent = (similarity: number) => Math.round(similarity * 100);

  return (
    <><Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-500" />
              {t("matches.jobSuggestions", "Passende Stellen")}
              {pendingCount > 0 && (
                <Badge variant="secondary" className="ml-1">{pendingCount}</Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              {t("matches.jobSuggestionsDesc", "Semantisch passende Stellen basierend auf Profil-Ähnlichkeit")}
            </CardDescription>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <div className="space-y-2">
            {visibleSuggestions.map((job: any) => {
              const isMatched = existingJobIds.includes(job.id);
              return (
                <div
                  key={job.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isMatched ? 'bg-muted/30 opacity-70' : 'hover:bg-accent/50'
                  }`}
                >
                  <div
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    onClick={() => {
                      if (!isMatched && candidateData) {
                        const idx = visibleSuggestions.findIndex((s: any) => s.id === job.id);
                        setReviewInitialIndex(idx >= 0 ? idx : 0);
                        setReviewDialogOpen(true);
                      }
                    }}
                  >
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{job.title}</p>
                        {isMatched && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/50 text-green-700 dark:text-green-400">
                            gematcht
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {job.clients?.name || t("matches.noCompany")}
                        {job.location && <span className="ml-1 text-muted-foreground/70">· {job.location}</span>}
                        {(() => {
                          const { estimatedKm } = isWithinCommuteRange(
                            candidateLocationLat ?? null, candidateLocationLng ?? null,
                            job.location_lat, job.location_lng, null
                          );
                          if (estimatedKm != null) {
                            return (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-muted-foreground/70">
                                · <MapPin className="h-3 w-3 inline" />~{estimatedKm}km
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-xs ${
                      similarityPercent(job.similarity) >= 70
                        ? 'border-green-500/50 text-green-700 dark:text-green-400'
                        : similarityPercent(job.similarity) >= 50
                          ? 'border-amber-500/50 text-amber-700 dark:text-amber-400'
                          : 'border-muted'
                    }`}
                  >
                    {similarityPercent(job.similarity)}%
                  </Badge>
                  {!isMatched && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                        disabled={addingId === job.id}
                        onClick={(e) => {
                          e.preventDefault();
                          handleAddJob(job.id, job.title);
                        }}
                        title="Annehmen"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={dismissingId === job.id}
                        onClick={(e) => {
                          e.preventDefault();
                          handleDismissJob(job.id);
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

    {/* Review Dialog */}
    {candidateData && (
      <SuggestionReviewDialog
        isOpen={reviewDialogOpen}
        onClose={() => setReviewDialogOpen(false)}
        suggestions={visibleSuggestions}
        candidateData={candidateData}
        initialIndex={reviewInitialIndex}
        onAccept={async (jobId, jobTitle) => {
          await handleAddJob(jobId, jobTitle);
          queryClient.invalidateQueries({ queryKey: ['dismissed-job-suggestions', candidateId] });
        }}
        onDismiss={async (jobId) => {
          await handleDismissJob(jobId);
        }}
      />
    )}
    </>
  );
}
