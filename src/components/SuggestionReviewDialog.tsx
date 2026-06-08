import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { estimateDistanceKm } from "@/lib/distanceUtils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Mail, Phone, MapPin, Building2, Euro, Calendar, User, Briefcase, Clock,
  Globe, Award, Target, Home, ChevronLeft, ChevronRight, CheckCircle, X,
  Sparkles, Loader2, PartyPopper, FileText
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface SuggestionItem {
  id: string;
  title?: string;
  similarity: number;
  location?: string;
  location_lat?: number;
  location_lng?: number;
  skills?: string[];
  status?: string;
  client_id?: string;
  clients?: { name: string };
}

interface CandidateData {
  id: string;
  name: string;
  position?: string | null;
  desired_position?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  skills?: string[] | null;
  experience?: string | null;
  current_salary?: string | null;
  desired_salary?: string | null;
  status?: string | null;
  recruiting_status?: string | null;
  industry?: string | null;
  birthdate?: string | null;
  workload?: string | null;
  willing_to_relocate?: string | null;
  max_commute?: string | null;
  reason_for_change?: string | null;
  languages?: Array<{ name: string; level: string }> | null;
  further_education?: Array<{ name: string; institution?: string; date?: string }> | null;
  education?: Array<{ field?: string; degree?: string; endDate?: string; startDate?: string; institution?: string }> | null;
  work_experience?: Array<{ company: string; position: string; duration?: string; startDate?: string; endDate?: string; start_date?: string; end_date?: string; description?: string }> | null;
}

interface SuggestionReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: SuggestionItem[];
  candidateData: CandidateData;
  initialIndex: number;
  onAccept: (jobId: string, jobTitle: string) => Promise<void>;
  onDismiss: (jobId: string) => Promise<void>;
}

function useFullJobData(jobId: string | undefined) {
  return useQuery({
    queryKey: ['full-job-for-review', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, description, requirements, responsibilities, benefits, salary_range, employment_type, experience_level, skills, location, location_lat, location_lng, status, client_id, clients(name)')
        .eq('id', jobId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
    staleTime: 300_000,
  });
}

// --- Notes helpers (reused from CandidateMatchDialog pattern) ---
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
      <div className="prose prose-sm max-w-none text-muted-foreground [&_p]:my-1 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:my-0.5"
        dangerouslySetInnerHTML={{ __html: note.content }}
      />
    </div>
  );
}

function SuggestionCandidateNotesTab({ candidateId, onCountLoaded }: { candidateId: string; onCountLoaded?: (count: number) => void }) {
  const [candidateNotes, setCandidateNotes] = useState<ParsedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotes = async () => {
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
    fetchNotes();
  }, [candidateId]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />;
  if (candidateNotes.length === 0) return <p className="text-sm text-muted-foreground italic">Keine Notizen vorhanden</p>;
  return <div className="space-y-3">{candidateNotes.map(n => <NoteCard key={n.id} note={n} />)}</div>;
}

function SuggestionJobNotesTab({ jobId, onCountLoaded }: { jobId: string; onCountLoaded?: (count: number) => void }) {
  const [jobNotes, setJobNotes] = useState<ParsedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotes = async () => {
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
    fetchNotes();
  }, [jobId]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />;
  if (jobNotes.length === 0) return <p className="text-sm text-muted-foreground italic">Keine Notizen vorhanden</p>;
  return <div className="space-y-3">{jobNotes.map(n => <NoteCard key={n.id} note={n} />)}</div>;
}

function SuggestionClientNotesTab({ clientId, onCountLoaded }: { clientId: string | null | undefined; onCountLoaded?: (count: number) => void }) {
  const [clientNotes, setClientNotes] = useState<ParsedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setClientNotes([]);
      onCountLoaded?.(0);
      setLoading(false);
      return;
    }
    const fetchNotes = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('clients')
        .select('structured_notes')
        .eq('id', clientId)
        .single();
      const notes = data?.structured_notes && Array.isArray(data.structured_notes) ? data.structured_notes as unknown as ParsedNote[] : [];
      setClientNotes(notes);
      onCountLoaded?.(notes.length);
      setLoading(false);
    };
    fetchNotes();
  }, [clientId]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />;
  if (clientNotes.length === 0) return <p className="text-sm text-muted-foreground italic">Keine Notizen vorhanden</p>;
  return <div className="space-y-3">{clientNotes.map(n => <NoteCard key={n.id} note={n} />)}</div>;
}

export function SuggestionReviewDialog({
  isOpen, onClose, suggestions: initialSuggestions, candidateData, initialIndex, onAccept, onDismiss
}: SuggestionReviewDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [remainingIds, setRemainingIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [candidateNotesCount, setCandidateNotesCount] = useState(0);
  const [jobNotesCount, setJobNotesCount] = useState(0);
  const [clientNotesCount, setClientNotesCount] = useState(0);

  // Reset when dialog opens or suggestions change
  useEffect(() => {
    if (isOpen) {
      const ids = initialSuggestions.map(s => s.id);
      setRemainingIds(ids);
      setCurrentIndex(Math.min(initialIndex, ids.length - 1));
    }
  }, [isOpen, initialSuggestions, initialIndex]);

  const currentJobId = remainingIds[currentIndex];
  const currentSuggestion = initialSuggestions.find(s => s.id === currentJobId);
  const { data: fullJob, isLoading: isLoadingJob } = useFullJobData(currentJobId);

  const similarityPercent = currentSuggestion ? Math.round(currentSuggestion.similarity * 100) : 0;

  const handleAccept = useCallback(async () => {
    if (!currentJobId || !fullJob) return;
    setIsProcessing(true);
    try {
      await onAccept(currentJobId, fullJob.title);
      setRemainingIds(prev => {
        const next = prev.filter(id => id !== currentJobId);
        if (currentIndex >= next.length && next.length > 0) {
          setCurrentIndex(next.length - 1);
        }
        return next;
      });
    } finally {
      setIsProcessing(false);
    }
  }, [currentJobId, fullJob, onAccept, currentIndex]);

  const handleDismiss = useCallback(async () => {
    if (!currentJobId) return;
    setIsProcessing(true);
    try {
      await onDismiss(currentJobId);
      setRemainingIds(prev => {
        const next = prev.filter(id => id !== currentJobId);
        if (currentIndex >= next.length && next.length > 0) {
          setCurrentIndex(next.length - 1);
        }
        return next;
      });
    } finally {
      setIsProcessing(false);
    }
  }, [currentJobId, onDismiss, currentIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(i => i - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < remainingIds.length - 1) {
        setCurrentIndex(i => i + 1);
      } else if (e.key === 'Enter' && !isProcessing && remainingIds.length > 0) {
        e.preventDefault();
        handleAccept();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, currentIndex, remainingIds.length, isProcessing, handleAccept]);

  const initials = candidateData.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // Skills overlap calculation
  const candidateSkills = (candidateData.skills || []).map(s => s.toLowerCase());
  const jobSkills = (fullJob?.skills || []).map((s: string) => s.toLowerCase());
  const overlappingSkills = candidateSkills.filter(s => jobSkills.includes(s));
  const missingSkills = jobSkills.filter((s: string) => !candidateSkills.includes(s));

  // All done state
  if (remainingIds.length === 0 && isOpen) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <PartyPopper className="h-12 w-12 text-primary" />
            <h3 className="text-lg font-semibold">Alle Vorschläge bearbeitet</h3>
            <p className="text-sm text-muted-foreground text-center">
              Du hast alle semantischen Vorschläge durchgesehen.
            </p>
            <Button onClick={onClose}>Schliessen</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Air distance calculation
  const airDistanceKm = (() => {
    const cLat = candidateData.location_lat;
    const cLng = candidateData.location_lng;
    const jLat = fullJob?.location_lat;
    const jLng = fullJob?.location_lng;
    if (cLat && cLng && jLat && jLng) {
      return Math.round(estimateDistanceKm(cLat, cLng, jLat, jLng));
    }
    return null;
  })();

  const maxCommuteKm = candidateData.max_commute ? parseInt(candidateData.max_commute.match(/(\d+)/)?.[1] || '0', 10) || null : null;
  const distanceColor = airDistanceKm != null && maxCommuteKm
    ? (airDistanceKm <= maxCommuteKm * 1.5 ? 'text-green-600 dark:text-green-400' : 'text-destructive')
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[95vw] h-[90vh] flex flex-col p-0">
        {/* Compact Header + Comparison merged */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0 border-b">
          <DialogHeader className="mb-0">
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-amber-500" />
                {isLoadingJob ? '...' : fullJob?.title || 'Stelle'}
                {fullJob?.clients?.name && (
                  <span className="text-muted-foreground font-normal text-xs">
                    bei {fullJob.clients.name}
                  </span>
                )}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex(i => i - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
                    {currentIndex + 1} / {remainingIds.length}
                  </span>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={currentIndex >= remainingIds.length - 1}
                    onClick={() => setCurrentIndex(i => i + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Inline comparison bar */}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
            {/* Similarity circle - smaller */}
            <div className="flex items-center gap-1.5">
              <div className="relative w-8 h-8">
                <svg className="w-8 h-8 transform -rotate-90">
                  <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="3" fill="none" className="text-muted/30" />
                  <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="3" fill="none"
                    strokeDasharray={`${(similarityPercent / 100) * 81.7} 81.7`} strokeLinecap="round"
                    className={similarityPercent >= 70 ? 'text-green-500' : similarityPercent >= 50 ? 'text-amber-500' : 'text-orange-500'}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-[10px] font-bold ${similarityPercent >= 70 ? 'text-green-500' : similarityPercent >= 50 ? 'text-amber-500' : 'text-orange-500'}`}>
                    {similarityPercent}%
                  </span>
                </div>
              </div>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Location + Air Distance */}
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{candidateData.location || '–'}</span>
              <span className="text-muted-foreground/50">→</span>
              <span>{fullJob?.location || '–'}</span>
              {airDistanceKm != null && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ml-0.5 ${distanceColor}`}>
                  ~{airDistanceKm} km
                </Badge>
              )}
              {maxCommuteKm && (
                <span className="text-[10px] text-muted-foreground">(max {maxCommuteKm} km)</span>
              )}
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Skills Overlap */}
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">Skills</span>
              {fullJob?.skills && fullJob.skills.length > 0 && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${
                  overlappingSkills.length / fullJob.skills.length >= 0.5
                    ? 'border-green-500/30 text-green-700 dark:text-green-400'
                    : 'border-orange-500/30 text-orange-600 dark:text-orange-400'
                }`}>
                  {overlappingSkills.length}/{fullJob.skills.length}
                </Badge>
              )}
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Salary */}
            <div className="flex items-center gap-1.5">
              <Euro className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{candidateData.desired_salary || '–'}</span>
              <span className="text-muted-foreground/50">|</span>
              <span>{fullJob?.salary_range || '–'}</span>
            </div>
          </div>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 overflow-hidden px-4 pb-1">
          {/* LEFT: Candidate Info */}
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
                      {candidateData.avatar_url && <AvatarImage src={candidateData.avatar_url} />}
                      <AvatarFallback className="bg-primary text-primary-foreground font-medium text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-semibold text-sm hover:text-primary cursor-pointer transition-colors"
                        onClick={() => navigate(`/candidates/${candidateData.id}`)}
                      >
                        {candidateData.name}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {candidateData.position || candidateData.desired_position}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Contact */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs">Kontakt</h4>
                    <div className="space-y-1.5">
                      {candidateData.email && (
                        <div className="flex items-center gap-2 text-xs">
                          <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{candidateData.email}</span>
                        </div>
                      )}
                      {candidateData.phone && (
                        <div className="flex items-center gap-2 text-xs">
                          <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          {candidateData.phone}
                        </div>
                      )}
                      {candidateData.location && (
                        <div className="flex items-center gap-2 text-xs">
                          <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          {candidateData.location}
                        </div>
                      )}
                      {candidateData.birthdate && (
                        <div className="flex items-center gap-2 text-xs">
                          <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          {candidateData.birthdate}
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Status */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs">Status</h4>
                    <div className="flex flex-wrap gap-1">
                      {candidateData.status && <Badge variant="outline" className="text-xs py-0 h-5">{candidateData.status}</Badge>}
                      {candidateData.recruiting_status && <Badge variant="secondary" className="text-xs py-0 h-5">{candidateData.recruiting_status}</Badge>}
                      {candidateData.industry && <Badge variant="outline" className="text-xs py-0 h-5">{candidateData.industry}</Badge>}
                    </div>
                  </div>

                  <Separator />

                  {/* Salary */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs">Gehalt</h4>
                    <div className="space-y-1.5">
                      {candidateData.current_salary && (
                        <div className="flex items-center gap-2 text-xs">
                          <Euro className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">Aktuell:</span> {candidateData.current_salary}
                        </div>
                      )}
                      {candidateData.desired_salary && (
                        <div className="flex items-center gap-2 text-xs">
                          <Target className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">Gewünscht:</span> {candidateData.desired_salary}
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Preferences */}
                  {(candidateData.workload || candidateData.willing_to_relocate || candidateData.max_commute) && (
                    <>
                      <div className="space-y-2">
                        <h4 className="font-medium text-xs">Präferenzen</h4>
                        <div className="space-y-1.5">
                          {candidateData.workload && (
                            <div className="flex items-center gap-2 text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">Workload:</span> {candidateData.workload}
                            </div>
                          )}
                          {candidateData.willing_to_relocate && (
                            <div className="flex items-center gap-2 text-xs">
                              <Home className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">Umzugsbereit:</span> {candidateData.willing_to_relocate}
                            </div>
                          )}
                          {candidateData.max_commute && (
                            <div className="flex items-center gap-2 text-xs">
                              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">Max. Pendelzeit:</span> {candidateData.max_commute}
                            </div>
                          )}
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}

                  {/* Reason for change */}
                  {candidateData.reason_for_change && (
                    <>
                      <div className="space-y-2">
                        <h4 className="font-medium text-xs">Wechselgrund</h4>
                        <p className="text-xs text-muted-foreground">{candidateData.reason_for_change}</p>
                      </div>
                      <Separator />
                    </>
                  )}

                  {/* Skills */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs">Skills</h4>
                    <div className="flex flex-wrap gap-1">
                      {(candidateData.skills || []).map((skill, i) => (
                        <Badge
                          key={i}
                          variant={jobSkills.includes(skill.toLowerCase()) ? "default" : "secondary"}
                          className="text-xs py-0 h-5"
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Languages */}
                  {candidateData.languages && candidateData.languages.length > 0 && (
                    <>
                      <div className="space-y-2">
                        <h4 className="font-medium text-xs">Sprachen</h4>
                        <div className="space-y-1">
                          {candidateData.languages.map((lang, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
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

                  {/* Work Experience */}
                  {candidateData.work_experience && candidateData.work_experience.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-xs">Berufserfahrung</h4>
                      <div className="space-y-3">
                        {candidateData.work_experience.map((exp, i) => (
                          <div key={i} className="space-y-1">
                            <p className="text-xs font-medium">{exp.position}</p>
                            <p className="text-xs text-muted-foreground">{exp.company}</p>
                            <p className="text-xs text-muted-foreground">
                              {exp.duration || `${exp.startDate || exp.start_date || ''} - ${exp.endDate || exp.end_date || 'heute'}`}
                            </p>
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
                  )}

                  {/* Education */}
                  {candidateData.education && candidateData.education.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <h4 className="font-medium text-xs">Ausbildung</h4>
                        <div className="space-y-2">
                          {candidateData.education.map((edu, i) => (
                            <div key={i} className="space-y-0.5">
                              <p className="text-xs font-medium">{edu.degree} {edu.field && `in ${edu.field}`}</p>
                              {edu.institution && <p className="text-xs text-muted-foreground">{edu.institution}</p>}
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

          {/* MIDDLE: Job Info */}
          <div className="flex flex-col overflow-hidden">
            <Card className="flex flex-col h-full overflow-hidden">
              <CardHeader className="flex-shrink-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Briefcase className="h-4 w-4" />
                  Position
                </CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1 px-6">
                {isLoadingJob ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : fullJob ? (
                  <div className="space-y-3 text-sm pb-4">
                    <div>
                      <h3
                        className="font-semibold text-sm hover:text-primary cursor-pointer transition-colors"
                        onClick={() => navigate(`/jobs/${fullJob.id}`)}
                      >
                        {fullJob.title}
                      </h3>
                      {(fullJob as any).clients?.name && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5">
                          <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                          {(fullJob as any).clients.name}
                        </p>
                      )}
                    </div>

                    <Separator />

                    {/* Details */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-xs">Details</h4>
                      <div className="flex flex-wrap gap-1">
                        {fullJob.status && <Badge variant="outline" className="text-xs py-0 h-5">{fullJob.status}</Badge>}
                        {fullJob.employment_type && <Badge variant="secondary" className="text-xs py-0 h-5">{fullJob.employment_type}</Badge>}
                        {fullJob.experience_level && <Badge variant="outline" className="text-xs py-0 h-5">{fullJob.experience_level}</Badge>}
                      </div>
                    </div>

                    <Separator />

                    {/* Base data */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-xs">Basisdaten</h4>
                      <div className="space-y-1.5">
                        {fullJob.location && (
                          <div className="flex items-center gap-2 text-xs">
                            <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            {fullJob.location}
                          </div>
                        )}
                        {fullJob.salary_range && (
                          <div className="flex items-center gap-2 text-xs">
                            <Euro className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            {fullJob.salary_range}
                          </div>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Skills */}
                    {fullJob.skills && fullJob.skills.length > 0 && (
                      <>
                        <div className="space-y-2">
                          <h4 className="font-medium text-xs">Erforderliche Skills</h4>
                          <div className="flex flex-wrap gap-1">
                            {fullJob.skills.map((skill: string, i: number) => (
                              <Badge
                                key={i}
                                variant={candidateSkills.includes(skill.toLowerCase()) ? "default" : "secondary"}
                                className="text-xs py-0 h-5"
                              >
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <Separator />
                      </>
                    )}

                    {/* Description */}
                    {fullJob.description && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-xs">Beschreibung</h4>
                        <div
                          className="text-xs text-muted-foreground prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: fullJob.description }}
                        />
                      </div>
                    )}

                    {/* Responsibilities */}
                    {fullJob.responsibilities && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <h4 className="font-medium text-xs">Aufgaben</h4>
                          <div
                            className="text-xs text-muted-foreground prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: fullJob.responsibilities }}
                          />
                        </div>
                      </>
                    )}

                    {/* Requirements */}
                    {fullJob.requirements && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <h4 className="font-medium text-xs">Anforderungen</h4>
                          <div
                            className="text-xs text-muted-foreground prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: fullJob.requirements }}
                          />
                        </div>
                      </>
                    )}

                    {/* Benefits */}
                    {fullJob.benefits && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <h4 className="font-medium text-xs">Benefits</h4>
                          <div
                            className="text-xs text-muted-foreground prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: fullJob.benefits }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </ScrollArea>
            </Card>
          </div>

          {/* RIGHT: Notes Panel */}
          <div className="flex flex-col overflow-hidden">
            <Card className="flex flex-col h-full overflow-hidden">
              <CardHeader className="flex-shrink-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Notizen
                </CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1 px-6">
                <Tabs defaultValue="candidate" className="pb-4">
                  <TabsList className="w-full mb-3">
                    <TabsTrigger value="candidate" className="flex-1 text-xs">
                      Kandidat
                      {candidateNotesCount > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">{candidateNotesCount}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="job" className="flex-1 text-xs">
                      Stelle
                      {jobNotesCount > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">{jobNotesCount}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="client" className="flex-1 text-xs">
                      Firma
                      {clientNotesCount > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">{clientNotesCount}</Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="candidate">
                    <SuggestionCandidateNotesTab
                      candidateId={candidateData.id}
                      onCountLoaded={setCandidateNotesCount}
                    />
                  </TabsContent>
                  <TabsContent value="job">
                    {currentJobId ? (
                      <SuggestionJobNotesTab
                        key={currentJobId}
                        jobId={currentJobId}
                        onCountLoaded={setJobNotesCount}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Keine Stelle ausgewählt</p>
                    )}
                  </TabsContent>
                  <TabsContent value="client">
                    <SuggestionClientNotesTab
                      key={fullJob?.client_id || 'no-client'}
                      clientId={fullJob?.client_id}
                      onCountLoaded={setClientNotesCount}
                    />
                  </TabsContent>
                </Tabs>
              </ScrollArea>
            </Card>
          </div>
        </div>
        <div className="px-4 py-2 border-t flex items-center justify-between flex-shrink-0">
          <div className="text-[10px] text-muted-foreground">
            ← → navigieren · Enter = annehmen · Esc = schliessen
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              disabled={isProcessing}
              onClick={handleDismiss}
            >
              <X className="h-4 w-4 mr-2" />
              Ablehnen
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={isProcessing || isLoadingJob}
              onClick={handleAccept}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Annehmen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
