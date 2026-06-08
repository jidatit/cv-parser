import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Euro, LayoutGrid, List, MapPin, ChevronLeft, ChevronRight, MoreVertical, FileText, TrendingUp, Bell, BellOff, User, ArrowUpDown, Sparkles, Info, CheckCircle, AlertTriangle, XCircle, Car, Train, ArrowRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link, useLocation } from "react-router-dom";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { usePreventHorizontalOverscrollNavigation } from "@/hooks/usePreventHorizontalOverscrollNavigation";
import { CandidateMatchDialog } from "@/components/CandidateMatchDialog";
import { JobExposeCreatorDialog } from "@/components/JobExposeCreatorDialog";
import { useToast } from "@/hooks/use-toast";
import { StatusDropdown } from "@/components/StatusDropdown";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { de, enUS, fr, it, es } from "date-fns/locale";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import { getStatusOptions } from "@/lib/statusUtils";
import { extractLowerSalary, calculateHonorar, formatCHF, defaultHonorarStructure } from "@/lib/honorarUtils";
import { translateRejectionReason } from "@/lib/rejectionReasonUtils";
import { UserFilter } from "@/components/UserFilter";
import { useLanguage } from "@/hooks/useLanguage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

// Helper: parse minutes from commute string like "1h 15min" or "1 Stunde"
const parseMinutesFromString = (str: string): number => {
  if (!str) return 0;
  let minutes = 0;
  const hoursMatch = str.match(/(\d+)\s*(?:h|stunden?)/i);
  if (hoursMatch) minutes += parseInt(hoursMatch[1]) * 60;
  const minsMatch = str.match(/(\d+)\s*(?:min|minuten?)/i);
  if (minsMatch) minutes += parseInt(minsMatch[1]);
  if (minutes === 0) {
    const plainNumber = parseInt(str.replace(/\D/g, ''));
    if (plainNumber > 0) minutes = plainNumber;
  }
  return minutes;
};

const getCommuteStatusIcon = (actual: string, max: string) => {
  const actualMins = parseMinutesFromString(actual);
  const maxMins = parseMinutesFromString(max);
  if (maxMins === 0) return null;
  let tolerance: number;
  if (maxMins <= 20) tolerance = 0.30;
  else if (maxMins <= 35) tolerance = 0.25;
  else if (maxMins <= 60) tolerance = 0.15;
  else tolerance = 0.10;
  const toleranceLimit = maxMins * (1 + tolerance);
  if (actualMins <= maxMins) {
    return <CheckCircle className="h-3 w-3 text-success" />;
  } else if (actualMins <= toleranceLimit) {
    return <AlertTriangle className="h-3 w-3 text-warning" />;
  } else {
    return <XCircle className="h-3 w-3 text-destructive" />;
  }
};

const getCommuteColorClass = (actual: string, max: string): string => {
  const actualMins = parseMinutesFromString(actual);
  const maxMins = parseMinutesFromString(max);
  if (maxMins === 0) return "text-muted-foreground";
  let tolerance: number;
  if (maxMins <= 20) tolerance = 0.30;
  else if (maxMins <= 35) tolerance = 0.25;
  else if (maxMins <= 60) tolerance = 0.15;
  else tolerance = 0.10;
  const toleranceLimit = maxMins * (1 + tolerance);
  if (actualMins <= maxMins) return "text-success";
  if (actualMins <= toleranceLimit) return "text-warning";
  return "text-destructive";
};

export default function Pipeline() {
  const { t, currentLanguage } = useLanguage();
  const { toast } = useToast();
  const location = useLocation();
  const { configurations, loading: configLoading } = useStatusConfigurations();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedPlacementId, setSelectedPlacementId] = useState<string>("");
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [placements, setPlacements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>(() => {
    const saved = localStorage.getItem('pipeline-view-mode');
    return (saved as 'kanban' | 'list') || 'kanban';
  });
  const kanbanScrollRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  usePreventHorizontalOverscrollNavigation(kanbanScrollRef, viewMode === "kanban");
  usePreventHorizontalOverscrollNavigation(listScrollRef, viewMode === "list");
  const [selectedCandidateFilter, setSelectedCandidateFilter] = useState<string | null>(() => {
    return sessionStorage.getItem('pipeline-candidate-filter') || null;
  });
  const [ready2sendCandidates, setReady2sendCandidates] = useState<Array<{id: string, name: string}>>([]);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string | null>(() => {
    return sessionStorage.getItem('pipeline-status-filter') || null;
  });
  const [hideEarlyStages, setHideEarlyStages] = useState(() => {
    const saved = localStorage.getItem('pipeline-hide-early-stages');
    return saved === 'true';
  });
  
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectPlacementId, setRejectPlacementId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectNote, setRejectNote] = useState<string>("");
  const [rejectionReasons, setRejectionReasons] = useState<Array<{id: string, reason: string}>>([]);
  const [exposeCreatorOpen, setExposeCreatorOpen] = useState(false);
  const [exposeCreatorCandidateId, setExposeCreatorCandidateId] = useState<string>("");
  const [exposeCreatorCandidateName, setExposeCreatorCandidateName] = useState<string>("");
  const [exposeCreatorInitialTab, setExposeCreatorInitialTab] = useState<string | undefined>(undefined);
  const [honorarDialogOpen, setHonorarDialogOpen] = useState(false);
  const [honorarPlacementId, setHonorarPlacementId] = useState<string | null>(null);
  const [honorarValue, setHonorarValue] = useState<string>("");

  // Restore expose creator state when navigating back
  useEffect(() => {
    const state = location.state as any;
    if (state?.exposeCreator) {
      setExposeCreatorOpen(true);
      setExposeCreatorCandidateId(state.exposeCreator.candidateId);
      setExposeCreatorCandidateName(state.exposeCreator.candidateName);
      setExposeCreatorInitialTab(state.exposeCreator.activeTab);
      // Clean up state to prevent re-opening on refresh
      window.history.replaceState({}, document.title);
    }
  }, []);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string | null>(() => {
    return sessionStorage.getItem('pipeline-user-filter-value') || null;
  });
  const [currentPage, setCurrentPage] = useState(() => {
    const saved = sessionStorage.getItem('pipeline-current-page');
    return saved ? Number(saved) : 1;
  });
  const itemsPerPage = 50;
  const [sortByFollowUp, setSortByFollowUp] = useState(false);
  const [sortByDate, setSortByDate] = useState<'none' | 'asc' | 'desc'>('none');
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragSelectValue, setDragSelectValue] = useState(true);

  // Global mouseup listener to end drag-to-select
  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleMouseDownOnCheckbox = (placementId: string) => {
    const isCurrentlySelected = selectedMatchIds.has(placementId);
    setDragSelectValue(!isCurrentlySelected);
    setIsDragging(true);
  };

  const handleMouseEnterOnCheckbox = (placementId: string) => {
    if (!isDragging) return;
    setSelectedMatchIds(prev => {
      const next = new Set(prev);
      dragSelectValue ? next.add(placementId) : next.delete(placementId);
      return next;
    });
  };

  const getDateLocale = () => {
    switch (currentLanguage) {
      case 'de': return de;
      case 'fr': return fr;
      case 'it': return it;
      case 'es': return es;
      default: return enUS;
    }
  };

  useEffect(() => {
    const fetchRejectionReasons = async () => {
      try {
        const { data, error } = await supabase
          .from('rejection_reasons')
          .select('*')
          .order('created_at');

        if (error) throw error;
        setRejectionReasons(data || []);
      } catch (error) {
        console.error('Error fetching rejection reasons:', error);
      }
    };

    fetchRejectionReasons();
  }, []);

  // Persist filter states to sessionStorage
  useEffect(() => {
    if (selectedCandidateFilter) {
      sessionStorage.setItem('pipeline-candidate-filter', selectedCandidateFilter);
    } else {
      sessionStorage.removeItem('pipeline-candidate-filter');
    }
  }, [selectedCandidateFilter]);

  useEffect(() => {
    if (selectedStatusFilter) {
      sessionStorage.setItem('pipeline-status-filter', selectedStatusFilter);
    } else {
      sessionStorage.removeItem('pipeline-status-filter');
    }
    setSelectedMatchIds(new Set());
    setCurrentPage(1);
  }, [selectedStatusFilter]);

  useEffect(() => {
    if (selectedUserFilter) {
      sessionStorage.setItem('pipeline-user-filter-value', selectedUserFilter);
    } else {
      sessionStorage.removeItem('pipeline-user-filter-value');
    }
  }, [selectedUserFilter]);

  useEffect(() => {
    sessionStorage.setItem('pipeline-current-page', String(currentPage));
  }, [currentPage]);

  // Save & restore Kanban scroll position
  useEffect(() => {
    const el = kanbanScrollRef.current;
    if (!el || viewMode !== 'kanban') return;

    const handleScroll = () => {
      sessionStorage.setItem('pipeline-scroll-x', String(el.scrollLeft));
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== 'kanban' || loading) return;
    const saved = sessionStorage.getItem('pipeline-scroll-x');
    if (saved && kanbanScrollRef.current) {
      requestAnimationFrame(() => {
        kanbanScrollRef.current?.scrollTo({ left: Number(saved) });
      });
    }
  }, [loading, viewMode]);
  useEffect(() => {
    localStorage.setItem('pipeline-hide-early-stages', hideEarlyStages.toString());
  }, [hideEarlyStages]);

  useEffect(() => {
    localStorage.setItem('pipeline-view-mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    loadPlacements();
  }, [selectedUserFilter]);

  // Realtime subscription for automatic updates
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-placements-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'placements'
        },
        () => {
          loadPlacements();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedUserFilter]);

  useEffect(() => {
    if (placements.length > 0) {
      const ready2sendPlacements = placements.filter(p => p.stage === 'Ready2Send');
      const uniqueCandidates = ready2sendPlacements
        .map(p => ({
          id: p.candidates?.id,
          name: p.candidates?.name
        }))
        .filter((c, index, self) => 
          c.id && c.name && index === self.findIndex(t => t.id === c.id)
        ) as Array<{id: string, name: string}>;
      
      setReady2sendCandidates(uniqueCandidates);
    }
  }, [placements]);

  useEffect(() => {
    const placementId = searchParams.get('placement');
    if (placementId && placements.length > 0) {
      const placement = placements.find(p => p.id === placementId);
      if (placement) {
        setSelectedCandidate(placement.candidates);
        // Add company property for CandidateMatchDialog compatibility
        setSelectedJob({ 
          ...placement.jobs, 
          company: placement.jobs?.clients?.name || t("matches.noCompany") 
        });
        setSelectedStage(placement.stage);
        setSelectedPlacementId(placement.id);
        setShowMatchDialog(true);
      }
    }
  }, [searchParams, placements]);

  const loadPlacements = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const dateLocale = getDateLocale();
      const { data, error } = await supabase
        .from('placements')
        .select(`
          *,
          candidates(*),
          jobs(*, clients(name))
        `)
        .neq('stage', 'Abgelehnt')
        .order('updated_at', { ascending: false })
        .limit(5000);

      if (error) throw error;
      
      let filteredData = data || [];
      if (selectedUserFilter) {
        filteredData = filteredData.filter(
          p => p.user_id === selectedUserFilter
        );
      }
      
      const userIds = [...new Set(filteredData.map(p => p.user_id))];
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
      
      const placementsWithCreator = filteredData.map(p => ({
        ...p,
        creatorName: profilesMap[p.user_id] || t("dashboard.unknown")
      }));
      
      setPlacements(placementsWithCreator);
    } catch (error) {
      console.error('Error loading placements:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.loadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter out "Abgelehnt" stage from pipeline view
  const stageConfigs = getStatusOptions(configurations.matchStages).filter(s => s.title !== 'Abgelehnt');
  
  const interview2Index = configurations.matchStages.findIndex(s => 
    s.id === 'interview2' || s.label === 'Interview 2'
  );
  const stagesWithHonorar = interview2Index >= 0 
    ? configurations.matchStages.slice(interview2Index).map(s => s.label)
    : [];
  
  const allStages = stageConfigs.map(config => {
    const dateLocale = getDateLocale();
    const stagePlacements = placements
      .filter(p => p.stage === config.title)
      .map(p => {
        const salary = p.candidates?.desired_salary || p.candidates?.current_salary || '-';
        const salaryNum = extractLowerSalary(salary);
        const honorarStructure = configurations.honorarStructure || defaultHonorarStructure;
        const honorarCalc = salaryNum ? calculateHonorar(salaryNum, honorarStructure) : null;
        const showHonorar = stagesWithHonorar.includes(config.title);
        
        // For "Shared" stage, use shared_at date; otherwise use updated_at
        const displayDate = config.title === 'Shared' && p.shared_at 
          ? p.shared_at 
          : p.updated_at;
        
        return {
          id: p.id,
          placementId: p.id,
          candidateId: p.candidate_id,
          jobId: p.job_id,
          name: p.candidates?.name || t("dashboard.unknown"),
          initials: p.candidates?.name?.split(' ').map((n: string) => n[0]).join('') || '??',
          position: p.jobs?.title || t("jobs.noClient"),
          company: p.jobs?.clients?.name || t("jobs.noClient"),
          location: p.jobs?.location || '-',
          salary,
          honorar: honorarCalc,
          showHonorar: stagesWithHonorar.includes(config.title),
          date: displayDate ? formatDistanceToNow(new Date(displayDate), { addSuffix: true, locale: dateLocale }) : '-',
          rawDate: displayDate || '',
          candidate: p.candidates,
          avatarUrl: p.candidates?.avatar_url || null,
          job: { ...p.jobs, company: p.jobs?.clients?.name || t("jobs.noClient") },
          notes: p.notes || [],
          creatorName: (p as any).creatorName || t("dashboard.unknown"),
          followUp: p.follow_up || false,
            isAiMatch: Boolean(p.from_ai_match),
            clientId: p.jobs?.client_id || null,
            candidateLocation: p.candidates?.location || '-',
            maxCommute: p.candidates?.max_commute || null,
            commuteAutoDuration: p.commute_auto_duration || null,
            commuteAutoDistance: p.commute_auto_distance || null,
            commuteOepnvDuration: p.commute_oepnv_duration || null,
            commuteOepnvDistance: p.commute_oepnv_distance || null,
            matchScore: p.match_score || null,
            matchStrengths: (p.match_strengths as string[] | null) || null,
            matchGaps: (p.match_gaps as string[] | null) || null,
            matchRisks: (p.match_risks as string[] | null) || null,
            manualHonorar: p.manual_honorar ? Number(p.manual_honorar) : null,
        };
      });

    return {
      ...config,
      candidates: stagePlacements
    };
  });

  const earlyStageNames = configurations.matchStages.slice(0, 4).map(s => s.label);
  const stages = hideEarlyStages 
    ? allStages.filter(stage => !earlyStageNames.includes(stage.title))
    : allStages;

  const handleCandidateMove = async (placementId: string, fromStage: string, toStage: string) => {
    try {
      const { error } = await supabase
        .from('placements')
        .update({ stage: toStage })
        .eq('id', placementId);

      if (error) throw error;

      setPlacements(prev => prev.map(p =>
        p.id === placementId ? { ...p, stage: toStage } : p
      ));

      toast({
        title: t("toast.statusUpdated"),
        description: `${t("common.candidate")} ${fromStage} → ${toStage}`,
      });
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

  const handleCandidateClick = (candidate: any, stage: string) => {
    setSelectedCandidate(candidate.candidate);
    setSelectedJob(candidate.job);
    setSelectedStage(stage);
    setSelectedPlacementId(candidate.placementId);
    setShowMatchDialog(true);
    setSearchParams({ placement: candidate.placementId });
  };

  const handleCloseMatchDialog = () => {
    setShowMatchDialog(false);
    loadPlacements(true);
    setSearchParams({});
  };

  useEffect(() => {
    if (!showMatchDialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        handleCloseMatchDialog();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMatchDialog]);

  const handleStatusChange = async (placementId: string, newStatusId: string) => {
    // Find the stage config by id to get the correct title for the database
    const stageConfig = stageConfigs.find(s => s.id === newStatusId);
    const stageTitle = stageConfig?.title || newStatusId;
    await handleCandidateMove(placementId, '', stageTitle);
  };

  const handleDeletePlacement = async (placementId: string) => {
    // Optimistically remove from UI
    setPlacements(prev => prev.filter(p => p.id !== placementId));
    
    try {
      const { error } = await supabase
        .from('placements')
        .delete()
        .eq('id', placementId);

      if (error) throw error;

      toast({
        title: t("toast.deleteSuccess"),
        description: t("toast.deleteSuccess"),
      });
    } catch (error) {
      console.error('Error deleting placement:', error);
      // Reload on error to restore state
      loadPlacements(true);
      toast({
        title: t("toast.error"),
        description: t("toast.deleteError"),
        variant: "destructive",
      });
    }
  };

  const handleRejectPlacement = async () => {
    if (!rejectPlacementId || !rejectReason) return;
    
    try {
      const { data: currentPlacement } = await supabase
        .from('placements')
        .select('stage, notes')
        .eq('id', rejectPlacementId)
        .single();

      // Create rejection note with reason and optional note combined
      const rejectionNoteText = rejectNote.trim() 
        ? `${t("settings.rejection")}: ${rejectReason}\nNotiz: ${rejectNote.trim()}`
        : `${t("settings.rejection")}: ${rejectReason}`;
      
      const rejectionNote = { 
        text: rejectionNoteText, 
        timestamp: new Date().toISOString(),
        type: 'rejection_note',
        rejected_from_stage: currentPlacement?.stage || t("dashboard.unknown"),
        rejection_reason: rejectReason,
        rejected_at: new Date().toISOString()
      };
      
      // Append to existing notes
      const existingNotes = Array.isArray(currentPlacement?.notes) ? currentPlacement.notes : [];
      const updatedNotes = [...existingNotes, rejectionNote];

      const { error } = await supabase
        .from('placements')
        .update({ 
          stage: 'Abgelehnt',
          notes: updatedNotes
        })
        .eq('id', rejectPlacementId);

      if (error) throw error;

      await loadPlacements();
      toast({
        title: t("toast.statusUpdated"),
        description: t("toast.statusUpdated"),
      });
    } catch (error) {
      console.error('Error rejecting placement:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.updateError"),
        variant: "destructive",
      });
    } finally {
      setRejectDialogOpen(false);
      setRejectPlacementId(null);
      setRejectReason("");
      setRejectNote("");
    }
  };

  const handleToggleFollowUp = async (placementId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('placements')
        .update({ follow_up: !currentValue })
        .eq('id', placementId);

      if (error) throw error;

      // Update local state immediately
      setPlacements(prev => prev.map(p => 
        p.id === placementId ? { ...p, follow_up: !currentValue } : p
      ));

      toast({
        title: !currentValue ? "Nachfassen aktiviert" : "Nachfassen deaktiviert",
        description: !currentValue ? "Match wurde als 'Nachfassen' markiert" : "Markierung wurde entfernt",
      });
    } catch (error) {
      console.error('Error toggling follow up:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.updateError"),
        variant: "destructive",
      });
    }
  };

  const handleOpenExposeCreator = (candidateId: string) => {
    // Find candidate name from ready2sendCandidates
    const candidate = ready2sendCandidates.find(c => c.id === candidateId);
    setExposeCreatorCandidateId(candidateId);
    setExposeCreatorCandidateName(candidate?.name || "");
    setExposeCreatorOpen(true);
  };

  const isVorgestelltFiltered = viewMode === 'list' && selectedStatusFilter === 'Vorgestellt';

  const handleBulkMoveToReady2Share = async () => {
    if (selectedMatchIds.size === 0) return;
    try {
      const { error } = await supabase
        .from('placements')
        .update({ stage: 'Ready2Share' })
        .in('id', Array.from(selectedMatchIds));

      if (error) throw error;

      const count = selectedMatchIds.size;
      setPlacements(prev => prev.map(p => 
        selectedMatchIds.has(p.id) ? { ...p, stage: 'Ready2Share' } : p
      ));
      setSelectedMatchIds(new Set());
      toast({
        title: t("toast.statusUpdated"),
        description: `${count} Match${count > 1 ? 'es' : ''} → Ready2Share`,
      });
    } catch (error) {
      console.error('Error bulk moving to Ready2Share:', error);
      toast({ title: t("toast.error"), description: t("toast.updateError"), variant: "destructive" });
    }
  };

  const handleBulkRejectNoInterest = async () => {
    if (selectedMatchIds.size === 0) return;
    try {
      const count = selectedMatchIds.size;
      const updatedMap = new Map<string, any>();

      for (const matchId of selectedMatchIds) {
        const placement = placements.find(p => p.id === matchId);

        const rejectionNote = {
          text: `${t("settings.rejection")}: Kandidat hat kein Interesse`,
          timestamp: new Date().toISOString(),
          type: 'rejection_note',
          rejected_from_stage: placement?.stage || 'Vorgestellt',
          rejection_reason: 'Kandidat hat kein Interesse',
          rejected_at: new Date().toISOString()
        };

        const existingNotes = Array.isArray(placement?.notes) ? placement.notes : [];
        const updatedNotes = [...existingNotes, rejectionNote];

        await supabase
          .from('placements')
          .update({ stage: 'Abgelehnt', notes: updatedNotes })
          .eq('id', matchId);

        updatedMap.set(matchId, updatedNotes);
      }

      setPlacements(prev => prev.map(p => 
        updatedMap.has(p.id) ? { ...p, stage: 'Abgelehnt', notes: updatedMap.get(p.id) } : p
      ));
      setSelectedMatchIds(new Set());
      toast({
        title: t("toast.statusUpdated"),
        description: `${count} Match${count > 1 ? 'es' : ''} abgelehnt`,
      });
    } catch (error) {
      console.error('Error bulk rejecting:', error);
      toast({ title: t("toast.error"), description: t("toast.updateError"), variant: "destructive" });
    }
  };

  const handleMoveToVorgestellt = async () => {
    try {
      let matchesToMove;
      if (selectedCandidateFilter) {
        matchesToMove = placements.filter(
          p => p.stage === 'Ready2Send' && p.candidate_id === selectedCandidateFilter
        );
      } else {
        matchesToMove = placements.filter(p => p.stage === 'Ready2Send');
      }

      if (matchesToMove.length === 0) {
        toast({
          title: t("aiMatches.noMatches"),
          description: t("aiMatches.noMatches"),
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('placements')
        .update({ stage: 'Vorgestellt' })
        .in('id', matchesToMove.map(m => m.id));

      if (error) throw error;

      await loadPlacements();

      toast({
        title: t("toast.statusUpdated"),
        description: `${matchesToMove.length} Match${matchesToMove.length > 1 ? 'es' : ''}`,
      });
    } catch (error) {
      console.error('Error moving matches:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.updateError"),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("pipeline.title")}</h1>
          <p className="text-muted-foreground">
            {t("pipeline.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UserFilter
            storageKey="pipeline-user-filter"
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
            {t("common.details")}
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
            {!hideEarlyStages && allStages.filter(stage => earlyStageNames.includes(stage.title)).map((stage) => (
              <div 
                key={stage.title} 
                className="flex-shrink-0 w-80"
                onDragOver={(e) => handleDragOver(e, stage.title)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.title)}
              >
                <Card className={`h-full transition-colors ${dragOverStage === stage.title ? 'ring-2 ring-primary' : ''}`}>
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
                          key={candidate.placementId}
                          draggable
                          onDragStart={(e) => handleDragStart(e, { id: candidate.placementId, stage: stage.title })}
                          onDragEnd={handleDragEnd}
                          className={`bg-card border border-border rounded-lg p-3 shadow-sm hover:shadow-md transition-all relative
                            ${draggedItem?.id === candidate.id ? 'opacity-50 rotate-2' : ''}
                            hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          <div className="flex items-start gap-3 mb-3">
                            <Avatar className="h-10 w-10 cursor-pointer" onClick={() => handleCandidateClick(candidate, stage.title)}>
                              {candidate.avatarUrl && <AvatarImage src={candidate.avatarUrl} alt={candidate.name} />}
                              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                {candidate.initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleCandidateClick(candidate, stage.title)}>
                              <div className="flex items-center gap-1.5">
                                <Link
                                  to={`/candidates/${candidate.candidateId}`}
                                  state={{ from: '/pipeline' }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm font-medium text-foreground truncate hover:underline"
                                >
                                  {candidate.name}
                                </Link>
                                {candidate.isAiMatch && (
                                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 p-1 h-5 w-5 flex items-center justify-center">
                                    <Sparkles className="h-3 w-3" />
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {candidate.date}
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-6 w-6 absolute top-2 right-2"
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="z-[100] bg-popover border shadow-lg">
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRejectPlacementId(candidate.placementId);
                                    setRejectDialogOpen(true);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          
                          <div className="space-y-2 cursor-pointer" onClick={() => handleCandidateClick(candidate, stage.title)}>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3 flex-shrink-0" />
                              {candidate.clientId ? (
                                <Link
                                  to={`/clients/${candidate.clientId}`}
                                  state={{ from: '/pipeline' }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate hover:underline"
                                >
                                  {candidate.company}
                                </Link>
                              ) : (
                                <span className="truncate">{candidate.company}</span>
                              )}
                            </div>
                            <Link
                              to={`/jobs/${candidate.jobId}`}
                              state={{ from: '/pipeline' }}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm font-medium text-foreground truncate hover:underline"
                            >
                              {candidate.position}
                            </Link>
                            <div className="flex items-center gap-1 text-xs">
                              {candidate.matchScore ? (
                                <>
                                  <Sparkles className="h-3 w-3 flex-shrink-0 text-primary" />
                                  <span className="font-medium text-foreground">
                                    {candidate.matchScore}% Match
                                  </span>
                                  {(candidate.matchStrengths || candidate.matchGaps || candidate.matchRisks) && (
                                    <TooltipProvider delayDuration={0}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Info className={`h-3.5 w-3.5 cursor-default ${candidate.matchScore >= 80 ? 'text-success' : candidate.matchScore >= 70 ? 'text-warning' : 'text-muted-foreground'}`} />
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-sm">
                                          <div className="space-y-2 text-xs">
                                            {candidate.matchStrengths?.length > 0 && (
                                              <div>
                                                <div className="flex items-center gap-1 font-medium text-success mb-0.5"><CheckCircle className="h-3 w-3" /> {t("pipeline.strengths")}</div>
                                                {candidate.matchStrengths.map((s: string, i: number) => <div key={i}>• {s}</div>)}
                                              </div>
                                            )}
                                            {candidate.matchGaps?.length > 0 && (
                                              <div>
                                                <div className="flex items-center gap-1 font-medium text-warning mb-0.5"><AlertTriangle className="h-3 w-3" /> {t("pipeline.gaps")}</div>
                                                {candidate.matchGaps.map((g: string, i: number) => <div key={i}>• {g}</div>)}
                                              </div>
                                            )}
                                            {candidate.matchRisks?.length > 0 && (
                                              <div>
                                                <div className="flex items-center gap-1 font-medium text-destructive mb-0.5"><XCircle className="h-3 w-3" /> {t("pipeline.risks")}</div>
                                                {candidate.matchRisks.map((r: string, i: number) => <div key={i}>• {r}</div>)}
                                              </div>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                  <span className="text-muted-foreground">—</span>
                                </>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground/70 truncate">
                              {candidate.creatorName}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}

            {hideEarlyStages && (
              <div className="flex-shrink-0 w-20 flex items-center justify-center animate-fade-in">
                <Card className="h-[680px] w-full bg-muted/30 border-2 border-dashed hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setHideEarlyStages(false)}>
                  <CardContent className="p-2 h-full flex flex-col items-center justify-center gap-3">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <ChevronLeft className="h-5 w-5 text-muted-foreground" />
                      <div className="text-xs font-medium text-muted-foreground [writing-mode:vertical-lr] rotate-180">
                        4 {t("pipeline.stages")}
                      </div>
                      <Badge variant="secondary" className="text-xs rotate-0">
                        {allStages.filter(s => earlyStageNames.includes(s.title))
                          .reduce((sum, s) => sum + s.candidates.length, 0)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex items-center justify-center w-12 flex-shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full h-10 w-10 shadow-sm hover:shadow-md transition-all"
                onClick={() => setHideEarlyStages(!hideEarlyStages)}
              >
                {hideEarlyStages ? (
                  <ChevronLeft className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </Button>
            </div>

            {allStages.filter(stage => !earlyStageNames.includes(stage.title)).map((stage) => (
              <div 
                key={stage.title} 
                className="flex-shrink-0 w-80"
                onDragOver={(e) => handleDragOver(e, stage.title)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.title)}
              >
                <Card className={`h-full transition-colors ${dragOverStage === stage.title ? 'ring-2 ring-primary' : ''}`}>
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
                      {stage.candidates.map((candidate) => {
                        const cardContent = (
                          <div
                            key={candidate.placementId}
                            draggable
                            onDragStart={(e) => handleDragStart(e, { id: candidate.placementId, stage: stage.title })}
                            onDragEnd={handleDragEnd}
                            className={`bg-card border border-border rounded-lg p-3 shadow-sm hover:shadow-md transition-all relative
                              ${draggedItem?.id === candidate.id ? 'opacity-50 rotate-2' : ''}
                              hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          <div className="flex items-start gap-3 mb-3">
                            <Avatar className="h-10 w-10 cursor-pointer" onClick={() => handleCandidateClick(candidate, stage.title)}>
                              {candidate.avatarUrl && <AvatarImage src={candidate.avatarUrl} />}
                              <AvatarFallback className="bg-muted text-muted-foreground">
                                <User className="h-5 w-5" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleCandidateClick(candidate, stage.title)}>
                              <div className="flex items-center gap-1.5">
                                <Link
                                  to={`/candidates/${candidate.candidateId}`}
                                  state={{ from: '/pipeline' }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm font-medium text-foreground truncate hover:underline"
                                >
                                  {candidate.name}
                                </Link>
                                {candidate.isAiMatch && (
                                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 p-1 h-5 w-5 flex items-center justify-center">
                                    <Sparkles className="h-3 w-3" />
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {candidate.date}
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-6 w-6 absolute top-2 right-2"
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="z-[100] bg-popover border shadow-lg">
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRejectPlacementId(candidate.placementId);
                                    setRejectDialogOpen(true);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          
                          <div className="space-y-2 cursor-pointer" onClick={() => handleCandidateClick(candidate, stage.title)}>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3 flex-shrink-0" />
                              {candidate.clientId ? (
                                <Link
                                  to={`/clients/${candidate.clientId}`}
                                  state={{ from: '/pipeline' }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate hover:underline"
                                >
                                  {candidate.company}
                                </Link>
                              ) : (
                                <span className="truncate">{candidate.company}</span>
                              )}
                            </div>
                            <Link
                              to={`/jobs/${candidate.jobId}`}
                              state={{ from: '/pipeline' }}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm font-medium text-foreground truncate hover:underline"
                            >
                              {candidate.position}
                            </Link>
                            <div className="flex items-center gap-1 text-xs">
                              {candidate.matchScore ? (
                                <>
                                  <Sparkles className="h-3 w-3 flex-shrink-0 text-primary" />
                                  <span className="font-medium text-foreground">
                                    {candidate.matchScore}% Match
                                  </span>
                                  {(candidate.matchStrengths || candidate.matchGaps || candidate.matchRisks) && (
                                    <TooltipProvider delayDuration={0}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Info className={`h-3.5 w-3.5 cursor-default ${candidate.matchScore >= 80 ? 'text-success' : candidate.matchScore >= 70 ? 'text-warning' : 'text-muted-foreground'}`} />
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-sm">
                                          <div className="space-y-2 text-xs">
                                            {candidate.matchStrengths?.length > 0 && (
                                              <div>
                                                <div className="flex items-center gap-1 font-medium text-success mb-0.5"><CheckCircle className="h-3 w-3" /> {t("pipeline.strengths")}</div>
                                                {candidate.matchStrengths.map((s: string, i: number) => <div key={i}>• {s}</div>)}
                                              </div>
                                            )}
                                            {candidate.matchGaps?.length > 0 && (
                                              <div>
                                                <div className="flex items-center gap-1 font-medium text-warning mb-0.5"><AlertTriangle className="h-3 w-3" /> {t("pipeline.gaps")}</div>
                                                {candidate.matchGaps.map((g: string, i: number) => <div key={i}>• {g}</div>)}
                                              </div>
                                            )}
                                            {candidate.matchRisks?.length > 0 && (
                                              <div>
                                                <div className="flex items-center gap-1 font-medium text-destructive mb-0.5"><XCircle className="h-3 w-3" /> {t("pipeline.risks")}</div>
                                                {candidate.matchRisks.map((r: string, i: number) => <div key={i}>• {r}</div>)}
                                              </div>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                  <span className="text-muted-foreground">—</span>
                                </>
                              )}
                            </div>
                            {candidate.showHonorar && (candidate.manualHonorar || candidate.honorar) && (
                              <div className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 rounded px-2 py-1">
                                <TrendingUp className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">
                                  {candidate.manualHonorar
                                    ? `${t("pipeline.honorar")}: ${formatCHF(candidate.manualHonorar)} (manuell)`
                                    : `${t("pipeline.honorar")}: ${formatCHF(candidate.honorar!.amount)} (${candidate.honorar!.percentage}%)`
                                  }
                                </span>
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground/70 truncate">
                              {candidate.creatorName}
                            </div>
                          </div>
                          </div>
                        );

                        if (stage.title === 'Placed') {
                          return (
                            <ContextMenu key={candidate.placementId}>
                              <ContextMenuTrigger asChild>
                                {cardContent}
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={() => {
                                  setHonorarPlacementId(candidate.placementId);
                                  setHonorarValue(candidate.manualHonorar ? String(candidate.manualHonorar) : "");
                                  setHonorarDialogOpen(true);
                                }}>
                                  <Euro className="h-4 w-4 mr-2" />
                                  Honorar manuell eingeben
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          );
                        }

                        return cardContent;
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("common.status")} {t("common.filter")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  variant={selectedStatusFilter === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedStatusFilter(null);
                    setSelectedCandidateFilter(null);
                  }}
                >
                  {t("common.all")} {t("common.status")}
                </Button>
                
                {!hideEarlyStages && allStages
                  .filter(stage => ['Ready2Send', 'Vorgestellt', 'Ready2Share', 'Shared'].includes(stage.title))
                  .map((stage) => (
                    <Button
                      key={stage.title}
                      variant={selectedStatusFilter === stage.title ? "default" : "outline"}
                      size="sm" 
                      onClick={() => {
                        setSelectedStatusFilter(stage.title);
                        setSelectedCandidateFilter(null);
                      }}
                      className="gap-2"
                    >
                      {stage.title}
                      <Badge className={`${stage.color} text-xs`}>
                        {stage.candidates.length}
                      </Badge>
                    </Button>
                  ))}
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setHideEarlyStages(!hideEarlyStages)}
                  className="h-9 w-9 rounded-full"
                >
                  {hideEarlyStages ? (
                    <ChevronLeft className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                
                {allStages
                  .filter(stage => !['Ready2Send', 'Vorgestellt', 'Ready2Share', 'Shared'].includes(stage.title))
                  .map((stage) => (
                    <Button
                      key={stage.title}
                      variant={selectedStatusFilter === stage.title ? "default" : "outline"}
                      size="sm" 
                      onClick={() => {
                        setSelectedStatusFilter(stage.title);
                        setSelectedCandidateFilter(null);
                      }}
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

          {selectedStatusFilter === 'Ready2Send' && ready2sendCandidates.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{t("common.candidate")} {t("common.filter")}</CardTitle>
                  <div className="flex gap-2">
                    {selectedCandidateFilter && (
                      <Button
                        onClick={() => handleOpenExposeCreator(selectedCandidateFilter)}
                        size="sm"
                        className="gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        {t("pipeline.exposePdf")}
                      </Button>
                    )}
                    <Button
                      onClick={handleMoveToVorgestellt}
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                    >
                      {t("pipeline.toPresented")}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedCandidateFilter === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCandidateFilter(null)}
                  >
                    {t("common.all")} {t("nav.candidates")}
                  </Button>
                  {ready2sendCandidates.map((candidate) => {
                    const matchCount = placements.filter(
                      p => p.stage === 'Ready2Send' && p.candidates?.id === candidate.id
                    ).length;
                    return (
                      <Button
                        key={candidate.id}
                        variant={selectedCandidateFilter === candidate.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedCandidateFilter(candidate.id)}
                        className="gap-2"
                      >
                        {candidate.name}
                        <Badge className="text-xs">
                          {matchCount}
                        </Badge>
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {(() => {
            let pipelineFilteredCandidates = stages
              .filter(stage => !selectedStatusFilter || stage.title === selectedStatusFilter)
              .flatMap(stage => 
                stage.candidates
                  .filter(candidate => !selectedCandidateFilter || candidate.candidateId === selectedCandidateFilter)
                  .map(candidate => ({
                    ...candidate,
                    stageName: stage.title,
                    stageColor: stage.color,
                    isAiMatch: candidate.isAiMatch
                  }))
              );
            
            // Sort by follow_up when active, otherwise by date (default)
            if (sortByFollowUp && selectedStatusFilter === 'Shared') {
              pipelineFilteredCandidates = [...pipelineFilteredCandidates].sort((a, b) => {
                if (a.followUp && !b.followUp) return -1;
                if (!a.followUp && b.followUp) return 1;
                return new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime();
              });
            }

            if (sortByDate !== 'none') {
              pipelineFilteredCandidates = [...pipelineFilteredCandidates].sort((a, b) => {
                const dateA = new Date(a.rawDate).getTime();
                const dateB = new Date(b.rawDate).getTime();
                return sortByDate === 'asc' ? dateA - dateB : dateB - dateA;
              });
            }

            const totalFilteredPages = Math.ceil(pipelineFilteredCandidates.length / itemsPerPage);

            return (<>
          <div
            ref={listScrollRef}
            className="overflow-x-auto pipeline-list-scroll"
          >
          <Card className="min-w-max">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">
                  {selectedStatusFilter ? `${selectedStatusFilter} - ${t("pipeline.matches")}` : `${t("common.all")} ${t("pipeline.matches")}`}
                </CardTitle>
                {isVorgestelltFiltered && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={selectedMatchIds.size === 0}
                      onClick={handleBulkMoveToReady2Share}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Ready2Share ({selectedMatchIds.size})
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={selectedMatchIds.size === 0}
                      onClick={handleBulkRejectNoInterest}
                    >
                      {t("settings.rejectDialogTitle")} ({selectedMatchIds.size})
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {(() => {
                  const showHonorarColumn = pipelineFilteredCandidates.some(c => c.showHonorar);
                  const showFollowUpColumn = selectedStatusFilter === 'Shared';
                  
                  return (
                    <Table className="w-full">
                    <TableHeader>
                      <TableRow>
                        {showFollowUpColumn && (
                          <TableHead 
                            className="w-[60px] cursor-pointer hover:bg-muted/50"
                            onClick={() => setSortByFollowUp(!sortByFollowUp)}
                          >
                            <div className="flex items-center gap-1">
                              NF
                              <ArrowUpDown className={`h-3 w-3 ${sortByFollowUp ? 'text-blue-500' : 'text-muted-foreground'}`} />
                            </div>
                          </TableHead>
                        )}
                        {isVorgestelltFiltered && (
                          <TableHead className="w-[40px]" />
                        )}
                        <TableHead>{t("table.candidate")}</TableHead>
                        <TableHead>{t("table.position")}</TableHead>
                        <TableHead>{t("table.company")}</TableHead>
                        <TableHead>{t("table.location")}</TableHead>
                        <TableHead className="w-[90px]">Match Score</TableHead>
                        {showHonorarColumn && <TableHead>{t("table.honorar")}</TableHead>}
                        <TableHead 
                          className="w-[100px] cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => setSortByDate(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none')}
                        >
                          <div className="flex items-center gap-1">
                            {t("common.date")}
                            <ArrowUpDown className={`h-3 w-3 ${sortByDate !== 'none' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                          </div>
                        </TableHead>
                        <TableHead className="w-[120px]">{t("common.status")}</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pipelineFilteredCandidates
                        .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                        .map((candidate) => (
                        <TableRow
                          key={`${candidate.placementId}-${candidate.stageName}`}
                          onClick={() => handleCandidateClick(candidate, candidate.stageName)}
                          className="cursor-pointer hover:bg-muted/50"
                        >
                          {isVorgestelltFiltered && (
                            <TableCell
                              onClick={(e) => e.stopPropagation()}
                            onMouseDown={() => {
                                handleMouseDownOnCheckbox(candidate.placementId);
                              }}
                              onMouseEnter={() => handleMouseEnterOnCheckbox(candidate.placementId)}
                              style={{ userSelect: isDragging ? 'none' : undefined }}
                            >
                              <Checkbox
                                checked={selectedMatchIds.has(candidate.placementId)}
                                onCheckedChange={(checked) => {
                                  setSelectedMatchIds(prev => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      next.add(candidate.placementId);
                                    } else {
                                      next.delete(candidate.placementId);
                                    }
                                    return next;
                                  });
                                }}
                              />
                            </TableCell>
                          )}
                          {showFollowUpColumn && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {candidate.stageName === 'Shared' ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleToggleFollowUp(candidate.placementId, candidate.followUp)}
                                >
                                  <Bell className={`h-4 w-4 ${candidate.followUp ? 'text-blue-500 fill-blue-500' : 'text-muted-foreground'}`} />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="max-w-0">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar className="h-8 w-8 flex-shrink-0">
                                {candidate.avatarUrl && <AvatarImage src={candidate.avatarUrl} />}
                                <AvatarFallback className="bg-muted text-muted-foreground">
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <Link
                                to={`/candidates/${candidate.candidateId}`}
                                state={{ from: '/pipeline' }}
                                onClick={(e) => e.stopPropagation()}
                                className="font-medium truncate hover:underline block min-w-0"
                                title={candidate.name}
                              >
                                {candidate.name}
                              </Link>
                              {candidate.isAiMatch && (
                                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 p-1 h-5 w-5 flex items-center justify-center">
                                  <Sparkles className="h-3 w-3" />
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-0">
                            <Link
                              to={`/jobs/${candidate.jobId}`}
                              state={{ from: '/pipeline' }}
                              onClick={(e) => e.stopPropagation()}
                              className="truncate hover:underline block"
                              title={candidate.position}
                            >
                              {candidate.position}
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              {candidate.clientId ? (
                                <Link
                                  to={`/clients/${candidate.clientId}`}
                                  state={{ from: '/pipeline' }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate hover:underline min-w-0"
                                  title={candidate.company}
                                >
                                  {candidate.company}
                                </Link>
                              ) : (
                                <span className="truncate min-w-0" title={candidate.company}>{candidate.company}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="truncate min-w-0" title={candidate.location}>{candidate.location}</span>
                              {(candidate.commuteAutoDuration || candidate.commuteOepnvDuration) && (
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className={`h-3.5 w-3.5 cursor-default flex-shrink-0 ${candidate.commuteAutoDuration && candidate.maxCommute ? getCommuteColorClass(candidate.commuteAutoDuration, candidate.maxCommute) : "text-muted-foreground"}`} />
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-xs">
                                      <div className="space-y-1.5 text-xs">
                                        <div className="flex items-center gap-1">
                                          <User className="h-3 w-3" />
                                          <span className="font-medium">{t("pipeline.candidate")}:</span>
                                          <span>{candidate.candidateLocation}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Building2 className="h-3 w-3" />
                                          <span className="font-medium">{t("pipeline.company")}:</span>
                                          <span>{candidate.location}</span>
                                        </div>
                                        <div className="border-t border-border my-1" />
                                        {candidate.commuteAutoDuration && (
                                          <div className="flex items-center gap-1">
                                            <Car className="h-3 w-3" />
                                            <span>{candidate.commuteAutoDuration}</span>
                                            {candidate.commuteAutoDistance && (
                                              <span className="text-muted-foreground">({candidate.commuteAutoDistance})</span>
                                            )}
                                          </div>
                                        )}
                                        {candidate.commuteOepnvDuration && (
                                          <div className="flex items-center gap-1">
                                            <Train className="h-3 w-3" />
                                            <span>{candidate.commuteOepnvDuration}</span>
                                            {candidate.commuteOepnvDistance && (
                                              <span className="text-muted-foreground">({candidate.commuteOepnvDistance})</span>
                                            )}
                                          </div>
                                        )}
                                        {candidate.maxCommute && (
                                          <>
                                            <div className="border-t border-border my-1" />
                                            <div className="flex items-center gap-1">
                                              <span className="font-medium">Max.:</span>
                                              <span>{candidate.maxCommute}</span>
                                              {candidate.commuteAutoDuration && getCommuteStatusIcon(candidate.commuteAutoDuration, candidate.maxCommute)}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {candidate.matchScore ? (
                                <>
                                  <Sparkles className="h-3 w-3 text-primary flex-shrink-0" />
                                  <span className="font-medium text-foreground">
                                    {candidate.matchScore}%
                                  </span>
                                  {(candidate.matchStrengths || candidate.matchGaps || candidate.matchRisks) && (
                                    <TooltipProvider delayDuration={0}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Info className={`h-3.5 w-3.5 cursor-default ${candidate.matchScore >= 80 ? 'text-success' : candidate.matchScore >= 70 ? 'text-warning' : 'text-muted-foreground'}`} />
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-sm">
                                          <div className="space-y-2 text-xs">
                                            {candidate.matchStrengths?.length > 0 && (
                                              <div>
                                                <div className="flex items-center gap-1 font-medium text-success mb-0.5"><CheckCircle className="h-3 w-3" /> {t("pipeline.strengths")}</div>
                                                {candidate.matchStrengths.map((s: string, i: number) => <div key={i}>• {s}</div>)}
                                              </div>
                                            )}
                                            {candidate.matchGaps?.length > 0 && (
                                              <div>
                                                <div className="flex items-center gap-1 font-medium text-warning mb-0.5"><AlertTriangle className="h-3 w-3" /> {t("pipeline.gaps")}</div>
                                                {candidate.matchGaps.map((g: string, i: number) => <div key={i}>• {g}</div>)}
                                              </div>
                                            )}
                                            {candidate.matchRisks?.length > 0 && (
                                              <div>
                                                <div className="flex items-center gap-1 font-medium text-destructive mb-0.5"><XCircle className="h-3 w-3" /> {t("pipeline.risks")}</div>
                                                {candidate.matchRisks.map((r: string, i: number) => <div key={i}>• {r}</div>)}
                                              </div>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          {showHonorarColumn && (
                            <TableCell>
                              {candidate.showHonorar && (candidate.manualHonorar || candidate.honorar) ? (
                              <div className="flex items-center gap-1 text-sm font-medium text-primary min-w-0">
                                  <TrendingUp className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate min-w-0">
                                    {candidate.manualHonorar
                                      ? `${formatCHF(candidate.manualHonorar)} (manuell)`
                                      : `${formatCHF(candidate.honorar!.amount)} (${candidate.honorar!.percentage}%)`
                                    }
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-muted-foreground truncate">
                            {candidate.date}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <StatusDropdown
                              currentStatus={candidate.stageName}
                              currentColor={candidate.stageColor}
                              availableStatuses={stageConfigs}
                              onStatusChange={(newStatus) => handleStatusChange(candidate.placementId, newStatus)}
                            />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onClick={() => handleDeletePlacement(candidate.placementId)}
                                >
                                  {t("pipeline.dissolve")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setRejectPlacementId(candidate.placementId);
                                    setRejectDialogOpen(true);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  {t("settings.rejectDialogTitle")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    </Table>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
          
          {/* Pagination */}
          {totalFilteredPages > 1 && (
              <div className="flex justify-end mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalFilteredPages) }, (_, i) => {
                      let pageNum;
                      if (totalFilteredPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalFilteredPages - 2) {
                        pageNum = totalFilteredPages - 4 + i;
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
                        onClick={() => setCurrentPage(p => Math.min(totalFilteredPages, p + 1))}
                        className={currentPage === totalFilteredPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
          )}
        </>);
           })()}
        </div>
      )}

      {selectedCandidate && selectedJob && (
        <CandidateMatchDialog
          isOpen={showMatchDialog}
          onClose={handleCloseMatchDialog}
          onUpdate={loadPlacements}
          candidate={selectedCandidate}
          job={selectedJob}
          stage={selectedStage}
          placementId={selectedPlacementId}
        />
      )}


      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.rejectDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.rejectDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={rejectReason} onValueChange={setRejectReason}>
            {rejectionReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.noRejectionReasons")}
              </p>
            ) : (
              rejectionReasons.map((reason) => (
                <div key={reason.id} className="flex items-center space-x-2">
                  <RadioGroupItem value={reason.reason} id={reason.id} />
                  <Label htmlFor={reason.id}>{translateRejectionReason(reason.reason)}</Label>
                </div>
              ))
            )}
          </RadioGroup>
          <div className="space-y-2">
            <Label htmlFor="reject-note">{t("notes.addNote")} ({t("common.optional")})</Label>
            <Textarea
              id="reject-note"
              placeholder={t("notes.addNotePlaceholder")}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRejectDialogOpen(false);
              setRejectReason("");
              setRejectNote("");
            }}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleRejectPlacement} disabled={!rejectReason}>
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Expose Creator Dialog */}
      <JobExposeCreatorDialog
        open={exposeCreatorOpen}
        onOpenChange={(open) => {
          setExposeCreatorOpen(open);
          if (!open) setExposeCreatorInitialTab(undefined);
        }}
        candidateId={exposeCreatorCandidateId}
        candidateName={exposeCreatorCandidateName}
        initialActiveTab={exposeCreatorInitialTab}
      />

      {/* Manual Honorar Dialog */}
      <Dialog open={honorarDialogOpen} onOpenChange={setHonorarDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Honorar manuell eingeben</DialogTitle>
            <DialogDescription>
              Betrag in CHF eingeben. Überschreibt die automatische Berechnung.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="honorar-input">Betrag (CHF)</Label>
            <Input
              id="honorar-input"
              type="number"
              placeholder="z.B. 25000"
              value={honorarValue}
              onChange={(e) => setHonorarValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHonorarDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={async () => {
              if (!honorarPlacementId) return;
              const numValue = honorarValue ? Number(honorarValue) : null;
              try {
                const { error } = await supabase
                  .from('placements')
                  .update({ manual_honorar: numValue } as any)
                  .eq('id', honorarPlacementId);
                if (error) throw error;
                toast({ title: "Honorar gespeichert" });
                setHonorarDialogOpen(false);
                loadPlacements(true);
              } catch (error) {
                console.error('Error saving honorar:', error);
                toast({ title: t("toast.error"), variant: "destructive" });
              }
            }}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
