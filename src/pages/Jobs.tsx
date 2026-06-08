import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, MapPin, Archive, Trash2, MoreHorizontal, Merge } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NewJobDialog } from "@/components/NewJobDialog";
import { JobDuplicateManager } from "@/components/JobDuplicateManager";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { JobFilters, JobFilterCriteria } from "@/components/JobFilters";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAISearching, setIsAISearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSelectMode, setDragSelectMode] = useState(true);
  const { toast } = useToast();
  const { t, currentLanguage } = useLanguage();

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleCheckboxMouseDown = useCallback((e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    const willSelect = !selected.has(jobId);
    setDragSelectMode(willSelect);
    setIsDragging(true);
    const next = new Set(selected);
    if (willSelect) next.add(jobId); else next.delete(jobId);
    setSelected(next);
  }, [selected]);

  const handleRowMouseEnter = useCallback((jobId: string) => {
    if (!isDragging) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (dragSelectMode) next.add(jobId); else next.delete(jobId);
      return next;
    });
  }, [isDragging, dragSelectMode]);

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const toggleAll = () => {
    if (selected.size === filteredJobs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredJobs.map(j => j.id)));
    }
  };

  const handleBulkArchive = async () => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await supabase.from('jobs').update({ status: 'Archived' }).eq('id', id);
    }
    toast({ title: `${ids.length} Jobs archiviert` });
    setSelected(new Set());
    fetchJobs();
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await supabase.from('jobs').delete().eq('id', id);
    }
    toast({ title: `${ids.length} Jobs gelöscht` });
    setSelected(new Set());
    fetchJobs();
  };

  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, description, location, status, employment_type, experience_level, salary_range, skills, client_id, created_at, updated_at, user_id, clients(name, status, industry)')
        .neq('status', 'Archived')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setJobs(data || []);
      setFilteredJobs(data || []);
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

  const handleFilterChange = (filters: JobFilterCriteria) => {
    let filtered = jobs;

    if (filters.location) {
      filtered = filtered.filter(job =>
        job.location?.toLowerCase().includes(filters.location!.toLowerCase())
      );
    }

    if (filters.status) {
      filtered = filtered.filter(job => job.status === filters.status);
    }

    if (filters.employmentType) {
      filtered = filtered.filter(job => job.employment_type === filters.employmentType);
    }

    if (filters.experienceLevel) {
      filtered = filtered.filter(job =>
        job.experience_level?.toLowerCase().includes(filters.experienceLevel!.toLowerCase())
      );
    }

    if (filters.client) {
      filtered = filtered.filter(job =>
        job.clients?.name?.toLowerCase().includes(filters.client!.toLowerCase())
      );
    }

    if (filters.skills && filters.skills.length > 0) {
      filtered = filtered.filter(job =>
        filters.skills!.some(skill =>
          job.skills?.some((jobSkill: string) =>
            jobSkill.toLowerCase().includes(skill.toLowerCase())
          )
        )
      );
    }

    if (filters.minSalary || filters.maxSalary) {
      filtered = filtered.filter(job => {
        if (!job.salary_range) return false;
        const salaryText = job.salary_range.toLowerCase();
        return (
          (!filters.minSalary || salaryText.includes(filters.minSalary.toLowerCase())) ||
          (!filters.maxSalary || salaryText.includes(filters.maxSalary.toLowerCase()))
        );
      });
    }

    if (searchTerm) {
      filtered = filtered.filter(job =>
        job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.clients?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredJobs(filtered);
    setSelected(new Set());
  };

  const handleAISearch = async (query: string) => {
    setIsAISearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-job-search', {
        body: { searchQuery: query }
      });

      if (error) throw error;

      if (data?.results) {
        setFilteredJobs(data.results);
        setSelected(new Set());
        toast({
          title: t("jobs.aiSearchComplete"),
          description: `${data.results.length} ${t("jobs.matchingJobsFound")}`,
        });
      }
    } catch (error) {
      console.error('AI search error:', error);
      toast({
        title: t("toast.error"),
        description: t("jobs.aiSearchFailed"),
        variant: "destructive",
      });
    } finally {
      setIsAISearching(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t("jobs.loadingJobs")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("jobs.title")}</h1>
          <p className="text-muted-foreground">
            {t("jobs.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NewJobDialog
            onJobCreated={() => {
              fetchJobs();
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDuplicateDialogOpen(true)}>
                <Merge className="h-4 w-4 mr-2" />
                Duplikate prüfen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <JobDuplicateManager
          open={duplicateDialogOpen}
          onOpenChange={setDuplicateDialogOpen}
          onMergeComplete={fetchJobs}
        />
      </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <JobFilters
            onFilterChange={handleFilterChange}
            onAISearch={handleAISearch}
            isAISearching={isAISearching}
            searchTerm={searchTerm}
            searchBar={
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("jobs.searchPlaceholder")}
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    handleFilterChange({});
                  }}
                />
              </div>
            }
          />
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <span className="text-sm text-muted-foreground">{selected.size} ausgewählt</span>
          <Button size="sm" variant="outline" onClick={handleBulkArchive}>
            <Archive className="h-4 w-4 mr-1" /> Archivieren
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Löschen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{selected.size} Jobs löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkDelete}>Löschen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Jobs Table */}
      {filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              {jobs.length === 0 ? t("jobs.noJobsYet") : t("jobs.noJobs")}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {jobs.length === 0 
                ? t("jobs.noJobsYetDesc")
                : t("jobs.noMatchingSearch")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === filteredJobs.length && filteredJobs.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>{t("jobs.position")}</TableHead>
                <TableHead>{t("jobs.company")}</TableHead>
                <TableHead>{t("common.location")}</TableHead>
                <TableHead>{t("common.industry")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("jobs.added")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => (
                <TableRow 
                  key={job.id} 
                  className={`cursor-pointer hover:bg-muted/50 ${isDragging ? 'select-none' : ''}`}
                  onClick={() => navigate(`/jobs/${job.id}`, { state: { from: '/jobs' } })}
                  onMouseEnter={() => handleRowMouseEnter(job.id)}
                >
                  <TableCell 
                    onClick={e => e.stopPropagation()}
                    onMouseDown={(e) => handleCheckboxMouseDown(e, job.id)}
                  >
                    <Checkbox
                      checked={selected.has(job.id)}
                      onCheckedChange={() => toggleSelect(job.id)}
                      className="pointer-events-none"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell>
                    {job.client_id && job.clients?.name ? (
                      <span
                        className="hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/clients/${job.client_id}`, { state: { from: '/jobs' } });
                        }}
                      >
                        {job.clients.name}
                      </span>
                    ) : (
                      t("jobs.noClient")
                    )}
                  </TableCell>
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
