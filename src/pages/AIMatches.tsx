import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Loader2, Eye } from "lucide-react";
import { useAIMatching } from "@/contexts/AIMatchingContext";
import { AIMatchCard } from "@/components/AIMatchCard";
import { AIMatchDetailDialog } from "@/components/AIMatchDetailDialog";
import { triggerAutoAnalysis } from "@/lib/autoAnalyzeMatch";

interface AIMatch {
  id: string;
  candidate_id: string;
  job_id: string;
  match_score: number;
  match_reasons: string[];
  status: string;
  created_at: string;
  candidates: {
    id: string;
    name: string;
    position: string;
    desired_position: string;
    location: string;
    desired_salary: string;
    email?: string;
    phone?: string;
    skills?: string[];
    avatar_url?: string;
    max_commute?: string;
  };
  jobs: {
    id: string;
    title: string;
    location: string;
    salary_range: string;
    description?: string;
    requirements?: string;
    skills?: string[];
    clients: {
      name: string;
    } | null;
  };
}

export default function AIMatches() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { jobProgress, isGenerating, startMatching } = useAIMatching();
  const [selectedMatch, setSelectedMatch] = useState<AIMatch | null>(null);
  const [activeTab, setActiveTab] = useState<string>("new");

  const { data: matches, isLoading } = useQuery({
    queryKey: ['ai-matches'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('ai_matches')
        .select(`
          *,
          candidates(
            id, name, position, desired_position, location, desired_salary, 
            email, phone, skills, avatar_url, max_commute,
            notes, languages, education, work_experience, certifications,
            status, industry, birthdate, workload, willing_to_relocate,
            current_salary, experience, reason_for_change
          ),
          jobs(
            id, title, location, salary_range, description, requirements, 
            responsibilities, benefits, skills, employment_type, experience_level,
            source_url,
            clients(name, id)
          )
        `)
        .eq('user_id', user.id)
        .in('status', ['new', 'review'])
        .order('match_score', { ascending: false });

      if (error) throw error;
      return data as unknown as AIMatch[];
    },
  });

  const newMatches = matches?.filter(m => m.status === 'new') || [];
  const reviewMatches = matches?.filter(m => m.status === 'review') || [];

  const updateMatchStatus = useMutation({
    mutationFn: async ({ matchId, status }: { matchId: string; status: string }) => {
      // Get the AI match details first
      const { data: aiMatch, error: fetchError } = await supabase
        .from('ai_matches')
        .select('candidate_id, job_id, match_score, match_reasons')
        .eq('id', matchId)
        .single();
      
      if (fetchError) throw fetchError;

      // Update AI match status
      const { error: updateError } = await supabase
        .from('ai_matches')
        .update({ status })
        .eq('id', matchId);

      if (updateError) throw updateError;

      // If accepted, create a placement
      if (status === 'accepted') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data: placementData, error: placementError } = await supabase
          .from('placements')
          .insert({
            user_id: user.id,
            candidate_id: aiMatch.candidate_id,
            job_id: aiMatch.job_id,
            stage: 'Ready2Send',
            match_score: aiMatch.match_score,
            match_reasons: aiMatch.match_reasons,
            from_ai_match: true,
          })
          .select('id')
          .single();

        if (placementError) throw placementError;

        // Trigger auto analysis in background
        if (placementData) {
          triggerAutoAnalysis(placementData.id, aiMatch.candidate_id, aiMatch.job_id);
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-matches'] });
      queryClient.invalidateQueries({ queryKey: ['placements'] });
      setSelectedMatch(null);
      toast.success(status === 'accepted' ? t('aiMatches.matchAccepted') : t('aiMatches.matchRejected'));
    },
    onError: () => {
      toast.error(t('toast.updateError'));
    },
  });

  const handleAccept = () => {
    if (selectedMatch) {
      updateMatchStatus.mutate({ matchId: selectedMatch.id, status: 'accepted' });
    }
  };

  const handleReject = () => {
    if (selectedMatch) {
      updateMatchStatus.mutate({ matchId: selectedMatch.id, status: 'rejected' });
    }
  };

  const handleStartMatching = () => {
    // Pass the current language to the matching function
    startMatching(i18n.language);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            {t('nav.aiMatches')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('aiMatches.subtitle')}
          </p>
        </div>
        <Button 
          onClick={handleStartMatching} 
          disabled={isGenerating}
          size="lg"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              {t('aiMatches.analyzing')}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {t('aiMatches.generateMatches')}
            </>
          )}
        </Button>
      </div>

      {/* Progress Card */}
      {jobProgress && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{jobProgress.message || t('aiMatches.processing')}</span>
                  <span className="text-sm text-muted-foreground">{jobProgress.progress}%</span>
                </div>
                <Progress value={jobProgress.progress} className="h-2" />
                {jobProgress.stats && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {jobProgress.processed_candidates || 0} / {jobProgress.total_candidates || '?'} {t('aiMatches.candidatesProcessed')}
                    {jobProgress.new_matches !== null && ` • ${jobProgress.new_matches} ${t('aiMatches.newMatches')}`}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : matches && matches.length > 0 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="new" className="gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Matches ({newMatches.length})
            </TabsTrigger>
            {reviewMatches.length > 0 && (
              <TabsTrigger value="review" className="gap-2">
                <Eye className="h-3.5 w-3.5" />
                Prüfen ({reviewMatches.length})
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="new" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {newMatches.map((match) => (
                <AIMatchCard
                  key={match.id}
                  match={match}
                  onClick={() => setSelectedMatch(match)}
                  onAccept={() => updateMatchStatus.mutate({ matchId: match.id, status: 'accepted' })}
                  onReject={() => updateMatchStatus.mutate({ matchId: match.id, status: 'rejected' })}
                  isUpdating={updateMatchStatus.isPending}
                />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="review" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Diese Matches liegen im Grenzbereich (65-69%) und sollten manuell geprüft werden.
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {reviewMatches.map((match) => (
                <div key={match.id} className="relative">
                  <Badge className="absolute top-2 right-2 z-10 bg-amber-500/90 text-white text-[10px]">
                    Prüfen
                  </Badge>
                  <AIMatchCard
                    match={match}
                    onClick={() => setSelectedMatch(match)}
                    onAccept={() => updateMatchStatus.mutate({ matchId: match.id, status: 'accepted' })}
                    onReject={() => updateMatchStatus.mutate({ matchId: match.id, status: 'rejected' })}
                    isUpdating={updateMatchStatus.isPending}
                  />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="p-12 text-center">
          <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{t('aiMatches.noMatches')}</h3>
          <p className="text-muted-foreground mb-4">
            {t('aiMatches.noMatchesDesc')}
          </p>
          <Button onClick={handleStartMatching} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {t('aiMatches.analyzing')}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {t('aiMatches.generateMatches')}
              </>
            )}
          </Button>
        </Card>
      )}

      {/* Match Detail Dialog */}
      {selectedMatch && (
        <AIMatchDetailDialog
          isOpen={!!selectedMatch}
          onClose={() => setSelectedMatch(null)}
          match={selectedMatch}
          onAccept={handleAccept}
          onReject={handleReject}
          isUpdating={updateMatchStatus.isPending}
        />
      )}
    </div>
  );
}
