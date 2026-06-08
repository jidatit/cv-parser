import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { XCircle, Pencil, Check, X, CheckCircle2, AlertTriangle, Columns2 } from "lucide-react";
import { PublicationPerformanceMatrix } from "./PublicationPerformanceMatrix";

interface Props {
  job: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

interface ChecklistItem {
  key: string;
  label: string;
  passed: boolean;
}

function InlineEdit({ value, field, jobId, isHtml, onSaved }: { value: string | null; field: string; jobId: string; isHtml?: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');

  const save = async () => {
    await supabase.from('jobs').update({ [field]: editValue } as any).eq('id', jobId);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('publication_audit_log').insert({
        job_id: jobId, user_id: user.id, action: 'edited',
        details: { field, old_value: value, new_value: editValue },
      } as any);
    }
    setEditing(false);
    onSaved();
  };

  if (editing) {
    return (
      <div className="space-y-1">
        {isHtml ? (
          <Textarea value={editValue} onChange={e => setEditValue(e.target.value)} rows={4} className="text-sm" />
        ) : (
          <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="text-sm" />
        )}
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={save}><Check className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditValue(value || ''); }}><X className="h-3 w-3" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <button onClick={() => setEditing(true)} className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-background border shadow-sm">
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
      {isHtml && value ? (
        <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }} />
      ) : (
        <p className="text-sm">{value || <span className="text-muted-foreground italic">—</span>}</p>
      )}
    </div>
  );
}

export function PublicationSideBySideDialog({ job, open, onOpenChange, onUpdate }: Props) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [fullJob, setFullJob] = useState<any>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [sideBySide, setSideBySide] = useState(false);
  const [activeTab, setActiveTab] = useState("variant_a");

  const reload = () => {
    if (job?.id) {
      supabase.from('jobs').select('*, clients(name)').eq('id', job.id).single().then(({ data }) => {
        setFullJob(data);
      });
    }
  };

  useEffect(() => { if (open) reload(); }, [open, job?.id]);

  const data = fullJob || job;

  // Checklist
  const checklist: ChecklistItem[] = [
    { key: 'title_a', label: t('publicationManager.checklist.titleA'), passed: !!(data.public_title_a || data.public_title) },
    { key: 'description', label: t('publicationManager.checklist.description'), passed: !!data.public_description },
    { key: 'requirements', label: t('publicationManager.checklist.requirements'), passed: !!data.public_requirements },
    { key: 'seo_title', label: t('publicationManager.checklist.seoTitle'), passed: !!data.seo_meta_title },
    { key: 'seo_desc', label: t('publicationManager.checklist.seoDesc'), passed: !!(data.meta_description || data.seo_meta_description) },
  ];
  const allPassed = checklist.every(c => c.passed);

  const handleApprove = async () => {
    if (!allPassed) {
      setShowChecklist(true);
      return;
    }
    await doApprove();
  };

  const doApprove = async () => {
    setLoading(true);
    setShowChecklist(false);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('jobs').update({
      publication_status: 'live', is_published: true,
      published_at: now.toISOString(), publication_expires_at: expiresAt,
    } as any).eq('id', job.id);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('publication_audit_log').insert({
        job_id: job.id, user_id: user.id, action: 'approved',
        details: { publication_status: 'live' },
      } as any);
    }
    toast.success(t('publicationManager.jobApprovedPublished'));
    setLoading(false);
    onUpdate();
    onOpenChange(false);
  };

  const handleUnpublish = async () => {
    setConfirmUnpublish(false);
    setLoading(true);
    await supabase.from('jobs').update({ publication_status: 'draft', is_published: false } as any).eq('id', job.id);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('publication_audit_log').insert({
        job_id: job.id, user_id: user.id, action: 'unpublished',
        details: { publication_status: 'draft' },
      } as any);
    }
    toast.success(t('publicationManager.actions.unpublish'));
    setLoading(false);
    onUpdate();
    onOpenChange(false);
  };

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      await supabase.functions.invoke('anonymize-job', {
        body: { job_ids: [job.id], anonymization_level: job.anonymization_level || 'medium', language: job.publication_language || 'de' },
      });
      toast.success(t('publicationManager.regeneratingAnonymization'));
      setTimeout(() => { onUpdate(); onOpenChange(false); }, 2000);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderSection = (title: string, content: string | null, field?: string) => {
    if (!content && !field) return null;
    return (
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{title}</h4>
        {field ? (
          <InlineEdit value={content} field={field} jobId={job.id} isHtml onSaved={reload} />
        ) : (
          <div className="text-sm prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content!) }} />
        )}
      </div>
    );
  };

  const renderOriginal = () => (
    <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
      <p className="font-medium text-base">{data.title}</p>
      {data.clients?.name && <p className="text-sm text-muted-foreground">{data.clients.name}</p>}
      {renderSection(t("jobs.description"), data.description)}
      {renderSection(t("jobs.responsibilities"), data.responsibilities)}
      {renderSection(t("jobs.requirements"), data.requirements)}
      {renderSection(t("jobs.benefits"), data.benefits)}
    </div>
  );

  const renderVariantA = () => (
    <div className="p-4 rounded-lg border bg-primary/5 space-y-3">
      <InlineEdit value={data.public_title_a || data.public_title} field="public_title_a" jobId={job.id} onSaved={reload} />
      {data.framework_a && <Badge variant="secondary">{data.framework_a}</Badge>}
      {data.public_summary_a && (
        <InlineEdit value={data.public_summary_a} field="public_summary_a" jobId={job.id} onSaved={reload} />
      )}
      {renderSection(t("jobs.description"), data.public_description, "public_description")}
      {renderSection(t("jobs.responsibilities"), data.public_responsibilities, "public_responsibilities")}
      {renderSection(t("jobs.requirements"), data.public_requirements, "public_requirements")}
      {renderSection(t("jobs.benefits"), data.public_benefits, "public_benefits")}
    </div>
  );

  const renderVariantB = () => (
    <div className="p-4 rounded-lg border bg-accent/10 space-y-3">
      <InlineEdit value={data.public_title_b} field="public_title_b" jobId={job.id} onSaved={reload} />
      {data.framework_b && <Badge variant="secondary">{data.framework_b}</Badge>}
      {data.public_summary_b && (
        <InlineEdit value={data.public_summary_b} field="public_summary_b" jobId={job.id} onSaved={reload} />
      )}
      {renderSection(t("jobs.description"), data.public_description_b, "public_description_b")}
      {renderSection(t("jobs.responsibilities"), data.public_responsibilities_b, "public_responsibilities_b")}
      {renderSection(t("jobs.requirements"), data.public_requirements_b, "public_requirements_b")}
      {renderSection(t("jobs.benefits"), data.public_benefits_b, "public_benefits_b")}
      {!data.public_description_b && !data.public_title_b && (
        <p className="text-sm text-muted-foreground italic">{t('publicationManager.noVariantB')}</p>
      )}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                {job.title}
                <Badge variant="outline">{t(`publicationManager.status.${job.publication_status}`)}</Badge>
              </DialogTitle>
              <Button size="sm" variant="ghost" onClick={() => setSideBySide(!sideBySide)}>
                <Columns2 className="h-4 w-4 mr-1" />
                {sideBySide ? 'Tabs' : 'Side-by-Side'}
              </Button>
            </div>
          </DialogHeader>

          {sideBySide ? (
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase">{t("publicationManager.original")}</h3>
                {renderOriginal()}
              </div>
              <Tabs defaultValue="a">
                <TabsList>
                  <TabsTrigger value="a">{t("publicationManager.variantA")}</TabsTrigger>
                  <TabsTrigger value="b">{t("publicationManager.variantB")}</TabsTrigger>
                </TabsList>
                <TabsContent value="a">{renderVariantA()}</TabsContent>
                <TabsContent value="b">{renderVariantB()}</TabsContent>
              </Tabs>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
              <TabsList>
                <TabsTrigger value="original">{t("publicationManager.original")}</TabsTrigger>
                <TabsTrigger value="variant_a">{t("publicationManager.variantA")}</TabsTrigger>
                <TabsTrigger value="variant_b">{t("publicationManager.variantB")}</TabsTrigger>
              </TabsList>
              <TabsContent value="original">{renderOriginal()}</TabsContent>
              <TabsContent value="variant_a">{renderVariantA()}</TabsContent>
              <TabsContent value="variant_b">{renderVariantB()}</TabsContent>
            </Tabs>
          )}

          {/* Performance Matrix */}
          {(data.public_title_a || data.public_title_b) && (
            <div className="mt-4">
              <PublicationPerformanceMatrix jobId={job.id} onUpdate={onUpdate} />
            </div>
          )}

          {/* SEO Section */}
          {(data.seo_meta_title || data.seo_meta_description || data.seo_slug) && (
            <div className="mt-4 p-4 rounded-lg border space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase">{t("publicationManager.seo")}</h3>
              {data.seo_slug && <p className="text-sm"><strong>Slug:</strong> {data.seo_slug}</p>}
              <p className="text-sm"><strong>Title:</strong> {data.seo_meta_title}</p>
              <p className="text-sm"><strong>Description:</strong> {data.meta_description || data.seo_meta_description}</p>
              {data.seo_keywords?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {data.seo_keywords.map((kw: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={handleRegenerate} disabled={loading}>
              {t("publicationManager.actions.regenerate")}
            </Button>
            {job.publication_status === 'live' ? (
              <Button variant="destructive" onClick={() => setConfirmUnpublish(true)} disabled={loading}>
                <XCircle className="h-4 w-4 mr-1" />
                {t("publicationManager.actions.unpublish")}
              </Button>
            ) : (
              <Button onClick={handleApprove} disabled={loading}>
                {t("publicationManager.actions.approve")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Publish checklist warning */}
      <AlertDialog open={showChecklist} onOpenChange={setShowChecklist}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('publicationManager.checklist.title')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 mt-2">
                {checklist.map(item => (
                  <div key={item.key} className="flex items-center gap-2">
                    {item.passed
                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                      : <XCircle className="h-4 w-4 text-destructive" />
                    }
                    <span className={item.passed ? '' : 'text-destructive font-medium'}>{item.label}</span>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('publicationManager.confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={doApprove}>{t('publicationManager.checklist.publishAnyway')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm unpublish */}
      <AlertDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('publicationManager.confirm.unpublishTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('publicationManager.confirm.unpublishSingle')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('publicationManager.confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnpublish} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('publicationManager.actions.unpublish')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
