import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { triggerAutoAnalysis } from "@/lib/autoAnalyzeMatch";
import { MoreVertical, Trash2, Sparkles, Pencil, XCircle, RotateCcw, Bell, MapPin, Car, Train, Info, CheckCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import { useQuery } from "@tanstack/react-query";
import { CandidateMatchDialog } from "@/components/CandidateMatchDialog";
import { AIMatchDetailDialog } from "@/components/AIMatchDetailDialog";
import { format } from "date-fns";
import { de, enUS, fr, it, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { translateRejectionReason } from "@/lib/rejectionReasonUtils";
import { JobEmbeddingSuggestions } from "@/components/JobEmbeddingSuggestions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MatchedJob {
  id: string;
  job_id: string;
  stage: string;
  notes?: any;
  follow_up?: boolean;
  match_score?: number | null;
  match_reasons?: any;
  match_strengths?: any;
  match_gaps?: any;
  match_risks?: any;
  commute_auto_duration?: string | null;
  commute_auto_distance?: string | null;
  commute_oepnv_duration?: string | null;
  commute_oepnv_distance?: string | null;
  jobs?: {
    id?: string;
    title: string;
    status?: string;
    client_id?: string;
    location?: string;
    salary_range?: string;
    description?: string;
    employment_type?: string;
    requirements?: string;
    responsibilities?: string;
    experience_level?: string;
    skills?: string[];
    clients?: {
      name: string;
    };
  };
}

// Helper: Match score color
const getMatchScoreColor = (score: number) => {
  if (score >= 80) return 'text-success';
  if (score >= 70) return 'text-warning';
  return 'text-muted-foreground';
};

// Inline commute + location display
function PlacementCommuteInfo({ placement }: { placement: MatchedJob }) {
  const location = placement.jobs?.location;
  const hasCommute = placement.commute_auto_duration || placement.commute_oepnv_duration;
  if (!location && !hasCommute) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
      {location && (
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {location}
        </span>
      )}
      {placement.commute_auto_duration && (
        <span className="flex items-center gap-1">
          <Car className="h-3 w-3" />
          {placement.commute_auto_duration}
          {placement.commute_auto_distance && <span className="text-muted-foreground/60">({placement.commute_auto_distance})</span>}
        </span>
      )}
      {placement.commute_oepnv_duration && (
        <span className="flex items-center gap-1">
          <Train className="h-3 w-3" />
          {placement.commute_oepnv_duration}
          {placement.commute_oepnv_distance && <span className="text-muted-foreground/60">({placement.commute_oepnv_distance})</span>}
        </span>
      )}
    </div>
  );
}

// Inline match score with info tooltip
function PlacementMatchScore({ placement }: { placement: MatchedJob }) {
  const { t } = useTranslation();
  if (!placement.match_score) return null;

  const strengths = Array.isArray(placement.match_strengths) ? placement.match_strengths : [];
  const gaps = Array.isArray(placement.match_gaps) ? placement.match_gaps : [];
  const risks = Array.isArray(placement.match_risks) ? placement.match_risks : [];
  const hasDetails = strengths.length > 0 || gaps.length > 0 || risks.length > 0;

  return (
    <div className="flex items-center gap-1 text-xs">
      <Sparkles className="h-3 w-3 text-primary" />
      <span className="font-medium">{placement.match_score}%</span>
      {hasDetails && (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Info className={`h-3.5 w-3.5 cursor-default ${getMatchScoreColor(placement.match_score)}`} />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs space-y-2 p-3">
              {strengths.length > 0 && (
                <div>
                  <p className="font-semibold flex items-center gap-1 text-success"><CheckCircle className="h-3 w-3" /> {t("pipeline.strengths", "Stärken")}</p>
                  <ul className="list-disc pl-4">{strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
              {gaps.length > 0 && (
                <div>
                  <p className="font-semibold flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" /> {t("pipeline.gaps", "Lücken")}</p>
                  <ul className="list-disc pl-4">{gaps.map((g: string, i: number) => <li key={i}>{g}</li>)}</ul>
                </div>
              )}
              {risks.length > 0 && (
                <div>
                  <p className="font-semibold flex items-center gap-1 text-destructive"><XCircle className="h-3 w-3" /> {t("pipeline.risks", "Risiken")}</p>
                  <ul className="list-disc pl-4">{risks.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

interface CandidateMatchesTabProps {
  matchedJobs: MatchedJob[];
  onMatchDeleted?: () => void;
  candidateId: string;
}

export function CandidateMatchesTab({ matchedJobs, onMatchDeleted, candidateId }: CandidateMatchesTabProps) {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const { configurations } = useStatusConfigurations();
  const [searchParams, setSearchParams] = useSearchParams();

  // State for edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState<MatchedJob | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editNote, setEditNote] = useState("");

  // State for reject dialog
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingPlacement, setRejectingPlacement] = useState<MatchedJob | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState<string[]>([]);

  // State for match dialog
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [selectedPlacement, setSelectedPlacement] = useState<MatchedJob | null>(null);

  // State for AI match detail dialog
  const [selectedAiMatch, setSelectedAiMatch] = useState<any | null>(null);

  const getDateLocale = () => {
    switch (i18n.language) {
      case 'de': return de;
      case 'fr': return fr;
      case 'it': return it;
      case 'es': return es;
      default: return enUS;
    }
  };

  const getStageColor = (stage: string) => {
    const stageColors: Record<string, string> = {
      "Ready2Send": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800",
      "Vorgestellt": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800",
      "Ready2Share": "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 border-teal-200 dark:border-teal-800",
      "Shared": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200 border-cyan-200 dark:border-cyan-800",
      "Inquiry": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-800",
      "Invitation": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800",
      "Interview 1": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-800",
      "Interview 2": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800",
      "Trial Day": "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200 border-pink-200 dark:border-pink-800",
      "Offered": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800",
      "Placed": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800",
      "Abgelehnt": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-800"
    };
    return stageColors[stage] || "bg-muted text-muted-foreground";
  };

  // Fetch candidate data
  const { data: candidateData } = useQuery({
    queryKey: ['candidate-for-matches', candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  // Fetch AI Matches for this candidate (only show 'new' status, hide accepted/rejected)
  const { data: aiMatches, refetch: refetchAiMatches } = useQuery({
    queryKey: ['ai-matches-candidate', candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_matches')
        .select(`
          *,
          jobs:job_id(*, clients(name))
        `)
        .eq('candidate_id', candidateId)
        .eq('status', 'new')
        .order('match_score', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch rejection reasons
  useEffect(() => {
    const fetchRejectionReasons = async () => {
      const { data } = await supabase
        .from('rejection_reasons')
        .select('reason')
        .order('reason');
      setRejectionReasons(data?.map(r => r.reason) || []);
    };
    fetchRejectionReasons();
  }, []);

  // Stage priority for sorting (higher = better/further in process)
  const stagePriority: Record<string, number> = {
    "Placed": 11,
    "Offered": 10,
    "Trial Day": 9,
    "Interview 2": 8,
    "Interview 1": 7,
    "Invitation": 6,
    "Inquiry": 5,
    "Shared": 4,
    "Ready2Share": 3,
    "Vorgestellt": 2,
    "Ready2Send": 1,
  };

  // Separate placed, active and rejected matches
  const placedMatches = matchedJobs.filter(job => job.stage === 'Placed');
  const activeMatches = matchedJobs
    .filter(job => job.stage !== 'Abgelehnt' && job.stage !== 'Placed')
    .sort((a, b) => (stagePriority[b.stage] || 0) - (stagePriority[a.stage] || 0));
  const rejectedMatches = matchedJobs.filter(job => job.stage === 'Abgelehnt');

  const handleDeleteMatch = async (placementId: string, jobTitle: string) => {
    try {
      const { error } = await supabase
        .from('placements')
        .delete()
        .eq('id', placementId);

      if (error) throw error;

      toast({
        title: t("matches.resolved"),
        description: t("matches.resolvedDesc", { job: jobTitle }),
      });

      onMatchDeleted?.();
    } catch (error) {
      console.error('Error deleting match:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.resolveError"),
        variant: "destructive",
      });
    }
  };

  const handleStageChange = async (placementId: string, newStage: string, fromStage?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get current placement to access notes and job_id
      const { data: placement } = await supabase
        .from('placements')
        .select('notes, stage, job_id')
        .eq('id', placementId)
        .single();

      const currentNotes = Array.isArray(placement?.notes) ? [...placement.notes] : [];
      const previousStage = fromStage || placement?.stage;
      const isReactivation = previousStage === 'Abgelehnt';
      
      // If reactivating a match, check if the job is archived and reactivate it
      if (isReactivation && placement?.job_id) {
        const { data: jobData } = await supabase
          .from('jobs')
          .select('status')
          .eq('id', placement.job_id)
          .single();
        
        if (jobData?.status === 'Archived') {
          await supabase
            .from('jobs')
            .update({ status: 'Active' })
            .eq('id', placement.job_id);
          
          toast({
            title: t("jobs.jobReactivated") || "Stelle reaktiviert",
            description: t("jobs.jobReactivatedDesc") || "Die archivierte Stelle wurde automatisch wieder aktiviert.",
          });
        }
      }
      
      // Add activity log entry for stage change
      currentNotes.push({
        type: 'activity',
        action: isReactivation ? 'match_reactivated' : 'stage_changed',
        from_stage: previousStage,
        to_stage: newStage,
        user_id: user?.id,
        created_at: new Date().toISOString(),
      });

      const { error } = await supabase
        .from('placements')
        .update({ stage: newStage, notes: currentNotes })
        .eq('id', placementId);

      if (error) throw error;

      toast({
        title: t("matches.stageUpdated"),
        description: t("matches.stageUpdatedDesc", { stage: newStage }),
      });

      onMatchDeleted?.(); // Refresh the data
    } catch (error) {
      console.error('Error updating stage:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.stageUpdateError"),
        variant: "destructive",
      });
    }
  };

  const handleToggleFollowUp = async (placementId: string, currentFollowUp: boolean) => {
    try {
      const { error } = await supabase
        .from('placements')
        .update({ follow_up: !currentFollowUp })
        .eq('id', placementId);

      if (error) throw error;
      onMatchDeleted?.(); // Refresh the data
    } catch (error) {
      console.error('Error toggling follow-up:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.saveError"),
        variant: "destructive",
      });
    }
  };

  const handleAcceptAiMatch = async (matchId: string, jobTitle: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get the AI match details
      const aiMatch = aiMatches?.find(m => m.id === matchId);
      if (!aiMatch) return;

      // Update AI match status to accepted
      const { error: updateError } = await supabase
        .from('ai_matches')
        .update({ status: 'accepted' })
        .eq('id', matchId);

      if (updateError) throw updateError;

      // Create a placement with AI match metadata
      const { data: placementData, error: placementError } = await supabase
        .from('placements')
        .insert({
          user_id: user.id,
          candidate_id: candidateId,
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
        triggerAutoAnalysis(placementData.id, candidateId, aiMatch.job_id);
      }

      toast({
        title: t("matches.accepted"),
        description: `${t("candidates.title")} ${t("matches.matchedSuccess")} ${jobTitle}`,
      });

      refetchAiMatches();
      onMatchDeleted?.(); // Refresh the placements
    } catch (error) {
      console.error('Error accepting AI match:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.acceptError"),
        variant: "destructive",
      });
    }
  };

  const handleRejectAiMatch = async (matchId: string) => {
    try {
      const { error } = await supabase
        .from('ai_matches')
        .update({ status: 'rejected' })
        .eq('id', matchId);

      if (error) throw error;

      toast({
        title: t("matches.rejected"),
        description: t("matches.rejectedSuccess"),
      });

      refetchAiMatches();
    } catch (error) {
      console.error('Error rejecting AI match:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.rejectError"),
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (placement: MatchedJob) => {
    setEditingPlacement(placement);
    // Extract rejection info from notes
    const rejectionNoteEntry = Array.isArray(placement.notes) 
      ? placement.notes.find((n: any) => n.type === 'rejection_note')
      : null;
    setEditReason(rejectionNoteEntry?.rejection_reason || "");
    setEditNote(rejectionNoteEntry?.text || "");
    setEditDialogOpen(true);
  };

  const handleSaveRejectionEdit = async () => {
    if (!editingPlacement) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get current notes array
      const currentNotes = Array.isArray(editingPlacement.notes) ? [...editingPlacement.notes] : [];
      
      // Find and update the rejection note
      const rejectionNoteIndex = currentNotes.findIndex((n: any) => n.type === 'rejection_note');
      
      if (rejectionNoteIndex >= 0) {
        currentNotes[rejectionNoteIndex] = {
          ...currentNotes[rejectionNoteIndex],
          rejection_reason: editReason,
          text: editNote,
          updated_at: new Date().toISOString(),
        };
      } else {
        // Create new rejection note if none exists
        currentNotes.push({
          type: 'rejection_note',
          rejection_reason: editReason,
          text: editNote,
          created_at: new Date().toISOString(),
        });
      }

      // Add activity log entry for rejection edit
      currentNotes.push({
        type: 'activity',
        action: 'rejection_edited',
        user_id: user?.id,
        created_at: new Date().toISOString(),
      });

      const { error } = await supabase
        .from('placements')
        .update({ notes: currentNotes })
        .eq('id', editingPlacement.id);

      if (error) throw error;

      toast({
        title: t("toast.saved"),
        description: t("toast.saveSuccess"),
      });

      setEditDialogOpen(false);
      setEditingPlacement(null);
      onMatchDeleted?.(); // Refresh the data
    } catch (error) {
      console.error('Error updating rejection:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.saveError"),
        variant: "destructive",
      });
    }
  };

  const openRejectDialog = (placement: MatchedJob) => {
    setRejectingPlacement(placement);
    setRejectReason("");
    setRejectNote("");
    setRejectDialogOpen(true);
  };

  const handleRejectPlacement = async () => {
    if (!rejectingPlacement) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get current notes array
      const currentNotes = Array.isArray(rejectingPlacement.notes) ? [...rejectingPlacement.notes] : [];
      
      // Add rejection note
      currentNotes.push({
        type: 'rejection_note',
        rejection_reason: rejectReason,
        text: rejectNote,
        rejected_from_stage: rejectingPlacement.stage,
        rejected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      // Add activity log entry for rejection
      currentNotes.push({
        type: 'activity',
        action: 'match_rejected',
        from_stage: rejectingPlacement.stage,
        rejection_reason: rejectReason,
        user_id: user?.id,
        created_at: new Date().toISOString(),
      });

      const { error } = await supabase
        .from('placements')
        .update({ 
          stage: 'Abgelehnt',
          notes: currentNotes 
        })
        .eq('id', rejectingPlacement.id);

      if (error) throw error;

      toast({
        title: t("matches.rejected"),
        description: t("matches.rejectedSuccess"),
      });

      setRejectDialogOpen(false);
      setRejectingPlacement(null);
      onMatchDeleted?.(); // Refresh the data
    } catch (error) {
      console.error('Error rejecting placement:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.rejectError"),
        variant: "destructive",
      });
    }
  };

  const existingJobIds = matchedJobs.map(m => m.job_id);

  if (matchedJobs.length === 0 && (!aiMatches || aiMatches.length === 0) && !candidateData?.embedding) {
    return (
      <Card className="mt-6">
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">
            {t("matches.noMatchesYet")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* AI Matches */}
      {aiMatches && aiMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("matches.aiMatches")}
            </CardTitle>
            <CardDescription>{t("matches.aiMatchesDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {aiMatches.map((match: any) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => setSelectedAiMatch(match)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium truncate">{match.jobs?.title}</p>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        {match.match_score}%
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {match.jobs?.clients?.name || t("matches.noCompany")}
                    </p>
                    {match.match_reasons && match.match_reasons.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {match.match_reasons[0]}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleAcceptAiMatch(match.id, match.jobs?.title || '')}
                    >
                      {t("matches.accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRejectAiMatch(match.id)}
                    >
                      {t("matches.reject")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Placed Matches - shown above active matches */}
      {placedMatches.length > 0 && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-blue-700 dark:text-blue-400">{t("matches.placedMatches")}</CardTitle>
            <CardDescription>{t("matches.placedMatchesDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {placedMatches.map((placement) => (
                <div
                  key={placement.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100/50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedPlacement(placement);
                    setShowMatchDialog(true);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{placement.jobs?.title}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {placement.jobs?.clients?.name || t("matches.noCompany")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 px-4 shrink-0">
                    <PlacementCommuteInfo placement={placement} />
                    <PlacementMatchScore placement={placement} />
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Badge className={`${getStageColor(placement.stage)} whitespace-nowrap`}>{placement.stage}</Badge>
                    {placement.jobs?.status && (
                      <Badge variant="outline">{placement.jobs.status}</Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMatch(placement.id, placement.jobs?.title || '');
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t("matches.resolve")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Matches */}
      {activeMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("matches.activeMatches")}</CardTitle>
            <CardDescription>{t("matches.activeMatchesDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeMatches.map((placement) => (
                <div
                  key={placement.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedPlacement(placement);
                    setShowMatchDialog(true);
                  }}
                >
                    <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{placement.jobs?.title}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {placement.jobs?.clients?.name || t("matches.noCompany")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 px-4 shrink-0">
                    <PlacementCommuteInfo placement={placement} />
                    <PlacementMatchScore placement={placement} />
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {placement.stage === 'Shared' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFollowUp(placement.id, placement.follow_up || false);
                        }}
                      >
                        <Bell className={`h-4 w-4 ${placement.follow_up ? 'text-blue-500 fill-blue-500' : 'text-muted-foreground'}`} />
                      </Button>
                    )}
                    {(placement as any).from_ai_match && (
                      <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 p-1 h-5 w-5 flex items-center justify-center">
                        <Sparkles className="h-3 w-3" />
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <button className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-opacity cursor-pointer hover:opacity-80 ${getStageColor(placement.stage)} whitespace-nowrap`}>
                          {placement.stage}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                        {configurations.matchStages
                          .filter(s => s.label !== 'Abgelehnt')
                          .map((stage) => (
                          <DropdownMenuItem
                            key={stage.id}
                            disabled={placement.stage === stage.label}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStageChange(placement.id, stage.label, placement.stage);
                            }}
                          >
                            <Badge className={`${getStageColor(stage.label)} mr-2 text-xs`}>{stage.label}</Badge>
                            {placement.stage === stage.label && " ✓"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {placement.jobs?.status && (
                      <Badge variant="outline">{placement.jobs.status}</Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRejectDialog(placement);
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          {t("matches.reject")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMatch(placement.id, placement.jobs?.title || '');
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t("matches.resolve")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Embedding Suggestions */}
      <JobEmbeddingSuggestions
        candidateId={candidateId}
        candidateEmbedding={candidateData?.embedding || null}
        candidateIndustry={candidateData?.industry}
        candidateLocationLat={(candidateData as any)?.location_lat}
        candidateLocationLng={(candidateData as any)?.location_lng}
        candidateMaxCommute={candidateData?.max_commute}
        candidateWorkExperience={candidateData?.work_experience as any[] || []}
        existingJobIds={existingJobIds}
        onJobAdded={onMatchDeleted}
        candidateData={candidateData}
      />

      {/* Rejected Matches */}
      {rejectedMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("matches.rejectedMatches")}</CardTitle>
            <CardDescription>{t("matches.rejectedMatchesDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rejectedMatches.map((placement) => {
                const rejectionNoteEntry = Array.isArray(placement.notes) 
                  ? placement.notes.find((n: any) => n.type === 'rejection_note')
                  : null;
                let rejectionReason = rejectionNoteEntry?.rejection_reason;
                let rejectionNote = rejectionNoteEntry?.text;
                const rejectedFromStage = rejectionNoteEntry?.rejected_from_stage;
                const rejectedAt = rejectionNoteEntry?.rejected_at;
                
                // Fallback for older data structure: extract reason from text field
                if (!rejectionReason && rejectionNote) {
                  const reasonMatch = rejectionNote.match(/Absagegründe?:\s*([^\n]+)/i);
                  if (reasonMatch) {
                    rejectionReason = reasonMatch[1].trim();
                    const noteMatch = rejectionNote.match(/Notiz:\s*(.+)/is);
                    rejectionNote = noteMatch ? noteMatch[1].trim() : '';
                  }
                }
                
                // Get available stages excluding "Abgelehnt"
                const availableStages = configurations.matchStages.filter(s => s.label !== 'Abgelehnt');
                
                return (
                  <div
                    key={placement.id}
                    className="p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setSelectedPlacement(placement);
                      setShowMatchDialog(true);
                    }}
                  >
                    {/* Header Row: Job Title, Company, Status Badge, and Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{placement.jobs?.title}</p>
                          <span className="text-muted-foreground text-sm">•</span>
                          <p className="text-sm text-muted-foreground truncate">
                            {placement.jobs?.clients?.name || t("matches.noCompany")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 px-4 shrink-0">
                        <PlacementCommuteInfo placement={placement} />
                        <PlacementMatchScore placement={placement} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button 
                              variant="ghost" 
                              className="h-auto p-0 hover:bg-transparent"
                            >
                              <Badge variant="destructive" className="cursor-pointer hover:bg-destructive/80 transition-colors text-xs">
                                {t("matches.rejected")}
                              </Badge>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[100] bg-popover border shadow-lg">
                            {availableStages.map((stage) => (
                              <DropdownMenuItem 
                                key={stage.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStageChange(placement.id, stage.label);
                                }}
                                className="cursor-pointer"
                              >
                                {t("matches.moveToStage", { stage: stage.label })}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[100] bg-popover border shadow-lg">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStageChange(placement.id, rejectedFromStage || 'Ready2Send');
                              }}
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              {t("matches.reactivate")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(placement);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              {t("matches.editRejection")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMatch(placement.id, placement.jobs?.title || '');
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t("matches.resolve")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    
                    {/* Rejection Details Row - compact horizontal layout */}
                    {(rejectedFromStage || rejectedAt || rejectionReason) && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {rejectedFromStage && (
                            <span className="flex items-center gap-1">
                              <span className="font-medium">{t("matches.rejectedFrom")}:</span>
                              <Badge variant="outline" className="text-xs py-0 h-5">{rejectedFromStage}</Badge>
                            </span>
                          )}
                          {rejectedAt && (
                            <span>
                              <span className="font-medium">{t("matches.rejectedAt")}:</span>{' '}
                              {format(new Date(rejectedAt), 'dd.MM.yyyy', { locale: getDateLocale() })}
                            </span>
                          )}
                          {rejectionReason && (
                            <span>
                              <span className="font-medium">{t("matches.rejectionReason")}:</span>{' '}
                              {translateRejectionReason(rejectionReason)}
                            </span>
                          )}
                          {rejectionNote && (
                            <span className="italic break-words whitespace-pre-wrap">
                              <span className="font-medium not-italic">{t("matches.note")}:</span>{' '}
                              {rejectionNote}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Rejection Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("matches.editRejection")}</DialogTitle>
            <DialogDescription>
              {editingPlacement?.jobs?.title} - {editingPlacement?.jobs?.clients?.name || t("matches.noCompany")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("matches.rejectionReason")}</Label>
              <Select value={editReason} onValueChange={setEditReason}>
                <SelectTrigger>
                  <SelectValue placeholder={t("matches.selectReason")} />
                </SelectTrigger>
                <SelectContent>
                  {rejectionReasons.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {translateRejectionReason(reason)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("matches.note")}</Label>
              <Textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder={t("matches.addNote")}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveRejectionEdit}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("matches.reject")}</DialogTitle>
            <DialogDescription>
              {rejectingPlacement?.jobs?.title} - {rejectingPlacement?.jobs?.clients?.name || t("matches.noCompany")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("matches.rejectionReason")}</Label>
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger>
                  <SelectValue placeholder={t("matches.selectReason")} />
                </SelectTrigger>
                <SelectContent>
                  {rejectionReasons.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {translateRejectionReason(reason)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("matches.note")} ({t("common.optional")})</Label>
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder={t("matches.addNote")}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleRejectPlacement}>
              {t("matches.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Match Dialog */}
      {selectedPlacement && selectedPlacement.jobs && candidateData && (
        <CandidateMatchDialog
          isOpen={showMatchDialog}
          onClose={() => {
            setShowMatchDialog(false);
            setSelectedPlacement(null);
            onMatchDeleted?.();
          }}
          onUpdate={onMatchDeleted}
          candidate={{
            id: candidateData.id as any,
            name: candidateData.name || '',
            position: candidateData.position,
            desired_position: candidateData.desired_position,
            avatar_url: candidateData.avatar_url,
            email: candidateData.email || '',
            phone: candidateData.phone || '',
            location: candidateData.location || '',
            skills: candidateData.skills || [],
            experience: candidateData.experience || '',
            current_salary: candidateData.current_salary,
            desired_salary: candidateData.desired_salary,
            initials: (candidateData.name || '').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
            status: candidateData.status,
            recruiting_status: candidateData.recruiting_status,
            industry: candidateData.industry,
            birthdate: candidateData.birthdate,
            workload: candidateData.workload,
            willing_to_relocate: candidateData.willing_to_relocate,
            max_commute: candidateData.max_commute,
            reason_for_change: candidateData.reason_for_change,
            languages: candidateData.languages as { name: string; level: string }[] | undefined,
            further_education: candidateData.further_education as { name: string; institution?: string; date?: string; description?: string }[] | undefined,
            education: candidateData.education as { field?: string; degree?: string; endDate?: string; startDate?: string; institution?: string; grade?: string }[] | undefined,
            work_experience: candidateData.work_experience as { company: string; position: string; duration?: string; startDate?: string; endDate?: string; description?: string }[] | undefined,
          }}
          job={{
            id: selectedPlacement.job_id as any,
            title: selectedPlacement.jobs.title,
            company: selectedPlacement.jobs.clients?.name || t("matches.noCompany"),
            client_id: selectedPlacement.jobs.client_id,
            location: selectedPlacement.jobs.location || '',
            employment_type: selectedPlacement.jobs.employment_type,
            salary: selectedPlacement.jobs.salary_range || '',
            salary_range: selectedPlacement.jobs.salary_range,
            description: selectedPlacement.jobs.description || '',
            requirements: selectedPlacement.jobs.requirements || '',
            responsibilities: selectedPlacement.jobs.responsibilities || '',
            status: selectedPlacement.jobs.status,
            experience_level: selectedPlacement.jobs.experience_level,
            skills: selectedPlacement.jobs.skills,
            benefits: (selectedPlacement.jobs as any).benefits,
          }}
          stage={selectedPlacement.stage}
          placementId={selectedPlacement.id}
        />
      )}

      {/* AI Match Detail Dialog */}
      {selectedAiMatch && candidateData && (
        <AIMatchDetailDialog
          isOpen={!!selectedAiMatch}
          onClose={() => setSelectedAiMatch(null)}
          match={{
            id: selectedAiMatch.id,
            candidate_id: candidateId,
            job_id: selectedAiMatch.job_id,
            match_score: selectedAiMatch.match_score,
            match_reasons: selectedAiMatch.match_reasons || [],
            status: selectedAiMatch.status,
            candidates: {
              id: candidateData.id,
              name: candidateData.name,
              position: candidateData.position || '',
              desired_position: candidateData.desired_position || '',
              location: candidateData.location || '',
              desired_salary: candidateData.desired_salary || '',
              email: candidateData.email || undefined,
              phone: candidateData.phone || undefined,
              skills: candidateData.skills || [],
              avatar_url: candidateData.avatar_url || undefined,
              max_commute: candidateData.max_commute || undefined,
              notes: typeof candidateData.notes === 'string' ? candidateData.notes : undefined,
              languages: candidateData.languages as any,
              education: candidateData.education as any,
              work_experience: candidateData.work_experience as any,
              further_education: candidateData.further_education as any,
              industry: candidateData.industry || undefined,
              status: candidateData.status || undefined,
              birthdate: candidateData.birthdate || undefined,
              current_salary: candidateData.current_salary || undefined,
              workload: candidateData.workload || undefined,
              willing_to_relocate: candidateData.willing_to_relocate || undefined,
              experience: candidateData.experience || undefined,
            },
            jobs: {
              id: selectedAiMatch.jobs?.id || selectedAiMatch.job_id,
              title: selectedAiMatch.jobs?.title || '',
              location: selectedAiMatch.jobs?.location || '',
              salary_range: selectedAiMatch.jobs?.salary_range || '',
              description: selectedAiMatch.jobs?.description || undefined,
              requirements: selectedAiMatch.jobs?.requirements || undefined,
              responsibilities: selectedAiMatch.jobs?.responsibilities || undefined,
              benefits: selectedAiMatch.jobs?.benefits || undefined,
              skills: selectedAiMatch.jobs?.skills || [],
              employment_type: selectedAiMatch.jobs?.employment_type || undefined,
              experience_level: selectedAiMatch.jobs?.experience_level || undefined,
              clients: selectedAiMatch.jobs?.clients || null,
            },
          }}
          onAccept={() => {
            handleAcceptAiMatch(selectedAiMatch.id, selectedAiMatch.jobs?.title || '');
            const currentIndex = aiMatches.findIndex((m: any) => m.id === selectedAiMatch.id);
            const remaining = aiMatches.filter((m: any) => m.id !== selectedAiMatch.id);
            const nextMatch = remaining[Math.min(currentIndex, remaining.length - 1)] || null;
            setSelectedAiMatch(nextMatch);
          }}
          onReject={() => {
            handleRejectAiMatch(selectedAiMatch.id);
            const currentIndex = aiMatches.findIndex((m: any) => m.id === selectedAiMatch.id);
            const remaining = aiMatches.filter((m: any) => m.id !== selectedAiMatch.id);
            const nextMatch = remaining[Math.min(currentIndex, remaining.length - 1)] || null;
            setSelectedAiMatch(nextMatch);
          }}
          isUpdating={false}
        />
      )}
    </div>
  );
}
