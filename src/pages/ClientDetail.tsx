import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  Globe,
  Save,
  X,
  Loader2,
  MoreVertical,
  Trash2,
  Briefcase,
  ExternalLink,
  Plus,
  Sparkles,
  Archive,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { NotesSection } from "@/components/NotesSection";
import { StatusDropdown } from "@/components/StatusDropdown";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { CompanyLogoUpload } from "@/components/CompanyLogoUpload";
import { ContactPersonsTab } from "@/components/ContactPersonsTab";
import { NewJobDialog } from "@/components/NewJobDialog";
import {
  IndustryMultiSelect,
  parseIndustryString,
  industryArrayToString,
} from "@/components/IndustryMultiSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/hooks/useLanguage";
import { getStatusColor, getJobStatusTranslationKey } from "@/lib/statusUtils";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import { useGoBack } from "@/hooks/useGoBack";

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/clients");
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const { configurations } = useStatusConfigurations();

  // Check if we came from a match view or returning from a job
  const returnToTab = "details";
  const [client, setClient] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);
  const [newBenefit, setNewBenefit] = useState<string>("");
  const [jobPipelineCounts, setJobPipelineCounts] = useState<
    Record<string, number>
  >({});
  const [isParsingWebsite, setIsParsingWebsite] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  const handleToggleDescriptionApproved = async () => {
    if (!client) return;
    const newValue = !client.description_approved;

    const { error } = await supabase
      .from("clients")
      .update({ description_approved: newValue } as any)
      .eq("id", id);

    if (!error) {
      setClient((prev: any) => ({ ...prev, description_approved: newValue }));
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch client
        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (clientError) throw clientError;
        setClient(clientData);

        // Parse benefits into array
        if (clientData?.benefits) {
          const benefitsArray = clientData.benefits
            .split("•")
            .map((b: string) => b.trim())
            .filter(Boolean);
          setSelectedBenefits(benefitsArray);
        }

        // Fetch jobs for this client
        const { data: jobsData, error: jobsError } = await supabase
          .from("jobs")
          .select("*")
          .eq("client_id", id)
          .order("created_at", { ascending: false });

        if (jobsError) throw jobsError;
        setJobs(jobsData || []);

        // Fetch pipeline matches for each job (stages >= Inquiry)
        if (jobsData && jobsData.length > 0) {
          const jobIds = jobsData.map((j) => j.id);
          const pipelineStages = [
            "Inquiry",
            "Sent",
            "Interview",
            "Offered",
            "Placed",
          ];

          const { data: placementsData } = await supabase
            .from("placements")
            .select("job_id, stage")
            .in("job_id", jobIds)
            .in("stage", pipelineStages);

          if (placementsData) {
            const counts: Record<string, number> = {};
            placementsData.forEach((p) => {
              counts[p.job_id] = (counts[p.job_id] || 0) + 1;
            });
            setJobPipelineCounts(counts);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id]);

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveField = async (field: string) => {
    try {
      const { error } = await supabase
        .from("clients")
        .update({ [field]: editValue })
        .eq("id", id);

      if (error) throw error;

      setClient((prev: any) => ({ ...prev, [field]: editValue }));
      setEditingField(null);
      toast({
        title: t("toast.saved"),
        description: t("toast.saveSuccess"),
      });

      // Auto-parse website when website field is saved
      if (field === "website" && editValue) {
        handleParseWebsite(editValue);

        // Fire-and-forget: fetch logo if none exists yet
        if (!client?.logo_url && id) {
          supabase.functions.invoke('fetch-company-logo', {
            body: { url: editValue, clientId: id }
          }).then(res => {
            if (res.data?.success && res.data?.logo_url) {
              setClient((prev: any) => ({ ...prev, logo_url: res.data.logo_url }));
            }
          }).catch(err => {
            console.error('Logo fetch error:', err);
          });
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

  const saveBenefits = async () => {
    try {
      const benefitsString = selectedBenefits.join(" • ");
      const { error } = await supabase
        .from("clients")
        .update({ benefits: benefitsString })
        .eq("id", id);

      if (error) throw error;

      setClient((prev: any) => ({ ...prev, benefits: benefitsString }));
      setEditingField(null);
      setNewBenefit("");
      toast({
        title: t("toast.saved"),
        description: t("clients.benefitsUpdated"),
      });
    } catch (error) {
      console.error("Error saving benefits:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.saveError"),
        variant: "destructive",
      });
    }
  };

  const handleLogoChange = async (url: string | null) => {
    try {
      const { error } = await supabase
        .from("clients")
        .update({ logo_url: url, logo_bg_color: null } as any)
        .eq("id", id);

      if (error) throw error;

      setClient((prev: any) => ({ ...prev, logo_url: url, logo_bg_color: null }));
      toast({
        title: t("toast.success"),
        description: url ? t("clients.logoUpdated") : t("clients.logoRemoved"),
      });
    } catch (error) {
      console.error("Error updating logo:", error);
      toast({
        title: t("toast.error"),
        description: t("clients.logoUpdateError"),
        variant: "destructive",
      });
    }
  };
  const removeBenefit = (benefit: string) => {
    setSelectedBenefits((prev) => prev.filter((b) => b !== benefit));
  };

  const addBenefit = () => {
    if (newBenefit.trim() && !selectedBenefits.includes(newBenefit.trim())) {
      setSelectedBenefits((prev) => [...prev, newBenefit.trim()]);
      setNewBenefit("");
    }
  };

  const statusOptions = [
    {
      title: "N/D",
      color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    },
    { title: t("clients.statusNotOpen"), color: "bg-red-500/70 text-white" },
    { title: t("clients.statusOpen"), color: "bg-green-500/70 text-white" },
    { title: t("clients.statusPartner"), color: "bg-blue-500/70 text-white" },
  ];

  const getCurrentStatusColor = (status: string) => {
    const statusOption = statusOptions.find((s) => s.title === status);
    return statusOption?.color || "bg-gray-500 text-white";
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!client) return;

    const { error } = await supabase
      .from("clients")
      .update({ status: newStatus })
      .eq("id", id!);

    if (error) {
      toast({
        title: t("toast.error"),
        description: t("toast.updateError"),
        variant: "destructive",
      });
      return;
    }

    setClient({ ...client, status: newStatus });
    toast({
      title: t("toast.statusUpdated"),
      description: `${t("clients.statusSetTo")} "${newStatus}"`,
    });
  };

  const handleArchive = async () => {
    if (!confirm(t("archive.archiveCompanyConfirm"))) {
      return;
    }

    setIsArchiving(true);
    try {
      // 1. Archive the client
      const { error: clientError } = await supabase
        .from("clients")
        .update({ status: "Archived" })
        .eq("id", id);

      if (clientError) throw clientError;

      // 2. Get all non-archived jobs for this client
      const { data: jobsToArchive } = await supabase
        .from("jobs")
        .select("id")
        .eq("client_id", id)
        .neq("status", "Archived");

      // 3. Archive all jobs
      if (jobsToArchive && jobsToArchive.length > 0) {
        const jobIds = jobsToArchive.map((j) => j.id);

        const { error: jobsError } = await supabase
          .from("jobs")
          .update({ status: "Archived" })
          .in("id", jobIds);

        if (jobsError) throw jobsError;

        // 4. Reject all active placements for these jobs
        const { data: placementsToReject } = await supabase
          .from("placements")
          .select("id, notes")
          .in("job_id", jobIds)
          .not("stage", "in", '("Abgelehnt","Placed","Archiviert")');

        if (placementsToReject && placementsToReject.length > 0) {
          for (const placement of placementsToReject) {
            const existingNotes = Array.isArray(placement.notes)
              ? placement.notes
              : [];
            const rejectionNote = {
              id: crypto.randomUUID(),
              text: "Automatisch abgelehnt: Firma wurde archiviert",
              createdAt: new Date().toISOString(),
              createdBy: userProfile?.full_name || "System",
            };

            await supabase
              .from("placements")
              .update({
                stage: "Abgelehnt",
                notes: [...existingNotes, rejectionNote],
              })
              .eq("id", placement.id);
          }
        }
      }

      toast({
        title: t("toast.archived"),
        description: t("toast.saveSuccess"),
      });

      navigate("/clients");
    } catch (error) {
      console.error("Error archiving client:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.updateError"),
        variant: "destructive",
      });
      setIsArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("clients.confirmDelete"))) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase.from("clients").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: t("toast.deleted"),
        description: t("toast.deleteSuccess"),
      });

      navigate("/clients");
    } catch (error) {
      console.error("Error deleting client:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.deleteError"),
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  const handleJobStatusChange = async (jobId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ status: newStatus })
        .eq("id", jobId);

      if (error) throw error;

      setJobs((prevJobs) =>
        prevJobs.map((job) =>
          job.id === jobId ? { ...job, status: newStatus } : job,
        ),
      );

      toast({
        title: t("toast.statusUpdated"),
        description: `${t("jobs.statusSetTo")} "${newStatus}"`,
      });
    } catch (error) {
      console.error("Error updating job status:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.updateError"),
        variant: "destructive",
      });
    }
  };

  // Use global job status configuration
  const jobStatusOptions = configurations.jobStatuses.map((s) => ({
    id: s.label,
    label: s.label,
  }));

  const handleBack = goBack;

  const handleParseWebsite = async (urlOverride?: string) => {
    const targetUrl = urlOverride || client?.website;
    if (!targetUrl) {
      toast({
        title: t("toast.error"),
        description:
          t("clients.noWebsiteToAnalyze") ||
          "Bitte zuerst eine Website-URL eingeben",
        variant: "destructive",
      });
      return;
    }

    setIsParsingWebsite(true);
    try {
      // Format URL
      let websiteUrl = targetUrl.trim();
      if (
        !websiteUrl.startsWith("http://") &&
        !websiteUrl.startsWith("https://")
      ) {
        websiteUrl = `https://${websiteUrl}`;
      }

      const { data, error } = await supabase.functions.invoke(
        "parse-company-website",
        {
          body: { url: websiteUrl },
        },
      );

      if (error) throw error;
      if (!data?.success || !data?.data) {
        throw new Error(data?.error || "Parsing failed");
      }

      const parsedData = data.data;
      const updates: Record<string, any> = {};
      const updatedFields: string[] = [];

      // Description is not saved here - it will be generated by AI via handleGenerateDescription() below
      // Only update other empty fields
      if (!client.benefits && parsedData.benefits) {
        updates.benefits = parsedData.benefits;
        updatedFields.push(t("clients.benefits"));
      }
      if (!client.address && parsedData.address) {
        updates.address = parsedData.address;
        updatedFields.push(t("clients.address"));
      }
      if (!client.email && parsedData.email) {
        updates.email = parsedData.email;
        updatedFields.push(t("clients.email"));
      }
      if (!client.phone && parsedData.phone) {
        updates.phone = parsedData.phone;
        updatedFields.push(t("clients.phone"));
      }
      if (!client.contact_person && parsedData.contact_person) {
        updates.contact_person = parsedData.contact_person;
        updatedFields.push(t("clients.contactPerson"));
      }
      if (!client.careers_url && parsedData.careers_url) {
        updates.careers_url = parsedData.careers_url;
        updatedFields.push(t("clients.careersPage"));
      }
      if (!client.industry && parsedData.industry) {
        updates.industry = parsedData.industry;
        updatedFields.push(t("clients.industry"));
      }
      if (!client.logo_url && parsedData.logo_url) {
        updates.logo_url = parsedData.logo_url;
        updatedFields.push("Logo");
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from("clients")
          .update(updates)
          .eq("id", id);

        if (updateError) throw updateError;

        // Update local state
        setClient((prev: any) => ({ ...prev, ...updates }));

        // Update benefits array if benefits were updated
        if (updates.benefits) {
          const benefitsArray = updates.benefits
            .split("•")
            .map((b: string) => b.trim())
            .filter(Boolean);
          setSelectedBenefits(benefitsArray);
        }

        toast({
          title: t("toast.success"),
          description: `${updatedFields.length} ${t("clients.fieldsUpdated")}: ${updatedFields.join(", ")}`,
        });
      } else {
        toast({
          title: t("toast.info") || "Info",
          description:
            t("clients.noNewData") ||
            "Keine neuen Daten gefunden - alle Felder sind bereits ausgefüllt",
        });
      }

      // Auto-generate description after successful parsing
      setIsParsingWebsite(false);
      handleGenerateDescription();
      return;
    } catch (error) {
      console.error("Error parsing website:", error);
      toast({
        title: t("toast.error"),
        description:
          t("clients.parseError") || "Fehler beim Analysieren der Website",
        variant: "destructive",
      });
    } finally {
      setIsParsingWebsite(false);
    }
  };

  const handleGenerateDescription = async () => {
    setIsGeneratingDescription(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-company-description",
        {
          body: { client_id: id },
        },
      );

      if (error) {
        // Try to extract the actual error message from the edge function response
        const context = (error as any)?.context;
        if (context) {
          try {
            const body = await context.json?.() || context;
            if (body?.error) throw new Error(body.error);
          } catch (e) {
            if (e instanceof Error && e.message !== 'Edge Function returned a non-2xx status code') throw e;
          }
        }
        throw error;
      }

      if (!data?.description) {
        throw new Error("Keine Beschreibung generiert");
      }

      // Auto-save the generated description
      const { error: updateError } = await supabase
        .from("clients")
        .update({ description: data.description })
        .eq("id", id);

      if (updateError) throw updateError;

      setClient((prev: any) => ({ ...prev, description: data.description }));

      toast({
        title: t("toast.success"),
        description: "Unternehmensbeschreibung wurde generiert",
      });
    } catch (error) {
      console.error("Error generating description:", error);
      const msg = error instanceof Error ? error.message : "";
      toast({
        title: t("toast.error"),
        description: msg.includes("Rate-Limit") ? msg : "Beschreibung konnte nicht generiert werden. Bitte erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
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

  if (!client) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common.back")}
          </Button>
        </div>
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">{t("clients.notFound")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("common.back")}
        </Button>
      </div>

      <Tabs defaultValue={returnToTab} className="w-full space-y-6">
        <div className="flex items-center justify-between gap-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">{t("clients.details")}</TabsTrigger>
            <TabsTrigger value="jobs">{t("nav.jobs")}</TabsTrigger>
            <TabsTrigger value="contacts">{t("clients.contacts")}</TabsTrigger>
          </TabsList>

          <NewJobDialog
            clientId={id}
            onJobCreated={async () => {
              // Refresh jobs list
              const { data: jobsData } = await supabase
                .from("jobs")
                .select("*")
                .eq("client_id", id)
                .order("created_at", { ascending: false });
              if (jobsData) setJobs(jobsData);
            }}
            trigger={
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t("jobs.new")}
              </Button>
            }
          />
        </div>

        <TabsContent value="details" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Main Info */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-start gap-6">
                  {/* Company Logo */}
                  <CompanyLogoUpload
                    currentLogo={client.logo_url}
                    companyName={client.name}
                    onLogoChange={handleLogoChange}
                    clientId={id}
                    websiteUrl={client.website}
                    logoBgColor={client.logo_bg_color}
                  />

                  <div className="flex-1 flex items-start justify-between">
                    <div className="flex-1 space-y-4">
                      {/* Name */}
                      <div className="group relative">
                        {editingField === "name" ? (
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
                                onClick={() => saveField("name")}
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
                          <CardTitle
                            className="text-2xl cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                            onDoubleClick={() => startEdit("name", client.name)}
                          >
                            {client.name}
                          </CardTitle>
                        )}
                      </div>

                      {/* Industry */}
                      <div className="group relative">
                        <CardDescription className="text-lg flex items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0" />
                          <IndustryMultiSelect
                            value={parseIndustryString(client.industry)}
                            onChange={async (newIndustries) => {
                              try {
                                const industryString =
                                  industryArrayToString(newIndustries);
                                const { error } = await supabase
                                  .from("clients")
                                  .update({ industry: industryString || null })
                                  .eq("id", id);

                                if (error) throw error;

                                setClient((prev: any) => ({
                                  ...prev,
                                  industry: industryString,
                                }));
                                toast({
                                  title: t("toast.saved"),
                                  description: t("toast.saveSuccess"),
                                });
                              } catch (error) {
                                console.error("Error saving industry:", error);
                                toast({
                                  title: t("toast.error"),
                                  description: t("toast.saveError"),
                                  variant: "destructive",
                                });
                              }
                            }}
                            placeholder={t("clients.noIndustry")}
                          />
                        </CardDescription>
                      </div>
                    </div>

                    {/* Status and Actions */}
                    <div className="flex items-center gap-2">
                      <StatusDropdown
                        currentStatus={client.status || t("clients.statusOpen")}
                        currentColor={getCurrentStatusColor(
                          client.status || t("clients.statusOpen"),
                        )}
                        availableStatuses={statusOptions}
                        onStatusChange={handleStatusChange}
                      />

                      {/* Actions Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="z-50 bg-popover"
                        >
                          <DropdownMenuItem
                            onClick={handleArchive}
                            disabled={
                              isArchiving || client.status === "Archived"
                            }
                          >
                            <Archive className="h-4 w-4 mr-2" />
                            {t("archive.archiveCompany")}
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
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Contact Person */}
                <div>
                  <h3 className="font-semibold mb-3">
                    {t("clients.contactInfo")}
                  </h3>
                  <div className="space-y-3">
                    {/* Contact Person Name */}
                    <div className="group relative">
                      {editingField === "contact_person" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder={t("clients.contactPerson")}
                            className="flex-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => saveField("contact_person")}
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
                        <div
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() =>
                            startEdit("contact_person", client.contact_person)
                          }
                        >
                          <span className="flex-1 font-medium">
                            {client.contact_person ||
                              t("clients.noContactPerson")}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Email */}
                    <div className="group relative">
                      {editingField === "email" ? (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="email@example.com"
                            type="email"
                            className="flex-1"
                            autoFocus
                          />
                          <Button size="sm" onClick={() => saveField("email")}>
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
                        <div
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() => startEdit("email", client.email)}
                        >
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">
                            {client.email || "N/D"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Phone */}
                    <div className="group relative">
                      {editingField === "phone" ? (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="+49..."
                            type="tel"
                            className="flex-1"
                            autoFocus
                          />
                          <Button size="sm" onClick={() => saveField("phone")}>
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
                        <div
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() => startEdit("phone", client.phone)}
                        >
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">
                            {client.phone || "N/D"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Address */}
                    <div className="group relative">
                      {editingField === "address" ? (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <LocationAutocomplete
                            value={editValue}
                            onChange={setEditValue}
                            placeholder={t("clients.address")}
                            className="flex-1"
                          />
                          <Button
                            size="sm"
                            onClick={() => saveField("address")}
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
                        <div
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() =>
                            startEdit("address", client.address)
                          }
                        >
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">
                            {client.address || "N/D"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Website */}
                    <div className="group relative">
                      {editingField === "website" ? (
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="https://..."
                            type="url"
                            className="flex-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => saveField("website")}
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
                        <div
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() =>
                            startEdit("website", client.website)
                          }
                          onContextMenu={(e) => {
                            e.preventDefault();
                            startEdit("website", client.website);
                          }}
                        >
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          {client.website ? (
                            <>
                              <a
                                href={
                                  client.website.startsWith("http")
                                    ? client.website
                                    : `https://${client.website}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 hover:underline flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t("clients.website")}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              {isParsingWebsite && (
                                <Loader2 className="h-3 w-3 animate-spin ml-auto text-muted-foreground" />
                              )}
                            </>
                          ) : (
                            <span className="flex-1">N/D</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Careers URL */}
                    <div className="group relative">
                      {editingField === "careers_url" ? (
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="https://..."
                            type="url"
                            className="flex-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => saveField("careers_url")}
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
                        <div
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() =>
                            startEdit("careers_url", client.careers_url)
                          }
                          onContextMenu={(e) => {
                            e.preventDefault();
                            startEdit("careers_url", client.careers_url);
                          }}
                        >
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          {client.careers_url ? (
                            <a
                              href={
                                client.careers_url.startsWith("http")
                                  ? client.careers_url
                                  : `https://${client.careers_url}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 hover:underline flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t("clients.careersPage")}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="flex-1">N/D</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Description */}
                <div className="group relative">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">
                        {t("common.description")}
                      </h3>
                      <button
                        onClick={handleToggleDescriptionApproved}
                        className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                        title={
                          client.description_approved
                            ? "Beschreibung als 'zu prüfen' markieren"
                            : "Beschreibung als 'gut' markieren"
                        }
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 transition-colors",
                            client.description_approved
                              ? "text-green-500"
                              : "text-muted-foreground/50",
                          )}
                        />
                      </button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateDescription}
                      disabled={isGeneratingDescription}
                      className="h-7 text-xs"
                    >
                      {isGeneratingDescription ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Generiere...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3 mr-1" />
                          AI Beschreibung
                        </>
                      )}
                    </Button>
                  </div>
                  {editingField === "description" ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder={t("clients.descriptionPlaceholder")}
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
                    <p
                      className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg whitespace-pre-wrap cursor-pointer hover:bg-muted transition-colors"
                      onDoubleClick={() =>
                        startEdit("description", client.description)
                      }
                    >
                      {client.description || t("clients.noDescription")}
                    </p>
                  )}
                </div>

                <Separator />

                {/* Benefits */}
                <div className="group relative">
                  <h3 className="font-semibold mb-3">
                    {t("clients.benefits")}
                  </h3>
                  {editingField === "benefits" ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 min-h-[80px] p-3 border rounded-md">
                        {selectedBenefits.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {t("clients.noBenefitsSelected")}
                          </p>
                        ) : (
                          selectedBenefits.map((benefit) => (
                            <Badge
                              key={benefit}
                              variant="secondary"
                              className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                              onClick={() => removeBenefit(benefit)}
                            >
                              {benefit}
                              <X className="ml-1 h-3 w-3" />
                            </Badge>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={newBenefit}
                          onChange={(e) => setNewBenefit(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addBenefit();
                            }
                          }}
                          placeholder={t("clients.addBenefitPlaceholder")}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={addBenefit}
                          disabled={!newBenefit.trim()}
                        >
                          {t("common.add")}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveBenefits}>
                          <Save className="h-3 w-3 mr-1" />
                          {t("common.save")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            cancelEdit();
                            // Reset benefits to saved state
                            if (client?.benefits) {
                              const benefitsArray = client.benefits
                                .split("•")
                                .map((b: string) => b.trim())
                                .filter(Boolean);
                              setSelectedBenefits(benefitsArray);
                            } else {
                              setSelectedBenefits([]);
                            }
                            setNewBenefit("");
                          }}
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex flex-wrap gap-2 bg-muted/50 p-3 rounded-lg min-h-[60px] cursor-pointer hover:bg-muted transition-colors"
                      onDoubleClick={() =>
                        startEdit("benefits", client.benefits)
                      }
                    >
                      {selectedBenefits.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t("clients.noBenefits")}
                        </p>
                      ) : (
                        selectedBenefits.map((benefit) => (
                          <Badge key={benefit} variant="secondary">
                            {benefit}
                          </Badge>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("common.notes")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <NotesSection
                    initialNotes={(client as any)?.structured_notes || []}
                    onSave={async (notes) => {
                      const { error } = await supabase
                        .from("clients")
                        .update({ structured_notes: notes } as any)
                        .eq("id", id);

                      if (error) {
                        toast({
                          title: t("toast.error"),
                          description: error.message,
                          variant: "destructive",
                        });
                        return;
                      }

                      setClient((prev: any) => ({
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
                    entityType="clients"
                    entityId={id}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                {t("nav.jobs")} (
                {jobs.filter((job) => job.status !== "Archived").length})
              </CardTitle>
              <CardDescription>
                {t("clients.jobsFor")} {client.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const activeJobs = jobs.filter(
                  (job) => job.status !== "Archived",
                );
                const archivedJobs = jobs.filter(
                  (job) => job.status === "Archived",
                );

                return (
                  <div className="space-y-6">
                    {/* Active Jobs */}
                    {activeJobs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {t("clients.noJobs")}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {activeJobs.map((job) => {
                          const pipelineCount = jobPipelineCounts[job.id] || 0;
                          return (
                            <div
                              key={job.id}
                              className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <Link
                                  to={`/jobs/${job.id}`}
                                  state={{
                                    fromClient: id,
                                    returnToTab: "jobs",
                                  }}
                                  className="flex-1 min-w-0 cursor-pointer"
                                >
                                  <div className="font-semibold text-base">
                                    {job.title}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3 flex-shrink-0" />
                                      <span>{job.location || "n/d"}</span>
                                    </div>
                                    {job.employment_type && (
                                      <span>{job.employment_type}</span>
                                    )}
                                  </div>
                                </Link>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {pipelineCount > 0 && (
                                    <Badge
                                      variant="outline"
                                      className="bg-green-500/10 text-green-600 border-green-500/30"
                                    >
                                      {pipelineCount}{" "}
                                      {pipelineCount === 1
                                        ? "Match"
                                        : "Matches"}
                                    </Badge>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="focus:outline-none">
                                        <Badge
                                          className={`${getStatusColor(job.status || "N/D")} cursor-pointer hover:opacity-80`}
                                        >
                                          {t(
                                            `common.jobStatus.${getJobStatusTranslationKey(job.status || "N/D")}`,
                                            {
                                              defaultValue: job.status || "N/D",
                                            },
                                          )}
                                        </Badge>
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      className="bg-popover z-50"
                                    >
                                      {jobStatusOptions.map((status) => (
                                        <DropdownMenuItem
                                          key={status.id}
                                          onClick={() =>
                                            handleJobStatusChange(
                                              job.id,
                                              status.id,
                                            )
                                          }
                                          className={
                                            job.status === status.id
                                              ? "bg-accent"
                                              : ""
                                          }
                                        >
                                          <Badge
                                            className={`${getStatusColor(status.id)} mr-2`}
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
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Archived Jobs Section */}
                    {archivedJobs.length > 0 && (
                      <>
                        <Separator className="my-6" />
                        <div>
                          <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
                            <Archive className="h-4 w-4" />
                            {t("clients.archivedJobs")} ({archivedJobs.length})
                          </h3>
                          <div className="space-y-3">
                            {archivedJobs.map((job) => {
                              const pipelineCount =
                                jobPipelineCounts[job.id] || 0;
                              return (
                                <div
                                  key={job.id}
                                  className="p-4 border rounded-lg bg-muted/30 opacity-70 hover:opacity-100 transition-opacity"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <Link
                                      to={`/jobs/${job.id}`}
                                      state={{
                                        fromClient: id,
                                        returnToTab: "jobs",
                                      }}
                                      className="flex-1 min-w-0 cursor-pointer"
                                    >
                                      <div className="font-semibold text-base">
                                        {job.title}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                          <MapPin className="h-3 w-3 flex-shrink-0" />
                                          <span>{job.location || "n/d"}</span>
                                        </div>
                                        {job.employment_type && (
                                          <span>{job.employment_type}</span>
                                        )}
                                      </div>
                                    </Link>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {pipelineCount > 0 && (
                                        <Badge
                                          variant="outline"
                                          className="bg-green-500/10 text-green-600 border-green-500/30"
                                        >
                                          {pipelineCount}{" "}
                                          {pipelineCount === 1
                                            ? "Match"
                                            : "Matches"}
                                        </Badge>
                                      )}
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button className="focus:outline-none">
                                            <Badge
                                              className={`${getStatusColor(job.status || "N/D")} cursor-pointer hover:opacity-80`}
                                            >
                                              {t(
                                                `common.jobStatus.${getJobStatusTranslationKey(job.status || "N/D")}`,
                                                {
                                                  defaultValue:
                                                    job.status || "N/D",
                                                },
                                              )}
                                            </Badge>
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                          align="end"
                                          className="bg-popover z-50"
                                        >
                                          {jobStatusOptions.map((status) => (
                                            <DropdownMenuItem
                                              key={status.id}
                                              onClick={() =>
                                                handleJobStatusChange(
                                                  job.id,
                                                  status.id,
                                                )
                                              }
                                              className={
                                                job.status === status.id
                                                  ? "bg-accent"
                                                  : ""
                                              }
                                            >
                                              <Badge
                                                className={`${getStatusColor(status.id)} mr-2`}
                                              >
                                                {t(
                                                  `common.jobStatus.${getJobStatusTranslationKey(status.label)}`,
                                                  {
                                                    defaultValue: status.label,
                                                  },
                                                )}
                                              </Badge>
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <ContactPersonsTab clientId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
