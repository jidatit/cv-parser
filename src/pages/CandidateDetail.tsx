import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Archive,
  Trash2,
  MoreHorizontal,
  Save,
  UserPlus,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Minus,
  Flag,
  ListTodo,
  Sparkles,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CVUploadDialog } from "@/components/CVUploadDialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { AddJobToCandidateDialog } from "@/components/AddJobToCandidateDialog";
import { supabase } from "@/integrations/supabase/client";
import { CandidateDetailsTab } from "@/components/CandidateDetailsTab";
import { CandidateMatchesTab } from "@/components/CandidateMatchesTab";
import { CVCreatorTab } from "@/components/CVCreatorTab";
import { ParsedCandidateData } from "@/services/CVParserService";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import { CandidateAIAssistant } from "@/components/CandidateAIAssistant";
import { SkillDetectionMode } from "@/components/SkillDetectionMode";
import { ExternalJobSearchTab } from "@/components/ExternalJobSearchTab";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGoBack } from "@/hooks/useGoBack";

interface WorkExperience {
  company: string;
  position: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  client_id?: string;
}

interface Education {
  degree: string;
  field?: string;
  institution: string;
  startDate?: string;
  endDate?: string;
  grade?: string;
}

interface Language {
  name: string;
  level?: string;
}

interface Certification {
  name: string;
  issuer?: string;
  date?: string;
}

interface CandidateInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  position?: string;
  desired_position?: string;
  industry?: string;
  status?: string;
  recruiting_status?: string;
  experience?: string;
  current_salary?: string;
  desired_salary?: string;
  max_commute?: string;
  willing_to_relocate?: string;
  workload?: string;
  reason_for_change?: string;
  birthdate?: string;
  skills?: string[];
  education?: Education[];
  work_experience?: WorkExperience[];
  languages?: Language[];
  certifications?: Certification[];
  last_contact?: string;
  notes?: string;
  avatar_url?: string;
  user_id?: string;
  assigned_to?: string | null;
  linkedin_url?: string;
  source_contact?: string;
  summary?: string;
  // Candidate Insights fields
  ai_summary?: string;
  signature_achievements?: string[];
  growth_potential?: string[];
  most_proud_of?: string;
  potential_risks?: string;
  insights_notes?: string;
  candidate_values?: string[];
  full_image_url?: string;
  is_verified?: boolean;
}

export default function CandidateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/candidates");
  const { toast } = useToast();
  const { t } = useLanguage();
  const [candidateInfo, setCandidateInfo] = useState<CandidateInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [newSkill, setNewSkill] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingWorkExp, setEditingWorkExp] = useState<number | null>(null);
  const [editingEducation, setEditingEducation] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [skillDetectionActive, setSkillDetectionActive] = useState(false);
  const [cachedDetectedSkills, setCachedDetectedSkills] = useState<any[] | null>(null);
  const [matchedJobs, setMatchedJobs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<
    { id: string; email: string; full_name: string | null }[]
  >([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { configurations } = useStatusConfigurations();
  const candidate = candidateInfo;

  // Fetch profiles for user assignment
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("full_name");
      setProfiles(data || []);
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    const fetchCandidate = async () => {
      try {
        const { data, error } = await supabase
          .from("candidates")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          toast({ title: t("common.noDataFound"), variant: "destructive" });
          navigate("/candidates");
          return;
        }

        setCandidateInfo({
          ...data,
          education: (data.education as any) || [],
          work_experience: (data.work_experience as any) || [],
          languages: (data.languages as any) || [],
          certifications: (data.certifications as any) || [],
          skills: data.skills || [],
        });
      } catch (error) {
        toast({
          title: t("toast.error"),
          description: t("toast.loadError"),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchCandidate();
  }, [id, navigate, toast]);

  useEffect(() => {
    if (id) fetchMatchedJobs();
  }, [id]);

  const fetchMatchedJobs = async () => {
    try {
      const { data, error } = await supabase
        .from("placements")
        .select("*, jobs(*, clients(name))")
        .eq("candidate_id", id);
      if (error) throw error;
      setMatchedJobs(data || []);
    } catch (error) {
      console.error("Error fetching matched jobs:", error);
    }
  };

  const saveToDatabase = async (updatedInfo: Partial<CandidateInfo>) => {
    try {
      const { error } = await supabase
        .from("candidates")
        .update(updatedInfo as any)
        .eq("id", id);
      if (error) throw error;
      toast({ title: t("toast.saved"), description: t("toast.saveSuccess") });
    } catch (error) {
      toast({
        title: t("toast.error"),
        description: t("toast.saveError"),
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async (updates: Partial<CandidateInfo>) => {
    if (!candidateInfo) return;
    const updatedInfo = { ...candidateInfo, ...updates };
    setCandidateInfo(updatedInfo);
    setCachedDetectedSkills(null);
    await saveToDatabase(updates);

    // Auto-reject open matches when status is set to "Not available"
    if (updates.status === "Not available") {
      try {
        // Fetch all open placements for this candidate
        const { data: openPlacements, error: fetchError } = await supabase
          .from("placements")
          .select("*")
          .eq("candidate_id", id!)
          .not("stage", "in", '("Abgelehnt","Placed")');

        if (fetchError) throw fetchError;

        if (openPlacements && openPlacements.length > 0) {
          for (const placement of openPlacements) {
            const existingNotes = Array.isArray(placement.notes) ? placement.notes : [];
            const now = new Date().toISOString();
            const rejectionNote = {
              type: "rejection_note",
              rejection_reason: "Kandidat ist nicht mehr verfügbar",
              text: t("matches.autoRejectedNote"),
              rejected_from_stage: placement.stage,
              rejected_at: now,
              created_at: now,
            };

            await supabase
              .from("placements")
              .update({
                stage: "Abgelehnt",
                notes: [...existingNotes, rejectionNote],
              })
              .eq("id", placement.id);
          }

          toast({
            title: t("matches.autoRejected", { count: openPlacements.length }),
          });

          // Refresh matched jobs
          fetchMatchedJobs();
        }
      } catch (error) {
        console.error("Error auto-rejecting placements:", error);
      }
    }
  };

  const handleArchiveCandidate = async () => {
    if (!candidateInfo) return;
    await handleUpdate({ status: "Archived" });
    toast({ title: t("toast.archived"), description: `${candidateInfo.name}` });
  };

  const handleDeleteCandidate = async () => {
    if (!candidateInfo) return;
    try {
      const { error } = await supabase.from("candidates").delete().eq("id", id);
      if (error) throw error;
      toast({
        title: t("toast.deleteSuccess"),
        description: `${candidateInfo.name}`,
      });
      navigate("/candidates");
    } catch (error) {
      toast({
        title: t("toast.error"),
        description: t("toast.deleteError"),
        variant: "destructive",
      });
    }
  };

  // Handle CV parsed data - updates form fields without saving to database
  // const handleCVParsed = (parsedData: ParsedCandidateData) => {
  //   if (!candidateInfo) return;

  //   // Map parsed education to form format
  //   const educationFormatted: Education[] = parsedData.education?.map(edu => ({
  //     degree: edu.degree || '',
  //     field: '',
  //     institution: edu.institution || '',
  //     location: '',
  //     startDate: edu.start_date || '',
  //     endDate: edu.end_date || '',
  //     grade: ''
  //   })) || [];

  //   // Map parsed work experience to form format
  //   const workExperienceFormatted: WorkExperience[] = parsedData.experiences?.map(exp => ({
  //     company: exp.company_name || '',
  //     position: exp.role_title || '',
  //     startDate: exp.start_date || '',
  //     endDate: exp.end_date || '',
  //     description: exp.description || '',
  //     client_id: exp.client_id
  //   })) || [];

  //   // Map parsed languages to form format
  //   const languagesFormatted: Language[] = parsedData.languages?.map(lang => ({
  //     name: lang.name || '',
  //     level: lang.level || ''
  //   })) || [];

  //   // Map parsed certifications to form format
  //   const certificationsFormatted: Certification[] = parsedData.certifications?.map(cert => ({
  //     name: cert.name || '',
  //     issuer: cert.issuer || '',
  //     date: cert.date || ''
  //   })) || [];

  //   // Update candidate info with parsed data (UI only, not saved to DB yet)
  //   const updatedInfo: CandidateInfo = {
  //     ...candidateInfo,
  //     name: parsedData.person?.full_name || candidateInfo.name,
  //     email: parsedData.person?.email || candidateInfo.email,
  //     phone: parsedData.person?.phone || candidateInfo.phone,
  //     location: parsedData.person?.location || candidateInfo.location,
  //     position: parsedData.person?.current_role || candidateInfo.position,
  //     desired_position: parsedData.person?.current_role || candidateInfo.desired_position,
  //     skills: parsedData.skills?.length ? parsedData.skills : candidateInfo.skills,
  //     education: educationFormatted.length ? educationFormatted : candidateInfo.education,
  //     work_experience: workExperienceFormatted.length ? workExperienceFormatted : candidateInfo.work_experience,
  //     languages: languagesFormatted.length ? languagesFormatted : candidateInfo.languages,
  //     certifications: certificationsFormatted.length ? certificationsFormatted : candidateInfo.certifications,
  //   };

  //   setCandidateInfo(updatedInfo);
  //   setHasUnsavedChanges(true);

  //   toast({
  //     title: "CV erfolgreich geparst",
  //     description: "Die Felder wurden aktualisiert. Klicken Sie auf 'Speichern' um die Änderungen zu übernehmen.",
  //   });
  // };
  const handleCVParsed = async (parsedData: ParsedCandidateData) => {
    if (!candidateInfo) return;

    try {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      setCandidateInfo({
        ...data,
        education: (data.education as any) || [],
        work_experience: (data.work_experience as any) || [],
        languages: (data.languages as any) || [],
        certifications: (data.certifications as any) || [],
        skills: data.skills || [],
      });

      toast({
        title: t("candidateDetail.cvParsedSaved"),
        description: t("candidateDetail.cvParsedSavedDesc"),
      });
    } catch (error) {
      console.error("Error reloading candidate:", error);
      toast({
        title: t("candidateDetail.reloadError"),
        description: t("candidateDetail.reloadErrorDesc"),
        variant: "destructive",
      });
    }
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!candidate) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("common.back")}
        </Button>

        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Button
              size="sm"
              onClick={async () => {
                if (candidateInfo) {
                  const { id: _, user_id, ...dataToSave } = candidateInfo;
                  await saveToDatabase(dataToSave);
                  setHasUnsavedChanges(false);
                }
              }}
            >
              <Save className="h-4 w-4 mr-2" />
              Änderungen speichern
            </Button>
          )}
          <AddJobToCandidateDialog
            candidateId={candidate.id}
            candidateName={candidate.name}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t("candidates.addToRecruitingPipeline")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-popover">
                  {configurations.recruitingStages.map((stage) => (
                    <DropdownMenuItem
                      key={stage.id}
                      onClick={() =>
                        handleUpdate({ recruiting_status: stage.id })
                      }
                      disabled={candidate.recruiting_status === stage.id}
                    >
                      {stage.label}
                      {candidate.recruiting_status === stage.id && " ✓"}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Flag className="h-4 w-4 mr-2" />
                  Priorität
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-popover">
                  <DropdownMenuItem
                    onClick={() => handleUpdate({ priority: "high" } as any)}
                    disabled={(candidate as any).priority === "high"}
                  >
                    <ArrowUp className="h-4 w-4 mr-2 text-red-600" />
                    Hoch
                    {(candidate as any).priority === "high" && " ✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleUpdate({ priority: "medium" } as any)}
                    disabled={(candidate as any).priority === "medium"}
                  >
                    <ArrowRight className="h-4 w-4 mr-2 text-yellow-600" />
                    Mittel
                    {(candidate as any).priority === "medium" && " ✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleUpdate({ priority: "low" } as any)}
                    disabled={(candidate as any).priority === "low"}
                  >
                    <ArrowDown className="h-4 w-4 mr-2 text-green-600" />
                    Gering
                    {(candidate as any).priority === "low" && " ✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleUpdate({ priority: null } as any)}
                    disabled={!(candidate as any).priority}
                  >
                    <Minus className="h-4 w-4 mr-2 text-muted-foreground" />
                    Keine
                    {!(candidate as any).priority && " ✓"}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowTaskDialog(true)}>
                <ListTodo className="h-4 w-4 mr-2" />
                Task erstellen
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleArchiveCandidate}
                disabled={candidate.status === "Archived"}
              >
                <Archive className="h-4 w-4 mr-2" />
                {t("common.archive")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <CVUploadDialog
            candidateId={candidate.id}
            candidateName={candidate.name}
            onCandidateParsed={handleCVParsed}
          />
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="details">{t("candidates.details")}</TabsTrigger>
          <TabsTrigger value="matches">{t("candidates.matches")}</TabsTrigger>
          <TabsTrigger value="external-search">{t("externalSearch.tabTitle")}</TabsTrigger>
          <TabsTrigger value="cv-creator">
            {t("candidates.cvCreator")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <CandidateDetailsTab
            candidate={candidate}
            onUpdate={handleUpdate}
            editingField={editingField}
            setEditingField={setEditingField}
            editValue={editValue}
            setEditValue={setEditValue}
            newSkill={newSkill}
            setNewSkill={setNewSkill}
            editingWorkExp={editingWorkExp}
            setEditingWorkExp={setEditingWorkExp}
            editingEducation={editingEducation}
            setEditingEducation={setEditingEducation}
            profiles={profiles}
          />
        </TabsContent>

        <TabsContent value="matches">
          <CandidateMatchesTab
            matchedJobs={matchedJobs}
            onMatchDeleted={fetchMatchedJobs}
            candidateId={id!}
          />
        </TabsContent>

        <TabsContent value="external-search">
          <ExternalJobSearchTab candidate={candidate} />
        </TabsContent>

        <TabsContent value="cv-creator">
          <CVCreatorTab candidate={candidate} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("candidates.deleteCandidate")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("candidates.confirmDelete")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCandidate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateTaskDialog
        open={showTaskDialog}
        onOpenChange={setShowTaskDialog}
        initialTitle={`@${candidate.name} `}
        candidateId={candidate.id}
      />

      {/* Floating AI Assistant Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="fixed bottom-6 right-6 z-50 rounded-full h-14 w-14 shadow-lg hover:shadow-xl transition-shadow"
            onClick={() => setShowAIAssistant(true)}
          >
            <Sparkles className="h-6 w-6" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{t("aiAssistant.title")}</TooltipContent>
      </Tooltip>

      {/* AI Assistant Sheet */}
      <CandidateAIAssistant
        open={showAIAssistant}
        onOpenChange={setShowAIAssistant}
        candidateId={candidate.id}
        currentData={candidateInfo}
        onUpdate={(updates) => {
          handleUpdate(updates);
          setHasUnsavedChanges(true);
        }}
        onStartSkillDetection={() => setSkillDetectionActive(true)}
      />

      {candidateInfo && (
        <SkillDetectionMode
          isActive={skillDetectionActive}
          onClose={() => setSkillDetectionActive(false)}
          candidateData={candidateInfo}
          currentSkills={candidateInfo.skills || []}
          onAddSkill={(skill) => {
            if (!candidateInfo) return;
            const current = candidateInfo.skills || [];
            const updated = current.includes(skill)
              ? current.filter((s) => s !== skill)
              : [...current, skill];
            handleUpdate({ skills: updated });
          }}
          cachedSkills={cachedDetectedSkills}
          onSkillsDetected={setCachedDetectedSkills}
        />
      )}
    </div>
  );
}
