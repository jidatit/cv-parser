import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Euro, LayoutGrid, List, MapPin, ArrowUp, ArrowRight, ArrowDown, ArrowUpDown, Minus, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { differenceInDays, differenceInWeeks, differenceInMonths, differenceInYears, isToday, isYesterday } from "date-fns";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { usePreventHorizontalOverscrollNavigation } from "@/hooks/usePreventHorizontalOverscrollNavigation";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { StatusDropdown } from "@/components/StatusDropdown";
import { supabase } from "@/integrations/supabase/client";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import { getStatusOptions } from "@/lib/statusUtils";
import { UserFilter } from "@/components/UserFilter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useAIMatching } from "@/contexts/AIMatchingContext";
import { EnhancedNewCandidateDialog } from "@/components/EnhancedNewCandidateDialog";
import { Plus } from "lucide-react";

type Priority = 'high' | 'medium' | 'low' | null;

const priorityConfig = {
  high: { label: 'Hoch', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30', icon: ArrowUp },
  medium: { label: 'Mittel', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30', icon: ArrowRight },
  low: { label: 'Gering', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30', icon: ArrowDown },
};

const formatRelativeDate = (date: Date): string => {
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

export default function PipelineRecruiting() {
  const { toast } = useToast();
  const { t, currentLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const returnToStage = location.state?.recruitingStage;
  const { configurations, loading: configLoading } = useStatusConfigurations();
  const { startMatchingForCandidate } = useAIMatching();
  const [stages, setStages] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>(() => {
    const saved = localStorage.getItem('recruiting-view-mode');
    return (saved as 'kanban' | 'list') || 'kanban';
  });
  const kanbanScrollRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const stageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  usePreventHorizontalOverscrollNavigation(kanbanScrollRef, viewMode === "kanban");
  usePreventHorizontalOverscrollNavigation(listScrollRef, viewMode === "list");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string | null>(null);
  const [activitySortDirection, setActivitySortDirection] = useState<'none' | 'desc' | 'asc'>('none');
  const [loading, setLoading] = useState(true);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const itemsPerPage = 50;

  // Handle returning to a specific stage
  useEffect(() => {
    if (returnToStage && stages.length > 0) {
      if (viewMode === 'list') {
        setSelectedStatusFilter(returnToStage);
      } else if (viewMode === 'kanban' && stageRefs.current[returnToStage]) {
        // Scroll to the stage column in kanban view
        stageRefs.current[returnToStage]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
      // Clear the state to prevent re-scrolling
      window.history.replaceState({}, document.title);
    }
  }, [returnToStage, stages, viewMode]);

  // Save view mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('recruiting-view-mode', viewMode);
  }, [viewMode]);

  // Kandidaten aus der Datenbank laden
  useEffect(() => {
    if (configLoading) return;
    
    const fetchCandidates = async () => {
      try {
        const { data: candidates, error } = await supabase
          .from('candidates')
          .select('*')
          .not('recruiting_status', 'is', null)
          .neq('status', 'Archived')
          .neq('status', 'Not available');

        if (error) throw error;

        // Filter by user if selected
        let filteredCandidates = candidates || [];
        if (selectedUserFilter) {
          filteredCandidates = filteredCandidates.filter(
            c => c.user_id === selectedUserFilter || c.assigned_to === selectedUserFilter
          );
        }

        // Fetch last activity for each candidate
        const candidateIds = filteredCandidates.map(c => c.id);
        let lastActivityMap: Record<string, Date> = {};

        if (candidateIds.length > 0) {
          const { data: activities } = await supabase
            .from('activity_logs')
            .select('entity_id, created_at')
            .eq('entity_type', 'candidates')
            .in('entity_id', candidateIds)
            .order('created_at', { ascending: false });

          // Map: nur die neueste Aktivität pro Kandidat speichern
          activities?.forEach(activity => {
            if (!lastActivityMap[activity.entity_id]) {
              lastActivityMap[activity.entity_id] = new Date(activity.created_at);
            }
          });
        }

        // Fetch profile names for user_ids
        const userIds = [...new Set(filteredCandidates.map(c => c.user_id))];
        let profilesMap: Record<string, string> = {};
        
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          
          if (profiles) {
            profilesMap = profiles.reduce((acc, p) => {
              acc[p.id] = p.full_name?.split(' ')[0] || t("dashboard.unknown");
              return acc;
            }, {} as Record<string, string>);
          }
        }

        // Priority order for sorting
        const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        // Kandidaten den entsprechenden Stages zuordnen
        const statusOptions = getStatusOptions(configurations.recruitingStages);
        const updatedStages = statusOptions.map(stage => ({
          id: stage.id,
          title: stage.title,
          color: stage.color,
          candidates: filteredCandidates
            .filter(c => c.recruiting_status === stage.id)
            .map(c => {
              // Erste Berufserfahrung (aktuellste) für "Jetzige Firma" verwenden
              let currentCompany = 'N/A';
              if (c.work_experience && Array.isArray(c.work_experience) && c.work_experience.length > 0) {
                // Nehme die erste Position (aktuellste im Lebenslauf)
                const currentExperience = c.work_experience[0] as any;
                let companyName = currentExperience?.company || 'N/A';
                // Entferne Pensum-Angabe (z.B. "· Teilzeit", "· Vollzeit")
                if (companyName.includes('·')) {
                  companyName = companyName.split('·')[0].trim();
                }
                currentCompany = companyName;
              }
              
              const createdAt = c.created_at ? new Date(c.created_at) : new Date(0);
              const isNew = createdAt > threeDaysAgo;
              
              return {
                id: c.id,
                name: c.name,
                initials: c.name.split(' ').map(n => n[0]).join('').toUpperCase(),
                position: c.desired_position || c.position || t("common.noDataFound"),
                company: currentCompany,
                location: c.location || t("common.noDataFound"),
                salary: c.desired_salary || t("common.noDataFound"),
                lastActivityFormatted: lastActivityMap[c.id] 
                  ? formatRelativeDate(lastActivityMap[c.id])
                  : (c.updated_at ? formatRelativeDate(new Date(c.updated_at)) : formatRelativeDate(createdAt)),
                lastActivityRaw: lastActivityMap[c.id] || (c.updated_at ? new Date(c.updated_at) : createdAt),
                avatar_url: c.avatar_url,
                creatorName: profilesMap[c.user_id] || t("dashboard.unknown"),
                priority: c.priority as Priority,
                isNew,
                createdAt
              };
            })
            .sort((a, b) => {
              // New candidates (within 3 days) come first
              if (a.isNew && !b.isNew) return -1;
              if (!a.isNew && b.isNew) return 1;
              
              // If both are new, sort by creation date (newest first)
              if (a.isNew && b.isNew) {
                return b.createdAt.getTime() - a.createdAt.getTime();
              }
              
              // Then sort by priority
              const aPrio = a.priority ? priorityOrder[a.priority] : 4;
              const bPrio = b.priority ? priorityOrder[b.priority] : 4;
              
              if (aPrio !== bPrio) return aPrio - bPrio;
              
              // Same priority: sort by creation date (newest first)
              return b.createdAt.getTime() - a.createdAt.getTime();
            })
        }));

        setStages(updatedStages);
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

    fetchCandidates();
  }, [toast, configLoading, configurations, selectedUserFilter, refreshKey]);

  const handleCandidateMove = async (candidateId: string, fromStageId: string, toStageId: string) => {
    try {
      // Stages where candidate should become "Active"
      const activeStages = ['ready2push'];
      const shouldBeActive = activeStages.includes(toStageId);
      
      // Build update data
      const updateData: { recruiting_status: string; status?: string } = { recruiting_status: toStageId };
      if (shouldBeActive) {
        updateData.status = 'Active';
      }

      // Update in database using the stage ID (snake_case)
      const { error } = await supabase
        .from('candidates')
        .update(updateData)
        .eq('id', candidateId);

      if (error) throw error;

      // Find the stage label for the toast message
      const toStageLabel = stages.find(s => s.id === toStageId)?.title || toStageId;

      // Update local state
      setStages(prevStages => {
        const newStages = prevStages.map(stage => ({...stage, candidates: [...stage.candidates]}));
        
        const fromStageIndex = newStages.findIndex(s => s.id === fromStageId);
        const candidateIndex = newStages[fromStageIndex]?.candidates.findIndex(c => c.id === candidateId) ?? -1;
        
        if (fromStageIndex >= 0 && candidateIndex >= 0) {
          const candidate = newStages[fromStageIndex].candidates[candidateIndex];
          newStages[fromStageIndex].candidates.splice(candidateIndex, 1);
          
          const toStageIndex = newStages.findIndex(s => s.id === toStageId);
          if (toStageIndex >= 0) {
            newStages[toStageIndex].candidates.push(candidate);
          }
        }
        
        return newStages;
      });

      toast({
        title: t("toast.statusUpdated"),
        description: `${t("common.candidate")} → ${toStageLabel}`,
      });

      // Auto-trigger AI match generation when moving to ready2push
      if (toStageId === 'ready2push') {
        const candidateName = stages.flatMap(s => s.candidates).find(c => c.id === candidateId)?.name || '';
        startMatchingForCandidate(candidateId, candidateName);
      }
    } catch (error) {
      console.error('Error moving candidate:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.updateError"),
        variant: "destructive",
      });
    }
  };

  const { draggedItem, dragOverStage, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop } = useDragAndDrop(handleCandidateMove);

  const handleCandidateClick = (candidate: any, stageId?: string) => {
    const stage = stageId || candidate.stageId;
    navigate(`/candidates/${candidate.id}`, { state: { from: '/recruiting', fromRecruiting: true, recruitingStage: stage } });
  };

  const handleStatusChange = async (candidateId: string, newStatus: string) => {
    await handleCandidateMove(candidateId, "", newStatus);
  };

  const handlePriorityChange = async (candidateId: string, newPriority: Priority) => {
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ priority: newPriority })
        .eq('id', candidateId);

      if (error) throw error;

      // Priority order for sorting
      const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      // Update local state and re-sort candidates
      setStages(prevStages => 
        prevStages.map(stage => {
          const updatedCandidates = stage.candidates.map((c: any) => 
            c.id === candidateId ? { ...c, priority: newPriority } : c
          );
          
          // Re-sort candidates after priority change
          updatedCandidates.sort((a: any, b: any) => {
            // New candidates (within 3 days) come first
            if (a.isNew && !b.isNew) return -1;
            if (!a.isNew && b.isNew) return 1;
            
            // If both are new, sort by creation date (newest first)
            if (a.isNew && b.isNew) {
              return b.createdAt.getTime() - a.createdAt.getTime();
            }
            
            // Then sort by priority
            const aPrio = a.priority ? priorityOrder[a.priority] : 4;
            const bPrio = b.priority ? priorityOrder[b.priority] : 4;
            
            if (aPrio !== bPrio) return aPrio - bPrio;
            
            // Same priority: sort by creation date (newest first)
            return b.createdAt.getTime() - a.createdAt.getTime();
          });
          
          return {
            ...stage,
            candidates: updatedCandidates
          };
        })
      );

      const priorityLabel = newPriority ? priorityConfig[newPriority].label : 'Keine';
      toast({
        title: t("toast.statusUpdated"),
        description: `${t("recruiting.priority")}: ${priorityLabel}`,
      });
    } catch (error) {
      console.error('Error updating priority:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.updateError"),
        variant: "destructive",
      });
    }
  };

  const handleCompanyClick = async (companyName: string) => {
    if (!companyName || companyName === 'N/A' || companyName === t("common.noDataFound")) {
      return;
    }
    
    try {
      // Search for a client with a matching name
      const { data: clients, error } = await supabase
        .from('clients')
        .select('id, name')
        .ilike('name', `%${companyName}%`)
        .limit(1);
      
      if (error) throw error;
      
      if (clients && clients.length > 0) {
        navigate(`/clients/${clients[0].id}`, { state: { from: '/recruiting' } });
      } else {
        toast({
          title: t("common.notFound"),
          description: t("recruiting.companyNotFound"),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error finding client:', error);
    }
  };

  const PriorityDropdown = ({ candidateId, currentPriority }: { candidateId: string; currentPriority: Priority }) => {
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
          <DropdownMenuItem onClick={() => handlePriorityChange(candidateId, 'high')}>
            <ArrowUp className="h-4 w-4 mr-2 text-red-600" />
            {t("recruiting.priorityHigh")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handlePriorityChange(candidateId, 'medium')}>
            <ArrowRight className="h-4 w-4 mr-2 text-yellow-600" />
            {t("recruiting.priorityMedium")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handlePriorityChange(candidateId, 'low')}>
            <ArrowDown className="h-4 w-4 mr-2 text-green-600" />
            {t("recruiting.priorityLow")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handlePriorityChange(candidateId, null)}>
            <Minus className="h-4 w-4 mr-2 text-muted-foreground" />
            {t("recruiting.priorityNone")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("recruiting.title")}</h1>
          <p className="text-muted-foreground">
            {t("recruiting.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EnhancedNewCandidateDialog
            onCandidateCreated={() => {
              setRefreshKey(prev => prev + 1);
              setLoading(true);
            }}
            defaultRecruitingStatus={selectedStatusFilter || configurations.recruitingStages[0]?.id || null}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                {t("candidates.newCandidate")}
              </Button>
            }
          />
          <UserFilter
            storageKey="recruiting-user-filter"
            value={selectedUserFilter}
            onChange={setSelectedUserFilter}
          />
          <Button
            variant={viewMode === 'kanban' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('kanban')}
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            {t("pipeline.kanban")}
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4 mr-2" />
            {t("pipeline.list")}
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      {viewMode === 'kanban' ? (
        <div 
          ref={kanbanScrollRef} 
          className="overflow-x-auto"
          style={{
            overscrollBehaviorX: 'contain',
            touchAction: 'manipulation',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div className="flex gap-4 min-w-max pb-4">
            {stages.map((stage) => (
              <div 
                key={stage.id} 
                ref={(el) => { stageRefs.current[stage.id] = el; }}
                className="flex-shrink-0 w-80"
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <Card className={`h-full transition-colors ${dragOverStage === stage.id ? 'ring-2 ring-primary' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {stage.title}
                      </CardTitle>
                      <Badge className={stage.color}>
                        {stage.candidates.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 min-h-[600px] bg-muted/30 rounded-lg p-3">
                      {stage.candidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, { id: candidate.id, stage: stage.id })}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleCandidateClick(candidate, stage.id)}
                          className={`bg-card border border-border rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-pointer
                            ${draggedItem?.id === candidate.id ? 'opacity-50 rotate-2' : ''}
                            hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          <div className="flex items-start gap-3 mb-3">
                            <div onClick={(e) => e.stopPropagation()}>
                              <PriorityDropdown candidateId={candidate.id} currentPriority={candidate.priority} />
                            </div>
                            <Avatar className="h-10 w-10">
                              {candidate.avatar_url && <AvatarImage src={candidate.avatar_url} />}
                              <AvatarFallback className="bg-muted text-muted-foreground">
                                <User className="h-5 w-5" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">
                                  {candidate.name}
                                </span>
                                {candidate.isNew && (
                                  <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                                    {t("recruiting.new")}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {candidate.lastActivityFormatted}
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{candidate.company}</span>
                            </div>
                            <div className="text-sm font-medium text-foreground truncate">
                              {candidate.position}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Euro className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{candidate.salary}</span>
                            </div>
                            <div className="text-xs text-muted-foreground/70 truncate">
                              {t("pipeline.byCreator")} {candidate.creatorName}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* List View */
        <div 
          ref={listScrollRef}
          className="space-y-4"
          style={{
            overscrollBehaviorX: 'contain',
            touchAction: 'manipulation',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {/* Status Filter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("common.filter")} {t("common.status")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedStatusFilter === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedStatusFilter(null)}
                >
                  {t("common.all")} {t("common.status")}
                </Button>
                {stages.map((stage) => (
                  <Button
                    key={stage.id}
                    variant={selectedStatusFilter === stage.id ? "default" : "outline"}
                    size="sm" 
                    onClick={() => setSelectedStatusFilter(stage.id)}
                    className="gap-2"
                  >
                    {stage.title}
                    <Badge className={`${stage.color} text-xs`}>
                      {stage.candidates.length}
                    </Badge>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Filtered Results Table */}
          <Card className="min-w-max overflow-x-auto">
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedStatusFilter ? `${stages.find(s => s.id === selectedStatusFilter)?.title || selectedStatusFilter} - ${t("nav.candidates")}` : `${t("common.all")} ${t("nav.candidates")}`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">{t("recruiting.priority")}</TableHead>
                      <TableHead>{t("table.candidate")}</TableHead>
                      <TableHead>{t("candidates.desiredPosition")}</TableHead>
                      <TableHead>{t("recruiting.currentCompany")}</TableHead>
                      <TableHead>{t("common.location")}</TableHead>
                      <TableHead 
                        className="cursor-pointer select-none hover:text-foreground transition-colors"
                        onClick={() => setActivitySortDirection(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none')}
                      >
                        <div className="flex items-center gap-1">
                          Letzte Aktivität
                          {activitySortDirection === 'none' && <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          {activitySortDirection === 'desc' && <ArrowDown className="h-3.5 w-3.5" />}
                          {activitySortDirection === 'asc' && <ArrowUp className="h-3.5 w-3.5" />}
                        </div>
                      </TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stages
                      .filter(stage => !selectedStatusFilter || stage.id === selectedStatusFilter)
                      .flatMap(stage => 
                        stage.candidates.map(candidate => ({
                          ...candidate,
                          stageId: stage.id,
                          stageName: stage.title,
                          stageColor: stage.color
                        }))
                      )
                      .sort((a, b) => {
                        if (activitySortDirection === 'none') return 0;
                        const dateA = a.lastActivityRaw?.getTime() || 0;
                        const dateB = b.lastActivityRaw?.getTime() || 0;
                        return activitySortDirection === 'desc' ? dateB - dateA : dateA - dateB;
                      })
                      .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                      .map((candidate) => (
                        <TableRow
                          key={`${candidate.id}-${candidate.stageName}`}
                          onClick={() => handleCandidateClick(candidate)}
                          className="cursor-pointer hover:bg-muted/50"
                        >
                          <TableCell>
                            <PriorityDropdown candidateId={candidate.id} currentPriority={candidate.priority} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                {candidate.avatar_url && <AvatarImage src={candidate.avatar_url} />}
                                <AvatarFallback className="bg-muted text-muted-foreground">
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium truncate">{candidate.name}</span>
                              {candidate.isNew && (
                                <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                                  {t("recruiting.new")}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="truncate">{candidate.position}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span 
                                className="truncate hover:text-primary hover:underline cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCompanyClick(candidate.company);
                                }}
                              >
                                {candidate.company}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{candidate.location}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground truncate">
                            {candidate.lastActivityFormatted}
                          </TableCell>
                          <TableCell>
                            <StatusDropdown
                              currentStatus={candidate.stageName}
                              currentColor={candidate.stageColor}
                              availableStatuses={stages.map(s => ({ title: s.title, color: s.color, id: s.id }))}
                              onStatusChange={(newStatusId) => handleStatusChange(candidate.id, newStatusId)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          
          {/* Pagination */}
          {(() => {
            const allCandidates = stages
              .filter(stage => !selectedStatusFilter || stage.id === selectedStatusFilter)
              .flatMap(stage => stage.candidates);
            const totalPages = Math.ceil(allCandidates.length / itemsPerPage);
            
            if (totalPages <= 1) return null;
            
            return (
              <div className="flex justify-end mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setCurrentPage(pageNum)}
                            isActive={currentPage === pageNum}
                            className="cursor-pointer"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            );
          })()}
         </div>
       )}
    </div>
  );
}