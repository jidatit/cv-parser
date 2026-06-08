import { useState, useEffect, useRef, useCallback } from "react";
import { triggerAutoAnalysis } from "@/lib/autoAnalyzeMatch";
import { useNavigate, useLocation } from "react-router-dom";
import { isSearchRunning, startBackgroundSearch, subscribeToCompletion, subscribeToProgress, resumeRunningSearches } from "@/hooks/useGlobalExternalSearch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Search,
  MapPin,
  Building2,
  Briefcase,
  ExternalLink,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  Star,
  Database,
  User,
  Globe,
  Award,
  Mail,
  Phone,
  Calendar,
  Target,
  Home,
  Euro,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";

interface ExternalJobResult {
  job_id: string | null;
  client_id: string | null;
  title: string;
  company_name: string;
  location: string;
  description: string;
  via: string;
  job_link: string | null;
  detected_extensions: Record<string, any>;
  match_score: number;
  reason: string;
  estimated_distance_km: number;
  tasks: string[];
  requirements: string[];
  benefits: string[];
  commute_duration?: string | null;
  commute_distance?: string | null;
  commute_exceeds_max?: boolean;
  is_new_import?: boolean;
}

interface ExternalJobSearchTabProps {
  candidate: {
    id: string;
    name: string;
    position?: string;
    desired_position?: string;
    skills?: string[];
    location?: string;
    industry?: string;
    max_commute?: string;
    experience?: string;
    education?: any[];
    work_experience?: any[];
    further_education?: any[];
    // certifications removed - merged into further_education
    languages?: any[];
    notes?: string;
    desired_salary?: string | number | null;
    reason_for_change?: string | null;
    user_id?: string;
    avatar_url?: string;
    email?: string;
    phone?: string;
    birthdate?: string;
    status?: string;
    recruiting_status?: string;
    current_salary?: string;
    workload?: string;
    willing_to_relocate?: string;
  };
}

export function ExternalJobSearchTab({ candidate }: ExternalJobSearchTabProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const storageKey = `ext-search-${candidate.id}`;
  const initialized = useRef(false);

  const [results, setResults] = useState<ExternalJobResult[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ExternalJobResult | null>(null);
  const [dbJobData, setDbJobData] = useState<{ description: string | null; responsibilities: string | null; requirements: string | null; benefits: string | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedJobs, setImportedJobs] = useState<Set<string>>(new Set());
  const [isCached, setIsCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);
  const [algoVersion, setAlgoVersion] = useState<string | null>(null);
  const [scrapeStats, setScrapeStats] = useState<{ scraped: number; new: number; existing: number; filtered: number } | null>(null);
  const [pensumRange, setPensumRange] = useState<[number, number]>([80, 100]);
  const [existingPlacements, setExistingPlacements] = useState<Set<string>>(new Set());
  const [progressMessage, setProgressMessage] = useState<string>("");

  // Load existing placements for this candidate
  useEffect(() => {
    const loadPlacements = async () => {
      const { data } = await supabase
        .from("placements")
        .select("job_id")
        .eq("candidate_id", candidate.id);
      if (data) {
        setExistingPlacements(new Set(data.map(p => p.job_id)));
      }
    };
    loadPlacements();
  }, [candidate.id]);

  // Load full job data from DB when a job is selected
  useEffect(() => {
    const loadDbJobData = async () => {
      if (!selectedJob?.job_id) {
        setDbJobData(null);
        return;
      }
      const { data } = await supabase
        .from("jobs")
        .select("description, responsibilities, requirements, benefits")
        .eq("id", selectedJob.job_id)
        .maybeSingle();
      setDbJobData(data || null);
    };
    loadDbJobData();
  }, [selectedJob?.job_id]);

  // Restore from sessionStorage on mount
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(storageKey);
      if (cached) {
        const data = JSON.parse(cached);
        setResults(data.results || []);
        setSearchQuery(data.searchQuery || "");
        setHasSearched(data.hasSearched || false);
        setIsCached(data.isCached || false);
        setCachedAt(data.cachedAt || null);
        setQueriesUsed(data.queriesUsed || []);
        setAlgoVersion(data.algoVersion || null);
        setScrapeStats(data.scrapeStats || null);
        setImportedJobs(new Set(data.importedJobs || []));
      }
    } catch (e) {
      console.warn("Failed to restore external search cache", e);
    }
    initialized.current = true;
  }, [storageKey]);

  // Save to sessionStorage when results change
  useEffect(() => {
    if (!initialized.current) return;
    if (!hasSearched) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        results, searchQuery, hasSearched, isCached, cachedAt,
        queriesUsed, algoVersion, scrapeStats,
        importedJobs: Array.from(importedJobs),
      }));
    } catch (e) {
      console.warn("Failed to save external search cache", e);
    }
  }, [results, searchQuery, hasSearched, isCached, cachedAt, queriesUsed, algoVersion, scrapeStats, importedJobs, storageKey]);

  // Subscribe to background search completion + progress
  useEffect(() => {
    // Check for running searches (e.g., after page refresh)
    const checkRunning = async () => {
      const isRunning = isSearchRunning(candidate.id);
      if (isRunning) {
        setLoading(true);
        setHasSearched(true);
      } else {
        // Check DB for running searches we might have missed
        const resumed = await resumeRunningSearches(candidate.id, candidate.name);
        if (resumed) {
          setLoading(true);
          setHasSearched(true);
        }
      }
    };
    checkRunning();

    const unsubComplete = subscribeToCompletion(candidate.id, (result, error) => {
      setLoading(false);
      setProgressMessage("");
      if (result) {
        setResults(result.results || []);
        setSearchQuery(result.query || "");
        setIsCached(result.is_cached || false);
        setCachedAt(result.cached_at || null);
        setQueriesUsed(result.queries_used || []);
        setAlgoVersion(result.algo_version || null);
        setScrapeStats(result.scrapeStats || null);
      }
    });

    const unsubProgress = subscribeToProgress(candidate.id, (message) => {
      setProgressMessage(message);
    });

    return () => {
      unsubComplete();
      unsubProgress();
    };
  }, [candidate.id, candidate.name]);

  const handleSearch = async (forceRefresh = false) => {
    setLoading(true);
    setHasSearched(true);
    setProgressMessage("Suche wird gestartet…");

    await startBackgroundSearch(
      candidate.id,
      candidate.name,
      { candidate, force_refresh: forceRefresh, pensum_min: pensumRange[0], pensum_max: pensumRange[1] },
    );
    // Results will come via polling + subscribeToCompletion
  };

  const getCacheAgeText = () => {
    if (!cachedAt) return "";
    const hours = Math.round((Date.now() - new Date(cachedAt).getTime()) / (1000 * 60 * 60));
    if (hours < 1) return t("externalSearch.cacheMinutesAgo");
    return t("externalSearch.cacheHoursAgo", { hours });
  };

  // Import now only creates a placement (job + client already exist in CRM)
  const handleImport = async (job: ExternalJobResult) => {
    if (!candidate.user_id) {
      toast({ title: t("toast.notLoggedIn"), variant: "destructive" });
      return;
    }

    if (!job.job_id) {
      toast({ title: "Job nicht im CRM gefunden", variant: "destructive" });
      return;
    }

    setImporting(true);
    try {
      // Check if placement already exists
      const { data: existingPlacement } = await supabase
        .from("placements")
        .select("id")
        .eq("candidate_id", candidate.id)
        .eq("job_id", job.job_id)
        .maybeSingle();

      if (existingPlacement) {
        toast({
          title: "Bereits zugeordnet",
          description: `${job.title} @ ${job.company_name} ist bereits mit diesem Kandidaten verknüpft.`,
        });
        setImportedJobs(prev => new Set(prev).add(jobKey(job)));
        setExistingPlacements(prev => new Set(prev).add(job.job_id!));
        setSelectedJob(null);
        return;
      }

      const { data: placementData, error: placementError } = await supabase
        .from("placements")
        .insert({
          candidate_id: candidate.id,
          job_id: job.job_id,
          user_id: candidate.user_id,
          match_score: job.match_score,
          match_strengths: job.tasks.map(t => t),
          from_ai_match: true,
          stage: "Ready2Send",
        })
        .select('id')
        .single();

      if (placementError) throw placementError;

      // Trigger AI analysis in the background (same as regular match creation)
      if (placementData?.id && job.job_id) {
        triggerAutoAnalysis(placementData.id, candidate.id, job.job_id);
      }

      setImportedJobs(prev => new Set(prev).add(jobKey(job)));
      setExistingPlacements(prev => new Set(prev).add(job.job_id!));
      setSelectedJob(null);

      toast({
        title: t("externalSearch.importSuccess"),
        description: `${job.title} @ ${job.company_name}`,
      });
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: t("externalSearch.importError"),
        description: error instanceof Error ? error.message : t("externalSearch.importFailed"),
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "outline";
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-muted-foreground";
  };

  const jobKey = (job: ExternalJobResult) => `${job.company_name}-${job.title}`;

  const isJobInCRM = (job: ExternalJobResult) => !!job.job_id && !job.is_new_import;
  const isJobAlreadyAssigned = (job: ExternalJobResult) => {
    return (job.job_id && existingPlacements.has(job.job_id)) || importedJobs.has(jobKey(job));
  };

  // Sort: jobs not in CRM first by match_score, then CRM jobs at bottom
  const sortedResults = [...results].sort((a, b) => {
    const aInCRM = isJobInCRM(a);
    const bInCRM = isJobInCRM(b);
    if (aInCRM !== bInCRM) return aInCRM ? 1 : -1;
    return b.match_score - a.match_score;
  });

  const candidateInitials = candidate.name
    ? candidate.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : '?';

  return (
    <div className="space-y-6">
      {/* Search Criteria Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5" />
            {t("externalSearch.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("common.position")}:</span>
              <span className="font-medium truncate">
                {candidate.desired_position || candidate.position || "-"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("common.location")}:</span>
              <span className="font-medium truncate">{candidate.location || "-"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("common.industry")}:</span>
              <span className="font-medium truncate">{candidate.industry || "-"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("externalSearch.maxCommute")}:</span>
              <span className="font-medium">{candidate.max_commute || "-"}</span>
            </div>
          </div>

          {candidate.skills && candidate.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.slice(0, 10).map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {candidate.skills.length > 10 && (
                <Badge variant="outline" className="text-xs">
                  +{candidate.skills.length - 10}
                </Badge>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {candidate.work_experience && candidate.work_experience.length > 0 && (
              <Badge variant="outline" className="text-xs">
                <Briefcase className="h-3 w-3 mr-1" />
                {candidate.work_experience.length} {t("externalSearch.workExperiences")}
              </Badge>
            )}
            {candidate.education && candidate.education.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {candidate.education.length} {t("externalSearch.educationEntries")}
              </Badge>
            )}
            {candidate.languages && candidate.languages.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {candidate.languages.length} {t("externalSearch.languages")}
              </Badge>
            )}
            {candidate.notes && (
              <Badge variant="outline" className="text-xs">
                ✓ {t("externalSearch.notesIncluded")}
              </Badge>
            )}
          </div>

          {/* Pensum Filter */}
          <div className="space-y-2 max-w-xs">
            <Label className="text-sm flex items-center gap-1.5">
              Pensum
              <span className="text-muted-foreground text-xs">({pensumRange[0]}% – {pensumRange[1]}%)</span>
            </Label>
            <Slider
              value={pensumRange}
              onValueChange={v => setPensumRange(v as [number, number])}
              min={0} max={100} step={10}
            />
          </div>

          {loading && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-muted-foreground">
                  {progressMessage || `${t("externalSearch.searching")}…`}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  Du kannst den Tab verlassen – die Suche läuft im Hintergrund weiter.
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => handleSearch(false)} disabled={loading} className="w-full sm:w-auto">
              <Search className="h-4 w-4 mr-2" />
              {loading ? t("externalSearch.searching") : t("externalSearch.startSearch")}
            </Button>
            {hasSearched && !loading && (
              <Button variant="outline" size="sm" onClick={() => handleSearch(true)} disabled={loading}>
                {t("externalSearch.forceRefresh")}
              </Button>
            )}
          </div>

          {searchQuery && (
            <div className="flex items-center gap-2 flex-wrap">
              {queriesUsed.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("externalSearch.queryUsed")}:{" "}
                  {queriesUsed.map((q, i) => (
                    <span key={i} className="italic">
                      "{q}"{i < queriesUsed.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("externalSearch.queryUsed")}: <span className="italic">"{searchQuery}"</span>
                </p>
              )}
              {isCached && cachedAt && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {t("externalSearch.fromCache")} ({getCacheAgeText()})
                </Badge>
              )}
              {algoVersion && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {algoVersion}
                </Badge>
              )}
            </div>
          )}

          {/* Scrape Stats */}
          {scrapeStats && !loading && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                <Database className="h-3 w-3 mr-1" />
                {scrapeStats.scraped} gescraped
              </Badge>
              {scrapeStats.new > 0 && (
                <Badge variant="default" className="text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  {scrapeStats.new} neu importiert
                </Badge>
              )}
              {scrapeStats.existing > 0 && (
                <Badge variant="outline" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
              {scrapeStats.existing} bereits im CRM
                </Badge>
              )}
              {scrapeStats.filtered > 0 && (
                <Badge variant="outline" className="text-xs text-orange-600">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {scrapeStats.filtered} Personalvermittler gefiltert
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Progress value={undefined} className="flex-1" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t("externalSearch.analyzing")}
            </span>
          </div>
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && hasSearched && results.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">{t("externalSearch.noResults")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("externalSearch.noResultsHint")}
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && sortedResults.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("externalSearch.resultsCount", { count: results.length })}
          </p>
          {sortedResults.map((job, idx) => {
            const isImported = importedJobs.has(jobKey(job));
            const isAssigned = isJobAlreadyAssigned(job);
            const inCRM = isJobInCRM(job);
            return (
              <Card
                key={idx}
                className={`transition-all hover:shadow-md ${inCRM ? "opacity-50" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{job.title}</h3>
                        <Badge
                          variant={getScoreBadgeVariant(job.match_score)}
                          className={getScoreColor(job.match_score)}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          {job.match_score}%
                        </Badge>
                        {isAssigned && (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Bereits zugeordnet
                          </Badge>
                        )}
                        {!isAssigned && inCRM && (
                          <Badge variant="outline" className="text-blue-600">
                            <Database className="h-3 w-3 mr-1" />
                            Bereits im CRM
                          </Badge>
                        )}
                        {isImported && !isAssigned && !inCRM && (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {t("externalSearch.imported")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {job.company_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                        {job.commute_duration && (
                          <span className={`text-xs flex items-center gap-1 ${job.commute_exceeds_max ? 'text-destructive font-medium' : ''}`}>
                            <Clock className="h-3 w-3" />
                            {job.commute_duration}
                            {job.commute_distance && ` (${job.commute_distance})`}
                          </span>
                        )}
                        {job.commute_exceeds_max && (
                          <Badge variant="destructive" className="text-xs py-0">
                            {t("externalSearch.commuteExceeded")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{job.reason}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedJob(job)}
                    >
                      {t("externalSearch.detailsAndImport")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Split-View Detail Dialog */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="sm:max-w-[95vw] h-[90vh] flex flex-col p-0">
          {selectedJob && (
            <>
              <div className="px-6 pt-6 pb-4 flex-shrink-0">
                <DialogHeader>
                  <div className="flex items-center justify-between pr-8">
                    <DialogTitle className="flex items-center gap-3">
                      {selectedJob.job_id ? (
                        <span
                          className="cursor-pointer hover:underline"
                          onClick={() => {
                            setSelectedJob(null);
                            navigate(`/jobs/${selectedJob.job_id}`, { state: { from: location.pathname } });
                          }}
                        >
                          {selectedJob.title}
                        </span>
                      ) : (
                        selectedJob.title
                      )}
                      <Badge
                        variant={getScoreBadgeVariant(selectedJob.match_score)}
                        className={getScoreColor(selectedJob.match_score)}
                      >
                        <Star className="h-3 w-3 mr-1" />
                        {selectedJob.match_score}%
                      </Badge>
                      {isJobAlreadyAssigned(selectedJob) && (
                        <Badge variant="outline" className="text-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Bereits zugeordnet
                        </Badge>
                      )}
                    </DialogTitle>
                    <Button
                      onClick={() => handleImport(selectedJob)}
                      disabled={importing || isJobAlreadyAssigned(selectedJob) || !selectedJob.job_id}
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {importing
                        ? t("externalSearch.importing")
                        : isJobAlreadyAssigned(selectedJob)
                          ? "Bereits zugeordnet"
                          : "Kandidat zuordnen"}
                    </Button>
                  </div>
                  <DialogDescription>
                    <span className="flex items-center gap-3 text-sm">
                      <span
                        className={`flex items-center gap-1 ${selectedJob.client_id ? 'cursor-pointer hover:underline hover:text-foreground' : ''}`}
                        onClick={() => {
                          if (selectedJob.client_id) {
                            setSelectedJob(null);
                            navigate(`/clients/${selectedJob.client_id}`, { state: { from: location.pathname } });
                          }
                        }}
                      >
                        <Building2 className="h-4 w-4" />
                        {selectedJob.company_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {selectedJob.location}
                      </span>
                      {selectedJob.commute_duration && (
                        <span className={`flex items-center gap-1 ${selectedJob.commute_exceeds_max ? 'text-destructive' : ''}`}>
                          <Clock className="h-4 w-4" />
                          {selectedJob.commute_duration}
                          {selectedJob.commute_distance && ` (${selectedJob.commute_distance})`}
                        </span>
                      )}
                    </span>
                  </DialogDescription>
                </DialogHeader>

                {/* Match Reason Banner */}
                <div className="mt-3 p-3 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium mb-1">{t("externalSearch.matchReason")}</p>
                  <p className="text-sm text-muted-foreground">{selectedJob.reason}</p>
                </div>
              </div>

              {/* Split View: Candidate | Job | Notes */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-hidden px-6 pb-6">
                {/* Candidate Information (Left) */}
                <div className="flex flex-col overflow-hidden">
                  <Card className="flex flex-col h-full overflow-hidden">
                    <CardHeader className="flex-shrink-0 pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <User className="h-4 w-4" />
                        Kandidat
                      </CardTitle>
                    </CardHeader>
                    <ScrollArea className="flex-1 px-6">
                      <div className="space-y-3 text-sm pb-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            {candidate.avatar_url && <AvatarImage src={candidate.avatar_url} alt={candidate.name} />}
                            <AvatarFallback className="bg-primary text-primary-foreground font-medium text-sm">
                              {candidateInitials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm">{candidate.name}</h3>
                            <p className="text-xs text-muted-foreground truncate">
                              {candidate.position || candidate.desired_position}
                            </p>
                          </div>
                        </div>

                        <Separator />

                        {/* Kontaktdaten */}
                        <div className="space-y-2">
                          <h4 className="font-medium text-xs">Kontakt</h4>
                          <div className="space-y-1.5">
                            {candidate.email && (
                              <div className="flex items-center gap-2 text-xs">
                                <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="truncate">{candidate.email}</span>
                              </div>
                            )}
                            {candidate.phone && (
                              <div className="flex items-center gap-2 text-xs">
                                <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                {candidate.phone}
                              </div>
                            )}
                            {candidate.location && (
                              <div className="flex items-center gap-2 text-xs">
                                <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                {candidate.location}
                              </div>
                            )}
                            {candidate.birthdate && (
                              <div className="flex items-center gap-2 text-xs">
                                <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                {candidate.birthdate}
                              </div>
                            )}
                          </div>
                        </div>

                        <Separator />

                        {/* Status */}
                        <div className="space-y-2">
                          <h4 className="font-medium text-xs">Status</h4>
                          <div className="flex flex-wrap gap-1">
                            {candidate.status && <Badge variant="outline" className="text-xs py-0 h-5">{candidate.status}</Badge>}
                            {candidate.recruiting_status && <Badge variant="secondary" className="text-xs py-0 h-5">{candidate.recruiting_status}</Badge>}
                            {candidate.industry && <Badge variant="outline" className="text-xs py-0 h-5">{candidate.industry}</Badge>}
                          </div>
                        </div>

                        <Separator />

                        {/* Gehalt */}
                        <div className="space-y-2">
                          <h4 className="font-medium text-xs">Gehalt</h4>
                          <div className="space-y-1.5">
                            {candidate.current_salary && (
                              <div className="flex items-center gap-2 text-xs">
                                <Euro className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="text-muted-foreground">Aktuell:</span> {candidate.current_salary}
                              </div>
                            )}
                            {candidate.desired_salary && (
                              <div className="flex items-center gap-2 text-xs">
                                <Target className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="text-muted-foreground">Gewünscht:</span> {String(candidate.desired_salary)}
                              </div>
                            )}
                          </div>
                        </div>

                        <Separator />

                        {/* Präferenzen */}
                        {(candidate.workload || candidate.willing_to_relocate || candidate.max_commute) && (
                          <>
                            <div className="space-y-2">
                              <h4 className="font-medium text-xs">Präferenzen</h4>
                              <div className="space-y-1.5">
                                {candidate.workload && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    <span className="text-muted-foreground">Workload:</span> {candidate.workload}
                                  </div>
                                )}
                                {candidate.willing_to_relocate && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <Home className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    <span className="text-muted-foreground">Umzugsbereit:</span> {candidate.willing_to_relocate}
                                  </div>
                                )}
                                {candidate.max_commute && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    <span className="text-muted-foreground">Max. Pendelzeit:</span> {candidate.max_commute}
                                  </div>
                                )}
                              </div>
                            </div>
                            <Separator />
                          </>
                        )}

                        {/* Wechselgrund */}
                        {candidate.reason_for_change && (
                          <>
                            <div className="space-y-2">
                              <h4 className="font-medium text-xs">Wechselgrund</h4>
                              <p className="text-xs text-muted-foreground">{candidate.reason_for_change}</p>
                            </div>
                            <Separator />
                          </>
                        )}

                        {/* Skills */}
                        <div className="space-y-2">
                          <h4 className="font-medium text-xs">Skills</h4>
                          <div className="flex flex-wrap gap-1">
                            {(candidate.skills || []).map((skill, index) => (
                              <Badge key={index} variant="secondary" className="text-xs py-0 h-5">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <Separator />

                        {/* Sprachen */}
                        {candidate.languages && candidate.languages.length > 0 && (
                          <>
                            <div className="space-y-2">
                              <h4 className="font-medium text-xs">Sprachen</h4>
                              <div className="space-y-1">
                                {candidate.languages.map((lang: any, index: number) => (
                                  <div key={index} className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-2">
                                      <Globe className="h-3 w-3 text-muted-foreground" />
                                      {lang.name}
                                    </span>
                                    <Badge variant="outline" className="text-xs py-0 h-5">{lang.level}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <Separator />
                          </>
                        )}

                        {/* Weiterbildungen */}
                        {candidate.further_education && candidate.further_education.length > 0 && (
                          <>
                            <div className="space-y-2">
                              <h4 className="font-medium text-xs">Weiterbildungen & Zertifikate</h4>
                              <div className="space-y-1.5">
                                {candidate.further_education.map((fe: any, index: number) => (
                                  <div key={index} className="flex items-start gap-2">
                                    <Award className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium">{fe.name}</p>
                                      {fe.institution && <p className="text-xs text-muted-foreground">{fe.institution}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <Separator />
                          </>
                        )}

                        {/* Berufserfahrung */}
                        {candidate.work_experience && candidate.work_experience.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-medium text-xs">Berufserfahrung</h4>
                            <div className="space-y-3">
                              {candidate.work_experience.map((exp: any, index: number) => (
                                <div key={index} className="space-y-1">
                                  <p className="text-xs font-medium">{exp.position}</p>
                                  <p className="text-xs text-muted-foreground">{exp.company}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {exp.startDate || exp.start_date || ''} - {exp.endDate || exp.end_date || 'heute'}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Ausbildung */}
                        {candidate.education && candidate.education.length > 0 && (
                          <>
                            <Separator />
                            <div className="space-y-2">
                              <h4 className="font-medium text-xs">Ausbildung</h4>
                              <div className="space-y-2">
                                {candidate.education.map((edu: any, index: number) => (
                                  <div key={index} className="space-y-0.5">
                                    <p className="text-xs font-medium">
                                      {edu.degree} {edu.field && `in ${edu.field}`}
                                    </p>
                                    {edu.institution && (
                                      <p className="text-xs text-muted-foreground">{edu.institution}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  </Card>
                </div>

                {/* Job Information (Middle) */}
                <div className="flex flex-col overflow-hidden">
                  <Card className="flex flex-col h-full overflow-hidden">
                    <CardHeader className="flex-shrink-0 pb-3">
                      <CardTitle className="flex items-center justify-between w-full text-base">
                        <span className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4" />
                          Position
                        </span>
                        {selectedJob.job_link && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                            <a href={selectedJob.job_link} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <ScrollArea className="flex-1 px-6">
                      <div className="space-y-3 text-sm pb-4">
                        <div>
                          <h3 className="font-semibold text-sm">
                            {selectedJob.job_id ? (
                              <span
                                className="cursor-pointer hover:underline"
                                onClick={() => {
                                  setSelectedJob(null);
                                  navigate(`/jobs/${selectedJob.job_id}`, { state: { from: location.pathname } });
                                }}
                              >
                                {selectedJob.title}
                              </span>
                            ) : (
                              selectedJob.title
                            )}
                          </h3>
                          <p
                            className={`text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5 ${selectedJob.client_id ? 'cursor-pointer hover:underline hover:text-foreground' : ''}`}
                            onClick={() => {
                              if (selectedJob.client_id) {
                                setSelectedJob(null);
                                navigate(`/clients/${selectedJob.client_id}`, { state: { from: location.pathname } });
                              }
                            }}
                          >
                            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                            {selectedJob.company_name}
                          </p>
                        </div>

                        <Separator />

                        {/* Basisdaten */}
                        <div className="space-y-2">
                          <h4 className="font-medium text-xs">Basisdaten</h4>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs">
                              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              {selectedJob.location}
                            </div>
                            {selectedJob.detected_extensions?.schedule_type && (
                              <div className="flex items-center gap-2 text-xs">
                                <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                {selectedJob.detected_extensions.schedule_type}
                              </div>
                            )}
                            {selectedJob.detected_extensions?.salary && (
                              <div className="flex items-center gap-2 text-xs">
                                <Euro className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                {selectedJob.detected_extensions.salary}
                              </div>
                            )}
                          </div>
                        </div>

                        <Separator />

                        {/* Beschreibung */}
                        {(dbJobData?.description || selectedJob.description) && (
                          <>
                            <div className="space-y-2">
                              <h4 className="font-medium text-xs">Beschreibung</h4>
                              {dbJobData?.description ? (
                                <div className="text-xs text-muted-foreground prose prose-xs max-w-none [&_ul]:list-disc [&_ul]:pl-4 [&_li]:text-muted-foreground" dangerouslySetInnerHTML={{ __html: dbJobData.description }} />
                              ) : (
                                <p className="text-xs text-muted-foreground whitespace-pre-line">
                                  {selectedJob.description}
                                </p>
                              )}
                            </div>
                            <Separator />
                          </>
                        )}

                        {/* Aufgaben */}
                        {(dbJobData?.responsibilities || selectedJob.tasks.length > 0) && (
                          <>
                            <div className="space-y-2">
                              <h4 className="font-medium text-xs">{t("externalSearch.tasks")}</h4>
                              {dbJobData?.responsibilities ? (
                                <div className="text-xs text-muted-foreground prose prose-xs max-w-none [&_ul]:list-disc [&_ul]:pl-4 [&_li]:text-muted-foreground" dangerouslySetInnerHTML={{ __html: dbJobData.responsibilities }} />
                              ) : (
                                <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                                  {selectedJob.tasks.map((task, i) => (
                                    <li key={i}>{task}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <Separator />
                          </>
                        )}

                        {/* Anforderungen */}
                        {(dbJobData?.requirements || selectedJob.requirements.length > 0) && (
                          <>
                            <div className="space-y-2">
                              <h4 className="font-medium text-xs">{t("externalSearch.requirements")}</h4>
                              {dbJobData?.requirements ? (
                                <div className="text-xs text-muted-foreground prose prose-xs max-w-none [&_ul]:list-disc [&_ul]:pl-4 [&_li]:text-muted-foreground" dangerouslySetInnerHTML={{ __html: dbJobData.requirements }} />
                              ) : (
                                <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                                  {selectedJob.requirements.map((req, i) => (
                                    <li key={i}>{req}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <Separator />
                          </>
                        )}

                        {/* Benefits */}
                        {(dbJobData?.benefits || selectedJob.benefits.length > 0) && (
                          <div className="space-y-2">
                            <h4 className="font-medium text-xs">{t("externalSearch.benefits")}</h4>
                            {dbJobData?.benefits ? (
                              <div className="text-xs text-muted-foreground prose prose-xs max-w-none [&_ul]:list-disc [&_ul]:pl-4 [&_li]:text-muted-foreground" dangerouslySetInnerHTML={{ __html: dbJobData.benefits }} />
                            ) : (
                              <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                                {selectedJob.benefits.map((ben, i) => (
                                  <li key={i}>{ben}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {selectedJob.via && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {t("externalSearch.via")}: {selectedJob.via}
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </Card>
                </div>


                {/* Notes (Right) */}
                <div className="flex flex-col overflow-hidden">
                  <Card className="flex flex-col h-full overflow-hidden">
                    <Tabs defaultValue="kandidat" className="flex flex-col flex-1 overflow-hidden">
                      <div className="flex-shrink-0 px-6 pt-4 pb-2">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="stelle">Stellen-Notizen</TabsTrigger>
                          <TabsTrigger value="kandidat">Kandidat-Notizen</TabsTrigger>
                        </TabsList>
                      </div>
                      <TabsContent value="stelle" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                        <ScrollArea className="flex-1 px-6">
                          <div className="pb-4">
                            {selectedJob.job_id ? (
                              <ExternalJobNotesTab jobId={selectedJob.job_id} />
                            ) : (
                              <p className="text-sm text-muted-foreground italic">Keine Notizen verfügbar</p>
                            )}
                          </div>
                        </ScrollArea>
                      </TabsContent>
                      <TabsContent value="kandidat" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                        <ScrollArea className="flex-1 px-6">
                          <div className="pb-4">
                            <ExternalCandidateNotesTab candidateId={candidate.id} />
                          </div>
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  </Card>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Helper Components for Notes Tabs ──

interface ParsedNote {
  id: string;
  content: string;
  author: string;
  timestamp: string;
  isImportant?: boolean;
}

function NoteCard({ note }: { note: ParsedNote }) {
  return (
    <div className={`p-3 rounded-lg border text-sm ${note.isImportant ? "border-amber-300 bg-amber-50/50 dark:bg-amber-900/10" : "border-border bg-muted/30"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{note.author}</span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(note.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="prose prose-sm max-w-none text-muted-foreground [&_p]:my-1 [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-0.5"
        dangerouslySetInnerHTML={{ __html: note.content }}
      />
    </div>
  );
}

function ExternalJobNotesTab({ jobId }: { jobId: string }) {
  const [notes, setNotes] = useState<ParsedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('jobs')
        .select('structured_notes')
        .eq('id', jobId)
        .single();
      const parsed = data?.structured_notes && Array.isArray(data.structured_notes) ? data.structured_notes as unknown as ParsedNote[] : [];
      setNotes(parsed);
      setLoading(false);
    };
    load();
  }, [jobId]);

  if (loading) return <div className="flex justify-center py-4"><Clock className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (notes.length === 0) return <p className="text-sm text-muted-foreground italic">Keine Notizen vorhanden</p>;
  return <div className="space-y-3">{notes.map(n => <NoteCard key={n.id} note={n} />)}</div>;
}

function ExternalCandidateNotesTab({ candidateId }: { candidateId: string }) {
  const [notes, setNotes] = useState<ParsedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('candidates')
        .select('notes')
        .eq('id', candidateId)
        .single();
      const parsed = parseNotesJson(data?.notes);
      setNotes(parsed);
      setLoading(false);
    };
    load();
  }, [candidateId]);

  if (loading) return <div className="flex justify-center py-4"><Clock className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (notes.length === 0) return <p className="text-sm text-muted-foreground italic">Keine Notizen vorhanden</p>;
  return <div className="space-y-3">{notes.map(n => <NoteCard key={n.id} note={n} />)}</div>;
}

function parseNotesJson(notesString: string | undefined | null): ParsedNote[] {
  if (!notesString) return [];
  try {
    const parsed = JSON.parse(notesString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [{
      id: Date.now().toString(),
      content: notesString,
      author: "System",
      timestamp: new Date().toISOString()
    }];
  }
}
