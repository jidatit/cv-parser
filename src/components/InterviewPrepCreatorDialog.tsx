import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { 
  Download, Loader2, Sparkles, Building2, User, Target, 
  AlertCircle, Briefcase, MessageSquare, CheckSquare, 
  TrendingUp, Wallet, Crown, Heart, Plus, Minus, ThumbsUp, ThumbsDown,
  Phone, BookOpen, Users, Check, Cloud
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// Simple debounce utility
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  const debouncedFn = ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T & { cancel: () => void };
  
  debouncedFn.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
  
  return debouncedFn;
}

// V3 Content Structure with Red Thread - Phase-Specific Content
interface PrepContentV3 {
  // Introduction
  introduction: {
    greeting: string;
    documentPurpose: string;
    howToUse: string[];
    recruiterNote: string;
    recruiterContact: string;
  };
  
  // Page 1 - About the Candidate
  candidateProfile: {
    matchReason: string;
    strengths: string[];
    relevantExperience: string;
  };
  
  weaknessesAndGaps: Array<{
    gap: string;
    situation: string;
    mitigation: string;
  }>;
  
  careerStepAnalysis?: {
    currentLevel: string;
    targetLevel: string;
    gapAnalysis: string;
    transferableSkills: string[];
    keyCompetencies: string[];
    talkingPoints: string[];
    expectedQuestions: string[];
  };
  
  salaryNegotiation?: {
    strategy: string;
    marketContext: string;
    argumentPoints: string[];
    timing: string;
  };
  
  // Interview 1 specific - Full company & position info
  company?: {
    briefing: string;
    culture: string;
    values: string[];
    highlights: string[];
    teamInfo: string;
  };
  
  position?: {
    overview: string;
    dailyWork: string;
    keyPoints: string[];
    growthPath: string;
  };
  
  // Interview 2 specific - Manager & technical depth
  secondRound?: {
    companyReminder: string;
    managerProfile: string;
    managerExpectations: string[];
    technicalFocus: string[];
    expectedCases: string[];
    projectExamples: string[];
    positionSummary: string;
  };
  
  // Trial Day specific - Team & practical tips
  trialDay?: {
    daySchedule: string;
    teamMembers: string;
    processesToObserve: string[];
    practicalTasks: string[];
    officeEtiquette: string[];
    dresscode: string;
    lunchInfo: string;
  };
  
  interviewPrep: {
    whatToExpect: string;
    tips: string[];
    bodyLanguage: string[];
    dosAndDonts: {
      dos: string[];
      donts: string[];
    };
  };
  
  yourPreparation: {
    questionsToAsk: string[];
    checklist: string[];
    followUpInfo: string;
  };
}

interface InterviewPrepCreatorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: any;
  job: any;
  client: any;
  matchData: any;
  commuteData: any;
  stage: string;
  placementId: string;
  onDocumentCreated?: () => void;
}

const FOCUS_AREAS = [
  {
    id: "weaknesses",
    label: "Schwächen betonen",
    description: "Fokus auf Entwicklungsbereiche",
    icon: AlertCircle,
  },
  {
    id: "salary",
    label: "Gehaltsverhandlung",
    description: "Tipps für Gehaltsgespräche",
    icon: Wallet,
  },
  {
    id: "technical",
    label: "Fachliche Tiefe",
    description: "Technische Fragen & Tests",
    icon: Briefcase,
  },
  {
    id: "culture",
    label: "Kulturelle Passung",
    description: "Team-Fit & Unternehmenskultur",
    icon: Heart,
  },
  {
    id: "leadership",
    label: "Führungsposition",
    description: "Management & Leadership",
    icon: Crown,
  },
];

const INTERVIEW_PHASES = [
  { value: "Interview 1", label: "Interview 1", description: "Erstes Kennenlernen" },
  { value: "Interview 2", label: "Interview 2", description: "Fachliches Gespräch" },
  { value: "Trial Day", label: "Trial Day", description: "Probetag / Schnuppertag" },
];

// Inline Edit Component using contentEditable
function InlineEdit({ 
  value, 
  onChange, 
  className = "",
  multiline = false 
}: { 
  value: string; 
  onChange: (value: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  
  const handleBlur = () => {
    if (ref.current) {
      const newValue = ref.current.textContent || '';
      if (newValue !== value) {
        onChange(newValue);
      }
    }
  };

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={`outline-none focus:bg-primary/5 rounded px-0.5 -mx-0.5 cursor-text transition-colors hover:bg-muted/50 ${className}`}
      onBlur={handleBlur}
      dangerouslySetInnerHTML={{ __html: value }}
      style={{ whiteSpace: multiline ? 'pre-wrap' : 'normal' }}
    />
  );
}

// Inline Edit for List Items
function InlineListItem({ 
  value, 
  onChange,
  bullet = "•",
  className = ""
}: { 
  value: string; 
  onChange: (value: string) => void;
  bullet?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  
  const handleBlur = () => {
    if (ref.current) {
      const newValue = ref.current.textContent || '';
      if (newValue !== value) {
        onChange(newValue);
      }
    }
  };

  return (
    <li className={`flex items-start gap-1.5 ${className}`}>
      <span className="text-primary flex-shrink-0 select-none">{bullet}</span>
      <span
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="outline-none focus:bg-primary/5 rounded px-0.5 -mx-0.5 cursor-text flex-1 transition-colors hover:bg-muted/50"
        onBlur={handleBlur}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    </li>
  );
}

export function InterviewPrepCreatorDialog({
  isOpen,
  onClose,
  candidate,
  job,
  client,
  matchData,
  commuteData,
  stage,
  placementId,
  onDocumentCreated,
}: InterviewPrepCreatorDialogProps) {
  // Configuration state
  const [selectedPhase, setSelectedPhase] = useState(stage || "Interview 1");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [language, setLanguage] = useState<"de" | "en">("de");
  const [customInstructions, setCustomInstructions] = useState("");
  
  // Content state
  const [prepContent, setPrepContent] = useState<PrepContentV3 | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activePreviewPage, setActivePreviewPage] = useState("page1");
  const [zoomLevel, setZoomLevel] = useState(0.55);
  
  // Save/Load state
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [existingDocId, setExistingDocId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { t } = useTranslation();

  // Save document to database
  const saveDocument = useCallback(async (content: PrepContentV3) => {
    if (!placementId || !content) return;
    
    setIsSaving(true);
    setSaveStatus('saving');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Check if document already exists
      const { data: existing } = await supabase
        .from('interview_prep_documents')
        .select('id')
        .eq('placement_id', placementId)
        .eq('phase', selectedPhase)
        .maybeSingle();
      
      // Cast content to Json type
      const contentJson = JSON.parse(JSON.stringify(content));
      
      if (existing?.id) {
        // Update existing document
        const { error } = await supabase
          .from('interview_prep_documents')
          .update({
            content: contentJson,
            focus_areas: focusAreas,
            language: language,
            custom_instructions: customInstructions,
            file_name: `Interview-Vorbereitung_${candidate?.name}_${selectedPhase}`,
          })
          .eq('id', existing.id);
        
        if (error) throw error;
        setExistingDocId(existing.id);
      } else {
        // Insert new document
        const { data, error } = await supabase
          .from('interview_prep_documents')
          .insert([{
            placement_id: placementId,
            phase: selectedPhase,
            content: contentJson,
            focus_areas: focusAreas,
            language: language,
            custom_instructions: customInstructions,
            created_by: user.id,
            file_name: `Interview-Vorbereitung_${candidate?.name}_${selectedPhase}`,
            file_url: '',
          }])
          .select('id')
          .single();
        
        if (error) throw error;
        if (data?.id) {
          setExistingDocId(data.id);
        }
      }
      
      setSaveStatus('saved');
      
      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
      
    } catch (error) {
      console.error('Error saving document:', error);
      setSaveStatus('idle');
    } finally {
      setIsSaving(false);
    }
  }, [placementId, selectedPhase, focusAreas, language, customInstructions, candidate?.name]);

  // Debounced save for content changes
  const debouncedSave = useMemo(
    () => debounce((content: PrepContentV3) => {
      saveDocument(content);
    }, 2000),
    [saveDocument]
  );

  // Load existing document
  const loadExistingDocument = useCallback(async () => {
    if (!placementId) return;
    
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('interview_prep_documents')
        .select('*')
        .eq('placement_id', placementId)
        .eq('phase', selectedPhase)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data?.content) {
        setPrepContent(data.content as unknown as PrepContentV3);
        setFocusAreas(data.focus_areas || []);
        setLanguage((data.language as "de" | "en") || "de");
        setCustomInstructions(data.custom_instructions || "");
        setExistingDocId(data.id);
      } else {
        // No existing document - reset state
        setPrepContent(null);
        setExistingDocId(null);
      }
    } catch (error) {
      console.error('Error loading document:', error);
    } finally {
      setIsLoading(false);
    }
  }, [placementId, selectedPhase]);

  // Load document when dialog opens or phase changes
  useEffect(() => {
    if (isOpen && placementId) {
      loadExistingDocument();
    }
  }, [isOpen, placementId, selectedPhase, loadExistingDocument]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      debouncedSave.cancel();
      setExistingDocId(null);
      setSaveStatus('idle');
    }
  }, [isOpen, debouncedSave]);

  const handleToggleFocusArea = (areaId: string) => {
    setFocusAreas((prev) =>
      prev.includes(areaId)
        ? prev.filter((id) => id !== areaId)
        : [...prev, areaId]
    );
  };

  const handleGenerateContent = async () => {
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get recruiter profile for contact info
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone, email')
        .eq('id', user?.id)
        .single();
      
      const response = await supabase.functions.invoke('generate-interview-prep', {
        body: {
          candidate,
          job,
          client,
          matchData: {
            score: matchData?.match_score,
            strengths: matchData?.match_strengths,
            gaps: matchData?.match_gaps,
            summary: matchData?.match_summary,
          },
          commuteData,
          stage: selectedPhase,
          focusAreas,
          customInstructions,
          language,
          placementId,
          userId: user?.id,
          recruiterInfo: profile,
          returnJson: true,
        },
      });

      if (response.error) throw response.error;

      const content = response.data as PrepContentV3;
      setPrepContent(content);
      
      // Save immediately after generation
      await saveDocument(content);
      
      toast({
        title: t("interviewPrep.contentGenerated"),
        description: t("interviewPrep.contentGeneratedDesc"),
      });
    } catch (error) {
      console.error('Error generating content:', error);
      toast({
        title: t("toast.error"),
        description: t("interviewPrep.generateError"),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!prepContent) return;
    
    setIsDownloading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const response = await supabase.functions.invoke('generate-interview-prep', {
        body: {
          candidate,
          job,
          client,
          matchData: {
            score: matchData?.match_score,
            strengths: matchData?.match_strengths,
            gaps: matchData?.match_gaps,
            summary: matchData?.match_summary,
          },
          commuteData,
          stage: selectedPhase,
          focusAreas,
          customInstructions,
          language,
          placementId,
          userId: user?.id,
          prepContent,
          returnJson: false,
        },
      });

      if (response.error) throw response.error;

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Interview-Vorbereitung_${candidate?.name?.replace(/\s+/g, '_')}_${selectedPhase.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t("interviewPrep.pdfCreated"),
        description: t("interviewPrep.pdfCreatedDesc"),
      });
      
      onDocumentCreated?.();
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: t("toast.error"),
        description: t("interviewPrep.pdfError"),
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Content update helpers
  const updateNestedContent = useCallback((path: string, value: any) => {
    if (!prepContent) return;
    
    const keys = path.split('.');
    const newContent = JSON.parse(JSON.stringify(prepContent));
    let current = newContent;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key.includes('[')) {
        const [arrKey, idx] = key.split('[');
        const index = parseInt(idx.replace(']', ''));
        current = current[arrKey][index];
      } else {
        current = current[key];
      }
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey.includes('[')) {
      const [arrKey, idx] = lastKey.split('[');
      const index = parseInt(idx.replace(']', ''));
      current[arrKey][index] = value;
    } else {
      current[lastKey] = value;
    }
    
    setPrepContent(newContent);
    
    // Trigger debounced save
    debouncedSave(newContent);
  }, [prepContent, debouncedSave]);

  const handleClose = () => {
    debouncedSave.cancel();
    setPrepContent(null);
    setFocusAreas([]);
    setCustomInstructions("");
    setExistingDocId(null);
    setSaveStatus('idle');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[95vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Interview-Vorbereitung für {candidate?.name}
            <Badge variant="outline" className="ml-2">{selectedPhase}</Badge>
          </DialogTitle>
        </DialogHeader>

        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
          {/* Left Panel - Configuration */}
          <ResizablePanel defaultSize={30} minSize={25} maxSize={40}>
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                {/* Phase Selection */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Interview-Phase</Label>
                  <RadioGroup
                    value={selectedPhase}
                    onValueChange={setSelectedPhase}
                    className="space-y-2"
                  >
                    {INTERVIEW_PHASES.map((phase) => (
                      <div
                        key={phase.value}
                        className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedPhase === phase.value
                            ? "bg-primary/5 border-primary"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedPhase(phase.value)}
                      >
                        <RadioGroupItem value={phase.value} id={phase.value} />
                        <div className="flex-1">
                          <Label htmlFor={phase.value} className="cursor-pointer font-medium text-sm">
                            {phase.label}
                          </Label>
                          <p className="text-xs text-muted-foreground">{phase.description}</p>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Focus Areas */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Fokus-Bereiche (optional)</Label>
                  <div className="space-y-2">
                    {FOCUS_AREAS.map((area) => {
                      const Icon = area.icon;
                      return (
                        <div
                          key={area.id}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                            focusAreas.includes(area.id)
                              ? "bg-primary/5 border-primary"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => handleToggleFocusArea(area.id)}
                        >
                          <Checkbox
                            id={area.id}
                            checked={focusAreas.includes(area.id)}
                            onCheckedChange={() => handleToggleFocusArea(area.id)}
                          />
                          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <Label htmlFor={area.id} className="cursor-pointer font-medium text-sm">
                              {area.label}
                            </Label>
                            <p className="text-xs text-muted-foreground truncate">{area.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Language */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Sprache</Label>
                  <RadioGroup
                    value={language}
                    onValueChange={(v) => setLanguage(v as "de" | "en")}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="de" id="lang-de" />
                      <Label htmlFor="lang-de" className="cursor-pointer text-sm">🇩🇪 Deutsch</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="en" id="lang-en" />
                      <Label htmlFor="lang-en" className="cursor-pointer text-sm">🇬🇧 English</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Custom Instructions */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Zusätzliche Hinweise</Label>
                  <Textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="z.B. 'Der Kandidat ist nervös - bitte beruhigende Tipps einbauen'"
                    className="min-h-[80px] text-sm"
                  />
                </div>

                {/* Generate Button */}
                <Button 
                  onClick={handleGenerateContent}
                  disabled={isGenerating}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generiere Inhalte...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Inhalte generieren
                    </>
                  )}
                </Button>
              </div>
            </ScrollArea>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Preview */}
          <ResizablePanel defaultSize={70}>
            <div className="h-full flex flex-col bg-muted/30">
              {/* Preview Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
                <div className="flex items-center gap-2">
                  <Tabs value={activePreviewPage} onValueChange={setActivePreviewPage}>
                    <TabsList className="h-8">
                      <TabsTrigger value="page1" className="text-xs px-3">Seite 1 - Über dich</TabsTrigger>
                      <TabsTrigger value="page2" className="text-xs px-3">Seite 2 - Die Stelle</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {prepContent && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      Texte direkt bearbeiten
                      {saveStatus === 'saving' && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Cloud className="h-3 w-3 animate-pulse" />
                        </span>
                      )}
                      {saveStatus === 'saved' && (
                        <span className="flex items-center gap-1 text-primary">
                          <Check className="h-3 w-3" />
                          Gespeichert
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Zoom Controls */}
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setZoomLevel(Math.max(0.3, zoomLevel - 0.1))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-xs w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  {/* Download Button */}
                  <Button
                    onClick={handleDownloadPdf}
                    disabled={!prepContent || isDownloading}
                    size="sm"
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    PDF erstellen
                  </Button>
                </div>
              </div>

              {/* Preview Content */}
              <ScrollArea className="flex-1">
                <div className="p-6 flex justify-center">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                      <Loader2 className="h-12 w-12 mb-4 animate-spin opacity-40" />
                      <p className="text-sm">Lade gespeichertes Dokument...</p>
                    </div>
                  ) : !prepContent ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                      <Target className="h-16 w-16 mb-4 opacity-20" />
                      <p className="text-lg font-medium mb-2">Noch keine Inhalte generiert</p>
                      <p className="text-sm max-w-md">
                        Wähle links die Interview-Phase und Fokus-Bereiche aus, 
                        dann klicke auf "Inhalte generieren"
                      </p>
                    </div>
                  ) : (
                    <div 
                      className="origin-top transition-transform duration-200"
                      style={{ transform: `scale(${zoomLevel})` }}
                    >
                      {activePreviewPage === "page1" ? (
                        <PreviewPage1V3 
                          content={prepContent}
                          candidate={candidate}
                          job={job}
                          client={client}
                          phase={selectedPhase}
                          language={language}
                          updateContent={updateNestedContent}
                        />
                      ) : (
                        <PreviewPage2V3 
                          content={prepContent}
                          candidate={candidate}
                          job={job}
                          client={client}
                          phase={selectedPhase}
                          language={language}
                          updateContent={updateNestedContent}
                        />
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </DialogContent>
    </Dialog>
  );
}

// Page 1 Preview - Two Column Layout
function PreviewPage1V3({ 
  content, 
  candidate, 
  job, 
  client, 
  phase,
  language,
  updateContent
}: { 
  content: PrepContentV3;
  candidate: any;
  job: any;
  client: any;
  phase: string;
  language: string;
  updateContent: (path: string, value: any) => void;
}) {
  const isEnglish = language === "en";
  
  return (
    <Card className="w-[595px] min-h-[842px] p-6 shadow-lg cv-light-mode flex flex-col" style={{ backgroundColor: 'white' }}>
      {/* Header */}
      <div className="border-b-2 border-primary pb-3 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-lg font-bold text-primary">
              {isEnglish ? "INTERVIEW PREPARATION" : "INTERVIEW-VORBEREITUNG"}
            </h1>
            <p className="text-xs text-muted-foreground">{phase} • {format(new Date(), "dd.MM.yyyy")}</p>
          </div>
          <div className="text-right text-[10px]">
            <p className="font-semibold">{candidate?.name}</p>
            <p className="text-muted-foreground">{job?.title}</p>
            <p className="text-muted-foreground">{client?.name || job?.company}</p>
          </div>
        </div>
      </div>

      {/* Introduction Section - Full Width */}
      <div className="bg-primary/5 rounded-lg p-3 mb-4 text-[9px]">
        <p className="font-semibold text-primary mb-1">
          <InlineEdit 
            value={content.introduction.greeting}
            onChange={(v) => updateContent('introduction.greeting', v)}
          />
        </p>
        <p className="mb-2">
          <InlineEdit 
            value={content.introduction.documentPurpose}
            onChange={(v) => updateContent('introduction.documentPurpose', v)}
            multiline
          />
        </p>
        <p className="text-[8px] italic">
          <InlineEdit 
            value={content.introduction.recruiterNote}
            onChange={(v) => updateContent('introduction.recruiterNote', v)}
          />
        </p>
        {content.introduction.recruiterContact && (
          <p className="text-[8px] mt-1 flex items-center gap-1">
            <Phone className="h-2.5 w-2.5" />
            <InlineEdit 
              value={content.introduction.recruiterContact}
              onChange={(v) => updateContent('introduction.recruiterContact', v)}
            />
          </p>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-4 flex-1">
        {/* Left Column */}
        <div className="space-y-3">
          {/* Profile Section */}
          <div>
            <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
              <User className="h-3 w-3" />
              {isEnglish ? "Your Profile" : "Dein Profil"}
            </h2>
            <div className="bg-green-50 rounded p-2 text-[8px]">
              <p className="font-semibold text-green-800 mb-1">
                {isEnglish ? "Why you were selected:" : "Warum du ausgewählt wurdest:"}
              </p>
              <p className="text-green-700 mb-2">
                <InlineEdit 
                  value={content.candidateProfile.matchReason}
                  onChange={(v) => updateContent('candidateProfile.matchReason', v)}
                  multiline
                />
              </p>
              <p className="font-semibold text-green-800 mb-1">
                {isEnglish ? "Your Strengths:" : "Deine Stärken:"}
              </p>
              <ul className="space-y-0.5">
                {content.candidateProfile.strengths.map((strength, i) => (
                  <InlineListItem
                    key={i}
                    value={strength}
                    onChange={(v) => updateContent(`candidateProfile.strengths[${i}]`, v)}
                    bullet="✓"
                    className="text-green-700"
                  />
                ))}
              </ul>
            </div>
          </div>

          {/* Weaknesses Section */}
          <div>
            <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
              <AlertCircle className="h-3 w-3" />
              {isEnglish ? "Potential Challenges" : "Potenzielle Herausforderungen"}
            </h2>
            <div className="space-y-1.5">
              {content.weaknessesAndGaps.map((item, i) => (
                <div key={i} className="bg-amber-50 rounded p-2 text-[8px]">
                  <p className="font-semibold text-amber-800">
                    <InlineEdit 
                      value={item.gap}
                      onChange={(v) => updateContent(`weaknessesAndGaps[${i}].gap`, v)}
                    />
                  </p>
                  <p className="text-amber-600 text-[7px] italic mt-0.5">
                    {isEnglish ? "May come up:" : "Könnte aufkommen:"}{" "}
                    <InlineEdit 
                      value={item.situation}
                      onChange={(v) => updateContent(`weaknessesAndGaps[${i}].situation`, v)}
                    />
                  </p>
                  <p className="text-amber-700 mt-1">
                    → <InlineEdit 
                      value={item.mitigation}
                      onChange={(v) => updateContent(`weaknessesAndGaps[${i}].mitigation`, v)}
                    />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          {/* Career Step Analysis (if applicable) */}
          {content.careerStepAnalysis && (
            <div>
              <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                <TrendingUp className="h-3 w-3" />
                {isEnglish ? "Career Step Analysis" : "Karriereschritt-Analyse"}
              </h2>
              <div className="bg-blue-50 rounded p-2 text-[8px]">
                <p className="text-blue-800 font-semibold mb-1">
                  <InlineEdit 
                    value={content.careerStepAnalysis.currentLevel}
                    onChange={(v) => updateContent('careerStepAnalysis.currentLevel', v)}
                  />
                  {" → "}
                  <InlineEdit 
                    value={content.careerStepAnalysis.targetLevel}
                    onChange={(v) => updateContent('careerStepAnalysis.targetLevel', v)}
                  />
                </p>
                <p className="text-blue-700 text-[7px] mb-2">
                  <InlineEdit 
                    value={content.careerStepAnalysis.gapAnalysis}
                    onChange={(v) => updateContent('careerStepAnalysis.gapAnalysis', v)}
                    multiline
                  />
                </p>
                
                <p className="font-semibold text-blue-900 mb-0.5 text-[7px]">
                  {isEnglish ? "Key Competencies:" : "Wichtige Kompetenzen:"}
                </p>
                <ul className="space-y-0.5 mb-2 text-[7px]">
                  {content.careerStepAnalysis.keyCompetencies.map((comp, i) => (
                    <InlineListItem
                      key={i}
                      value={comp}
                      onChange={(v) => updateContent(`careerStepAnalysis.keyCompetencies[${i}]`, v)}
                      className="text-blue-700"
                    />
                  ))}
                </ul>
                
                <p className="font-semibold text-blue-900 mb-0.5 text-[7px]">
                  {isEnglish ? "Talking Points:" : "Im Gespräch betonen:"}
                </p>
                <ul className="space-y-0.5 text-[7px]">
                  {content.careerStepAnalysis.talkingPoints.map((point, i) => (
                    <InlineListItem
                      key={i}
                      value={point}
                      onChange={(v) => updateContent(`careerStepAnalysis.talkingPoints[${i}]`, v)}
                      bullet="→"
                      className="text-blue-700"
                    />
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Salary Negotiation (if applicable) */}
          {content.salaryNegotiation && (
            <div>
              <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                <Wallet className="h-3 w-3" />
                {isEnglish ? "Salary Negotiation" : "Gehaltsverhandlung"}
              </h2>
              <div className="bg-emerald-50 rounded p-2 text-[8px]">
                <p className="text-emerald-800 mb-1">
                  <InlineEdit 
                    value={content.salaryNegotiation.strategy}
                    onChange={(v) => updateContent('salaryNegotiation.strategy', v)}
                    multiline
                  />
                </p>
                <p className="text-emerald-600 text-[7px] italic mb-1">
                  <InlineEdit 
                    value={content.salaryNegotiation.marketContext}
                    onChange={(v) => updateContent('salaryNegotiation.marketContext', v)}
                  />
                </p>
                <p className="font-semibold text-emerald-900 mb-0.5 text-[7px]">
                  {isEnglish ? "Arguments:" : "Argumente:"}
                </p>
                <ul className="space-y-0.5 text-[7px]">
                  {content.salaryNegotiation.argumentPoints.map((point, i) => (
                    <InlineListItem
                      key={i}
                      value={point}
                      onChange={(v) => updateContent(`salaryNegotiation.argumentPoints[${i}]`, v)}
                      bullet="€"
                      className="text-emerald-700"
                    />
                  ))}
                </ul>
                <p className="text-emerald-600 text-[7px] mt-1 italic">
                  {isEnglish ? "When to bring up:" : "Wann ansprechen:"}{" "}
                  <InlineEdit 
                    value={content.salaryNegotiation.timing}
                    onChange={(v) => updateContent('salaryNegotiation.timing', v)}
                  />
                </p>
              </div>
            </div>
          )}

          {/* Relevant Experience */}
          {!content.careerStepAnalysis && (
            <div>
              <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                <BookOpen className="h-3 w-3" />
                {isEnglish ? "Relevant Experience" : "Relevante Erfahrung"}
              </h2>
              <div className="bg-slate-50 rounded p-2 text-[8px]">
                <p className="text-slate-700">
                  <InlineEdit 
                    value={content.candidateProfile.relevantExperience}
                    onChange={(v) => updateContent('candidateProfile.relevantExperience', v)}
                    multiline
                  />
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-3 border-t text-[7px] text-muted-foreground flex justify-between">
        <span>{isEnglish ? "Page 1 of 2" : "Seite 1 von 2"}</span>
        <span>Beckett Stone</span>
      </div>
    </Card>
  );
}

// Page 2 Preview - Two Column Layout
function PreviewPage2V3({ 
  content, 
  candidate, 
  job, 
  client, 
  phase,
  language,
  updateContent
}: { 
  content: PrepContentV3;
  candidate: any;
  job: any;
  client: any;
  phase: string;
  language: string;
  updateContent: (path: string, value: any) => void;
}) {
  const isEnglish = language === "en";
  
  return (
    <Card className="w-[595px] min-h-[842px] p-6 shadow-lg cv-light-mode flex flex-col" style={{ backgroundColor: 'white' }}>
      {/* Header */}
      <div className="border-b border-muted pb-2 mb-3">
        <div className="flex justify-between items-center">
          <h1 className="text-sm font-bold text-primary">
            {candidate?.name} • {phase}
          </h1>
          <p className="text-xs text-muted-foreground">{client?.name || job?.company}</p>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-4 flex-1">
        {/* Left Column */}
        <div className="space-y-3">
          {/* Interview 1: Company & Position Section */}
          {phase === "Interview 1" && content.company && (
            <>
              {/* Company Section */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <Building2 className="h-3 w-3" />
                  {isEnglish ? "The Company" : "Das Unternehmen"}
                </h2>
                <div className="text-[8px] space-y-1.5">
                  <p>
                    <InlineEdit 
                      value={content.company.briefing}
                      onChange={(v) => updateContent('company.briefing', v)}
                      multiline
                    />
                  </p>
                  <div className="bg-slate-50 rounded p-1.5">
                    <p className="font-semibold text-[7px] mb-0.5">{isEnglish ? "Culture:" : "Kultur:"}</p>
                    <p className="text-[7px]">
                      <InlineEdit 
                        value={content.company.culture}
                        onChange={(v) => updateContent('company.culture', v)}
                      />
                    </p>
                  </div>
                  {content.company.values.length > 0 && (
                    <div>
                      <p className="font-semibold text-[7px] mb-0.5">{isEnglish ? "Values:" : "Werte:"}</p>
                      <div className="flex flex-wrap gap-1">
                        {content.company.values.map((value, i) => (
                          <span key={i} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[7px]">
                            <InlineEdit 
                              value={value}
                              onChange={(v) => updateContent(`company.values[${i}]`, v)}
                            />
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {content.company.highlights.map((highlight, i) => (
                      <InlineListItem
                        key={i}
                        value={highlight}
                        onChange={(v) => updateContent(`company.highlights[${i}]`, v)}
                      />
                    ))}
                  </ul>
                  {content.company.teamInfo && (
                    <div className="bg-blue-50 rounded p-1.5 flex items-start gap-1">
                      <Users className="h-2.5 w-2.5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <p className="text-[7px] text-blue-700">
                        <InlineEdit 
                          value={content.company.teamInfo}
                          onChange={(v) => updateContent('company.teamInfo', v)}
                        />
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Position Section */}
              {content.position && (
                <div>
                  <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                    <Briefcase className="h-3 w-3" />
                    {isEnglish ? "The Position" : "Die Position"}
                  </h2>
                  <div className="text-[8px] space-y-1.5">
                    <p>
                      <InlineEdit 
                        value={content.position.overview}
                        onChange={(v) => updateContent('position.overview', v)}
                        multiline
                      />
                    </p>
                    <div className="bg-slate-50 rounded p-1.5">
                      <p className="font-semibold text-[7px] mb-0.5">{isEnglish ? "Daily Work:" : "Tägliche Arbeit:"}</p>
                      <p className="text-[7px]">
                        <InlineEdit 
                          value={content.position.dailyWork}
                          onChange={(v) => updateContent('position.dailyWork', v)}
                        />
                      </p>
                    </div>
                    <ul className="space-y-0.5">
                      {content.position.keyPoints.map((point, i) => (
                        <InlineListItem
                          key={i}
                          value={point}
                          onChange={(v) => updateContent(`position.keyPoints[${i}]`, v)}
                        />
                      ))}
                    </ul>
                    <p className="text-[7px] italic text-muted-foreground">
                      <TrendingUp className="h-2 w-2 inline mr-0.5" />
                      <InlineEdit 
                        value={content.position.growthPath}
                        onChange={(v) => updateContent('position.growthPath', v)}
                      />
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Interview 2: Second Round Section */}
          {phase === "Interview 2" && content.secondRound && (
            <>
              {/* Company Reminder */}
              <div className="bg-slate-50 rounded p-2 text-[8px]">
                <p className="text-slate-600 italic">
                  <InlineEdit 
                    value={content.secondRound.companyReminder}
                    onChange={(v) => updateContent('secondRound.companyReminder', v)}
                  />
                </p>
              </div>

              {/* Manager Profile */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <Crown className="h-3 w-3" />
                  {isEnglish ? "Your Potential Manager" : "Dein potenzieller Vorgesetzter"}
                </h2>
                <div className="text-[8px] space-y-1.5">
                  <p className="bg-blue-50 rounded p-2">
                    <InlineEdit 
                      value={content.secondRound.managerProfile}
                      onChange={(v) => updateContent('secondRound.managerProfile', v)}
                      multiline
                    />
                  </p>
                  <div>
                    <p className="font-semibold text-[7px] mb-1">{isEnglish ? "What managers typically look for:" : "Was Vorgesetzte typischerweise suchen:"}</p>
                    <ul className="space-y-0.5">
                      {content.secondRound.managerExpectations.map((exp, i) => (
                        <InlineListItem
                          key={i}
                          value={exp}
                          onChange={(v) => updateContent(`secondRound.managerExpectations[${i}]`, v)}
                          bullet="→"
                        />
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Technical Focus */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <Briefcase className="h-3 w-3" />
                  {isEnglish ? "Technical Deep Dive" : "Fachliche Vertiefung"}
                </h2>
                <div className="text-[8px] space-y-1.5">
                  <ul className="space-y-0.5">
                    {content.secondRound.technicalFocus.map((topic, i) => (
                      <InlineListItem
                        key={i}
                        value={topic}
                        onChange={(v) => updateContent(`secondRound.technicalFocus[${i}]`, v)}
                        bullet="🎯"
                      />
                    ))}
                  </ul>
                </div>
              </div>

              {/* Position Summary */}
              <div className="bg-slate-50 rounded p-2 text-[7px] italic">
                <p className="font-semibold mb-0.5">{isEnglish ? "Position reminder:" : "Zur Erinnerung:"}</p>
                <InlineEdit 
                  value={content.secondRound.positionSummary}
                  onChange={(v) => updateContent('secondRound.positionSummary', v)}
                />
              </div>
            </>
          )}

          {/* Trial Day: Day Schedule & Team */}
          {phase === "Trial Day" && content.trialDay && (
            <>
              {/* Day Schedule */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <Target className="h-3 w-3" />
                  {isEnglish ? "Your Trial Day" : "Dein Probetag"}
                </h2>
                <div className="text-[8px] space-y-1.5">
                  <div className="bg-blue-50 rounded p-2">
                    <p className="font-semibold text-[7px] mb-1">{isEnglish ? "Typical Schedule:" : "Typischer Ablauf:"}</p>
                    <p>
                      <InlineEdit 
                        value={content.trialDay.daySchedule}
                        onChange={(v) => updateContent('trialDay.daySchedule', v)}
                        multiline
                      />
                    </p>
                  </div>
                </div>
              </div>

              {/* Team */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <Users className="h-3 w-3" />
                  {isEnglish ? "The Team" : "Das Team"}
                </h2>
                <div className="text-[8px] bg-green-50 rounded p-2">
                  <InlineEdit 
                    value={content.trialDay.teamMembers}
                    onChange={(v) => updateContent('trialDay.teamMembers', v)}
                    multiline
                  />
                </div>
              </div>

              {/* Processes to Observe */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <BookOpen className="h-3 w-3" />
                  {isEnglish ? "Pay Attention To" : "Worauf achten"}
                </h2>
                <div className="text-[8px]">
                  <ul className="space-y-0.5">
                    {content.trialDay.processesToObserve.map((process, i) => (
                      <InlineListItem
                        key={i}
                        value={process}
                        onChange={(v) => updateContent(`trialDay.processesToObserve[${i}]`, v)}
                        bullet="👁"
                      />
                    ))}
                  </ul>
                </div>
              </div>

              {/* Practical Tasks */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <Briefcase className="h-3 w-3" />
                  {isEnglish ? "Possible Tasks" : "Mögliche Aufgaben"}
                </h2>
                <div className="text-[8px]">
                  <ul className="space-y-0.5">
                    {content.trialDay.practicalTasks.map((task, i) => (
                      <InlineListItem
                        key={i}
                        value={task}
                        onChange={(v) => updateContent(`trialDay.practicalTasks[${i}]`, v)}
                        bullet="✓"
                      />
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          {/* Interview 2: Expected Cases & Project Examples */}
          {phase === "Interview 2" && content.secondRound && (
            <>
              {/* Expected Cases */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <AlertCircle className="h-3 w-3" />
                  {isEnglish ? "Expected Cases" : "Mögliche Case-Fragen"}
                </h2>
                <div className="text-[8px] bg-amber-50 rounded p-2">
                  <ul className="space-y-0.5">
                    {content.secondRound.expectedCases.map((caseQ, i) => (
                      <InlineListItem
                        key={i}
                        value={caseQ}
                        onChange={(v) => updateContent(`secondRound.expectedCases[${i}]`, v)}
                        bullet="❓"
                      />
                    ))}
                  </ul>
                </div>
              </div>

              {/* Project Examples */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <BookOpen className="h-3 w-3" />
                  {isEnglish ? "Examples to Mention" : "Beispiele die du nennen kannst"}
                </h2>
                <div className="text-[8px] bg-green-50 rounded p-2">
                  <ul className="space-y-0.5">
                    {content.secondRound.projectExamples.map((example, i) => (
                      <InlineListItem
                        key={i}
                        value={example}
                        onChange={(v) => updateContent(`secondRound.projectExamples[${i}]`, v)}
                        bullet="→"
                        className="text-green-700"
                      />
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* Trial Day: Office Etiquette, Dresscode, Lunch */}
          {phase === "Trial Day" && content.trialDay && (
            <>
              {/* Office Etiquette */}
              <div>
                <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
                  <Building2 className="h-3 w-3" />
                  {isEnglish ? "Office Etiquette" : "Verhalten im Büro"}
                </h2>
                <div className="text-[8px]">
                  <ul className="space-y-0.5">
                    {content.trialDay.officeEtiquette.map((tip, i) => (
                      <InlineListItem
                        key={i}
                        value={tip}
                        onChange={(v) => updateContent(`trialDay.officeEtiquette[${i}]`, v)}
                        bullet="✓"
                      />
                    ))}
                  </ul>
                </div>
              </div>

              {/* Dresscode & Lunch */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded p-2 text-[8px]">
                  <p className="font-semibold text-[7px] mb-1">👔 {isEnglish ? "Dresscode" : "Dresscode"}</p>
                  <InlineEdit 
                    value={content.trialDay.dresscode}
                    onChange={(v) => updateContent('trialDay.dresscode', v)}
                  />
                </div>
                <div className="bg-slate-50 rounded p-2 text-[8px]">
                  <p className="font-semibold text-[7px] mb-1">🍽️ {isEnglish ? "Lunch" : "Mittagspause"}</p>
                  <InlineEdit 
                    value={content.trialDay.lunchInfo}
                    onChange={(v) => updateContent('trialDay.lunchInfo', v)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Interview Tips - Always shown */}
          <div>
            <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
              <MessageSquare className="h-3 w-3" />
              {isEnglish ? `Tips for ${phase}` : `Tipps für ${phase}`}
            </h2>
            <div className="text-[8px] space-y-1.5">
              <p className="bg-primary/5 rounded p-1.5 text-[7px]">
                <InlineEdit 
                  value={content.interviewPrep.whatToExpect}
                  onChange={(v) => updateContent('interviewPrep.whatToExpect', v)}
                  multiline
                />
              </p>
              <ul className="space-y-0.5">
                {content.interviewPrep.tips.map((tip, i) => (
                  <InlineListItem
                    key={i}
                    value={tip}
                    onChange={(v) => updateContent(`interviewPrep.tips[${i}]`, v)}
                    bullet="💡"
                  />
                ))}
              </ul>
              
              {/* Body Language */}
              {content.interviewPrep.bodyLanguage.length > 0 && (
                <div className="bg-purple-50 rounded p-1.5">
                  <p className="font-semibold text-purple-800 text-[7px] mb-0.5">
                    {isEnglish ? "Body Language:" : "Körpersprache:"}
                  </p>
                  <ul className="space-y-0.5 text-[7px]">
                    {content.interviewPrep.bodyLanguage.map((item, i) => (
                      <InlineListItem
                        key={i}
                        value={item}
                        onChange={(v) => updateContent(`interviewPrep.bodyLanguage[${i}]`, v)}
                        bullet="👁"
                        className="text-purple-700"
                      />
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Do's and Don'ts */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-green-50 rounded p-1.5">
                  <p className="font-semibold text-green-800 text-[7px] mb-0.5 flex items-center gap-0.5">
                    <ThumbsUp className="h-2.5 w-2.5" /> Do's
                  </p>
                  <ul className="space-y-0.5 text-[7px]">
                    {content.interviewPrep.dosAndDonts.dos.map((item, i) => (
                      <InlineListItem
                        key={i}
                        value={item}
                        onChange={(v) => updateContent(`interviewPrep.dosAndDonts.dos[${i}]`, v)}
                        bullet="✓"
                        className="text-green-700"
                      />
                    ))}
                  </ul>
                </div>
                <div className="bg-red-50 rounded p-1.5">
                  <p className="font-semibold text-red-800 text-[7px] mb-0.5 flex items-center gap-0.5">
                    <ThumbsDown className="h-2.5 w-2.5" /> Don'ts
                  </p>
                  <ul className="space-y-0.5 text-[7px]">
                    {content.interviewPrep.dosAndDonts.donts.map((item, i) => (
                      <InlineListItem
                        key={i}
                        value={item}
                        onChange={(v) => updateContent(`interviewPrep.dosAndDonts.donts[${i}]`, v)}
                        bullet="✗"
                        className="text-red-700"
                      />
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Your Preparation */}
          <div>
            <h2 className="text-[10px] font-bold text-primary flex items-center gap-1.5 mb-1.5 uppercase">
              <CheckSquare className="h-3 w-3" />
              {isEnglish ? "Your Preparation" : "Deine Vorbereitung"}
            </h2>
            <div className="text-[8px] space-y-1.5">
              {/* Questions to Ask */}
              <div>
                <p className="font-semibold text-[7px] mb-0.5">
                  {isEnglish ? "Questions to Ask:" : "Fragen die du stellen kannst:"}
                </p>
                <ul className="space-y-0.5">
                  {content.yourPreparation.questionsToAsk.map((q, i) => (
                    <InlineListItem
                      key={i}
                      value={q}
                      onChange={(v) => updateContent(`yourPreparation.questionsToAsk[${i}]`, v)}
                      bullet="?"
                    />
                  ))}
                </ul>
              </div>
              
              {/* Checklist */}
              <div className="bg-slate-50 rounded p-1.5">
                <p className="font-semibold text-[7px] mb-0.5">
                  {isEnglish ? "Day-of Checklist:" : "Checkliste für den Tag:"}
                </p>
                <ul className="space-y-0.5 text-[7px]">
                  {content.yourPreparation.checklist.map((item, i) => (
                    <InlineListItem
                      key={i}
                      value={item}
                      onChange={(v) => updateContent(`yourPreparation.checklist[${i}]`, v)}
                      bullet="☐"
                    />
                  ))}
                </ul>
              </div>
              
              {/* Follow-up */}
              <p className="text-[7px] italic text-muted-foreground">
                <InlineEdit 
                  value={content.yourPreparation.followUpInfo}
                  onChange={(v) => updateContent('yourPreparation.followUpInfo', v)}
                />
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-3 border-t text-[7px] text-muted-foreground flex justify-between">
        <span>{isEnglish ? "Page 2 of 2" : "Seite 2 von 2"}</span>
        <span>{isEnglish ? "Good luck!" : "Viel Erfolg!"} 🍀</span>
      </div>
    </Card>
  );
}
