import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Inbox, Search, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { ApplicationDetailDialog } from "@/components/ApplicationDetailDialog";

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

interface JobBasic {
  id: string;
  title: string;
}

const STATUS_TABS = ["alle", "neu", "gesichtet", "kontaktiert", "in_prozess", "abgelehnt", "platziert"];

const statusColors: Record<string, string> = {
  neu: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  gesichtet: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  kontaktiert: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  in_prozess: "bg-green-500/10 text-green-500 border-green-500/20",
  abgelehnt: "bg-red-500/10 text-red-500 border-red-500/20",
  platziert: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

export default function Applications() {
  const { t, currentLanguage } = useLanguage();
  const { toast } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<JobBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("alle");
  const [searchQuery, setSearchQuery] = useState("");
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailApp, setDetailApp] = useState<Application | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const dateLocale = currentLanguage === "de" ? de : enUS;

  useEffect(() => {
    fetchApplications();
    fetchJobs();

    const channel = supabase
      .channel("applications-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, () => {
        fetchApplications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchApplications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: t("toast.loadError"), variant: "destructive" });
    } else {
      setApplications(data || []);
      // Count by status
      const counts: Record<string, number> = {};
      (data || []).forEach((app) => {
        counts[app.status] = (counts[app.status] || 0) + 1;
      });
      setStatusCounts(counts);
    }
    setLoading(false);
  };

  const fetchJobs = async () => {
    const { data } = await supabase.from("jobs").select("id, title").order("title");
    setJobs(data || []);
  };

  const getJobTitle = (jobId: string | null) => {
    if (!jobId) return "–";
    return jobs.find((j) => j.id === jobId)?.title || "–";
  };

  const filtered = applications.filter((app) => {
    if (activeTab !== "alle" && app.status !== activeTab) return false;
    if (jobFilter !== "all" && app.job_id !== jobFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        app.candidate_name.toLowerCase().includes(q) ||
        app.candidate_email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((a) => a.id)));
    }
  };

  const batchUpdateStatus = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    const { error } = await supabase
      .from("applications")
      .update({ status: newStatus })
      .in("id", Array.from(selectedIds));

    if (error) {
      toast({ title: t("toast.updateError"), variant: "destructive" });
    } else {
      toast({ title: t("toast.statusUpdated") });
      setSelectedIds(new Set());
      fetchApplications();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t("applications.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("applications.subtitle")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchApplications} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {t("common.loading").replace("...", "")}
        </Button>
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const count = tab === "alle" ? applications.length : statusCounts[tab] || 0;
          return (
            <Button
              key={tab}
              variant={activeTab === tab ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab)}
              className="gap-1.5"
            >
              {t(`applications.status.${tab}`)}
              <Badge variant="secondary" className="ml-1 text-xs">
                {count}
              </Badge>
            </Button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("applications.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={jobFilter} onValueChange={setJobFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t("applications.filterByJob")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {jobs.map((job) => (
              <SelectItem key={job.id} value={job.id}>
                {job.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} {t("applications.selected")}
            </span>
            <Button size="sm" variant="outline" onClick={() => batchUpdateStatus("gesichtet")}>
              {t("applications.markReviewed")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => batchUpdateStatus("kontaktiert")}>
              {t("applications.markContacted")}
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("common.job")}</TableHead>
              <TableHead>{t("applications.variant")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((app) => (
                <TableRow
                  key={app.id}
                  className="cursor-pointer"
                  onClick={() => setDetailApp(app)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(app.id)}
                      onCheckedChange={() => toggleSelect(app.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{app.candidate_name}</TableCell>
                  <TableCell className="text-muted-foreground">{app.candidate_email}</TableCell>
                  <TableCell className="text-muted-foreground">{getJobTitle(app.job_id)}</TableCell>
                  <TableCell>
                    {app.variant_shown ? (
                      <Badge variant="outline">{app.variant_shown}</Badge>
                    ) : (
                      "–"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[app.status] || ""}>
                      {t(`applications.status.${app.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(app.created_at), "dd.MM.yyyy", { locale: dateLocale })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ApplicationDetailDialog
        open={!!detailApp}
        onOpenChange={(open) => !open && setDetailApp(null)}
        application={detailApp}
        onStatusChange={() => {
          fetchApplications();
          setDetailApp(null);
        }}
      />
    </div>
  );
}
