import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Search, Filter, Mail, Phone, MapPin, LayoutGrid, List, ArrowUpDown, ArrowUp, ArrowDown, ArrowRight, Minus, User, UserX } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { differenceInDays, differenceInWeeks, differenceInMonths, differenceInYears, isToday, isYesterday } from "date-fns";

// Custom relative time formatter without hours
const formatLastPush = (date: Date): string => {
  if (isToday(date)) return "Heute";
  if (isYesterday(date)) return "Gestern";
  
  const now = new Date();
  const days = differenceInDays(now, date);
  const weeks = differenceInWeeks(now, date);
  const months = differenceInMonths(now, date);
  const years = differenceInYears(now, date);
  
  if (years >= 1) return `vor ${years} ${years === 1 ? 'Jahr' : 'Jahren'}`;
  if (months >= 1) return `vor ${months} ${months === 1 ? 'Monat' : 'Monaten'}`;
  if (weeks >= 1) return `vor ${weeks} ${weeks === 1 ? 'Woche' : 'Wochen'}`;
  return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
};
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";
import { EnhancedNewCandidateDialog } from "@/components/EnhancedNewCandidateDialog";

import { StatusDropdown } from "@/components/StatusDropdown";
import { CandidateFilters, FilterCriteria } from "@/components/CandidateFilters";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import { getStatusColor, getStatusOptions } from "@/lib/statusUtils";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Priority configuration matching Recruiting.tsx exactly
type Priority = 'high' | 'medium' | 'low' | null;

// Extract city from location string (e.g., "Zürich, Switzerland" -> "Zürich")
const extractCity = (location: string | null): string => {
  if (!location) return "-";
  // Split by comma and take the first part (usually the city)
  const parts = location.split(',').map(p => p.trim());
  // If there's only one part, return it
  if (parts.length === 1) return parts[0];
  // If the first part looks like a street (contains numbers), take the second part
  if (/\d/.test(parts[0]) && parts.length > 1) {
    return parts[1];
  }
  return parts[0];
};

const priorityConfig = {
  high: { label: 'Hoch', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30', icon: ArrowUp },
  medium: { label: 'Mittel', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30', icon: ArrowRight },
  low: { label: 'Gering', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30', icon: ArrowDown },
};

// PriorityDropdown component matching Recruiting.tsx exactly
const PriorityDropdown = ({ 
  candidateId, 
  currentPriority,
  onPriorityChange
}: { 
  candidateId: string;
  currentPriority: Priority;
  onPriorityChange: (candidateId: string, priority: Priority) => void;
}) => {
  const config = currentPriority ? priorityConfig[currentPriority] : null;
  const Icon = config?.icon || Minus;
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 ${config ? config.bgColor : 'bg-muted'}`}
        >
          <Icon className={`h-4 w-4 ${config ? config.color : 'text-muted-foreground'}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => onPriorityChange(candidateId, 'high')}>
          <ArrowUp className="h-4 w-4 mr-2 text-red-600" />
          Hoch
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPriorityChange(candidateId, 'medium')}>
          <ArrowRight className="h-4 w-4 mr-2 text-yellow-600" />
          Mittel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPriorityChange(candidateId, 'low')}>
          <ArrowDown className="h-4 w-4 mr-2 text-green-600" />
          Gering
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPriorityChange(candidateId, null)}>
          <Minus className="h-4 w-4 mr-2 text-muted-foreground" />
          Keine
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};


export default function Candidates() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { configurations } = useStatusConfigurations();
  const { user, loading: authLoading } = useAuth();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAISearching, setIsAISearching] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const saved = localStorage.getItem("candidatesViewMode");
    return (saved === "list" || saved === "grid") ? saved : "grid";
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterCriteria>({});
  const [sortColumn, setSortColumn] = useState<string | null>(() => {
    return localStorage.getItem("candidatesSortColumn");
  });
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(() => {
    const saved = localStorage.getItem("candidatesSortDirection");
    return saved === "desc" ? "desc" : "asc";
  });
  const [prioritySortActive, setPrioritySortActive] = useState<boolean>(() => {
    return localStorage.getItem("candidatesPrioritySortActive") === "true";
  });
  const [hideRecruitingPipeline, setHideRecruitingPipeline] = useState<boolean>(() => {
    return localStorage.getItem("candidatesHideRecruitingPipeline") === "true";
  });

  // Get recruiting stages from configurations
  const recruitingStages = configurations.recruitingStages || [];

  const handleColumnSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction or clear
      if (sortDirection === "asc") {
        setSortDirection("desc");
        localStorage.setItem("candidatesSortDirection", "desc");
      } else {
        setSortColumn(null);
        localStorage.removeItem("candidatesSortColumn");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
      localStorage.setItem("candidatesSortColumn", column);
      localStorage.setItem("candidatesSortDirection", "asc");
    }
  };

  const handlePrioritySortToggle = () => {
    const newValue = !prioritySortActive;
    setPrioritySortActive(newValue);
    localStorage.setItem("candidatesPrioritySortActive", newValue.toString());
  };

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("candidatesViewMode", mode);
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Fetch candidates on mount and when navigating to this page
  useEffect(() => {
    if (user) {
      fetchCandidates();
    }
  }, [user, location.key]);

  useEffect(() => {
    applyFilters();
  }, [candidates, searchTerm, activeFilters, sortColumn, sortDirection, prioritySortActive, hideRecruitingPipeline]);

  const fetchCandidates = async () => {
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, name, email, phone, position, location, status, priority, avatar_url, recruiting_status, skills, industry, desired_position, desired_salary, experience, last_pushed_at, created_at, updated_at, workload, max_commute, willing_to_relocate, assigned_to, user_id')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCandidates(data || []);
    } catch (error) {
      console.error('Error fetching candidates:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.candidatesLoadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const { t } = useLanguage();

  const handleCandidateCreated = async () => {
    // Refresh candidates list
    await fetchCandidates();
    toast({
      title: t("toast.candidateCreated"),
      description: t("toast.candidateCreatedDesc"),
    });
  };

  const applyFilters = () => {
    let filtered = [...candidates];

    // Apply search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.name?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.position?.toLowerCase().includes(term) ||
        c.location?.toLowerCase().includes(term)
      );
    }

    // Apply filters
    if (activeFilters.skills && activeFilters.skills.length > 0) {
      filtered = filtered.filter(c => 
        c.skills && activeFilters.skills!.some(skill => 
          c.skills.some((cs: string) => cs.toLowerCase().includes(skill.toLowerCase()))
        )
      );
    }

    if (activeFilters.industries && activeFilters.industries.length > 0) {
      filtered = filtered.filter(c => {
        if (!c.industry) return false;
        // Parse candidate industry (can be comma-separated or JSON array)
        let candidateIndustries: string[] = [];
        try {
          const parsed = JSON.parse(c.industry);
          if (Array.isArray(parsed)) candidateIndustries = parsed;
        } catch {
          candidateIndustries = c.industry.split(',').map((i: string) => i.trim()).filter(Boolean);
        }
        // Check if any of the filter industries match any of the candidate industries (exact match)
        return candidateIndustries.some(candInd => 
          activeFilters.industries!.some(filterInd => 
            candInd.toLowerCase() === filterInd.toLowerCase()
          )
        );
      });
    }

    if (activeFilters.position) {
      filtered = filtered.filter(c => 
        c.position?.toLowerCase().includes(activeFilters.position!.toLowerCase()) ||
        c.desired_position?.toLowerCase().includes(activeFilters.position!.toLowerCase())
      );
    }

    if (activeFilters.location) {
      filtered = filtered.filter(c => 
        c.location?.toLowerCase().includes(activeFilters.location!.toLowerCase())
      );
    }

    // Handle status filtering - hide archived by default unless explicitly filtered
    if (activeFilters.statuses && activeFilters.statuses.length > 0) {
      filtered = filtered.filter(c => activeFilters.statuses!.includes(c.status));
    } else {
      // No status filter active - hide archived candidates by default
      filtered = filtered.filter(c => c.status !== 'Archived');
    }

    if (activeFilters.experienceLevel) {
      filtered = filtered.filter(c => 
        c.experience?.toLowerCase().includes(activeFilters.experienceLevel!.toLowerCase())
      );
    }

    if (activeFilters.minSalary) {
      const minSalary = parseInt(activeFilters.minSalary);
      filtered = filtered.filter(c => {
        if (!c.desired_salary) return false;
        const salary = parseInt(c.desired_salary.replace(/[^0-9]/g, ''));
        return salary >= minSalary;
      });
    }

    if (activeFilters.maxSalary) {
      const maxSalary = parseInt(activeFilters.maxSalary);
      filtered = filtered.filter(c => {
        if (!c.desired_salary) return false;
        const salary = parseInt(c.desired_salary.replace(/[^0-9]/g, ''));
        return salary <= maxSalary;
      });
    }

    // Hide candidates in recruiting pipeline
    if (hideRecruitingPipeline) {
      filtered = filtered.filter(c => !c.recruiting_status);
    }

    // Combined sorting: priority as primary, column as secondary
    if (prioritySortActive || sortColumn) {
      filtered.sort((a, b) => {
        // Primary: Priority (if active)
        if (prioritySortActive) {
          const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
          const pA = a.priority ? priorityOrder[a.priority] || 0 : 0;
          const pB = b.priority ? priorityOrder[b.priority] || 0 : 0;
          if (pA !== pB) return pB - pA;
        }

        // Secondary: Column sort (if active)
        if (sortColumn) {
          if (sortColumn === 'last_pushed_at') {
            const valueA = a.last_pushed_at ? new Date(a.last_pushed_at).getTime() : 0;
            const valueB = b.last_pushed_at ? new Date(b.last_pushed_at).getTime() : 0;
            const cmp = valueA - valueB;
            return sortDirection === "asc" ? cmp : -cmp;
          }
          const valueA = (a[sortColumn] || "").toString().toLowerCase();
          const valueB = (b[sortColumn] || "").toString().toLowerCase();
          const cmp = valueA.localeCompare(valueB, 'de');
          return sortDirection === "asc" ? cmp : -cmp;
        }

        return 0;
      });
    }

    setFilteredCandidates(filtered);
  };

  const handleFilterChange = (filters: FilterCriteria) => {
    setActiveFilters(filters);
  };

  const handleAISearch = async (query: string) => {
    setIsAISearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-candidate-search', {
        body: { query }
      });

      if (error) throw error;

      if (data.candidates) {
        setFilteredCandidates(data.candidates);
        toast({
          title: "KI-Suche erfolgreich",
          description: `${data.candidates.length} Kandidaten gefunden`,
        });
      }
    } catch (error) {
      console.error('AI search error:', error);
      toast({
        title: "Fehler bei der KI-Suche",
        description: "Die Suche konnte nicht durchgeführt werden",
        variant: "destructive",
      });
    } finally {
      setIsAISearching(false);
    }
  };

  const handlePriorityChange = async (candidateId: string, newPriority: Priority) => {
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ priority: newPriority })
        .eq('id', candidateId);

      if (error) throw error;

      setCandidates(prev => prev.map(c => 
        c.id === candidateId ? { ...c, priority: newPriority } : c
      ));

      toast({
        title: "Priorität aktualisiert",
        description: newPriority 
          ? `Priorität wurde auf "${priorityConfig[newPriority].label}" gesetzt.`
          : "Priorität wurde entfernt.",
      });
    } catch (error) {
      console.error('Error updating priority:', error);
      toast({
        title: "Fehler",
        description: "Priorität konnte nicht aktualisiert werden",
        variant: "destructive",
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t("candidates.loadingCandidates")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("candidates.title")}</h1>
          <p className="text-muted-foreground">
            {t("candidates.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center border rounded-lg p-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleViewModeChange("grid")}
              className="h-8"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleViewModeChange("list")}
              className="h-8"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <EnhancedNewCandidateDialog
            onCandidateCreated={handleCandidateCreated}
          />
        </div>
      </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <CandidateFilters
            onFilterChange={handleFilterChange}
            onAISearch={handleAISearch}
            isAISearching={isAISearching}
            searchTerm={searchTerm}
            searchBar={
              <div className="relative flex-1 flex items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("candidates.searchPlaceholder")}
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="ml-2">
                  <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={hideRecruitingPipeline ? "default" : "outline"}
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        const newValue = !hideRecruitingPipeline;
                        setHideRecruitingPipeline(newValue);
                        localStorage.setItem("candidatesHideRecruitingPipeline", newValue.toString());
                      }}
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {hideRecruitingPipeline ? "Recruiting-Pipeline anzeigen" : "Recruiting-Pipeline ausblenden"}
                  </TooltipContent>
                </Tooltip>
                </div>
              </div>
            }
          />
        </CardContent>
      </Card>

      {/* Candidates View */}
      {filteredCandidates.length === 0 && candidates.length > 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">{t("candidates.noMatchingFilters")}</p>
          <Button variant="outline" onClick={() => {
            setActiveFilters({});
            setSearchTerm("");
          }}>
            {t("common.resetFilters")}
          </Button>
        </div>
      ) : candidates.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <p className="text-muted-foreground mb-4">
              {t("candidates.noCandidatesYet")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("candidates.noCandidatesYetDesc")}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCandidates.map((candidate) => (
            <Link key={candidate.id} to={`/candidates/${candidate.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={candidate.avatar_url} />
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        <User className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{candidate.name}</h3>
                            {candidate.recruiting_status && (
                              <StatusDropdown
                                currentStatus={candidate.recruiting_status}
                                currentColor={
                                  candidate.recruiting_status === "Austausch ausstehend" 
                                    ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                    : candidate.recruiting_status === "Unterlagen offen"
                                    ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                                    : candidate.recruiting_status === "Unterlagen geschickt"
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                    : candidate.recruiting_status === "Ready2Push"
                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                    : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                }
                                availableStatuses={[
                                  { title: "Austausch ausstehend", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
                                  { title: "Unterlagen offen", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
                                  { title: "Unterlagen geschickt", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
                                  { title: "Ready2Push", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
                                  { title: "Ready2Send", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" }
                                ]}
                                onStatusChange={async (newStatus) => {
                                  try {
                                    const { error } = await supabase
                                      .from('candidates')
                                      .update({ recruiting_status: newStatus })
                                      .eq('id', candidate.id);

                                    if (error) throw error;

                                    // Update local state
                                    setCandidates(candidates.map(c => 
                                      c.id === candidate.id ? { ...c, recruiting_status: newStatus } : c
                                    ));

                                    toast({
                                      title: "Status aktualisiert",
                                      description: `Recruiting-Status wurde zu "${newStatus}" geändert.`,
                                    });
                                  } catch (error) {
                                    console.error('Error updating recruiting status:', error);
                                    toast({
                                      title: "Fehler",
                                      description: "Status konnte nicht aktualisiert werden",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {candidate.position}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {candidate.priority && priorityConfig[candidate.priority as keyof typeof priorityConfig] && (
                            <span 
                              onClick={(e) => e.preventDefault()}
                              className={`p-1 rounded ${priorityConfig[candidate.priority as keyof typeof priorityConfig].bgColor}`}
                            >
                              {(() => {
                                const Icon = priorityConfig[candidate.priority as keyof typeof priorityConfig].icon;
                                return <Icon className={`h-3 w-3 ${priorityConfig[candidate.priority as keyof typeof priorityConfig].color}`} />;
                              })()}
                            </span>
                          )}
                          <Badge className={getStatusColor(candidate.status || "N/D")}>
                            {candidate.status || "N/D"}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="mt-3 space-y-1">
                        {candidate.email && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{candidate.email}</span>
                          </div>
                        )}
                        {candidate.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{candidate.phone}</span>
                          </div>
                        )}
                        {candidate.location && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span>{extractCity(candidate.location)}</span>
                          </div>
                        )}
                      </div>

                      {candidate.skills && candidate.skills.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {candidate.skills.slice(0, 3).map((skill: string, index: number) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                          {candidate.skills.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{candidate.skills.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="w-12 cursor-pointer hover:bg-muted/50 select-none p-0"
                  onClick={handlePrioritySortToggle}
                  title="Nach Priorität sortieren"
                >
                  <div className="h-full flex items-center justify-center">
                    {prioritySortActive ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleColumnSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Kandidat
                    {sortColumn === "name" && (sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleColumnSort("position")}
                >
                  <div className="flex items-center gap-1">
                    Position
                    {sortColumn === "position" && (sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleColumnSort("location")}
                >
                  <div className="flex items-center gap-1">
                    Standort
                    {sortColumn === "location" && (sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleColumnSort("industry")}
                >
                  <div className="flex items-center gap-1">
                    Branche
                    {sortColumn === "industry" && (sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleColumnSort("status")}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortColumn === "status" && (sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleColumnSort("last_pushed_at")}
                >
                  <div className="flex items-center gap-1">
                    Letzter Push
                    {sortColumn === "last_pushed_at" && (sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                  </div>
                </TableHead>
                {!hideRecruitingPipeline && (
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleColumnSort("recruiting_status")}
                  >
                    <div className="flex items-center gap-1">
                      Recruiting
                      {sortColumn === "recruiting_status" && (sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                    </div>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCandidates.map((candidate) => (
                <TableRow 
                  key={candidate.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/candidates/${candidate.id}`, { state: { from: '/candidates' } })}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <PriorityDropdown
                      candidateId={candidate.id}
                      currentPriority={candidate.priority as Priority}
                      onPriorityChange={handlePriorityChange}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={candidate.avatar_url} />
                        <AvatarFallback className="text-xs bg-muted">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-medium">{candidate.name}</p>
                    </div>
                  </TableCell>
                  <TableCell>{candidate.position || "-"}</TableCell>
                  <TableCell>{extractCity(candidate.location)}</TableCell>
                  <TableCell>{candidate.industry || "-"}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(candidate.status || "N/D")}>
                      {candidate.status || "N/D"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {candidate.last_pushed_at 
                      ? formatLastPush(new Date(candidate.last_pushed_at))
                      : "-"
                    }
                  </TableCell>
                  {!hideRecruitingPipeline && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {candidate.recruiting_status && (() => {
                        const statusOptions = getStatusOptions(recruitingStages);
                        const currentStage = statusOptions.find(s => s.id === candidate.recruiting_status);
                        return (
                          <StatusDropdown
                            currentStatus={currentStage?.title || candidate.recruiting_status}
                            currentColor={currentStage?.color || getStatusColor(candidate.recruiting_status)}
                            availableStatuses={statusOptions.map(s => ({ 
                              id: s.id,
                              title: s.title, 
                              color: s.color 
                            }))}
                            onStatusChange={async (newStatusId) => {
                              try {
                                const { error } = await supabase
                                  .from('candidates')
                                  .update({ recruiting_status: newStatusId })
                                  .eq('id', candidate.id);

                                if (error) throw error;

                                setCandidates(candidates.map(c => 
                                  c.id === candidate.id ? { ...c, recruiting_status: newStatusId } : c
                                ));

                                const selectedStage = statusOptions.find(s => s.id === newStatusId);
                                toast({
                                  title: "Status aktualisiert",
                                  description: `Recruiting-Status wurde zu "${selectedStage?.title || newStatusId}" geändert.`,
                                });
                              } catch (error) {
                                console.error('Error updating recruiting status:', error);
                                toast({
                                  title: "Fehler",
                                  description: "Status konnte nicht aktualisiert werden",
                                  variant: "destructive",
                                });
                              }
                            }}
                          />
                        );
                      })()}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
