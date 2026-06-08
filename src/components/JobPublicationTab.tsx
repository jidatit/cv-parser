import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AnonymizationLevelSelector } from "@/components/publication/AnonymizationLevelSelector";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { format, subDays, differenceInDays } from "date-fns";
import { de, enUS } from "date-fns/locale";
import {
  Globe, RefreshCw, CheckCircle, XCircle, ChevronDown, Clock, Eye, MousePointerClick, Loader2, Save
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface Props {
  jobId: string;
  job: any;
  onJobUpdate: (updatedJob: any) => void;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ai_processing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  review: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  live: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  scheduled: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export function JobPublicationTab({ jobId, job, onJobUpdate }: Props) {
  const { t, currentLanguage } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [anonymizationLevel, setAnonymizationLevel] = useState(job?.anonymization_level || "medium");
  const [pubLanguage, setPubLanguage] = useState(job?.publication_language || "de");
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [seoOpen, setSeoOpen] = useState(false);
  const [editingSeo, setEditingSeo] = useState(false);
  const [seoTitle, setSeoTitle] = useState(job?.seo_meta_title || "");
  const [seoDesc, setSeoDesc] = useState(job?.seo_meta_description || "");
  const [seoKeywords, setSeoKeywords] = useState(job?.seo_keywords?.join(", ") || "");
  const [totalClicks, setTotalClicks] = useState(0);
  const [totalViews, setTotalViews] = useState(0);

  const locale = currentLanguage === "de" ? de : enUS;

  const fetchData = useCallback(async () => {
    // Fetch analytics
    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const [analyticsRes, auditRes] = await Promise.all([
      supabase
        .from("publication_analytics")
        .select("date, clicks, views, variant")
        .eq("job_id", jobId)
        .gte("date", thirtyDaysAgo)
        .order("date"),
      supabase
        .from("publication_audit_log")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (analyticsRes.data) {
      const byDate: Record<string, { date: string; clicks: number; views: number }> = {};
      let clicks = 0, views = 0;
      analyticsRes.data.forEach((a: any) => {
        const d = format(new Date(a.date), "dd.MM");
        if (!byDate[d]) byDate[d] = { date: d, clicks: 0, views: 0 };
        byDate[d].clicks += a.clicks;
        byDate[d].views += a.views;
        clicks += a.clicks;
        views += a.views;
      });
      setAnalytics(Object.values(byDate));
      setTotalClicks(clicks);
      setTotalViews(views);
    }

    if (auditRes.data) {
      setAuditLog(auditRes.data);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync local state when job prop changes
  useEffect(() => {
    setAnonymizationLevel(job?.anonymization_level || "medium");
    setPubLanguage(job?.publication_language || "de");
    setSeoTitle(job?.seo_meta_title || "");
    setSeoDesc(job?.seo_meta_description || "");
    setSeoKeywords(job?.seo_keywords?.join(", ") || "");
  }, [job]);

  const handleAnonymize = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("anonymize-job", {
        body: {
          job_ids: [jobId],
          anonymization_level: anonymizationLevel,
          language: pubLanguage,
          generate_variant_b: true,
        },
      });
      if (error) throw error;
      toast.success(t("publicationManager.actions.anonymize") + " ✓");
      // Reload job data after short delay for AI processing
      setTimeout(async () => {
        const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
        if (data) onJobUpdate(data);
        fetchData();
      }, 3000);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("jobs")
      .update({
        publication_status: "live",
        is_published: true,
        published_at: now.toISOString(),
        publication_expires_at: expiresAt,
      } as any)
      .eq("id", jobId);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("publication_audit_log").insert({
          job_id: jobId,
          user_id: user.id,
          action: "approved",
          details: { publication_status: "live" },
        } as any);
      }
      const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
      if (data) onJobUpdate(data);
      fetchData();
      toast.success(t("publicationManager.audit.approved"));
    }
    setLoading(false);
  };

  const handleWithdraw = async () => {
    setLoading(true);
    const { error } = await supabase
      .from("jobs")
      .update({
        publication_status: "draft",
        is_published: false,
      } as any)
      .eq("id", jobId);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("publication_audit_log").insert({
          job_id: jobId,
          user_id: user.id,
          action: "unpublished",
          details: {},
        } as any);
      }
      const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
      if (data) onJobUpdate(data);
      fetchData();
      toast.success(t("publicationManager.audit.unpublished"));
    }
    setLoading(false);
  };

  const handleSaveSeo = async () => {
    const keywords = seoKeywords.split(",").map((k) => k.trim()).filter(Boolean);
    const { error } = await supabase
      .from("jobs")
      .update({
        seo_meta_title: seoTitle,
        seo_meta_description: seoDesc,
        seo_keywords: keywords,
      } as any)
      .eq("id", jobId);

    if (!error) {
      onJobUpdate({ ...job, seo_meta_title: seoTitle, seo_meta_description: seoDesc, seo_keywords: keywords });
      setEditingSeo(false);
      toast.success(t("toast.saved"));
    }
  };

  const daysUntilExpiry = job?.publication_expires_at
    ? differenceInDays(new Date(job.publication_expires_at), new Date())
    : null;

  const pubStatus = job?.publication_status || "draft";

  return (
    <div className="space-y-6 mt-6">
      {/* 1. Status & Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={statusColors[pubStatus] || statusColors.draft}>
                {t(`publicationManager.status.${pubStatus}`)}
              </Badge>
              <Badge variant="outline">
                {t(`publicationManager.anonymization.${anonymizationLevel}`)}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                {pubLanguage.toUpperCase()}
              </Badge>
              {pubStatus === "live" && daysUntilExpiry !== null && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {t("publicationManager.expiresIn")} {daysUntilExpiry} {t("publicationManager.days")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <AnonymizationLevelSelector value={anonymizationLevel} onChange={setAnonymizationLevel} />
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={pubLanguage}
                onChange={(e) => setPubLanguage(e.target.value)}
              >
                <option value="de">DE</option>
                <option value="en">EN</option>
                <option value="fr">FR</option>
              </select>
              <Button onClick={handleAnonymize} disabled={loading} size="sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                {t("publicationManager.actions.anonymize")}
              </Button>
              {pubStatus === "review" && (
                <Button onClick={handleApprove} disabled={loading} size="sm" variant="default">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t("publicationManager.actions.approve")}
                </Button>
              )}
              {pubStatus === "live" && (
                <Button onClick={handleWithdraw} disabled={loading} size="sm" variant="destructive">
                  <XCircle className="h-4 w-4 mr-1" />
                  {t("publicationManager.actions.unpublish")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 2. Side-by-Side Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase text-muted-foreground">
              {t("publicationManager.original")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-semibold text-lg">{job?.title}</p>
            {(job?.client_name || job?.location) && (
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {job?.client_name && <span>🏢 {job.client_name}</span>}
                {job?.location && <span>📍 {job.location}</span>}
              </div>
            )}
            {job?.description && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.description")}</h4>
                <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description) }} />
              </div>
            )}
            {job?.responsibilities && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.responsibilities")}</h4>
                <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.responsibilities) }} />
              </div>
            )}
            {job?.requirements && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.requirements")}</h4>
                <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.requirements) }} />
              </div>
            )}
            {job?.benefits && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.benefits")}</h4>
                <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.benefits) }} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase text-muted-foreground">
              {t("publicationManager.anonymized")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {job?.public_title ? (
              <>
                {job?.public_title_variant_b ? (
                  <Tabs defaultValue="a">
                    <TabsList className="mb-2 h-8">
                      <TabsTrigger value="a" className="text-xs">{t("publicationManager.variantA")}</TabsTrigger>
                      <TabsTrigger value="b" className="text-xs">{t("publicationManager.variantB")}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="a" className="space-y-2">
                      <p className="font-semibold">{job.public_title}</p>
                      {job.public_description && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.description")}</h4>
                          <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_description) }} />
                        </div>
                      )}
                      {job.public_responsibilities && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.responsibilities")}</h4>
                          <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_responsibilities) }} />
                        </div>
                      )}
                      {job.public_requirements && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.requirements")}</h4>
                          <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_requirements) }} />
                        </div>
                      )}
                      {job.public_benefits && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.benefits")}</h4>
                          <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_benefits) }} />
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="b" className="space-y-2">
                      <p className="font-semibold">{job.public_title_variant_b}</p>
                      {job.public_description_b && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.description")}</h4>
                          <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_description_b) }} />
                        </div>
                      )}
                      {job.public_responsibilities_b && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.responsibilities")}</h4>
                          <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_responsibilities_b) }} />
                        </div>
                      )}
                      {job.public_requirements_b && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.requirements")}</h4>
                          <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_requirements_b) }} />
                        </div>
                      )}
                      {job.public_benefits_b && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.benefits")}</h4>
                          <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_benefits_b) }} />
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                ) : (
                  <>
                    <p className="font-semibold">{job.public_title}</p>
                    {job.public_description && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.description")}</h4>
                        <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_description) }} />
                      </div>
                    )}
                    {job.public_responsibilities && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.responsibilities")}</h4>
                        <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_responsibilities) }} />
                      </div>
                    )}
                    {job.public_requirements && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.requirements")}</h4>
                        <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_requirements) }} />
                      </div>
                    )}
                    {job.public_benefits && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("jobs.benefits")}</h4>
                        <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.public_benefits) }} />
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {t("publicationManager.status.draft")} — {t("publicationManager.actions.anonymize")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3. SEO Metadata (Collapsible) */}
      <Collapsible open={seoOpen} onOpenChange={setSeoOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{t("publicationManager.seo")}</CardTitle>
                <ChevronDown className={`h-4 w-4 transition-transform ${seoOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              {editingSeo ? (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">Meta Title</label>
                    <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={60} />
                    <span className="text-xs text-muted-foreground">{seoTitle.length}/60</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Meta Description</label>
                    <Textarea value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} maxLength={160} rows={2} />
                    <span className="text-xs text-muted-foreground">{seoDesc.length}/160</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Keywords (comma-separated)</label>
                    <Input value={seoKeywords} onChange={(e) => setSeoKeywords(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveSeo}>
                      <Save className="h-3 w-3 mr-1" /> {t("common.save")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingSeo(false)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-sm"><strong>Title:</strong> {job?.seo_meta_title || "—"}</p>
                    <p className="text-sm"><strong>Description:</strong> {job?.seo_meta_description || "—"}</p>
                    {job?.seo_keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {job.seo_keywords.map((kw: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditingSeo(true)}>
                    {t("common.edit")}
                  </Button>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 4. Analytics Mini-Dashboard */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("publicationManager.analytics.last30Days")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6 mb-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{totalViews}</span>
              <span className="text-xs text-muted-foreground">{t("publicationManager.analytics.views")}</span>
            </div>
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{totalClicks}</span>
              <span className="text-xs text-muted-foreground">{t("publicationManager.analytics.clicks")}</span>
            </div>
          </div>
          {analytics.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={analytics}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="views" name={t("publicationManager.analytics.views")} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="clicks" name={t("publicationManager.analytics.clicks")} stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("common.noDataFound")}</p>
          )}
        </CardContent>
      </Card>

      {/* 5. Audit Log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("publicationManager.tabs.auditLog")}</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {auditLog.map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {t(`publicationManager.audit.${entry.action}`) || entry.action}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(entry.created_at), "dd.MM.yyyy HH:mm", { locale })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("common.noDataFound")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
