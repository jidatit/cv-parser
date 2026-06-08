import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Briefcase, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { getJobStatusTranslationKey } from "@/lib/statusUtils";
import { checkEmployerConflict, WorkExperience, EmployerConflictResult } from "@/lib/employerConflictCheck";
import { triggerAutoAnalysis } from "@/lib/autoAnalyzeMatch";

interface AddJobToCandidateDialogProps {
  candidateId: string;
  candidateName: string;
  candidateWorkExperience?: WorkExperience[];
  onMatchCreated?: () => void;
}

export function AddJobToCandidateDialog({ 
  candidateId, 
  candidateName, 
  candidateWorkExperience,
  onMatchCreated 
}: AddJobToCandidateDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [workExperience, setWorkExperience] = useState<WorkExperience[]>(candidateWorkExperience || []);

  // Conflict warning state
  const [conflictWarningOpen, setConflictWarningOpen] = useState(false);
  const [pendingJob, setPendingJob] = useState<{ id: string; title: string; clientName: string } | null>(null);
  const [conflictResult, setConflictResult] = useState<EmployerConflictResult | null>(null);

  useEffect(() => {
    if (open) {
      fetchJobs();
      if (!candidateWorkExperience) {
        fetchCandidateWorkExperience();
      }
    }
  }, [open]);

  const fetchCandidateWorkExperience = async () => {
    try {
      const { data } = await supabase
        .from('candidates')
        .select('work_experience')
        .eq('id', candidateId)
        .single();
      
      if (data?.work_experience) {
        setWorkExperience(data.work_experience as WorkExperience[]);
      }
    } catch (error) {
      console.error('Error fetching candidate work experience:', error);
    }
  };

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, clients(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.jobsLoadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkAndHandleConflict = (job: any) => {
    const clientName = job.clients?.name;
    
    if (!clientName || workExperience.length === 0) {
      // No client name or work experience to check against, proceed directly
      handleAddJob(job.id, job.title);
      return;
    }

    const conflict = checkEmployerConflict(workExperience, clientName);

    if (conflict.hasConflict) {
      setPendingJob({ id: job.id, title: job.title, clientName });
      setConflictResult(conflict);
      setConflictWarningOpen(true);
    } else {
      handleAddJob(job.id, job.title);
    }
  };

  const handleConfirmDespiteConflict = () => {
    if (pendingJob) {
      handleAddJob(pendingJob.id, pendingJob.title);
    }
    setConflictWarningOpen(false);
    setPendingJob(null);
    setConflictResult(null);
  };

  const handleCancelConflict = () => {
    setConflictWarningOpen(false);
    setPendingJob(null);
    setConflictResult(null);
  };

  const handleAddJob = async (jobId: string, jobTitle: string) => {
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
        title: t("matches.jobAdded"),
        description: `${candidateName} ${t("matches.jobAddedDesc")}`,
      });

      setOpen(false);
      onMatchCreated?.();
    } catch (error) {
      console.error('Error adding job:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.addError"),
        variant: "destructive",
      });
    }
  };

  const filteredJobs = jobs.filter(job =>
    job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.clients?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getConflictMessage = () => {
    if (!conflictResult) return "";
    
    if (conflictResult.isCurrentEmployer) {
      return t("matches.employerConflict.currentEmployer", {
        name: candidateName,
        company: conflictResult.matchedCompanyName,
        position: conflictResult.matchedPosition || t("common.position")
      });
    } else {
      return t("matches.employerConflict.formerEmployer", {
        name: candidateName,
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
            <Briefcase className="h-4 w-4 mr-2" />
            {t("matches.matchToJob")}
          </Button>
        </DialogTrigger>
        <DialogContent className="w-[95vw] max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("matches.matchCandidateToJob").replace("{candidate}", candidateName)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={t("matches.searchJob")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="h-[400px] w-full overflow-y-auto rounded-md bg-background">
              <div className="space-y-2 pr-4">
                {loading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t("matches.loadingJobs")}</p>
                ) : filteredJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t("matches.noJobs")}</p>
                ) : (
                  filteredJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => checkAndHandleConflict(job)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{job.title}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {job.clients?.name || t("matches.noCompany")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {job.status && (
                            <Badge variant="secondary">{t(`common.jobStatus.${getJobStatusTranslationKey(job.status)}`, { defaultValue: job.status })}</Badge>
                          )}
                          {job.location && (
                            <Badge variant="outline">{job.location}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
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
