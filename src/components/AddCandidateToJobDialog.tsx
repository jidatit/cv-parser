import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";
import { checkEmployerConflict, WorkExperience, EmployerConflictResult } from "@/lib/employerConflictCheck";
import { triggerAutoAnalysis } from "@/lib/autoAnalyzeMatch";

interface AddCandidateToJobDialogProps {
  jobId: string;
  jobTitle: string;
  clientName?: string;
  onCandidateAdded?: () => void;
}

export function AddCandidateToJobDialog({ jobId, jobTitle, clientName, onCandidateAdded }: AddCandidateToJobDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  // Conflict warning state
  const [conflictWarningOpen, setConflictWarningOpen] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<{ id: string; name: string } | null>(null);
  const [conflictResult, setConflictResult] = useState<EmployerConflictResult | null>(null);
  const [resolvedClientName, setResolvedClientName] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchCandidates();
      fetchClientName();
    }
  }, [open]);

  const fetchClientName = async () => {
    if (clientName) {
      setResolvedClientName(clientName);
      return;
    }
    
    // If clientName not provided, fetch from job
    try {
      const { data: job } = await supabase
        .from('jobs')
        .select('clients(name)')
        .eq('id', jobId)
        .single();
      
      setResolvedClientName(job?.clients?.name || null);
    } catch (error) {
      console.error('Error fetching client name:', error);
    }
  };

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, name, position, avatar_url, status, work_experience')
        .order('name');

      if (error) throw error;
      setCandidates(data || []);
    } catch (error) {
      console.error('Error fetching candidates:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.candidatesLoadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkAndHandleConflict = (candidate: any) => {
    if (!resolvedClientName) {
      // No client name to check against, proceed directly
      handleAddCandidate(candidate.id, candidate.name);
      return;
    }

    const workExperience = (candidate.work_experience || []) as WorkExperience[];
    const conflict = checkEmployerConflict(workExperience, resolvedClientName);

    if (conflict.hasConflict) {
      setPendingCandidate({ id: candidate.id, name: candidate.name });
      setConflictResult(conflict);
      setConflictWarningOpen(true);
    } else {
      handleAddCandidate(candidate.id, candidate.name);
    }
  };

  const handleConfirmDespiteConflict = () => {
    if (pendingCandidate) {
      handleAddCandidate(pendingCandidate.id, pendingCandidate.name);
    }
    setConflictWarningOpen(false);
    setPendingCandidate(null);
    setConflictResult(null);
  };

  const handleCancelConflict = () => {
    setConflictWarningOpen(false);
    setPendingCandidate(null);
    setConflictResult(null);
  };

  const handleAddCandidate = async (candidateId: string, candidateName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if placement already exists
      const { data: existingPlacement } = await supabase
        .from('placements')
        .select('id')
        .eq('candidate_id', candidateId)
        .eq('job_id', jobId)
        .maybeSingle();

      if (existingPlacement) {
        toast({
          title: t("matches.alreadyMatched"),
          description: `${candidateName} ${t("matches.alreadyMatchedDesc")}`,
          variant: "destructive",
        });
        return;
      }

      const { data: placementData, error } = await supabase
        .from('placements')
        .insert({
          candidate_id: candidateId,
          job_id: jobId,
          user_id: user.id,
          stage: 'Ready2Send'
        })
        .select('id')
        .single();

      if (error) throw error;

      // Trigger auto analysis in background
      if (placementData) {
        triggerAutoAnalysis(placementData.id, candidateId, jobId);
      }

      // Update candidate recruiting_status to null (moved to normal pipeline)
      const { error: updateError } = await supabase
        .from('candidates')
        .update({ recruiting_status: null })
        .eq('id', candidateId);

      if (updateError) throw updateError;

      toast({
        title: t("matches.candidateAdded"),
        description: `${candidateName} ${t("matches.candidateAddedDesc")}`,
      });

      setOpen(false);
      onCandidateAdded?.();
    } catch (error) {
      console.error('Error adding candidate:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.addError"),
        variant: "destructive",
      });
    }
  };

  const filteredCandidates = candidates.filter(candidate =>
    candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    candidate.position?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getConflictMessage = () => {
    if (!conflictResult || !pendingCandidate) return "";
    
    const positionText = conflictResult.matchedPosition 
      ? ` (${conflictResult.matchedPosition})`
      : "";
    
    if (conflictResult.isCurrentEmployer) {
      return t("matches.employerConflict.currentEmployer", {
        name: pendingCandidate.name,
        company: conflictResult.matchedCompanyName,
        position: conflictResult.matchedPosition || t("common.position")
      });
    } else {
      return t("matches.employerConflict.formerEmployer", {
        name: pendingCandidate.name,
        company: conflictResult.matchedCompanyName,
        position: conflictResult.matchedPosition || t("common.position")
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <UserPlus className="h-4 w-4 mr-2" />
            {t("matches.addCandidate")}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t("matches.addCandidateToJob").replace("{job}", jobTitle)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={t("matches.searchCandidate")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {loading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t("matches.loadingCandidates")}</p>
                ) : filteredCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t("matches.noCandidates")}</p>
                ) : (
                  filteredCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => checkAndHandleConflict(candidate)}
                    >
                      <Avatar>
                        <AvatarImage src={candidate.avatar_url || ''} />
                        <AvatarFallback className="bg-muted text-muted-foreground">
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{candidate.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{candidate.position || t("matches.noPosition")}</p>
                      </div>
                      {candidate.status && (
                        <Badge variant="secondary">{candidate.status}</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={conflictWarningOpen} onOpenChange={setConflictWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("matches.employerConflict.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{getConflictMessage()}</p>
              <p className="text-amber-600 dark:text-amber-400">{t("matches.employerConflict.warning")}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConflict}>
              {t("matches.employerConflict.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDespiteConflict}>
              {t("matches.employerConflict.confirmAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
