import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mail, Phone, MapPin, Building2, Euro, Calendar, User, Briefcase, Clock, Globe, Award, TrendingUp, Home, Repeat, Target, X, Loader2, CheckCircle, AlertCircle, AlertTriangle, MoreVertical, ChevronDown, ChevronUp, Sparkles, RefreshCw, Car, Train, Zap, Wallet, FileText, Download, Eye, Trash, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotesSection } from "./NotesSection";
import { usePlacementProbability, SentimentButton, SentimentPanel } from "./PlacementProbability";
import { supabase } from "@/integrations/supabase/client";
import { translateRejectionReason } from "@/lib/rejectionReasonUtils";
import { getJobStatusTranslationKey } from "@/lib/statusUtils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InterviewPrepCreatorDialog } from "./InterviewPrepCreatorDialog";
import { PDFViewer } from "./PDFViewer";
import { StatusDropdown } from "./StatusDropdown";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";

interface Candidate {
  id: number;
  name: string;
  position?: string;
  desired_position?: string;
  avatar_url?: string;
  email: string;
  phone: string;
  location: string;
  skills: string[];
  experience: string;
  salary?: string;
  current_salary?: string;
  desired_salary?: string;
  initials: string;
  status?: string;
  recruiting_status?: string;
  industry?: string;
  birthdate?: string;
  last_contact?: string;
  workload?: string;
  willing_to_relocate?: string;
  max_commute?: string;
  reason_for_change?: string;
  languages?: Array<{
    name: string;
    level: string;
  }>;
  further_education?: Array<{
    name: string;
    institution?: string;
    date?: string;
    description?: string;
  }>;
  education?: Array<{
    field?: string;
    degree?: string;
    endDate?: string;
    startDate?: string;
    institution?: string;
    grade?: string;
  }>;
  work_experience?: Array<{
    company: string;
    position: string;
    duration?: string;
    startDate?: string;
    endDate?: string;
    start_date?: string;  // snake_case Variante für ältere Daten
    end_date?: string;    // snake_case Variante für ältere Daten
    description?: string;
  }>;
}

interface Job {
  id: number;
  title: string;
  company: string;
  client_id?: string;
  location: string;
  type?: string;
  employment_type?: string;
  salary: string;
  salary_range?: string;
  description: string;
  requirements?: string;
  responsibilities?: string;
  tasks?: string;
  benefits?: string;
  status?: string;
  experience_level?: string;
  skills?: string[];
  source_url?: string;
}

interface CandidateMatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  candidate: Candidate;
  job: Job;
  stage: string;
  placementId: string;
}
// Helper: parse notes JSON
interface ParsedNote {
  id: string;
  content: string;
  author: string;
  timestamp: string;
  isImportant?: boolean;
}

const parseNotesJson = (notesString: string | undefined | null): ParsedNote[] => {
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
};

function NoteCard({ note }: { note: ParsedNote }) {
  return (
    <div className={`p-3 rounded-lg border text-sm ${note.isImportant ? "border-amber-300 bg-amber-50/50 dark:bg-amber-900/10" : "border-border bg-muted/30"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{note.author}</span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(note.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="prose prose-sm max-w-none text-muted-foreground [&_p]:my-1 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:my-0.5"
        dangerouslySetInnerHTML={{ __html: note.content }}
      />
    </div>
  );
}

function CandidateNotesTab({ candidateId, onCountLoaded }: { candidateId: string; onCountLoaded?: (count: number) => void }) {
  const [candidateNotes, setCandidateNotes] = useState<ParsedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('candidates')
        .select('notes')
        .eq('id', candidateId)
        .single();
      const parsed = data?.notes ? parseNotesJson(data.notes) : [];
      setCandidateNotes(parsed);
      onCountLoaded?.(parsed.length);
      setLoading(false);
    };
    fetch();
  }, [candidateId]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />;
  if (candidateNotes.length === 0) return <p className="text-sm text-muted-foreground italic">Keine Notizen vorhanden</p>;
  return <div className="space-y-3">{candidateNotes.map(n => <NoteCard key={n.id} note={n} />)}</div>;
}

function JobNotesTab({ jobId, onCountLoaded }: { jobId: string; onCountLoaded?: (count: number) => void }) {
  const [jobNotes, setJobNotes] = useState<ParsedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('jobs')
        .select('structured_notes')
        .eq('id', jobId)
        .single();
      const notes = data?.structured_notes && Array.isArray(data.structured_notes) ? data.structured_notes as unknown as ParsedNote[] : [];
      setJobNotes(notes);
      onCountLoaded?.(notes.length);
      setLoading(false);
    };
    fetch();
  }, [jobId]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />;
  if (jobNotes.length === 0) return <p className="text-sm text-muted-foreground italic">Keine Notizen vorhanden</p>;
  return <div className="space-y-3">{jobNotes.map(n => <NoteCard key={n.id} note={n} />)}</div>;
}

export function CandidateMatchDialog({ isOpen, onClose, onUpdate, candidate, job, stage, placementId }: CandidateMatchDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { userProfile } = useAuth();
  const { configurations } = useStatusConfigurations();
  const [currentStage, setCurrentStage] = useState<string>(stage);
  const [matchScore, setMatchScore] = useState<number>(0);
  const [matchReasons, setMatchReasons] = useState<string[]>([]);
  const [matchStrengths, setMatchStrengths] = useState<string[]>([]);
  const [matchGaps, setMatchGaps] = useState<string[]>([]);
  const [matchRisks, setMatchRisks] = useState<string[]>([]);
  const [matchSummary, setMatchSummary] = useState<string>('');
  const [skillsScore, setSkillsScore] = useState<number>(0);
  const [experienceScore, setExperienceScore] = useState<number>(0);
  const [salaryScore, setSalaryScore] = useState<number>(0);
  const [commuteData, setCommuteData] = useState<{
    auto: { duration: string | null; distance: string | null } | null;
    oepnv: { duration: string | null; distance: string | null } | null;
  } | null>(null);
  const [isLoadingCommute, setIsLoadingCommute] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [candidateNotesCount, setCandidateNotesCount] = useState(0);
  const [jobNotesCount, setJobNotesCount] = useState(0);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [deletePlacementOpen, setDeletePlacementOpen] = useState(false);

  // Load notes counts immediately when dialog opens
  useEffect(() => {
    if (!candidate?.id || !job?.id) return;
    const loadCounts = async () => {
      const [candRes, jobRes] = await Promise.all([
        supabase.from('candidates').select('notes').eq('id', String(candidate.id)).single(),
        supabase.from('jobs').select('structured_notes').eq('id', String(job.id)).single(),
      ]);
      if (candRes.data?.notes) {
        setCandidateNotesCount(parseNotesJson(candRes.data.notes).length);
      }
      if (jobRes.data?.structured_notes && Array.isArray(jobRes.data.structured_notes)) {
        setJobNotesCount((jobRes.data.structured_notes as unknown as ParsedNote[]).length);
      }
    };
    loadCounts();
  }, [candidate?.id, job?.id]);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectNote, setRejectNote] = useState<string>("");
  const [rejectionReasons, setRejectionReasons] = useState<Array<{id: string, reason: string}>>([]);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [hasExistingAnalysis, setHasExistingAnalysis] = useState(false);
  const [isPrepDialogOpen, setIsPrepDialogOpen] = useState(false);
  const [clientData, setClientData] = useState<any>(null);
  const [savedPrepDocuments, setSavedPrepDocuments] = useState<Array<{
    id: string;
    file_url: string;
    file_name: string;
    focus_areas: string[];
    custom_instructions: string | null;
    language: string;
    created_at: string;
  }>>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<typeof savedPrepDocuments[0] | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);

  const openPreview = async (doc: typeof savedPrepDocuments[0]) => {
    setPreviewDocument(doc);
    try {
      const storagePath = doc.file_url.includes('interview-prep/') 
        ? doc.file_url.split('interview-prep/').pop()?.split('?')[0] || doc.file_name
        : doc.file_name;
      const { data, error } = await supabase.storage.from('interview-prep').createSignedUrl(storagePath, 3600);
      setPreviewSignedUrl(error ? doc.file_url : data?.signedUrl || doc.file_url);
    } catch {
      setPreviewSignedUrl(doc.file_url);
    }
  };
  
  // Update currentStage when stage prop changes
  useEffect(() => {
    setCurrentStage(stage);
  }, [stage]);

  // Sentiment analysis hook - pass placementId to enable persistence
  const sentiment = usePlacementProbability(notes, currentStage, placementId);

  // Calculate commute time when dialog opens - with caching
  useEffect(() => {
    if (isOpen && placementId && candidate?.location && job?.location) {
      loadOrCalculateCommute(candidate.location, job.location);
    }
  }, [isOpen, placementId, candidate?.location, job?.location]);

  const loadOrCalculateCommute = async (origin: string, destination: string) => {
    if (!origin || !destination || !placementId) {
      setCommuteData(null);
      return;
    }
    
    setIsLoadingCommute(true);
    try {
      // First check for cached commute data
      const { data: placement } = await supabase
        .from('placements')
        .select('commute_auto_duration, commute_auto_distance, commute_oepnv_duration, commute_oepnv_distance, commute_calculated_at')
        .eq('id', placementId)
        .maybeSingle();

      // Use cached data if available
      if (placement?.commute_calculated_at) {
        setCommuteData({
          auto: placement.commute_auto_duration ? {
            duration: placement.commute_auto_duration,
            distance: placement.commute_auto_distance
          } : null,
          oepnv: placement.commute_oepnv_duration ? {
            duration: placement.commute_oepnv_duration,
            distance: placement.commute_oepnv_distance
          } : null
        });
        setIsLoadingCommute(false);
        return;
      }

      // Calculate new commute data
      const { data, error } = await supabase.functions.invoke('calculate-commute', {
        body: { origin, destination }
      });

      if (error) {
        console.error('Error calculating commute:', error);
        setCommuteData(null);
        return;
      }

      // Save to cache
      await supabase
        .from('placements')
        .update({
          commute_auto_duration: data?.auto?.duration || null,
          commute_auto_distance: data?.auto?.distance || null,
          commute_oepnv_duration: data?.oepnv?.duration || null,
          commute_oepnv_distance: data?.oepnv?.distance || null,
          commute_calculated_at: new Date().toISOString()
        })
        .eq('id', placementId);

      setCommuteData(data);
    } catch (error) {
      console.error('Error with commute:', error);
      setCommuteData(null);
    } finally {
      setIsLoadingCommute(false);
    }
  };

  // Load existing analysis when dialog opens (but don't run new analysis automatically)
  useEffect(() => {
    if (isOpen && candidate && job && placementId) {
      loadExistingAnalysis();
    }
  }, [isOpen, candidate?.id, job?.id, placementId]);

  // Load existing analysis from database without running new analysis
  const loadExistingAnalysis = async () => {
    try {
      const { data: placement, error: loadError } = await supabase
        .from('placements')
        .select('match_score, match_reasons, match_strengths, match_gaps, match_risks, match_summary, skills_score, experience_score, salary_score, analysis_completed_at, notes, commute_auto_duration, commute_auto_distance, commute_oepnv_duration, commute_oepnv_distance, commute_calculated_at')
        .eq('id', placementId)
        .maybeSingle();

      if (loadError) throw loadError;

      // Check if we have a valid completed analysis
      const reasons = Array.isArray(placement?.match_reasons) ? (placement.match_reasons as string[]) : [];
      const strengths = Array.isArray(placement?.match_strengths) ? (placement.match_strengths as string[]) : [];
      const gaps = Array.isArray(placement?.match_gaps) ? (placement.match_gaps as string[]) : [];
      const risks = Array.isArray(placement?.match_risks) ? (placement.match_risks as string[]) : [];
      const summary = placement?.match_summary || '';
      
      // Check if the analysis is valid (has actual data, not error messages)
      const isValidAnalysis = placement?.analysis_completed_at && 
        (strengths.length > 0 || gaps.length > 0) &&
        !reasons.some(r => r.includes('konnte nicht geparst') || r.includes('nicht verfügbar'));

      if (isValidAnalysis) {
        setMatchScore(placement.match_score || 75);
        setMatchReasons(reasons);
        setMatchStrengths(strengths);
        setMatchGaps(gaps);
        setMatchRisks(risks);
        setMatchSummary(summary);
        setSkillsScore(placement.skills_score || 70);
        setExperienceScore(placement.experience_score || 75);
        setSalaryScore(placement.salary_score || 80);
        setHasExistingAnalysis(true);
        
        // Also load cached commute data if available
        if (placement.commute_calculated_at) {
          setCommuteData({
            auto: placement.commute_auto_duration ? {
              duration: placement.commute_auto_duration,
              distance: placement.commute_auto_distance
            } : null,
            oepnv: placement.commute_oepnv_duration ? {
              duration: placement.commute_oepnv_duration,
              distance: placement.commute_oepnv_distance
            } : null
          });
        }
      } else {
        setHasExistingAnalysis(false);
      }
    } catch (error) {
      console.error('Error loading existing analysis:', error);
      setHasExistingAnalysis(false);
    }
  };

  // Run AI analysis (only when triggered by button click)
  const runAIAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      // Load placement notes
      const { data: placement } = await supabase
        .from('placements')
        .select('notes')
        .eq('id', placementId)
        .maybeSingle();
      
      const placementNotes = Array.isArray(placement?.notes) ? placement.notes : [];

      // Load client data if available
      let loadedClientData = null;
      if (job?.client_id) {
        const { data: client } = await supabase
          .from('clients')
          .select('*')
          .eq('id', job.client_id)
          .maybeSingle();
        loadedClientData = client;
        setClientData(client);
      }

      // Calculate fresh commute data for the analysis
      let commuteDataForAnalysis = null;
      if (candidate?.location && job?.location) {
        try {
          const { data: commuteResult } = await supabase.functions.invoke('calculate-commute', {
            body: { origin: candidate.location, destination: job.location }
          });
          commuteDataForAnalysis = commuteResult;
          
          // Update commute state and save to cache
          setCommuteData(commuteResult);
          await supabase
            .from('placements')
            .update({
              commute_auto_duration: commuteResult?.auto?.duration || null,
              commute_auto_distance: commuteResult?.auto?.distance || null,
              commute_oepnv_duration: commuteResult?.oepnv?.duration || null,
              commute_oepnv_distance: commuteResult?.oepnv?.distance || null,
              commute_calculated_at: new Date().toISOString()
            })
            .eq('id', placementId);
        } catch (e) {
          console.log('Could not calculate commute for analysis');
        }
      }

      // Run comprehensive AI analysis with all CRM data
      const { data, error } = await supabase.functions.invoke('analyze-match', {
        body: { 
          candidate, 
          job,
          client: loadedClientData,
          notes: placementNotes,
          stage,
          commuteData: commuteDataForAnalysis,
          forceRefresh: true
        }
      });

      if (error) throw error;

      const newScore = data.score || 75;
      const newReasons = data.reasons || [];
      const newStrengths = data.strengths || [];
      const newGaps = data.gaps || [];
      const newRisks = data.risks || [];
      const newSummary = data.summary || '';
      const newSkillsScore = data.skills_score || 70;
      const newExperienceScore = data.experience_score || 75;
      const newSalaryScore = data.salary_score || 80;

      // Save analysis to database including sub-scores
      await supabase
        .from('placements')
        .update({
          match_score: newScore,
          match_reasons: newReasons,
          match_strengths: newStrengths,
          match_gaps: newGaps,
          match_risks: newRisks,
          match_summary: newSummary,
          skills_score: newSkillsScore,
          experience_score: newExperienceScore,
          salary_score: newSalaryScore,
          analysis_completed_at: new Date().toISOString()
        })
        .eq('id', placementId);

      setMatchScore(newScore);
      setMatchReasons(newReasons);
      setMatchStrengths(newStrengths);
      setMatchGaps(newGaps);
      setMatchRisks(newRisks);
      setMatchSummary(newSummary);
      setSkillsScore(newSkillsScore);
      setExperienceScore(newExperienceScore);
      setSalaryScore(newSalaryScore);
      setHasExistingAnalysis(true);
    } catch (error) {
      console.error('Error analyzing match:', error);
      setMatchScore(75);
      setMatchReasons(['AI-Analyse nicht verfügbar']);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Load rejection reasons
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

  // Load notes and saved documents when dialog opens
  useEffect(() => {
    if (isOpen && placementId) {
      loadNotes();
      loadSavedPrepDocuments();
    }
  }, [isOpen, placementId]);

  const loadSavedPrepDocuments = async () => {
    if (!placementId) return;
    
    setIsLoadingDocuments(true);
    try {
      const { data, error } = await supabase
        .from('interview_prep_documents')
        .select('*')
        .eq('placement_id', placementId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSavedPrepDocuments(data || []);
    } catch (error) {
      console.error('Error loading saved prep documents:', error);
    } finally {
      setIsLoadingDocuments(false);
    }
  };


  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('placements')
        .select('notes, created_at')
        .eq('id', placementId)
        .maybeSingle();

      if (error) throw error;
      setNotes(Array.isArray(data?.notes) ? data.notes : []);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const handleSaveNotes = async (newNotes: any[]) => {
    try {
      console.log('Saving notes to placement:', placementId, newNotes);
      
      const { data, error } = await supabase
        .from('placements')
        .update({ notes: newNotes })
        .eq('id', placementId)
        .select();

      if (error) {
        console.error('Error saving notes:', error);
        throw error;
      }
      
      console.log('Notes saved successfully:', data);
      setNotes(newNotes);
    } catch (error) {
      console.error('Error saving notes:', error);
      throw error;
    }
  };

  const handleRejectPlacement = async () => {
    if (!rejectReason) return;
    
    try {
      // Create rejection note with reason and optional note combined
      const rejectionNoteText = rejectNote.trim() 
        ? `Abgelehnt: ${rejectReason}\nNotiz: ${rejectNote.trim()}`
        : `Abgelehnt: ${rejectReason}`;
      
      const rejectionNote = { 
        text: rejectionNoteText, 
        timestamp: new Date().toISOString(),
        type: 'rejection_note',
        rejected_from_stage: stage
      };
      
      // Append to existing notes
      const updatedNotes = [...notes, rejectionNote];

      const { error } = await supabase
        .from('placements')
        .update({ 
          stage: 'Abgelehnt',
          notes: updatedNotes
        })
        .eq('id', placementId);

      if (error) throw error;

      toast({
        title: "Match abgelehnt",
        description: "Der Match wurde als abgelehnt markiert.",
      });
      
      onClose();
      onUpdate?.(); // Update parent data without page reload
    } catch (error) {
      console.error('Error rejecting placement:', error);
      toast({
        title: "Fehler",
        description: "Match konnte nicht abgelehnt werden.",
        variant: "destructive",
      });
    } finally {
      setRejectDialogOpen(false);
      setRejectReason("");
      setRejectNote("");
    }
  };

  // Check if the stage allows interview prep generation
  const canGenerateInterviewPrep = ['Interview 1', 'Interview 2', 'Trial Day'].includes(stage);

  const handleOpenPrepDialog = () => {
    setIsPrepDialogOpen(true);
  };


  const handleDownloadSavedDocument = async (doc: typeof savedPrepDocuments[0]) => {
    try {
      // Extract storage path from file_url
      const storagePath = doc.file_url.includes('interview-prep/') 
        ? doc.file_url.split('interview-prep/').pop()?.split('?')[0] || doc.file_name
        : doc.file_name;
      const { data, error } = await supabase.storage.from('interview-prep').createSignedUrl(storagePath, 3600);
      if (error || !data?.signedUrl) {
        console.error('Error creating signed URL:', error);
        window.open(doc.file_url, '_blank');
        return;
      }
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error('Error downloading document:', err);
      window.open(doc.file_url, '_blank');
    }
  };

  const handleDeleteSavedDocument = async (docId: string) => {
    try {
      const { error } = await supabase
        .from('interview_prep_documents')
        .delete()
        .eq('id', docId);
      
      if (error) throw error;
      
      setSavedPrepDocuments(prev => prev.filter(d => d.id !== docId));
      toast({
        title: "Dokument gelöscht",
        description: "Das Exposé wurde erfolgreich gelöscht.",
      });
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Fehler",
        description: "Das Dokument konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };
  
  const getScoreColor = (score: number) => {
    if (score >= 90) return "bg-success text-success-foreground";
    if (score >= 80) return "bg-warning text-warning-foreground"; 
    return "bg-primary text-primary-foreground";
  };

  const getStageColor = (stageValue: string) => {
    const stageColors: Record<string, string> = {
      "Ready2Send": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      "Vorgestellt": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      "Shared": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
      "Inquiry": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      "Invitation": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      "Interview 1": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      "Interview 2": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
      "Trial Day": "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
      "Offered": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
      "Placed": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      "Abgelehnt": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
    };
    return stageColors[stageValue] || "bg-muted text-muted-foreground";
  };

  const handleStageChange = async (newStage: string) => {
    try {
      const { error } = await supabase
        .from('placements')
        .update({ stage: newStage })
        .eq('id', placementId);

      if (error) throw error;

      setCurrentStage(newStage);
      
      toast({
        title: t("matches.stageUpdated"),
        description: t("matches.stageUpdatedDesc", { stage: newStage }),
      });

      onClose();
      onUpdate?.();
    } catch (error) {
      console.error('Error updating stage:', error);
      toast({
        title: t("toast.error"),
        description: t("matches.stageUpdateError"),
        variant: "destructive",
      });
    }
  };

  // Get available stages for the dropdown
  const availableStages = configurations.matchStages
    .filter(s => s.label !== 'Abgelehnt') // Exclude "Abgelehnt" - use reject dialog instead
    .map(s => ({
      title: s.label,
      color: getStageColor(s.label)
    }));

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[95vw] h-[90vh] flex flex-col p-0">
          <div className="px-6 pt-6 pb-4 flex-shrink-0">
            <DialogHeader>
              <div className="flex items-center justify-between pr-8">
                <DialogTitle className="flex items-center gap-3">
                  <User className="h-5 w-5" />
                  Match Details
                </DialogTitle>
                <div className="flex items-center gap-2">
                  {/* Recruiting Status, Match Score, AI Analysis */}
                  <StatusDropdown
                    currentStatus={currentStage}
                    currentColor={getStageColor(currentStage)}
                    availableStatuses={availableStages}
                    onStatusChange={handleStageChange}
                    disabled={currentStage === 'Abgelehnt'}
                  />
                  {isAnalyzing ? (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      AI analysiert...
                    </Badge>
                  ) : (
                    <>
                      <Badge className={getScoreColor(matchScore)}>
                        {matchScore}% Match
                      </Badge>
                      {matchReasons.length > 0 && (
                        <Badge
                          variant="outline"
                          className="cursor-pointer hover:bg-accent flex items-center gap-1"
                          onClick={() => setIsAnalysisOpen(!isAnalysisOpen)}
                        >
                          <Sparkles className="h-3 w-3" />
                          AI Analyse
                          {isAnalysisOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Badge>
                      )}
                    </>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                    <Clock className="h-3 w-3" />
                    vor 2 Std.
                  </span>
                  {currentStage !== 'Abgelehnt' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => setRejectDialogOpen(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Match ablehnen
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeletePlacementOpen(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash className="h-4 w-4 mr-2" />
                          Match auflösen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <DialogDescription>
                Detaillierte Informationen über den Kandidaten und die Position
              </DialogDescription>
            </DialogHeader>

          {/* AI Match Insights - Button to start or show existing analysis */}
          {!hasExistingAnalysis && !isAnalyzing && (
            <div className="mt-4 px-6">
              <Button
                variant="outline"
                size="sm"
                onClick={runAIAnalysis}
                className="w-full flex items-center justify-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                AI-Analyse starten
              </Button>
            </div>
          )}

          {isAnalyzing && (
            <div className="mt-4 px-6">
              <div className="flex items-center justify-center gap-2 py-3 bg-muted/30 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">AI-Analyse läuft...</span>
              </div>
            </div>
          )}

          {hasExistingAnalysis && !isAnalyzing && matchReasons.length > 0 && (
            <Collapsible open={isAnalysisOpen} onOpenChange={setIsAnalysisOpen}>
              <CollapsibleContent className="mt-2 animate-fade-in">
                <div className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl border p-4 space-y-3">
                  
                  {/* Row 1: Score Circles + Category Bars */}
                  <div className="grid grid-cols-12 gap-3">
                    
                    {/* Match Score */}
                    <div className="col-span-2 flex flex-col items-center justify-center p-2 bg-background/60 rounded-lg border">
                      <div className="relative w-14 h-14">
                        <svg className="w-14 h-14 transform -rotate-90">
                          <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="5" fill="none" className="text-muted/30" />
                          <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="5" fill="none"
                            strokeDasharray={`${(matchScore / 100) * 151} 151`} strokeLinecap="round"
                            className={matchScore >= 80 ? 'text-green-500' : matchScore >= 60 ? 'text-yellow-500' : 'text-orange-500'}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-base font-bold ${matchScore >= 80 ? 'text-green-500' : matchScore >= 60 ? 'text-yellow-500' : 'text-orange-500'}`}>
                            {matchScore}%
                          </span>
                        </div>
                      </div>
                      <span className="text-[9px] text-muted-foreground mt-1">Match</span>
                    </div>

                    {/* Erfolgswahrscheinlichkeit */}
                    <div className="col-span-2 flex flex-col items-center justify-center p-2 bg-background/60 rounded-lg border">
                      <div className="relative w-14 h-14">
                        <svg className="w-14 h-14 transform -rotate-90">
                          <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="5" fill="none" className="text-muted/30" />
                          <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="5" fill="none"
                            strokeDasharray={`${(Math.min(matchScore + 10, 100) / 100) * 151} 151`} strokeLinecap="round"
                            className="text-primary"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-base font-bold text-primary">{Math.min(matchScore + 10, 100)}%</span>
                        </div>
                      </div>
                      <span className="text-[9px] text-muted-foreground mt-1">Erfolg</span>
                    </div>

                    {/* Category Progress Bars */}
                    <div className="col-span-5 flex flex-col justify-center gap-2 p-2 bg-background/60 rounded-lg border">
                      {/* Skills */}
                      <div className="flex items-center gap-2">
                        <Zap className="h-3 w-3 text-blue-500 flex-shrink-0" />
                        <span className="text-[9px] w-12 text-muted-foreground">Skills</span>
                        <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${skillsScore >= 80 ? 'bg-green-500' : skillsScore >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                            style={{ width: `${skillsScore}%` }} />
                        </div>
                        <span className="text-[10px] font-medium w-8 text-right">{skillsScore}%</span>
                      </div>
                      {/* Experience */}
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-3 w-3 text-purple-500 flex-shrink-0" />
                        <span className="text-[9px] w-12 text-muted-foreground">Karriere</span>
                        <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${experienceScore >= 80 ? 'bg-green-500' : experienceScore >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                            style={{ width: `${experienceScore}%` }} />
                        </div>
                        <span className="text-[10px] font-medium w-8 text-right">{experienceScore}%</span>
                      </div>
                      {/* Salary */}
                      <div className="flex items-center gap-2">
                        <Wallet className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                        <span className="text-[9px] w-12 text-muted-foreground">Gehalt</span>
                        <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${salaryScore >= 80 ? 'bg-green-500' : salaryScore >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                            style={{ width: `${salaryScore}%` }} />
                        </div>
                        <span className="text-[10px] font-medium w-8 text-right">{salaryScore}%</span>
                      </div>
                    </div>

                    {/* Commute Times */}
                    <div className="col-span-3 grid grid-cols-2 gap-2">
                      <div className="flex flex-col items-center justify-center p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                        <Car className="h-5 w-5 text-blue-500" />
                        <span className="text-sm font-bold text-blue-500 mt-1">
                          {isLoadingCommute ? '...' : commuteData?.auto?.duration || '–'}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {commuteData?.auto?.distance ? `(${commuteData.auto.distance})` : 'Auto'}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                        <Train className="h-5 w-5 text-purple-500" />
                        <span className="text-sm font-bold text-purple-500 mt-1">
                          {isLoadingCommute ? '...' : commuteData?.oepnv?.duration || '–'}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {commuteData?.oepnv?.distance ? `(${commuteData.oepnv.distance})` : 'ÖPNV'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  {matchSummary && (
                    <div className="px-3 py-2 bg-background/60 rounded-lg border text-[11px] text-muted-foreground">
                      {matchSummary}
                    </div>
                  )}

                  {/* Details Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {/* Stärken */}
                    {matchStrengths.length > 0 && (
                      <div className="bg-green-500/5 rounded-lg border border-green-500/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">Stärken</span>
                        </div>
                        <ul className="space-y-1">
                          {matchStrengths.map((s, i) => (
                            <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                              <span className="text-green-500 mt-px">✓</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Lücken */}
                    {matchGaps.length > 0 && (
                      <div className="bg-orange-500/5 rounded-lg border border-orange-500/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <AlertCircle className="h-3 w-3 text-orange-500" />
                          <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400">Lücken</span>
                        </div>
                        <ul className="space-y-1">
                          {matchGaps.map((g, i) => (
                            <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                              <span className="text-orange-500 mt-px">!</span>
                              <span>{g}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Risiken */}
                    {matchRisks.length > 0 && (
                      <div className="bg-red-500/5 rounded-lg border border-red-500/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                          <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">Risiken</span>
                        </div>
                        <ul className="space-y-1">
                          {matchRisks.map((r, i) => (
                            <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                              <span className="text-red-500 mt-px">⚠</span>
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2 text-[9px] text-muted-foreground flex-wrap">
                      {matchReasons.map((r, i) => (
                        <span key={i} className="flex items-center gap-1 bg-muted/30 px-1.5 py-0.5 rounded">
                          <span className="w-1 h-1 rounded-full bg-primary" />
                          {r}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        supabase
                          .from('placements')
                          .update({ analysis_completed_at: null })
                          .eq('id', placementId)
                          .then(() => runAIAnalysis());
                      }}
                      className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors ml-2"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-hidden px-6 pb-6">
          {/* Candidate Information */}
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
                      {candidate.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 
                      className="font-semibold text-sm hover:text-primary cursor-pointer transition-colors"
                      onClick={() => {
                        navigate(`/candidates/${candidate.id}`, { 
                          state: { from: '/recruiting', fromMatch: { placementId, jobId: job.id, returnUrl: `/pipeline?placement=${placementId}` } } 
                        });
                      }}
                    >
                      {candidate.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">{candidate.position || candidate.desired_position}</p>
                  </div>
                </div>

                <Separator />

                {/* Kontaktdaten */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs">Kontakt</h4>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{candidate.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      {candidate.phone}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      {candidate.location}
                    </div>
                    {candidate.birthdate && (
                      <div className="flex items-center gap-2 text-xs">
                        <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        {candidate.birthdate}
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Status & Details */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs">Status</h4>
                  <div className="flex flex-wrap gap-1">
                    {candidate.status && <Badge variant="outline" className="text-xs py-0 h-5">{candidate.status}</Badge>}
                    {candidate.recruiting_status && <Badge variant="secondary" className="text-xs py-0 h-5">{candidate.recruiting_status}</Badge>}
                    {candidate.industry && <Badge variant="outline" className="text-xs py-0 h-5">{candidate.industry}</Badge>}
                  </div>
                </div>

                <Separator />

                {/* Gehaltsvorstellungen */}
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
                        <span className="text-muted-foreground">Gewünscht:</span> {candidate.desired_salary}
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
                        {candidate.languages.map((lang, index) => (
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
                        {candidate.further_education.map((fe, index) => (
                          <div key={index} className="space-y-0.5">
                            <div className="flex items-start gap-2">
                              <Award className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium">{fe.name}</p>
                                {fe.institution && <p className="text-xs text-muted-foreground">{fe.institution}</p>}
                                {fe.date && <p className="text-xs text-muted-foreground">{fe.date}</p>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Berufserfahrung - jetzt oberhalb der Ausbildung */}
                {candidate.work_experience && candidate.work_experience.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="font-medium text-xs">Berufserfahrung</h4>
                      <div className="space-y-3">
                        {candidate.work_experience.map((exp: any, index: number) => (
                          <div key={index} className="space-y-1">
                            <div className="space-y-0.5">
                              <p className="text-xs font-medium">{exp.position}</p>
                              <p className="text-xs text-muted-foreground">{exp.company}</p>
                              <p className="text-xs text-muted-foreground">
                                {exp.duration || `${exp.startDate || exp.start_date || ''} - ${exp.endDate || exp.end_date || 'heute'}`}
                              </p>
                            </div>
                            {exp.description && (
                              <div 
                                className="text-xs text-muted-foreground pl-3 prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-2 [&_li]:ml-1 [&_p]:my-0.5"
                                dangerouslySetInnerHTML={{ __html: exp.description }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {candidate.education && candidate.education.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-medium text-xs">Ausbildung</h4>
                      <div className="space-y-2">
                        {candidate.education.map((edu, index) => (
                          <div key={index} className="space-y-0.5">
                            <p className="text-xs font-medium">
                              {edu.degree} {edu.field && `in ${edu.field}`}
                            </p>
                            {edu.institution && (
                              <p className="text-xs text-muted-foreground">{edu.institution}</p>
                            )}
                            {(edu.startDate || edu.endDate) && (
                              <p className="text-xs text-muted-foreground">
                                {edu.startDate} {edu.startDate && edu.endDate && '-'} {edu.endDate}
                              </p>
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

          {/* Job Information */}
          <div className="flex flex-col overflow-hidden">
            <Card className="flex flex-col h-full overflow-hidden">
              <CardHeader className="flex-shrink-0 pb-3">
                <div className="flex items-center justify-between w-full">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Briefcase className="h-4 w-4" />
                    Position
                  </CardTitle>
                  {job?.source_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Originalinserat öffnen"
                      onClick={() => window.open(job.source_url, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <ScrollArea className="flex-1 px-6">
                <div className="space-y-3 text-sm pb-4">
                <div>
                  <h3 
                    className="font-semibold text-sm hover:text-primary cursor-pointer transition-colors"
                    onClick={() => {
                      navigate(`/jobs/${job.id}`, { 
                        state: { from: location.pathname, fromMatch: { placementId, candidateId: candidate.id, returnUrl: location.pathname } } 
                      });
                    }}
                  >
                    {job.title}
                  </h3>
                  {job.client_id ? (
                    <button 
                      type="button"
                      className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5 py-1 px-0 hover:text-primary cursor-pointer transition-colors bg-transparent border-none text-left"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/clients/${job.client_id}`, { 
                          state: { from: '/recruiting', fromMatch: { placementId, returnUrl: `/pipeline?placement=${placementId}` } } 
                        });
                      }}
                    >
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="hover:underline">{job.company}</span>
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                      {job.company}
                    </p>
                  )}
                </div>

                <Separator />

                {/* Status & Details */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs">Details</h4>
                  <div className="flex flex-wrap gap-1">
                    {job.status && <Badge variant="outline" className="text-xs py-0 h-5">{t(`common.jobStatus.${getJobStatusTranslationKey(job.status)}`, { defaultValue: job.status })}</Badge>}
                    {job.employment_type && <Badge variant="secondary" className="text-xs py-0 h-5">{job.employment_type}</Badge>}
                    {job.experience_level && <Badge variant="outline" className="text-xs py-0 h-5">{job.experience_level}</Badge>}
                  </div>
                </div>

                <Separator />

                {/* Basisdaten */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs">Basisdaten</h4>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      {job.location}
                    </div>
                    {(job.type || job.employment_type) && (
                      <div className="flex items-center gap-2 text-xs">
                        <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        {job.employment_type || job.type}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <Euro className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      {job.salary_range || job.salary}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Skills */}
                {job.skills && job.skills.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <h4 className="font-medium text-xs">Erforderliche Skills</h4>
                      <div className="flex flex-wrap gap-1">
                        {job.skills.map((skill, index) => (
                          <Badge key={index} variant="secondary" className="text-xs py-0 h-5">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Beschreibung */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs">Beschreibung</h4>
                  {job.description ? (
                    <div 
                      className="text-xs text-muted-foreground prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                      dangerouslySetInnerHTML={{ __html: job.description }}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">-</p>
                  )}
                </div>

                {/* Aufgaben/Verantwortlichkeiten */}
                {(job.tasks || job.responsibilities) && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-medium text-xs">Aufgaben</h4>
                      <div 
                        className="text-xs text-muted-foreground prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                        dangerouslySetInnerHTML={{ __html: job.responsibilities || job.tasks || '' }}
                      />
                    </div>
                  </>
                )}

                {/* Anforderungen */}
                {job.requirements && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-medium text-xs">Anforderungen</h4>
                      <div 
                        className="text-xs text-muted-foreground prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                        dangerouslySetInnerHTML={{ __html: job.requirements }}
                      />
                    </div>
                  </>
                )}

                {/* Benefits */}
                {job.benefits && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-medium text-xs">Benefits</h4>
                      <div 
                        className="text-xs text-muted-foreground prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                        dangerouslySetInnerHTML={{ __html: job.benefits }}
                      />
                    </div>
                  </>
                )}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* Match Notes */}
          <div className="flex flex-col overflow-hidden">
{canGenerateInterviewPrep && (
              <div className="mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenPrepDialog}
                  className="w-full h-8 gap-1.5 text-xs"
                >
                  <FileText className="h-3 w-3" />
                  <Sparkles className="h-3 w-3" />
                  Vorbereitungs-Exposé erstellen
                </Button>
              </div>
            )}
            <Card className="flex flex-col h-full overflow-hidden">
              <Tabs defaultValue="match" className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-shrink-0 px-6 pt-4 pb-2">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="match">
                      Match
                      {notes.length > 0 && (
                         <span className="ml-0.5 text-[10px] text-muted-foreground font-normal align-baseline translate-y-[3px]">
                           {notes.length}
                         </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="kandidat">
                      Kandidat
                      {candidateNotesCount > 0 && (
                         <span className="ml-0.5 text-[10px] text-muted-foreground font-normal align-baseline translate-y-[3px]">
                           {candidateNotesCount}
                         </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="stelle">
                      Stelle
                      {jobNotesCount > 0 && (
                         <span className="ml-0.5 text-[10px] text-muted-foreground font-normal align-baseline translate-y-[3px]">
                           {jobNotesCount}
                         </span>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="match" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                  <CardHeader className="flex-shrink-0 pb-3 pt-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Calendar className="h-4 w-4" />
                        Match Notizen
                      </CardTitle>
                      <SentimentButton 
                        notes={notes}
                        isLoading={sentiment.isLoading}
                        isExpanded={sentiment.isExpanded}
                        result={sentiment.result}
                        config={sentiment.config}
                        getProbabilityColor={sentiment.getProbabilityColor}
                        getBackgroundColor={sentiment.getBackgroundColor}
                        onToggle={sentiment.handleToggle}
                      />
                    </div>
                  </CardHeader>
                  <div className="flex-1 min-h-0 px-6 overflow-y-auto">
                    <div className="pb-4 space-y-3">
                      <SentimentPanel
                        isExpanded={sentiment.isExpanded}
                        result={sentiment.result}
                        config={sentiment.config}
                        isLoading={sentiment.isLoading}
                        getProbabilityColor={sentiment.getProbabilityColor}
                        getProgressColor={sentiment.getProgressColor}
                        getBackgroundColor={sentiment.getBackgroundColor}
                        onRefresh={sentiment.analyzeProbability}
                      />
                      <NotesSection 
                        initialNotes={notes} 
                        onSave={handleSaveNotes} 
                        userName={userProfile?.full_name?.split(' ')[0] || 'User'}
                        userAvatarUrl={userProfile?.avatar_url}
                        entityType="placements"
                        entityId={placementId}
                      />
                      
                      {/* Saved prep documents */}
                      {canGenerateInterviewPrep && savedPrepDocuments.length > 0 && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                            <FileText className="h-3 w-3" />
                            Vorbereitungs-Exposés ({savedPrepDocuments.length})
                          </div>
                          <div className="space-y-1">
                            {savedPrepDocuments.map((doc) => (
                              <div 
                                key={doc.id} 
                                className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50 group text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <FileText className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                  <span className="truncate">
                                    {new Date(doc.created_at).toLocaleDateString('de-DE', { 
                                      day: '2-digit', 
                                      month: '2-digit', 
                                      year: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                    {doc.language === 'en' && ' (EN)'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0"
                                    onClick={() => openPreview(doc)}
                                    title="Vorschau"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleDownloadSavedDocument(doc)}
                                    title="Herunterladen"
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteSavedDocument(doc.id)}
                                    title="Löschen"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {isLoadingDocuments && canGenerateInterviewPrep && (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="kandidat" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                  <CardHeader className="flex-shrink-0 pb-3 pt-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <User className="h-4 w-4" />
                      Kandidaten-Notizen
                    </CardTitle>
                  </CardHeader>
                  <div className="flex-1 min-h-0 px-6 overflow-y-auto">
                    <div className="pb-8">
                      <CandidateNotesTab candidateId={String(candidate.id)} onCountLoaded={setCandidateNotesCount} />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="stelle" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                  <CardHeader className="flex-shrink-0 pb-3 pt-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Briefcase className="h-4 w-4" />
                      Stellen-Notizen
                    </CardTitle>
                  </CardHeader>
                  <div className="flex-1 min-h-0 px-6 overflow-y-auto">
                    <div className="pb-8">
                      <JobNotesTab jobId={String(job.id)} onCountLoaded={setJobNotesCount} />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.rejectDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("settings.rejectDialogDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup value={rejectReason} onValueChange={setRejectReason}>
          {rejectionReasons.map((reason) => (
            <div key={reason.id} className="flex items-center space-x-2">
              <RadioGroupItem value={reason.reason} id={reason.id} />
              <Label htmlFor={reason.id}>{translateRejectionReason(reason.reason)}</Label>
            </div>
          ))}
        </RadioGroup>
        <div className="space-y-2">
          <Label htmlFor="reject-note-dialog">Notiz (optional)</Label>
          <Textarea
            id="reject-note-dialog"
            placeholder="Zusätzliche Notiz zur Absage..."
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setRejectReason(""); setRejectNote(""); }}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleRejectPlacement}
            disabled={!rejectReason}
            className="bg-destructive hover:bg-destructive/90"
          >
            Ablehnen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <InterviewPrepCreatorDialog
      isOpen={isPrepDialogOpen}
      onClose={() => setIsPrepDialogOpen(false)}
      candidate={candidate}
      job={job}
      client={clientData}
      matchData={{
        match_score: matchScore,
        match_strengths: matchStrengths,
        match_gaps: matchGaps,
        match_summary: matchSummary,
      }}
      commuteData={commuteData}
      stage={currentStage}
      placementId={placementId}
      onDocumentCreated={loadSavedPrepDocuments}
    />

    {/* PDF Preview Dialog */}
    <Dialog open={!!previewDocument} onOpenChange={() => { setPreviewDocument(null); setPreviewSignedUrl(null); }}>
      <DialogContent className="sm:max-w-[90vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Exposé Vorschau
            </DialogTitle>
            <div className="flex items-center gap-2">
              {previewDocument && (
                <>
                  <Badge variant="outline">
                    {previewDocument.language === 'en' ? 'English' : 'Deutsch'}
                  </Badge>
                  <Badge variant="secondary">
                    {new Date(previewDocument.created_at).toLocaleDateString('de-DE', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </Badge>
                </>
              )}
            </div>
          </div>
          <DialogDescription>
            {previewDocument?.focus_areas?.length ? (
              <span className="text-xs">
                Fokus: {previewDocument.focus_areas.join(', ')}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {previewDocument && previewSignedUrl && (
            <PDFViewer url={previewSignedUrl} className="h-full" />
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={() => { setPreviewDocument(null); setPreviewSignedUrl(null); }}>
            Schließen
          </Button>
          {previewDocument && (
            <Button onClick={() => handleDownloadSavedDocument(previewDocument)}>
              <Download className="h-4 w-4 mr-2" />
              Herunterladen
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

  <AlertDialog open={deletePlacementOpen} onOpenChange={setDeletePlacementOpen}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Match auflösen</AlertDialogTitle>
        <AlertDialogDescription>
          Möchten Sie dieses Match wirklich auflösen? Diese Aktion kann nicht rückgängig gemacht werden. Alle zugehörigen Daten wie Notizen und Analysen gehen verloren.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
        <AlertDialogAction
          onClick={async () => {
            try {
              const { error } = await supabase
                .from('placements')
                .delete()
                .eq('id', placementId);
              if (error) throw error;
              toast({
                title: "Match aufgelöst",
                description: "Das Match wurde erfolgreich gelöscht.",
              });
              setDeletePlacementOpen(false);
              onClose();
              onUpdate?.();
            } catch (error) {
              console.error('Error deleting placement:', error);
              toast({
                title: "Fehler",
                description: "Das Match konnte nicht gelöscht werden.",
                variant: "destructive",
              });
            }
          }}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          Löschen
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  </>
  );
}