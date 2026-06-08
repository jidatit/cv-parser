import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, MapPin, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { de, enUS, fr, it, es } from "date-fns/locale";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStatusColor, getJobStatusTranslationKey } from "@/lib/statusUtils";

const getDateLocale = (lang: string) => {
  switch (lang) {
    case 'de': return de;
    case 'fr': return fr;
    case 'it': return it;
    case 'es': return es;
    default: return enUS;
  }
};

export default function Orders() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { t, currentLanguage } = useLanguage();
  const [sortByStatus, setSortByStatus] = useState<'none' | 'asc' | 'desc'>('none');

  const toggleStatusSort = () => {
    setSortByStatus(prev => prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none');
  };

  const statusPriority: Record<string, number> = { 'Assignment': 0, 'Offen': 1 };

  const getSortedJobs = (jobs: any[]) => {
    if (sortByStatus === 'none') return jobs;
    return [...jobs].sort((a, b) => {
      const pa = statusPriority[a.status] ?? 2;
      const pb = statusPriority[b.status] ?? 2;
      return sortByStatus === 'asc' ? pa - pb : pb - pa;
    });
  };

  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, clients(name, status, industry)')
        .in('status', ['Offen', 'Assignment'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      setJobs(data || []);
      setFilteredJobs(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.jobsLoadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = jobs.filter(job =>
        job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.clients?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredJobs(filtered);
    } else {
      setFilteredJobs(jobs);
    }
  }, [searchTerm, jobs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t("orders.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("orders.title")}</h1>
        <p className="text-muted-foreground">
          {t("orders.subtitle")}
        </p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("orders.searchPlaceholder")}
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      {filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              {jobs.length === 0 ? t("orders.noOrdersYet") : t("orders.noMatchingSearch")}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {jobs.length === 0 
                ? t("orders.noOrdersYetDesc")
                : t("orders.adjustSearch")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("jobs.position")}</TableHead>
                <TableHead>{t("jobs.company")}</TableHead>
                <TableHead>{t("common.location")}</TableHead>
                <TableHead>{t("common.industry")}</TableHead>
                <TableHead>
                  <button
                    onClick={toggleStatusSort}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    {t("common.status")}
                    {sortByStatus === 'none' && <ArrowUpDown className="h-3.5 w-3.5" />}
                    {sortByStatus === 'asc' && <ArrowUp className="h-3.5 w-3.5" />}
                    {sortByStatus === 'desc' && <ArrowDown className="h-3.5 w-3.5" />}
                  </button>
                </TableHead>
                <TableHead>{t("jobs.added")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getSortedJobs(filteredJobs).map((job) => (
                <TableRow 
                  key={job.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/jobs/${job.id}`, { state: { from: '/orders' } })}
                >
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell>{job.clients?.name || t("jobs.noClient")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {job.location ? (() => {
                        const parts = job.location.split(',').map((p: string) => p.trim());
                        if (parts.length > 2) {
                          const cityPart = parts[parts.length - 2];
                          return cityPart.replace(/^\d{4,5}\s+/, '') || "-";
                        } else if (parts.length === 2) {
                          return parts[0].replace(/^\d{4,5}\s+/, '') || "-";
                        }
                        return parts[0].replace(/^\d{4,5}\s+/, '') || "-";
                      })() : "-"}
                    </div>
                  </TableCell>
                  <TableCell>{(job.clients as any)?.industry || "-"}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(job.status || 'N/D')}>
                      {t(`common.jobStatus.${getJobStatusTranslationKey(job.status || 'N/D')}`, { defaultValue: job.status || 'N/D' })}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: getDateLocale(currentLanguage) })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
