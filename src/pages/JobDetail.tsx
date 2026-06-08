import { useParams, Link, useNavigate } from "react-router-dom";
import { getSignedLogoUrl } from "@/lib/storageUtils";
import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Euro,
  Briefcase,
  Calendar,
  Save,
  X,
  Pencil,
  Loader2,
  MoreVertical,
  Archive,
  Trash2,
  UserCircle,
  ExternalLink,
  Link as LinkIcon,
  CheckCircle,
  XCircle,
  AlertCircle,
  Upload,
  FileText,
  Download,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { de, enUS, fr, it, es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { AddCandidateToJobDialog } from "@/components/AddCandidateToJobDialog";
import { useLanguage } from "@/hooks/useLanguage";
import { NotesSection } from "@/components/NotesSection";
import { useAuth } from "@/contexts/AuthContext";
import { JobMatchesTab } from "@/components/JobMatchesTab";
import { JobUrlParser } from "@/components/JobUrlParser";
import { getStatusColor, getJobStatusTranslationKey } from "@/lib/statusUtils";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import { useGoBack } from "@/hooks/useGoBack";
import { JobPublicationTab } from "@/components/JobPublicationTab";
import { Globe, Sparkles } from "lucide-react";
import { JobAIAssistant } from "@/components/JobAIAssistant";

const openFileInNewTab = async (url: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  } catch (err) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};
import PrintPage from "@/components/cv-template/2ndcvPrintView";

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/jobs");
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [filteredClients, setFilteredClients] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [contextMenuClientSearch, setContextMenuClientSearch] = useState("");
  const [contextMenuFilteredClients, setContextMenuFilteredClients] = useState<any[]>([]);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [matchedCandidates, setMatchedCandidates] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<
    { id: string; email: string; full_name: string | null }[]
  >([]);
  const [showUrlParserDialog, setShowUrlParserDialog] = useState(false);
  const [urlValidity, setUrlValidity] = useState<
    "checking" | "valid" | "expired" | "uncertain" | "invalid" | null
  >(null);
  const [urlAnalysisReason, setUrlAnalysisReason] = useState<string>("");
  const [isManuallyValidated, setIsManuallyValidated] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isDraggingDocument, setIsDraggingDocument] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [isFetchingContent, setIsFetchingContent] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t, currentLanguage } = useLanguage();
  const { userProfile } = useAuth();
  const { configurations } = useStatusConfigurations();

  const handleDocumentFile = async (file: File) => {
    const validTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!validTypes.includes(file.type)) {
      toast({
        title: t("toast.error"),
        description: "Nur PDF, DOC oder DOCX erlaubt.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t("toast.error"),
        description: "Datei darf max. 10 MB gross sein.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingDocument(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const sanitizedFileName = file.name
        .replace(/[äÄ]/g, "ae")
        .replace(/[öÖ]/g, "oe")
        .replace(/[üÜ]/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${user.id}/${Date.now()}_${sanitizedFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("job-documents")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("job-documents").getPublicUrl(uploadData.path);

      const { error: dbError } = await supabase
        .from("jobs")
        .update({ source_document_url: publicUrl } as any)
        .eq("id", id);

      if (dbError) throw dbError;

      setJob((prev: any) => ({ ...prev, source_document_url: publicUrl }));
      toast({
        title: t("toast.saved"),
        description: "Dokument erfolgreich angehängt.",
      });
    } catch (error) {
      console.error("Error uploading document:", error);
      toast({
        title: t("toast.error"),
        description: "Dokument konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const getLocale = () => {
    switch (currentLanguage) {
      case "de":
        return de;
      case "fr":
        return fr;
      case "it":
        return it;
      case "es":
        return es;
      default:
        return enUS;
    }
  };

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
    const fetchJob = async () => {
      try {
        const { data, error } = await supabase
          .from("jobs")
          .select(
            "*, clients(name, website, email, phone, address, description, logo_url, industry)",
          )
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        setJob(data);

        // Resolve signed logo URL for private bucket and convert to data URL for PDF export
        if (data?.clients?.logo_url) {
          getSignedLogoUrl(data.clients.logo_url).then(async (signedUrl) => {
            if (signedUrl) {
              let logoUrl = signedUrl;
              try {
                const response = await fetch(signedUrl);
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                const dataUrl = await new Promise<string>((resolve) => {
                  const img = new Image();
                  img.crossOrigin = 'anonymous';
                  img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = 3;
                    canvas.width = (img.naturalWidth || 300) * scale;
                    canvas.height = (img.naturalHeight || 300) * scale;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      ctx.scale(scale, scale);
                      ctx.drawImage(img, 0, 0, img.naturalWidth || 300, img.naturalHeight || 300);
                    }
                    URL.revokeObjectURL(objectUrl);
                    resolve(canvas.toDataURL('image/png'));
                  };
                  img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(signedUrl); };
                  img.src = objectUrl;
                });
                logoUrl = dataUrl;
              } catch {
                // Keep signed URL as fallback
              }
              setJob((prev: any) => ({
                ...prev,
                clients: { ...prev.clients, logo_url: logoUrl },
              }));
            }
          });
        }
      } catch (error) {
        console.error("Error fetching job:", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchClients = async (search?: string) => {
      try {
        let query = supabase
          .from("clients")
          .select("id, name")
          .order("name")
          .limit(5000);

        if (search && search.trim()) {
          query = query.ilike("name", `%${search.trim()}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        setClients(data || []);
      } catch (error) {
        console.error("Error fetching clients:", error);
      }
    };

    if (id) {
      fetchJob();
      fetchClients();
    }
  }, [id]);

  // Gematche Kandidaten laden
  const fetchMatchedCandidates = async () => {
    try {
      const { data, error } = await supabase
        .from("placements")
        .select("*, candidates(*)")
        .eq("job_id", id);

      if (error) throw error;
      setMatchedCandidates(data || []);
    } catch (error) {
      console.error("Error fetching matched candidates:", error);
    }
  };

  useEffect(() => {
    if (id) {
      fetchMatchedCandidates();
    }
  }, [id]);

  // Check URL validity when job loads or source_url changes
  useEffect(() => {
    const checkUrlValidity = async () => {
      if (!job?.source_url) {
        setUrlValidity(null);
        setUrlAnalysisReason("");
        setIsManuallyValidated(false);
        return;
      }

      // Check if already manually validated
      if (job?.source_url_status === "manual_valid") {
        setUrlValidity("valid");
        setIsManuallyValidated(true);
        setUrlAnalysisReason("Manuell als gültig markiert");
        return;
      }

      // Check if manually invalidated
      if (job?.source_url_status === "manual_invalid") {
        setUrlValidity("expired");
        setIsManuallyValidated(true);
        setUrlAnalysisReason("Manuell als ungültig markiert");
        return;
      }

      setUrlValidity("checking");
      setUrlAnalysisReason("");
      setIsManuallyValidated(false);

      try {
        const response = await supabase.functions.invoke("check-url-validity", {
          body: { url: job.source_url },
        });

        if (response.error) {
          console.error("Error checking URL:", response.error);
          setUrlValidity("invalid");
          return;
        }

        const { valid, contentStatus, analysisReason } = response.data;

        // Determine the final status based on HTTP response and content analysis
        if (!valid) {
          setUrlValidity("invalid");
        } else if (contentStatus === "expired") {
          setUrlValidity("expired");
        } else if (contentStatus === "active") {
          setUrlValidity("valid");
        } else {
          // For 'uncertain' contentStatus, show warning instead of green checkmark
          setUrlValidity("uncertain");
        }

        setUrlAnalysisReason(analysisReason || "");
      } catch (error) {
        console.error("Error checking URL validity:", error);
        setUrlValidity("invalid");
      }
    };

    checkUrlValidity();
  }, [job?.source_url, job?.source_url_status]);

  // Handle manual URL validation toggle
  const handleManualValidation = async () => {
    try {
      // If currently manually validated as valid, switch to manual_invalid
      const isCurrentlyManualValid = job?.source_url_status === "manual_valid";
      const newStatus = isCurrentlyManualValid
        ? "manual_invalid"
        : "manual_valid";
      const newReason = isCurrentlyManualValid
        ? "Manuell als ungültig markiert"
        : "Manuell als gültig markiert";

      const { error } = await supabase
        .from("jobs")
        .update({
          source_url_status: newStatus,
          source_url_checked_at: new Date().toISOString(),
          source_url_reason: newReason,
        })
        .eq("id", id);

      if (error) throw error;

      setUrlValidity(isCurrentlyManualValid ? "expired" : "valid");
      setIsManuallyValidated(true);
      setUrlAnalysisReason(newReason);
      setJob((prev: any) => ({ ...prev, source_url_status: newStatus }));

      toast({
        title: isCurrentlyManualValid ? "URL abgelehnt" : "URL validiert",
        description: isCurrentlyManualValid
          ? "Die URL wurde manuell als ungültig markiert."
          : "Die URL wurde manuell als gültig markiert.",
      });
    } catch (error) {
      console.error("Error updating URL status:", error);
      toast({
        title: t("toast.error"),
        description: "URL-Status konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    }
  };

  const startEdit = (field: string, currentValue: string) => {
    console.log("here startEdit");
    setEditingField(field);
    setEditValue(currentValue || "");
    if (field === "client_id") {
      setClientSearch("");
      setFilteredClients(clients);
    }
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
    setClientSearch("");
    setFilteredClients([]);
  };

  const clientSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextMenuSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClientSearchChange = (value: string) => {
    setClientSearch(value);

    if (clientSearchTimerRef.current) {
      clearTimeout(clientSearchTimerRef.current);
    }

    clientSearchTimerRef.current = setTimeout(async () => {
      try {
        let query = supabase
          .from("clients")
          .select("id, name")
          .order("name")
          .limit(200);

        if (value.trim()) {
          query = query.ilike("name", `%${value.trim()}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        setFilteredClients(data || []);
      } catch (error) {
        console.error("Error searching clients:", error);
      }
    }, 300);
  };

  const fetchContentFromUrl = async (url: string) => {
    setIsFetchingContent(true);
    try {
      toast({
        title: "Stelleninhalt wird abgerufen...",
        description: "Die Stellenanzeige wird gescrapt und analysiert.",
      });

      const response = await supabase.functions.invoke("parse-job-posting", {
        body: { url },
      });

      if (response.error) throw response.error;

      const parsed = response.data;
      if (!parsed) throw new Error("Keine Daten empfangen");

      // Only fill empty fields
      const updates: Record<string, string> = {};
      const updatedFieldNames: string[] = [];

      if (parsed.description) {
        updates.description = parsed.description;
        updatedFieldNames.push("Beschreibung");
      }
      if (parsed.responsibilities) {
        updates.responsibilities = parsed.responsibilities;
        updatedFieldNames.push("Aufgaben");
      }
      if (parsed.requirements) {
        updates.requirements = parsed.requirements;
        updatedFieldNames.push("Anforderungen");
      }
      if (parsed.benefits) {
        updates.benefits = parsed.benefits;
        updatedFieldNames.push("Benefits");
      }
      if (parsed.title) {
        updates.title = parsed.title;
        updatedFieldNames.push("Titel");
      }
      if (parsed.location && !job?.location) {
        updates.location = parsed.location;
        updatedFieldNames.push("Standort");
      }
      if (parsed.employment_type && !job?.employment_type) {
        updates.employment_type = parsed.employment_type;
        updatedFieldNames.push("Anstellungsart");
      }
      if (parsed.salary_range && !job?.salary_range) {
        updates.salary_range = parsed.salary_range;
        updatedFieldNames.push("Gehalt");
      }
      if (parsed.skills && (!job?.skills || job.skills.length === 0)) {
        updates.skills = parsed.skills;
        updatedFieldNames.push("Skills");
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from("jobs")
          .update(updates)
          .eq("id", id);

        if (updateError) throw updateError;

        setJob((prev: any) => ({ ...prev, ...updates }));

        toast({
          title: "Stelleninhalte importiert",
          description: `Aktualisierte Felder: ${updatedFieldNames.join(", ")}`,
        });
      } else {
        toast({
          title: "Keine neuen Inhalte",
          description: "Alle Felder sind bereits befüllt.",
        });
      }
    } catch (error) {
      console.error("Error fetching content from URL:", error);
      toast({
        title: t("toast.error"),
        description: "Stelleninhalte konnten nicht abgerufen werden.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingContent(false);
    }
  };

  const saveField = async (field: string, value?: string) => {
    const valueToSave = value || editValue;
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ [field]: valueToSave })
        .eq("id", id);

      if (error) throw error;

      const previousValue = job?.[field];
      setJob((prev: any) => ({ ...prev, [field]: valueToSave }));
      setEditingField(null);
      toast({
        title: t("toast.saved"),
        description: t("toast.saveSuccess"),
      });

      // Auto-fetch content when source_url changes
      if (field === "source_url" && valueToSave) {
        try {
          new URL(valueToSave);
          fetchContentFromUrl(valueToSave);
        } catch {
          // Invalid URL, skip auto-fetch
        }
      }
    } catch (error) {
      console.error("Error saving field:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.saveError"),
        variant: "destructive",
      });
    }
  };

  const handleArchive = async () => {
    try {
      // Archive the job
      const { error } = await supabase
        .from("jobs")
        .update({ status: "Closed" })
        .eq("id", id);

      if (error) throw error;

      // Find all active matches for this job (not already rejected, placed, or archived)
      const { data: activePlacements, error: placementsError } = await supabase
        .from("placements")
        .select("id, stage, notes")
        .eq("job_id", id)
        .not("stage", "in", '("Abgelehnt","Placed","Archiviert")');

      if (placementsError) throw placementsError;

      // Reject all active matches with reason
      if (activePlacements && activePlacements.length > 0) {
        for (const placement of activePlacements) {
          const rejectionNote = {
            text: `Automatisch abgelehnt: Stelle wurde archiviert`,
            timestamp: new Date().toISOString(),
            type: "rejection_note",
            rejected_from_stage: placement.stage,
            rejection_reason: "Stelle archiviert",
            rejected_at: new Date().toISOString(),
          };

          const existingNotes = Array.isArray(placement.notes)
            ? placement.notes
            : [];

          await supabase
            .from("placements")
            .update({
              stage: "Abgelehnt",
              notes: [...existingNotes, rejectionNote],
            })
            .eq("id", placement.id);
        }

        // Update local state immediately
        const rejectedIds = activePlacements.map((p) => p.id);
        setMatchedCandidates((prev) =>
          prev.map((mc) =>
            rejectedIds.includes(mc.id) ? { ...mc, stage: "Abgelehnt" } : mc,
          ),
        );
      }

      setJob((prev: any) => ({ ...prev, status: "Archived" }));

      const matchCount = activePlacements?.length || 0;
      toast({
        title: t("toast.archived"),
        description:
          matchCount > 0
            ? `${t("jobs.archiveSuccess")} ${matchCount} Match${matchCount > 1 ? "es" : ""} abgelehnt.`
            : t("jobs.archiveSuccess"),
      });
    } catch (error) {
      console.error("Error archiving job:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.archiveError"),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("jobs.confirmDelete"))) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase.from("jobs").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: t("toast.deleted"),
        description: t("toast.deleteSuccess"),
      });

      // Navigate back
      navigate("/jobs");
    } catch (error) {
      console.error("Error deleting job:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.deleteError"),
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  const handleCreateClient = async () => {
    console.log("here handleCreateClient");
    if (!clientSearch.trim()) {
      toast({
        title: t("toast.error"),
        description: t("clients.enterName"),
        variant: "destructive",
      });
      return;
    }

    setIsCreatingClient(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: newClient, error } = await supabase
        .from("clients")
        .insert({
          name: clientSearch,
          user_id: user.id,
        })
        .select("id, name")
        .single();

      if (error) throw error;

      setClients((prev) =>
        [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)),
      );
      await saveField("client_id", newClient.id);

      const { data: updatedJob } = await supabase
        .from("jobs")
        .select("*, clients(name, industry)")
        .eq("id", id)
        .single();

      if (updatedJob) {
        setJob(updatedJob);
      }

      setClientSearch("");
      setEditingField(null);

      toast({
        title: t("clients.created"),
        description: t("clients.createSuccess"),
      });
    } catch (error) {
      console.error("Error creating client:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.createError"),
        variant: "destructive",
      });
    } finally {
      setIsCreatingClient(false);
    }
  };

  const handleClientChange = async (clientId: string) => {
    await saveField("client_id", clientId);

    const { data: updatedJob } = await supabase
      .from("jobs")
      .select("*, clients(name, industry)")
      .eq("id", id)
      .single();

    if (updatedJob) {
      setJob(updatedJob);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common.back")}
          </Button>
        </div>
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">{t("common.loading")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common.back")}
          </Button>
        </div>
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">{t("jobs.notFound")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Parse bullet points for display
  const parseBulletPoints = (text: any) => {
    if (!text) return [];
    // Ensure text is a string
    const textStr = Array.isArray(text) ? text.join("\n") : String(text);
    return textStr
      .split("\n")
      .filter((line: string) => line.trim())
      .map((line: string) => line.replace(/^[•\-*]\s*/, "").trim());
  };

  const responsibilities = parseBulletPoints(job.responsibilities);
  const requirements = parseBulletPoints(job.requirements);
  const benefitsPoints = parseBulletPoints(job.benefits);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("common.back")}
        </Button>
        <AddCandidateToJobDialog
          jobId={job.id}
          jobTitle={job.title}
          onCandidateAdded={fetchMatchedCandidates}
        />
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="details">{t("jobs.details")}</TabsTrigger>
          <TabsTrigger value="matches">
            {t("candidates.matches")}{" "}
            {matchedCandidates.length > 0 && `(${matchedCandidates.length})`}
          </TabsTrigger>
          <TabsTrigger value="job-form">Job Form</TabsTrigger>
          <TabsTrigger value="publication" className="gap-1">
            <Globe className="h-4 w-4" />
            {t("nav.publicationManager")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="grid gap-6 md:grid-cols-3 mt-6">
            {/* Main Info */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-4">
                    {/* Title */}
                    <div className="group relative">
                      {editingField === "title" ? (
                        <div className="space-y-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="text-xl font-semibold"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveField("title")}
                            >
                              <Save className="h-3 w-3 mr-1" />
                              {t("common.save")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEdit}
                            >
                              <X className="h-3 w-3 mr-1" />
                              {t("common.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <CardTitle className="text-2xl flex-1">
                            {job.title}
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                            onClick={() => startEdit("title", job.title)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Client */}
                    <div className="group relative">
                      {editingField === "client_id" ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1 relative">
                              <Input
                                value={clientSearch}
                                onChange={(e) =>
                                  handleClientSearchChange(e.target.value)
                                }
                                placeholder={t("clients.searchOrCreate")}
                                autoFocus
                                className="w-full"
                              />

                              {clientSearch && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto z-50">
                                  {filteredClients.length > 0 ? (
                                    <div className="py-1">
                                      {filteredClients.map((client) => (
                                        <div
                                          key={client.id}
                                          className="px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
                                          onClick={() =>
                                            handleClientChange(client.id)
                                          }
                                        >
                                          {client.name}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">
                                      {t("common.noResults")}
                                    </div>
                                  )}

                                  <div className="border-t border-border">
                                    <div
                                      className="px-3 py-2 hover:bg-accent cursor-pointer transition-colors text-sm font-medium text-primary"
                                      onClick={handleCreateClient}
                                    >
                                      {isCreatingClient ? (
                                        <span className="flex items-center gap-2">
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          {t("common.creating")}
                                        </span>
                                      ) : (
                                        `+ "${clientSearch}" ${t(
                                          "common.create",
                                        )}`
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEdit}
                            >
                              <X className="h-3 w-3 mr-1" />
                              {t("common.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {job.clients?.name ? (
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                <Link to={`/clients/${job.client_id}`}>
                                  <CardDescription className="text-lg flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors">
                                    <Building2 className="h-4 w-4" />
                                    {job.clients.name}
                                  </CardDescription>
                                </Link>
                              </ContextMenuTrigger>
                              <ContextMenuContent className="w-64">
                                <ContextMenuSub>
                                  <ContextMenuSubTrigger>
                                    <Building2 className="h-4 w-4 mr-2" />
                                    {t("jobs.changeCompany")}
                                  </ContextMenuSubTrigger>
                                  <ContextMenuSubContent className="w-64 p-0">
                                    <div className="p-2 border-b">
                                      <Input
                                        placeholder={t("common.search")}
                                        value={contextMenuClientSearch}
                                      onChange={(e) => {
                                          const val = e.target.value;
                                          setContextMenuClientSearch(val);
                                          if (contextMenuSearchTimerRef.current) {
                                            clearTimeout(contextMenuSearchTimerRef.current);
                                          }
                                          contextMenuSearchTimerRef.current = setTimeout(async () => {
                                            try {
                                              let query = supabase
                                                .from("clients")
                                                .select("id, name")
                                                .order("name")
                                                .limit(200);
                                              if (val.trim()) {
                                                query = query.ilike("name", `%${val.trim()}%`);
                                              }
                                              const { data, error } = await query;
                                              if (error) throw error;
                                              setContextMenuFilteredClients(data || []);
                                            } catch (error) {
                                              console.error("Error searching clients:", error);
                                            }
                                          }, 300);
                                        }}
                                        className="h-8"
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                      {(contextMenuClientSearch.trim() ? contextMenuFilteredClients : clients)
                                        .filter((c) => c.id !== job.client_id)
                                        .map((client) => (
                                          <ContextMenuItem
                                            key={client.id}
                                            onClick={() => {
                                              handleClientChange(client.id);
                                              setContextMenuClientSearch("");
                                              setContextMenuFilteredClients([]);
                                            }}
                                            className="cursor-pointer"
                                          >
                                            {client.name}
                                          </ContextMenuItem>
                                        ))}
                                      {(contextMenuClientSearch.trim() ? contextMenuFilteredClients : clients)
                                        .filter((c) => c.id !== job.client_id).length === 0 && (
                                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                          {t("common.noResults")}
                                        </div>
                                      )}
                                    </div>
                                  </ContextMenuSubContent>
                                </ContextMenuSub>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onClick={() => handleClientChange("")}
                                  className="cursor-pointer text-destructive"
                                >
                                  {t("jobs.removeCompanyLink")}
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          ) : (
                            <div
                              className="flex items-center gap-2 text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                              onClick={() =>
                                startEdit("client_id", job.client_id || "")
                              }
                            >
                              <Building2 className="h-4 w-4" />
                              <span className="text-sm italic">
                                {t("jobs.clickToAssignCompany")}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Status Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status - Direct Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:opacity-80 cursor-pointer ${getStatusColor(job.status || "N/D")}`}
                          >
                            {t(
                              `common.jobStatus.${getJobStatusTranslationKey(job.status || "N/D")}`,
                              { defaultValue: job.status || "N/D" },
                            )}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="z-50 bg-popover"
                        >
                          {configurations.jobStatuses.map((status) => (
                            <DropdownMenuItem
                              key={status.id}
                              onClick={() => saveField("status", status.label)}
                              className="cursor-pointer"
                            >
                              <Badge
                                className={`${getStatusColor(status.label)} mr-2`}
                                variant="outline"
                              >
                                {t(
                                  `common.jobStatus.${getJobStatusTranslationKey(status.label)}`,
                                  { defaultValue: status.label },
                                )}
                              </Badge>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Employment Type - Direct Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-accent cursor-pointer">
                            {job.employment_type || t("jobs.fulltime")}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="z-50 bg-popover"
                        >
                          <DropdownMenuItem
                            onClick={() =>
                              saveField("employment_type", "Vollzeit")
                            }
                            className="cursor-pointer"
                          >
                            {t("jobs.fulltime")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              saveField("employment_type", "Teilzeit")
                            }
                            className="cursor-pointer"
                          >
                            {t("jobs.parttime")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              saveField("employment_type", "Freelance")
                            }
                            className="cursor-pointer"
                          >
                            Freelance
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              saveField("employment_type", "Remote")
                            }
                            className="cursor-pointer"
                          >
                            Remote
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Experience Level */}
                      {(job.experience_level ||
                        editingField === "experience_level") && (
                        <div className="group relative">
                          {editingField === "experience_level" ? (
                            <div className="flex gap-2 items-center">
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="h-8 w-32"
                                placeholder={t("jobs.experiencePlaceholder")}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => saveField("experience_level")}
                              >
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEdit}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline">
                                {job.experience_level}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                onClick={() =>
                                  startEdit(
                                    "experience_level",
                                    job.experience_level,
                                  )
                                }
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* User Assignment Tag */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-accent cursor-pointer bg-background text-foreground">
                            <UserCircle className="h-3 w-3" />
                            {job.assigned_to
                              ? profiles
                                  .find((p) => p.id === job.assigned_to)
                                  ?.full_name?.split(" ")[0] ||
                                profiles
                                  .find((p) => p.id === job.assigned_to)
                                  ?.email?.split("@")[0] ||
                                t("common.assigned")
                              : t("common.notAssigned")}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="z-50 bg-popover"
                        >
                          {profiles.map((profile) => (
                            <DropdownMenuItem
                              key={profile.id}
                              onClick={async () => {
                                await saveField("assigned_to", profile.id);
                                setJob((prev: any) => ({
                                  ...prev,
                                  assigned_to: profile.id,
                                }));
                              }}
                              className="cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold bg-background text-foreground mr-2">
                                <UserCircle className="h-3 w-3" />
                                {profile.full_name?.split(" ")[0] ||
                                  profile.email?.split("@")[0]}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Actions Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="z-50 bg-popover"
                    >
                      <DropdownMenuItem
                        onClick={() => setShowUrlParserDialog(true)}
                      >
                        <LinkIcon className="h-4 w-4 mr-2" />
                        {t("jobs.importFromUrl")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleArchive}>
                        <Archive className="h-4 w-4 mr-2" />
                        {t("common.archive")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Job Details */}
                <div>
                  <h3 className="font-semibold mb-3">{t("jobs.details")}</h3>
                  <div className="space-y-3">
                    {/* Location */}
                    <div className="group relative">
                      {editingField === "location" ? (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <LocationAutocomplete
                            value={editValue}
                            onChange={setEditValue}
                            className="flex-1"
                            placeholder={t("jobs.locationPlaceholder")}
                          />
                          <Button
                            size="sm"
                            onClick={() => saveField("location")}
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">
                            {job.location || t("jobs.noLocation")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                            onClick={() => startEdit("location", job.location)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Salary */}
                    <div className="group relative">
                      {editingField === "salary_range" ? (
                        <div className="flex items-center gap-2">
                          <Euro className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1"
                            placeholder={t("jobs.salaryPlaceholder")}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => saveField("salary_range")}
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm">
                          <Euro className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">
                            {job.salary_range || t("jobs.noSalary")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                            onClick={() =>
                              startEdit("salary_range", job.salary_range)
                            }
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Created Date */}
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {t("common.created")}:{" "}
                        {formatDistanceToNow(new Date(job.created_at), {
                          addSuffix: true,
                          locale: getLocale(),
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <Separator />
                <div className="group relative">
                  <h3 className="font-semibold mb-3">
                    {t("common.description")}
                  </h3>
                  {editingField === "description" ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder={t("jobs.descriptionPlaceholder")}
                        rows={4}
                        className="text-sm"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveField("description")}
                        >
                          <Save className="h-3 w-3 mr-1" />
                          {t("common.save")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEdit}
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      {job.description ? (
                        <div
                          className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: job.description }}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                          {t("jobs.noDescription")}
                        </p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                        onClick={() =>
                          startEdit("description", job.description)
                        }
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Responsibilities */}
                <Separator />
                <div className="group relative">
                  <h3 className="font-semibold mb-3">
                    {t("jobs.responsibilities")}
                  </h3>
                  {editingField === "responsibilities" ? (
                    <div className="space-y-2">
                      <RichTextEditor
                        content={editValue}
                        onChange={setEditValue}
                        placeholder={t("jobs.responsibilitiesPlaceholder")}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveField("responsibilities")}
                        >
                          <Save className="h-3 w-3 mr-1" />
                          {t("common.save")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEdit}
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      {job.responsibilities ? (
                        <div
                          className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_strong]:font-semibold"
                          dangerouslySetInnerHTML={{
                            __html: job.responsibilities,
                          }}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t("jobs.noResponsibilities")}
                        </p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                        onClick={() =>
                          startEdit(
                            "responsibilities",
                            job.responsibilities || "",
                          )
                        }
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Requirements */}
                <Separator />
                <div className="group relative">
                  <h3 className="font-semibold mb-3">
                    {t("jobs.requirements")}
                  </h3>
                  {editingField === "requirements" ? (
                    <div className="space-y-2">
                      <RichTextEditor
                        content={editValue}
                        onChange={setEditValue}
                        placeholder={t("jobs.requirementsPlaceholder")}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveField("requirements")}
                        >
                          <Save className="h-3 w-3 mr-1" />
                          {t("common.save")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEdit}
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      {job.requirements ? (
                        <div
                          className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_strong]:font-semibold"
                          dangerouslySetInnerHTML={{ __html: job.requirements }}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t("jobs.noRequirements")}
                        </p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                        onClick={() =>
                          startEdit("requirements", job.requirements || "")
                        }
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Benefits */}
                <Separator />
                <div className="group relative">
                  <h3 className="font-semibold mb-3">{t("jobs.benefits")}</h3>
                  {editingField === "benefits" ? (
                    <div className="space-y-2">
                      <RichTextEditor
                        content={editValue}
                        onChange={setEditValue}
                        placeholder={t("jobs.benefitsPlaceholder")}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveField("benefits")}>
                          <Save className="h-3 w-3 mr-1" />
                          {t("common.save")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEdit}
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      {job.benefits ? (
                        <div
                          className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_strong]:font-semibold"
                          dangerouslySetInnerHTML={{ __html: job.benefits }}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t("jobs.noBenefits")}
                        </p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                        onClick={() =>
                          startEdit("benefits", job.benefits || "")
                        }
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <LinkIcon className="h-4 w-4" />
                    {t("jobs.originalPosting")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="group relative">
                    {editingField === "source_url" ? (
                      <div className="space-y-2">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder="https://..."
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveField("source_url")}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            {t("common.save")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            <X className="h-3 w-3 mr-1" />
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {job.source_url ? (
                          <>
                            <a
                              href={job.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (
                                  job.source_url.includes("supabase.co/storage")
                                ) {
                                  openFileInNewTab(job.source_url);
                                } else {
                                  window.open(
                                    job.source_url,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }
                              }}
                              className="text-sm text-primary hover:underline flex items-center gap-1 flex-1 truncate cursor-pointer"
                            >
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{job.source_url}</span>
                            </a>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={`flex-shrink-0 flex items-center gap-1 ${
                                      [
                                        "uncertain",
                                        "expired",
                                        "invalid",
                                      ].includes(urlValidity || "") ||
                                      isManuallyValidated
                                        ? "cursor-pointer hover:opacity-70 transition-opacity"
                                        : ""
                                    }`}
                                    onClick={() => {
                                      if (
                                        [
                                          "uncertain",
                                          "expired",
                                          "invalid",
                                        ].includes(urlValidity || "") ||
                                        isManuallyValidated
                                      ) {
                                        handleManualValidation();
                                      }
                                    }}
                                  >
                                    {urlValidity === "checking" && (
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    )}
                                    {urlValidity === "valid" && (
                                      <CheckCircle className="h-4 w-4 text-green-500" />
                                    )}
                                    {urlValidity === "uncertain" && (
                                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                                    )}
                                    {urlValidity === "expired" && (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    {urlValidity === "invalid" && (
                                      <XCircle className="h-4 w-4 text-destructive" />
                                    )}
                                    {isManuallyValidated && (
                                      <span className="text-[10px] text-muted-foreground font-medium">
                                        M
                                      </span>
                                    )}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <div>
                                    {urlValidity === "checking" &&
                                      t("jobs.checkingUrl")}
                                    {urlValidity === "valid" &&
                                      isManuallyValidated &&
                                      "Manuell als gültig markiert"}
                                    {urlValidity === "valid" &&
                                      !isManuallyValidated &&
                                      t("jobs.urlValid")}
                                    {urlValidity === "uncertain" &&
                                      t("jobs.urlUncertain")}
                                    {urlValidity === "expired" &&
                                      isManuallyValidated &&
                                      "Manuell als ungültig markiert"}
                                    {urlValidity === "expired" &&
                                      !isManuallyValidated &&
                                      t("jobs.urlExpired")}
                                    {urlValidity === "invalid" &&
                                      t("jobs.urlInvalid")}
                                  </div>
                                  {urlAnalysisReason &&
                                    !isManuallyValidated && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        {urlAnalysisReason}
                                      </div>
                                    )}
                                  {["uncertain", "expired", "invalid"].includes(
                                    urlValidity || "",
                                  ) &&
                                    !isManuallyValidated && (
                                      <div className="text-xs text-primary mt-1 font-medium">
                                        Klicken um manuell zu validieren
                                      </div>
                                    )}
                                  {isManuallyValidated && (
                                    <div className="text-xs text-primary mt-1 font-medium">
                                      {job?.source_url_status === "manual_valid"
                                        ? "Klicken um manuell abzulehnen"
                                        : "Klicken um manuell zu validieren"}
                                    </div>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground flex-1">
                            {t("jobs.noSourceUrl")}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 flex-shrink-0"
                          onClick={() =>
                            startEdit("source_url", job.source_url || "")
                          }
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {isFetchingContent && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Inhalte werden geladen...</span>
                    </div>
                  )}
                  <Separator className="my-3" />

                  {/* Document Upload Section */}
                  <div
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingDocument(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "copy";
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX;
                      const y = e.clientY;
                      if (
                        x < rect.left ||
                        x > rect.right ||
                        y < rect.top ||
                        y > rect.bottom
                      ) {
                        setIsDraggingDocument(false);
                      }
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingDocument(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) await handleDocumentFile(file);
                    }}
                    className={`rounded-lg transition-colors ${isDraggingDocument ? "border-2 border-dashed border-primary bg-primary/5 p-3" : ""}`}
                  >
                    <input
                      ref={documentInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) await handleDocumentFile(file);
                        if (documentInputRef.current)
                          documentInputRef.current.value = "";
                      }}
                    />

                    {isUploadingDocument ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Wird hochgeladen...</span>
                      </div>
                    ) : job.source_document_url ? (
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <a
                          href={job.source_document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            openFileInNewTab(job.source_document_url);
                          }}
                          className="text-sm text-primary hover:underline truncate flex-1 cursor-pointer"
                        >
                          {decodeURIComponent(
                            job.source_document_url.split("/").pop() || "",
                          ).replace(/^\d+_/, "")}
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0 text-muted-foreground hover:text-primary"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const response = await fetch(job.source_document_url);
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = decodeURIComponent(
                                job.source_document_url.split("/").pop() || "document.pdf"
                              ).replace(/^\d+_/, "");
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              window.URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error("Download error:", error);
                              toast({
                                title: t("toast.error"),
                                description: "Fehler beim Download.",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={async () => {
                            try {
                              const { error } = await supabase
                                .from("jobs")
                                .update({ source_document_url: null } as any)
                                .eq("id", id);
                              if (error) throw error;
                              setJob((prev: any) => ({
                                ...prev,
                                source_document_url: null,
                              }));
                              toast({
                                title: t("toast.saved"),
                                description: "Dokument entfernt.",
                              });
                            } catch (error) {
                              console.error("Error removing document:", error);
                              toast({
                                title: t("toast.error"),
                                description: "Fehler beim Entfernen.",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : isDraggingDocument ? (
                      <div className="flex flex-col items-center justify-center gap-1 py-2 text-center">
                        <Upload className="h-5 w-5 text-primary" />
                        <span className="text-sm text-primary font-medium">
                          Datei hier ablegen
                        </span>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground"
                        onClick={() => documentInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        PDF/DOC anhängen
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("common.notes")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <NotesSection
                    initialNotes={(job as any)?.structured_notes || []}
                    onSave={async (notes) => {
                      const { error } = await supabase
                        .from("jobs")
                        .update({ structured_notes: notes } as any)
                        .eq("id", id);
                      if (error) {
                        toast({
                          title: "Fehler",
                          description: "Notizen konnten nicht gespeichert werden.",
                          variant: "destructive",
                        });
                        return;
                      }
                      setJob((prev: any) => ({
                        ...prev,
                        structured_notes: notes,
                      }));
                      toast({
                        title: t("toast.noteSaved"),
                        description: t("toast.noteAddSuccess"),
                      });
                    }}
                    userName={userProfile?.full_name?.split(" ")[0] || "User"}
                    userAvatarUrl={userProfile?.avatar_url}
                    entityType="jobs"
                    entityId={id}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="matches">
          <JobMatchesTab
            matchedCandidates={matchedCandidates}
            onMatchUpdated={fetchMatchedCandidates}
            jobId={id!}
            job={job}
          />
        </TabsContent>

        <TabsContent value="job-form">
          <div className="mt-6">
            <PrintPage
              job={job}
              presenterName={userProfile?.full_name ?? ""}
              presenterEmail={userProfile?.email ?? ""}
              hideDownloadButton={false}
            />
          </div>
        </TabsContent>

        <TabsContent value="publication">
          <JobPublicationTab
            jobId={job.id}
            job={job}
            onJobUpdate={(updatedJob) => setJob((prev: any) => ({ ...prev, ...updatedJob }))}
          />
        </TabsContent>
      </Tabs>

      {/* URL Parser Dialog */}
      <Dialog open={showUrlParserDialog} onOpenChange={setShowUrlParserDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("jobs.importFromUrl")}</DialogTitle>
            <DialogDescription>{t("jobs.importFromUrlDesc")}</DialogDescription>
          </DialogHeader>
          <JobUrlParser
            onJobParsed={async (data) => {
              // Helper function to ensure string type
              const ensureString = (value: any): string => {
                if (!value) return "";
                if (Array.isArray(value)) return value.join("\n");
                return String(value);
              };

              // Format as bullet points if not already
              const formatAsBulletPoints = (text: string): string => {
                if (!text || text.includes("•")) return text;
                return text
                  .split("\n")
                  .filter((line) => line.trim())
                  .map((line) => `• ${line.trim()}`)
                  .join("\n");
              };

              // Update job with parsed data
              const updates: Record<string, any> = {};
              if (data.title) updates.title = ensureString(data.title);
              if (data.location) updates.location = ensureString(data.location);
              if (data.description)
                updates.description = ensureString(data.description);
              // Handle both 'tasks' and 'responsibilities' field names from parser
              const responsibilities =
                (data as any).responsibilities || data.tasks;
              if (responsibilities)
                updates.responsibilities = formatAsBulletPoints(
                  ensureString(responsibilities),
                );
              if (data.requirements)
                updates.requirements = formatAsBulletPoints(
                  ensureString(data.requirements),
                );
              if (data.salary) updates.salary_range = ensureString(data.salary);

              if (Object.keys(updates).length > 0) {
                const { error } = await supabase
                  .from("jobs")
                  .update(updates)
                  .eq("id", id);

                if (error) {
                  toast({
                    title: t("toast.error"),
                    description: t("toast.saveError"),
                    variant: "destructive",
                  });
                } else {
                  setJob((prev: any) => ({ ...prev, ...updates }));
                  toast({
                    title: t("toast.saved"),
                    description: t("jobs.importSuccess"),
                  });
                }
              }
              setShowUrlParserDialog(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* AI Assistant FAB */}
      {job && (
        <>
          <Button
            className="fixed bottom-6 right-6 z-50 rounded-full h-14 w-14 shadow-lg hover:shadow-xl transition-shadow"
            onClick={() => setShowAIAssistant(true)}
          >
            <Sparkles className="h-6 w-6" />
          </Button>

          <JobAIAssistant
            open={showAIAssistant}
            onOpenChange={setShowAIAssistant}
            jobId={job.id}
            currentData={job}
            onUpdate={async (updates) => {
              for (const [field, value] of Object.entries(updates)) {
                await saveField(field, value);
              }
            }}
          />
        </>
      )}
    </div>
  );
}
