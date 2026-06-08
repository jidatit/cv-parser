import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MoreVertical, Trash2, Sparkles, Pencil, RotateCcw, Bell, XCircle } from "lucide-react";
import { EmbeddingSuggestions } from "@/components/EmbeddingSuggestions";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import { useQuery } from "@tanstack/react-query";
import { CandidateMatchDialog } from "@/components/CandidateMatchDialog";
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
import { getStatusColor } from "@/lib/statusUtils";

interface MatchedCandidate {
  id: string;
  candidate_id: string;
  stage: string;
  notes?: any;
  follow_up?: boolean;
  match_score?: number | null;
  match_reasons?: any;
  candidates?: {
    id: string;
    name: string;
    position?: string;
    avatar_url?: string;
    status?: string;
    email?: string;
    phone?: string;
    location?: string;
    skills?: string[];
    experience?: string;
    current_salary?: string;
    desired_salary?: string;
    recruiting_status?: string;
    industry?: string;
    birthdate?: string;
    workload?: string;
    willing_to_relocate?: string;
    max_commute?: string;
    reason_for_change?: string;
    languages?: any;
    further_education?: any;
    education?: any;
    work_experience?: any;
    desired_position?: string;
  };
}

interface JobMatchesTabProps {
  matchedCandidates: MatchedCandidate[];
  onMatchUpdated?: () => void;
  jobId: string;
  job: any;
}

export function JobMatchesTab({ matchedCandidates, onMatchUpdated, jobId, job }: JobMatchesTabProps) {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const { configurations } = useStatusConfigurations();

  // State for edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState<MatchedCandidate | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editNote, setEditNote] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState<string[]>([]);

  // State for match dialog
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [selectedPlacement, setSelectedPlacement] = useState<MatchedCandidate | null>(null);

  // State for reject dialog
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingPlacement, setRejectingPlacement] = useState<MatchedCandidate | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");

  const getDateLocale = () => {
    switch (i18n.language) {
      case 'de': return de;
      case 'fr': return fr;
      case 'it': return it;
      case 'es': return es;
      default: return enUS;
    }
  };

  // Fetch AI Matches for this job
  const { data: aiMatches, refetch: refetchAiMatches } = useQuery({
    queryKey: ['ai-matches-job', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_matches')
        .select(`
          *,
          candidates(id, name, avatar_url, position, status)
        `)
        .eq('job_id', jobId)
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

  // Separate active and rejected matches
  const activeMatches = matchedCandidates.filter(c => c.stage !== 'Abgelehnt');
  const rejectedMatches = matchedCandidates.filter(c => c.stage === 'Abgelehnt');

  const handleDeleteMatch = async (placementId: string, candidateName: string) => {
    try {
      const { error } = await supabase
        .from('placements')
        .delete()
        .eq('id', placementId);

      if (error) throw error;

      toast({
        title: t("matches.resolved"),
        description: t("matches.resolvedDesc", { job: candidateName }),
      });

      onMatchUpdated?.();
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
      
      // Get current placement to access notes
      const { data: placement } = await supabase
        .from('placements')
        .select('notes, stage')
        .eq('id', placementId)
        .single();

      const currentNotes = Array.isArray(placement?.notes) ? [...placement.notes] : [];
      const previousStage = fromStage || placement?.stage;
      const isReactivation = previousStage === 'Abgelehnt';
      
      // If reactivating a match, check if the job is archived and reactivate it
      if (isReactivation && jobId) {
        const { data: jobData } = await supabase
          .from('jobs')
          .select('status')
          .eq('id', jobId)
          .single();
        
        if (jobData?.status === 'Archived') {
          await supabase
            .from('jobs')
            .update({ status: 'Active' })
            .eq('id', jobId);
          
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

      onMatchUpdated?.();
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
      onMatchUpdated?.(); // Refresh the data
    } catch (error) {
      console.error('Error toggling follow-up:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.saveError"),
        variant: "destructive",
      });
    }
  };

  const handleAcceptAiMatch = async (matchId: string, candidateName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const aiMatch = aiMatches?.find(m => m.id === matchId);
      if (!aiMatch) return;

      const { error: updateError } = await supabase
        .from('ai_matches')
        .update({ status: 'accepted' })
        .eq('id', matchId);

      if (updateError) throw updateError;

      // Create a placement with AI match metadata
      const { error: placementError } = await supabase
        .from('placements')
        .insert({
          user_id: user.id,
          candidate_id: aiMatch.candidate_id,
          job_id: jobId,
          stage: 'Ready2Send',
          match_score: aiMatch.match_score,
          match_reasons: aiMatch.match_reasons,
          from_ai_match: true,
        });

      if (placementError) throw placementError;

      toast({
        title: t("matches.accepted"),
        description: `${candidateName} ${t("matches.matchedSuccess")}`,
      });

      refetchAiMatches();
      onMatchUpdated?.();
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

  const openEditDialog = (placement: MatchedCandidate) => {
    setEditingPlacement(placement);
    const rejectionNoteEntry = Array.isArray(placement.notes) 
      ? placement.notes.find((n: any) => n.type === 'rejection_note')
      : null;
    setEditReason(rejectionNoteEntry?.rejection_reason || "");
    setEditNote(rejectionNoteEntry?.text || "");
    setEditDialogOpen(true);
  };

  const openRejectDialog = (placement: MatchedCandidate) => {
    setRejectingPlacement(placement);
    setRejectReason("");
    setRejectNote("");
    setRejectDialogOpen(true);
  };

  const handleRejectPlacement = async () => {
    if (!rejectingPlacement) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const currentNotes = Array.isArray(rejectingPlacement.notes) ? [...rejectingPlacement.notes] : [];
      
      // Add rejection note entry
      currentNotes.push({
        type: 'rejection_note',
        rejection_reason: rejectReason,
        text: rejectNote,
        rejected_from_stage: rejectingPlacement.stage,
        rejected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      // Add activity log entry
      currentNotes.push({
        type: 'activity',
        action: 'match_rejected',
        from_stage: rejectingPlacement.stage,
        to_stage: 'Abgelehnt',
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
      onMatchUpdated?.();
    } catch (error) {
      console.error('Error rejecting placement:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.saveError"),
        variant: "destructive",
      });
    }
  };

  const handleSaveRejectionEdit = async () => {
    if (!editingPlacement) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const currentNotes = Array.isArray(editingPlacement.notes) ? [...editingPlacement.notes] : [];
      const rejectionNoteIndex = currentNotes.findIndex((n: any) => n.type === 'rejection_note');
      
      if (rejectionNoteIndex >= 0) {
        currentNotes[rejectionNoteIndex] = {
          ...currentNotes[rejectionNoteIndex],
          rejection_reason: editReason,
          text: editNote,
          updated_at: new Date().toISOString(),
        };
      } else {
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
      onMatchUpdated?.();
    } catch (error) {
      console.error('Error updating rejection:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.saveError"),
        variant: "destructive",
      });
    }
  };

  // Collect existing candidate IDs for embedding suggestions filter
  const existingCandidateIds = [
    ...matchedCandidates.map(m => m.candidate_id),
    ...(aiMatches?.map((m: any) => m.candidate_id) || []),
  ];

  const hasNoContent = matchedCandidates.length === 0 && (!aiMatches || aiMatches.length === 0) && !job?.embedding;
  
  if (hasNoContent) {
    return (
      <Card className="mt-6">
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">
            {t("matches.noJobMatchesYet", "Für diese Stelle wurden noch keine Matches erstellt.")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Active Matches - always shown first */}
      {activeMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("matches.activeMatches")}</CardTitle>
            <CardDescription>{t("matches.matchedCandidates")}</CardDescription>
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
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar>
                      {placement.candidates?.avatar_url && (
                        <AvatarImage src={placement.candidates.avatar_url} />
                      )}
                      <AvatarFallback>
                        {placement.candidates?.name?.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{placement.candidates?.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {placement.candidates?.position || t("candidates.noPosition")}
                      </p>
                    </div>
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
                    <Badge className={getStatusColor(placement.stage)}>{placement.stage}</Badge>
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
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMatch(placement.id, placement.candidates?.name || '');
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

      {/* AI Matches */}
      {aiMatches && aiMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("matches.aiMatches")}
            </CardTitle>
            <CardDescription>{t("matches.aiSuggested")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {aiMatches.map((match: any) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <Link
                    to={`/candidates/${match.candidate_id}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <Avatar>
                      {match.candidates?.avatar_url && (
                        <AvatarImage src={match.candidates.avatar_url} />
                      )}
                      <AvatarFallback>
                        {match.candidates?.name?.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{match.candidates?.name}</p>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          {match.match_score}%
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {match.candidates?.position || t("candidates.noPosition")}
                      </p>
                      {match.match_reasons && match.match_reasons.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {match.match_reasons[0]}
                        </p>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleAcceptAiMatch(match.id, match.candidates?.name || '')}
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

      {/* Embedding-based Suggestions */}
      <EmbeddingSuggestions
        jobId={jobId}
        jobEmbedding={job?.embedding || null}
        jobIndustry={job?.clients?.industry || null}
        existingCandidateIds={existingCandidateIds}
        onCandidateAdded={onMatchUpdated}
      />



      {/* Rejected Matches */}
      {rejectedMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("matches.rejectedCandidates")}</CardTitle>
            <CardDescription>{t("matches.rejectedForPosition")}</CardDescription>
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
                    {/* Header Row: Avatar, Name, Position, Status Badge, and Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-9 w-9">
                          {placement.candidates?.avatar_url && (
                            <AvatarImage src={placement.candidates.avatar_url} />
                          )}
                          <AvatarFallback className="text-xs">
                            {placement.candidates?.name?.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate">{placement.candidates?.name}</p>
                            <span className="text-muted-foreground text-sm">•</span>
                            <p className="text-sm text-muted-foreground truncate">
                              {placement.candidates?.position || t("candidates.noPosition")}
                            </p>
                          </div>
                        </div>
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
                                handleDeleteMatch(placement.id, placement.candidates?.name || '');
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
                              <span className="font-medium">Grund:</span>{' '}
                              {translateRejectionReason(rejectionReason)}
                              {rejectionNote && (
                                <span className="ml-1">
                                  {' '}– <span className="italic">{rejectionNote}</span>
                                </span>
                              )}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("matches.editRejection")}</DialogTitle>
            <DialogDescription>
              {t("matches.editRejectionDesc")}
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
              <Label>{t("common.note")} ({t("common.optional")})</Label>
              <Textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder={t("notes.addNotePlaceholder")}
                rows={3}
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

      {/* Reject Match Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("matches.reject")}</DialogTitle>
            <DialogDescription>
              {t("matches.rejectMatchDesc") || "Wählen Sie einen Ablehnungsgrund und fügen Sie optional eine Notiz hinzu."}
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
              <Label>{t("common.note")} ({t("common.optional")})</Label>
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder={t("notes.addNotePlaceholder")}
                rows={3}
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
      {selectedPlacement && (
        <CandidateMatchDialog
          isOpen={showMatchDialog}
          onClose={() => {
            setShowMatchDialog(false);
            setTimeout(() => setSelectedPlacement(null), 150);
          }}
          onUpdate={onMatchUpdated}
          candidate={{
            id: selectedPlacement.candidates?.id as any,
            name: selectedPlacement.candidates?.name || '',
            position: selectedPlacement.candidates?.position,
            desired_position: selectedPlacement.candidates?.desired_position,
            avatar_url: selectedPlacement.candidates?.avatar_url,
            email: selectedPlacement.candidates?.email || '',
            phone: selectedPlacement.candidates?.phone || '',
            location: selectedPlacement.candidates?.location || '',
            skills: selectedPlacement.candidates?.skills || [],
            experience: selectedPlacement.candidates?.experience || '',
            current_salary: selectedPlacement.candidates?.current_salary,
            desired_salary: selectedPlacement.candidates?.desired_salary,
            initials: selectedPlacement.candidates?.name?.substring(0, 2).toUpperCase() || '',
            status: selectedPlacement.candidates?.status,
            recruiting_status: selectedPlacement.candidates?.recruiting_status,
            industry: selectedPlacement.candidates?.industry,
            birthdate: selectedPlacement.candidates?.birthdate,
            workload: selectedPlacement.candidates?.workload,
            willing_to_relocate: selectedPlacement.candidates?.willing_to_relocate,
            max_commute: selectedPlacement.candidates?.max_commute,
            reason_for_change: selectedPlacement.candidates?.reason_for_change,
            languages: selectedPlacement.candidates?.languages,
            further_education: selectedPlacement.candidates?.further_education,
            education: selectedPlacement.candidates?.education,
            work_experience: selectedPlacement.candidates?.work_experience,
          }}
          job={{
            id: job?.id,
            title: job?.title || '',
            company: job?.clients?.name || t("matches.noCompany"),
            client_id: job?.client_id,
            location: job?.location || '',
            employment_type: job?.employment_type,
            salary: job?.salary_range || '',
            salary_range: job?.salary_range,
            description: job?.description || '',
            requirements: job?.requirements,
            responsibilities: job?.responsibilities,
            status: job?.status,
            experience_level: job?.experience_level,
            skills: job?.skills,
            benefits: job?.benefits,
          }}
          stage={selectedPlacement.stage}
          placementId={selectedPlacement.id}
        />
      )}
    </div>
  );
}
