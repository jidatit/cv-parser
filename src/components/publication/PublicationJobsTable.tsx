import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { PublicationSideBySideDialog } from "./PublicationSideBySideDialog";
import { AnonymizationLevelSelector } from "./AnonymizationLevelSelector";
import { differenceInDays } from "date-fns";
import { Search, CalendarPlus, ArrowUpDown, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

interface JobRow {
  id: string;
  title: string;
  public_title: string | null;
  publication_status: string;
  anonymization_level: string;
  publication_language: string;
  publication_expires_at: string | null;
  active_title_variant: string;
  active_variant: string;
  client_name?: string;
}

type SortKey = 'title' | 'publication_status' | 'publication_expires_at';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

interface PublicationJobsTableProps {
  initialStatusFilter?: string;
}

export function PublicationJobsTable({ initialStatusFilter }: PublicationJobsTableProps) {
  const { t } = useLanguage();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [anonymizationLevel, setAnonymizationLevel] = useState<string>("medium");
  const [language, setLanguage] = useState<string>("de");
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'unpublish' | null>(null);

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase
      .from('jobs')
      .select('id, title, public_title, publication_status, anonymization_level, publication_language, publication_expires_at, active_title_variant, active_variant, client_id, status, clients(name)')
      .in('status', ['N/D', 'Active', 'Offen', 'Assignment', 'External'])
      .order('updated_at', { ascending: false });

    if (data) {
      setJobs(data.map((j: any) => ({
        ...j,
        client_name: j.clients?.name || '-',
      })));
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel('publication-jobs-table')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        fetchJobs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs]);

  // Sync initialStatusFilter from parent
  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter === "split_tests" ? "split" : initialStatusFilter);
    }
  }, [initialStatusFilter]);

  const filteredJobs = useMemo(() => {
    let result: JobRow[];
    if (statusFilter === "all") {
      result = jobs;
    } else if (statusFilter === "split") {
      result = jobs.filter(j => j.publication_status === "live" && j.active_variant === "split");
    } else {
      result = jobs.filter(j => j.publication_status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(j =>
        (j.public_title || j.title).toLowerCase().includes(q) ||
        (j.client_name || '').toLowerCase().includes(q)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      let valA: any, valB: any;
      if (sortKey === 'title') {
        valA = (a.public_title || a.title).toLowerCase();
        valB = (b.public_title || b.title).toLowerCase();
      } else if (sortKey === 'publication_expires_at') {
        valA = a.publication_expires_at || '';
        valB = b.publication_expires_at || '';
      } else {
        valA = (a as any)[sortKey] || '';
        valB = (b as any)[sortKey] || '';
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [jobs, statusFilter, searchQuery, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const pagedJobs = filteredJobs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [statusFilter, searchQuery]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === pagedJobs.length) setSelected(new Set());
    else setSelected(new Set(pagedJobs.map(j => j.id)));
  };

  const handleBatchAnonymize = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('anonymize-job', {
        body: { job_ids: Array.from(selected), anonymization_level: anonymizationLevel, language, generate_variant_b: true },
      });
      if (error) throw error;
      toast.success(`${selected.size} ${t('publicationManager.batchAnonymizing')}`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  const executeBatchApprove = async () => {
    const ids = Array.from(selected);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await Promise.all(ids.map(id =>
      supabase.from('jobs').update({
        publication_status: 'live', is_published: true,
        published_at: now.toISOString(), publication_expires_at: expiresAt,
      } as any).eq('id', id)
    ));
    toast.success(`${ids.length} ${t('publicationManager.batchPublished')}`);
    setSelected(new Set());
    setConfirmAction(null);
  };

  const executeBatchUnpublish = async () => {
    const ids = Array.from(selected);
    await Promise.all(ids.map(id =>
      supabase.from('jobs').update({ publication_status: 'draft', is_published: false } as any).eq('id', id)
    ));
    toast.success(`${ids.length} ${t('publicationManager.batchUnpublished')}`);
    setSelected(new Set());
    setConfirmAction(null);
  };

  const handleExtend = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('jobs').update({ publication_expires_at: newExpiry } as any).eq('id', jobId);
    toast.success(t('publicationManager.extended'));
    fetchJobs();
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = { draft: 'secondary', ai_processing: 'default', review: 'outline', live: 'default', expired: 'destructive', scheduled: 'secondary' };
    return (map[s] || 'secondary') as any;
  };

  const draftCount = Array.from(selected).filter(id => jobs.find(j => j.id === id)?.publication_status === 'draft').length;

  const SortHeader = ({ label, sortField }: { label: string; sortField: SortKey }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(sortField)}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      </div>
    </TableHead>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle>{t("publicationManager.tabs.jobs")}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('publicationManager.searchPlaceholder')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="draft">{t("publicationManager.status.draft")}</SelectItem>
                  <SelectItem value="review">{t("publicationManager.status.review")}</SelectItem>
                  <SelectItem value="scheduled">{t("publicationManager.status.scheduled")}</SelectItem>
                  <SelectItem value="live">{t("publicationManager.status.live")}</SelectItem>
                  <SelectItem value="expired">{t("publicationManager.status.expired")}</SelectItem>
                  <SelectItem value="split">{t("publicationManager.status.split_tests")}</SelectItem>
                </SelectContent>
              </Select>
              <AnonymizationLevelSelector value={anonymizationLevel} onChange={setAnonymizationLevel} />
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">DE</SelectItem>
                  <SelectItem value="en">EN</SelectItem>
                  <SelectItem value="fr">FR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-sm text-muted-foreground">{selected.size} {t("publicationManager.selected")}</span>
              <Button size="sm" onClick={handleBatchAnonymize} disabled={loading}>
                {t("publicationManager.actions.anonymize")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmAction('approve')}>
                {t("publicationManager.actions.approveAll")}
              </Button>
              {jobs.some(j => selected.has(j.id) && j.publication_status === 'live') && (
                <Button size="sm" variant="destructive" onClick={() => setConfirmAction('unpublish')}>
                  {t("publicationManager.actions.unpublish")}
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={selected.size === pagedJobs.length && pagedJobs.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <SortHeader label="Titel" sortField="title" />
                <TableHead>Firma</TableHead>
                <SortHeader label="Status" sortField="publication_status" />
                <TableHead>{t('publicationManager.variant')}</TableHead>
                <TableHead>Stufe</TableHead>
                <TableHead>Sprache</TableHead>
                <SortHeader label="Ablauf" sortField="publication_expires_at" />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedJobs.map(job => {
                const daysLeft = job.publication_expires_at ? differenceInDays(new Date(job.publication_expires_at), new Date()) : null;
                const isExpiringSoon = daysLeft !== null && daysLeft <= 5 && job.publication_status === 'live';
                return (
                  <TableRow
                    key={job.id}
                    className={`cursor-pointer ${isExpiringSoon ? 'bg-destructive/5' : ''}`}
                    onClick={() => setSelectedJob(job)}
                  >
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selected.has(job.id)} onCheckedChange={() => toggleSelect(job.id)} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {job.public_title || job.title}
                        {isExpiringSoon && <AlertTriangle className="h-4 w-4 text-destructive" />}
                      </div>
                    </TableCell>
                    <TableCell>{job.client_name}</TableCell>
                    <TableCell>
                      <Badge variant={statusColor(job.publication_status)}>
                        {t(`publicationManager.status.${job.publication_status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={job.active_variant === 'split' ? 'default' : 'outline'} className={job.active_variant === 'split' ? 'bg-primary/10 text-primary border-primary/20' : ''}>
                        {job.active_variant === 'split' ? 'A/B Split' : job.active_variant || 'A'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(`publicationManager.anonymization.${job.anonymization_level}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.publication_language.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      {daysLeft !== null ? (
                        <Badge variant={isExpiringSoon ? 'destructive' : 'secondary'}>
                          {daysLeft} {t("publicationManager.days")}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {job.publication_status === 'live' && (
                        <Button size="icon" variant="ghost" onClick={(e) => handleExtend(e, job.id)} title={t('publicationManager.extend')}>
                          <CalendarPlus className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {pagedJobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {t('publicationManager.noJobsFound')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                {filteredJobs.length} {t('publicationManager.totalJobs')}
              </span>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">{page + 1} / {totalPages}</span>
                <Button size="icon" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        {selectedJob && (
          <PublicationSideBySideDialog
            job={selectedJob}
            open={!!selectedJob}
            onOpenChange={(open) => !open && setSelectedJob(null)}
            onUpdate={fetchJobs}
          />
        )}
      </Card>

      {/* Confirm approve */}
      <AlertDialog open={confirmAction === 'approve'} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('publicationManager.confirm.approveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {draftCount > 0
                ? t('publicationManager.confirm.approveWithDrafts', { total: selected.size, drafts: draftCount })
                : t('publicationManager.confirm.approveDesc', { count: selected.size })
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('publicationManager.confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={executeBatchApprove}>{t('publicationManager.actions.approve')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm unpublish */}
      <AlertDialog open={confirmAction === 'unpublish'} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('publicationManager.confirm.unpublishTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('publicationManager.confirm.unpublishDesc', { count: selected.size })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('publicationManager.confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={executeBatchUnpublish} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('publicationManager.actions.unpublish')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
