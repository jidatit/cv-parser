import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Phone, Mail, FileDown, User, Briefcase, Calendar, BarChart3, MapPin, Send, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de, enUS, fr, es, it } from "date-fns/locale";
import { ApplicationRejectDialog } from "./ApplicationRejectDialog";
import { PDFViewer } from "./PDFViewer";

interface Application {
  id: string;
  created_at: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  cv_url: string | null;
  cover_letter: string | null;
  job_id: string | null;
  variant_shown: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  candidate_id: string | null;
}

interface NoteEntry {
  text: string;
  date: string;
  user?: string;
}

interface JobInfo {
  title: string;
  client_name: string | null;
  framework_a: string | null;
  framework_b: string | null;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  location: string | null;
  salary_range: string | null;
  skills: string[] | null;
  employment_type: string | null;
  job_notes: NoteEntry[] | null;
  client_notes: NoteEntry[] | null;
  client_text_notes: string | null;
}

interface VariantMetrics {
  views: number;
  clicks: number;
  applies: number;
}

interface ApplicationDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: Application | null;
  onStatusChange: () => void;
}

const statusColors: Record<string, string> = {
  neu: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  gesichtet: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  kontaktiert: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  in_prozess: "bg-green-500/10 text-green-500 border-green-500/20",
  abgelehnt: "bg-red-500/10 text-red-500 border-red-500/20",
  platziert: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

export function ApplicationDetailDialog({ open, onOpenChange, application, onStatusChange }: ApplicationDetailDialogProps) {
  const { t, currentLanguage } = useLanguage();
  const { toast } = useToast();
  const [jobInfo, setJobInfo] = useState<JobInfo | null>(null);
  const [metrics, setMetrics] = useState<VariantMetrics | null>(null);
  const [notes, setNotes] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cvSignedUrl, setCvSignedUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const dateLocale = currentLanguage === "de" ? de : currentLanguage === "fr" ? fr : currentLanguage === "es" ? es : currentLanguage === "it" ? it : enUS;

  useEffect(() => {
    if (!application) return;
    setNotes(application.notes || "");
    setCvSignedUrl(null);

    if (application.cv_url) {
      fetchCvUrl(application.cv_url);
    }

    if (application.job_id) {
      fetchJobInfo(application.job_id);
      if (application.variant_shown) {
        fetchMetrics(application.job_id, application.variant_shown);
      }
    }
  }, [application]);

  const fetchCvUrl = async (cvPath: string) => {
    const { data } = await supabase.storage
      .from("application-documents")
      .createSignedUrl(cvPath, 3600);
    if (data?.signedUrl) {
      setCvSignedUrl(data.signedUrl);
    }
  };

  const fetchJobInfo = async (jobId: string) => {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, client_id, framework_a, framework_b, description, requirements, responsibilities, location, salary_range, skills, employment_type, structured_notes")
      .eq("id", jobId)
      .single();

    if (job) {
      let clientName = null;
      let clientNotes: NoteEntry[] | null = null;
      let clientTextNotes: string | null = null;
      if (job.client_id) {
        const { data: client } = await supabase
          .from("clients")
          .select("name, notes, structured_notes")
          .eq("id", job.client_id)
          .single();
        clientName = client?.name || null;
        clientNotes = (client?.structured_notes as unknown as NoteEntry[] | null) || null;
        clientTextNotes = client?.notes || null;
      }
      setJobInfo({
        title: job.title,
        client_name: clientName,
        framework_a: job.framework_a,
        framework_b: job.framework_b,
        description: job.description,
        requirements: job.requirements,
        responsibilities: job.responsibilities,
        location: job.location,
        salary_range: job.salary_range,
        skills: job.skills,
        employment_type: job.employment_type,
        job_notes: (job.structured_notes as unknown as NoteEntry[] | null) || null,
        client_notes: clientNotes,
        client_text_notes: clientTextNotes,
      });
    }
  };

  const fetchMetrics = async (jobId: string, variant: string) => {
    const { data } = await supabase
      .from("job_analytics")
      .select("event_type")
      .eq("job_id", jobId)
      .eq("variant_shown", variant);

    if (data) {
      setMetrics({
        views: data.filter((e) => e.event_type === "view").length,
        clicks: data.filter((e) => e.event_type === "click").length,
        applies: data.filter((e) => e.event_type === "apply").length,
      });
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!application) return;

    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "gesichtet") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        updates.reviewed_by = user.id;
        updates.reviewed_at = new Date().toISOString();
      }
    }

    const { error } = await supabase
      .from("applications")
      .update(updates)
      .eq("id", application.id);

    if (error) {
      toast({ title: t("toast.updateError"), variant: "destructive" });
    } else {
      toast({ title: t("toast.statusUpdated") });
      onStatusChange();
    }
  };

  const saveNotes = async () => {
    if (!application) return;
    const { error } = await supabase
      .from("applications")
      .update({ notes })
      .eq("id", application.id);

    if (error) {
      toast({ title: t("toast.saveError"), variant: "destructive" });
    } else {
      toast({ title: t("toast.saved") });
    }
  };

  const handleReject = async (reason: string) => {
    if (!application) return;
    const notesUpdate = reason
      ? `${notes ? notes + "\n" : ""}Ablehnungsgrund: ${reason}`
      : notes;

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("applications")
      .update({
        status: "abgelehnt",
        notes: notesUpdate,
        reviewed_by: user?.id || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", application.id);

    if (error) {
      toast({ title: t("toast.updateError"), variant: "destructive" });
    } else {
      toast({ title: t("toast.statusUpdated") });
      setRejectOpen(false);
      onStatusChange();
    }
  };

  const downloadCV = async () => {
    if (!application?.cv_url) return;
    const { data } = await supabase.storage
      .from("application-documents")
      .createSignedUrl(application.cv_url, 300);

    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  const sendInvitation = async () => {
    if (!application) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-applicant", {
        body: {
          application_id: application.id,
          candidate_email: application.candidate_email,
          candidate_name: application.candidate_name,
          job_title: jobInfo?.title || "Stelle",
        },
      });

      if (error) throw error;

      toast({
        title: "Einladung gesendet",
        description: `Magic Link wurde an ${application.candidate_email} gesendet.`,
      });
    } catch (err: any) {
      console.error("Invite error:", err);
      toast({
        title: "Fehler beim Senden",
        description: err.message || "Die Einladung konnte nicht gesendet werden.",
        variant: "destructive",
      });
    } finally {
      setInviting(false);
    }
  };

  if (!application) return null;

  const frameworkLabel = application.variant_shown === "B"
    ? jobInfo?.framework_b || "PAS"
    : jobInfo?.framework_a || "AIDA";

  const isPdf = application.cv_url?.toLowerCase().endsWith(".pdf");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-7xl h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {application.candidate_name}
              <Badge className={statusColors[application.status] || ""}>
                {t(`applications.status.${application.status}`)}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden">
            {/* Left: Document Preview */}
            <div className="w-[60%] border-r flex flex-col">
              <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Dokumente
                </div>
                {application.cv_url && (
                  <Button variant="ghost" size="sm" onClick={downloadCV} className="gap-1 h-7 text-xs">
                    <FileDown className="h-3 w-3" />
                    Download
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                {cvSignedUrl && isPdf ? (
                  <PDFViewer url={cvSignedUrl} />
                ) : cvSignedUrl && !isPdf ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                    <FileText className="h-16 w-16" />
                    <p className="text-sm">Vorschau nicht verfügbar für dieses Format</p>
                    <Button variant="outline" size="sm" onClick={downloadCV} className="gap-2">
                      <FileDown className="h-4 w-4" />
                      Dokument herunterladen
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                    <FileText className="h-16 w-16" />
                    <p className="text-sm">Kein Dokument hochgeladen</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Job Details + Candidate Info */}
            <ScrollArea className="w-[40%]">
              <div className="p-4 space-y-4">
                {/* Candidate Contact */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Kontakt</h3>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${application.candidate_email}`} className="text-primary hover:underline">
                      {application.candidate_email}
                    </a>
                  </div>
                  {application.candidate_phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${application.candidate_phone}`} className="text-primary hover:underline">
                        {application.candidate_phone}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(application.created_at), "dd. MMMM yyyy, HH:mm", { locale: dateLocale })}
                  </div>
                  {application.source && (
                    <div className="text-sm text-muted-foreground">
                      {t("applications.source")}: <Badge variant="outline" className="ml-1">{application.source}</Badge>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Job Info with Tabs */}
                {jobInfo && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Stelle</h3>

                    <Tabs defaultValue="details" className="w-full">
                      <TabsList className="w-full">
                        <TabsTrigger value="details" className="flex-1 text-xs">Details</TabsTrigger>
                        <TabsTrigger value="job-notes" className="flex-1 text-xs">Notizen Stelle</TabsTrigger>
                        <TabsTrigger value="client-notes" className="flex-1 text-xs">Notizen Firma</TabsTrigger>
                      </TabsList>

                      <TabsContent value="details" className="space-y-3">
                        <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold text-sm">{jobInfo.title}</span>
                          </div>
                          {jobInfo.client_name && (
                            <p className="text-sm text-muted-foreground">{jobInfo.client_name}</p>
                          )}
                          {jobInfo.location && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {jobInfo.location}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {jobInfo.employment_type && (
                              <Badge variant="secondary" className="text-xs">{jobInfo.employment_type}</Badge>
                            )}
                            {jobInfo.salary_range && (
                              <Badge variant="secondary" className="text-xs">{jobInfo.salary_range}</Badge>
                            )}
                          </div>
                        </div>
                        {jobInfo.description && (
                          <div className="space-y-1">
                            <h4 className="text-xs font-medium text-muted-foreground">Beschreibung</h4>
                            <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-muted/20 p-2 rounded [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:space-y-1 [&_li]:ml-2" dangerouslySetInnerHTML={{ __html: jobInfo.description }} />
                          </div>
                        )}

                        {jobInfo.responsibilities && (
                          <div className="space-y-1">
                            <h4 className="text-xs font-medium text-muted-foreground">Aufgaben</h4>
                            <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-muted/20 p-2 rounded [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:space-y-1 [&_li]:ml-2" dangerouslySetInnerHTML={{ __html: jobInfo.responsibilities }} />
                          </div>
                        )}

                        {jobInfo.requirements && (
                          <div className="space-y-1">
                            <h4 className="text-xs font-medium text-muted-foreground">Anforderungen</h4>
                            <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-muted/20 p-2 rounded [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:space-y-1 [&_li]:ml-2" dangerouslySetInnerHTML={{ __html: jobInfo.requirements }} />
                          </div>
                        )}

                        {jobInfo.skills && jobInfo.skills.length > 0 && (
                          <div className="space-y-1">
                            <h4 className="text-xs font-medium text-muted-foreground">Skills</h4>
                            <div className="flex flex-wrap gap-1">
                              {jobInfo.skills.map((skill) => (
                                <Badge key={skill} variant="outline" className="text-xs">{skill}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="job-notes" className="space-y-3">
                        {jobInfo.job_notes && jobInfo.job_notes.length > 0 ? (
                          <div className="space-y-2">
                            {jobInfo.job_notes.map((note, i) => (
                              <div key={i} className="text-xs bg-muted/20 p-2 rounded space-y-1">
                                <p className="text-foreground/80">{note.text}</p>
                                <p className="text-muted-foreground text-[10px]">
                                  {note.date && format(new Date(note.date), "dd.MM.yyyy HH:mm", { locale: dateLocale })}
                                  {note.user && ` · ${note.user}`}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">Keine Notizen vorhanden</p>
                        )}
                      </TabsContent>

                      <TabsContent value="client-notes" className="space-y-3">
                        {jobInfo.client_name && (
                          <h4 className="text-xs font-medium text-muted-foreground">{jobInfo.client_name}</h4>
                        )}
                        {jobInfo.client_text_notes && (
                          <div className="text-xs text-foreground/80 bg-muted/20 p-2 rounded whitespace-pre-wrap">
                            {jobInfo.client_text_notes}
                          </div>
                        )}
                        {jobInfo.client_notes && jobInfo.client_notes.length > 0 ? (
                          <div className="space-y-2">
                            {jobInfo.client_notes.map((note, i) => (
                              <div key={i} className="text-xs bg-muted/20 p-2 rounded space-y-1">
                                <p className="text-foreground/80">{note.text}</p>
                                <p className="text-muted-foreground text-[10px]">
                                  {note.date && format(new Date(note.date), "dd.MM.yyyy HH:mm", { locale: dateLocale })}
                                  {note.user && ` · ${note.user}`}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : !jobInfo.client_text_notes ? (
                          <p className="text-xs text-muted-foreground italic">Keine Notizen vorhanden</p>
                        ) : null}
                      </TabsContent>
                    </Tabs>
                  </div>
                )}

                <Separator />

                {/* Variant & Metrics */}
                {application.variant_shown && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t("applications.variant")}:</span>
                    <Badge variant="outline">
                      {application.variant_shown} ({frameworkLabel})
                    </Badge>
                  </div>
                )}

                {metrics && (
                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      {t("applications.variantPerformance")}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold">{metrics.views}</p>
                        <p className="text-xs text-muted-foreground">Views</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">
                          {metrics.views > 0 ? ((metrics.clicks / metrics.views) * 100).toFixed(1) : "0"}%
                        </p>
                        <p className="text-xs text-muted-foreground">CTR</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">
                          {metrics.clicks > 0 ? ((metrics.applies / metrics.clicks) * 100).toFixed(1) : "0"}%
                        </p>
                        <p className="text-xs text-muted-foreground">Conv.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cover Letter */}
                {application.cover_letter && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("applications.coverLetter")}</h3>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-40 overflow-y-auto">
                        {application.cover_letter}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Notes */}
                <div className="space-y-2">
                  <Label>{t("applications.internalNotes")}</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder={t("applications.notesPlaceholder")}
                  />
                  <Button size="sm" onClick={saveNotes}>{t("common.save")}</Button>
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  {application.status === "neu" && (
                    <Button onClick={() => updateStatus("gesichtet")} className="gap-2" size="sm">
                      <Eye className="h-4 w-4" />
                      {t("applications.markReviewed")}
                    </Button>
                  )}
                  {["neu", "gesichtet"].includes(application.status) && (
                    <Button variant="outline" size="sm" onClick={() => updateStatus("kontaktiert")}>
                      {t("applications.markContacted")}
                    </Button>
                  )}
                  {["neu", "gesichtet", "kontaktiert"].includes(application.status) && (
                    <Button variant="outline" size="sm" onClick={() => updateStatus("in_prozess")}>
                      {t("applications.moveToPipeline")}
                    </Button>
                  )}
                  {application.status !== "abgelehnt" && application.status !== "platziert" && (
                    <Button variant="destructive" size="sm" onClick={() => setRejectOpen(true)}>
                      {t("applications.reject")}
                    </Button>
                  )}
                </div>

                {/* Magic Link Button - only in kontaktiert stage */}
                {application.status === "kontaktiert" && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Einladung</h3>
                      <p className="text-xs text-muted-foreground">
                        Erstellt einen Account für den Bewerber und sendet einen Magic Link per E-Mail.
                      </p>
                      <Button
                        onClick={sendInvitation}
                        disabled={inviting}
                        className="gap-2 w-full"
                        size="sm"
                      >
                        {inviting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        {inviting ? "Wird gesendet..." : "Magic Link senden"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <ApplicationRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={handleReject}
        candidateName={application.candidate_name}
      />
    </>
  );
}
