import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Mail, Phone, MapPin, Building2, Euro, User, Briefcase, 
  Car, Train, CheckCircle, XCircle, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Sparkles, Globe, Award, GraduationCap,
  Clock, FileText, Zap, Wallet, ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Helper: convert plain text with newlines to HTML bullet points
const formatTextToHtml = (text: string): string => {
  if (!text) return '';
  // If already contains HTML tags, return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  // Split by newlines and filter empty lines
  const lines = text.split(/\n/).filter(line => line.trim());
  if (lines.length <= 1) return text;
  // Convert to bullet list
  return '<ul>' + lines.map(line => `<li>${line.replace(/^[-•·]\s*/, '').trim()}</li>`).join('') + '</ul>';
};

// Helper function to parse notes JSON
interface ParsedNote {
  id: string;
  content: string;
  author: string;
  timestamp: string;
  isImportant?: boolean;
}

const parseNotes = (notesString: string | undefined): ParsedNote[] => {
  if (!notesString) return [];
  try {
    const parsed = JSON.parse(notesString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Fallback for plain-text notes (legacy)
    return [{
      id: Date.now().toString(),
      content: notesString,
      author: "System",
      timestamp: new Date().toISOString()
    }];
  }
};

interface AIMatchDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  match: {
    id: string;
    candidate_id: string;
    job_id: string;
    match_score: number;
    match_reasons: string[];
    status: string;
    candidates: {
      id: string;
      name: string;
      position: string;
      desired_position: string;
      location: string;
      desired_salary: string;
      email?: string;
      phone?: string;
      skills?: string[];
      avatar_url?: string;
      max_commute?: string;
      notes?: string;
      languages?: Array<{ name: string; level: string }>;
      education?: Array<{ field?: string; degree?: string; institution?: string; startDate?: string; endDate?: string }>;
      work_experience?: Array<{ company: string; position: string; startDate?: string; endDate?: string; description?: string }>;
      further_education?: Array<{ name: string; institution?: string; date?: string; description?: string }>;
      industry?: string;
      status?: string;
      birthdate?: string;
      current_salary?: string;
      workload?: string;
      willing_to_relocate?: string;
      experience?: string;
    };
    jobs: {
      id: string;
      title: string;
      location: string;
      salary_range: string;
      description?: string;
      requirements?: string;
      responsibilities?: string;
      benefits?: string;
      skills?: string[];
      employment_type?: string;
      experience_level?: string;
      source_url?: string;
      clients: {
        name: string;
        id?: string;
      } | null;
    };
  };
  onAccept: () => void;
  onReject: () => void;
  isUpdating: boolean;
}

interface CommuteData {
  auto: { duration: string | null; distance: string | null } | null;
  oepnv: { duration: string | null; distance: string | null } | null;
}

// Helper component to load and display job notes from DB
function JobNotesTab({ jobId, onCountLoaded }: { jobId: string; onCountLoaded?: (count: number) => void }) {
  const [jobNotes, setJobNotes] = useState<ParsedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobNotes = async () => {
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
    fetchJobNotes();
  }, [jobId]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />;
  if (jobNotes.length === 0) return <p className="text-sm text-muted-foreground italic">Keine Notizen vorhanden</p>;

  return (
    <div className="space-y-3">
      {jobNotes.map((note) => (
        <div 
          key={note.id} 
          className={cn(
            "p-3 rounded-lg border text-sm",
            note.isImportant 
              ? "border-amber-300 bg-amber-50/50 dark:bg-amber-900/10" 
              : "border-border bg-muted/30"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{note.author}</span>
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(note.timestamp), "dd.MM.yy HH:mm", { locale: de })}
            </span>
          </div>
          <div 
            className="prose prose-sm max-w-none text-muted-foreground [&_p]:my-1 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:my-0.5"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(note.content, { ADD_ATTR: ['target', 'rel'] })
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function AIMatchDetailDialog({ 
  isOpen, 
  onClose, 
  match, 
  onAccept, 
  onReject,
  isUpdating 
}: AIMatchDetailDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [commuteData, setCommuteData] = useState<CommuteData | null>(null);
  const [isLoadingCommute, setIsLoadingCommute] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [candidateNotesCount, setCandidateNotesCount] = useState(0);
  const [jobNotesCount, setJobNotesCount] = useState(0);

  // Calculate candidate notes count from already available data
  useEffect(() => {
    setCandidateNotesCount(parseNotes(match?.candidates?.notes).length);
  }, [match?.candidates?.notes]);

  // Load job notes count immediately
  useEffect(() => {
    if (!match?.jobs?.id) return;
    const loadJobNotesCount = async () => {
      const { data } = await supabase
        .from('jobs')
        .select('structured_notes')
        .eq('id', match.jobs.id)
        .single();
      if (data?.structured_notes && Array.isArray(data.structured_notes)) {
        setJobNotesCount((data.structured_notes as unknown as ParsedNote[]).length);
      }
    };
    loadJobNotesCount();
  }, [match?.jobs?.id]);

  // Calculate commute when dialog opens
  useEffect(() => {
    if (isOpen && match?.candidates?.location && match?.jobs?.location) {
      calculateCommute(match.candidates.location, match.jobs.location);
    }
  }, [isOpen, match?.candidates?.location, match?.jobs?.location]);

  const calculateCommute = async (origin: string, destination: string) => {
    if (!origin || !destination) {
      setCommuteData(null);
      return;
    }

    setIsLoadingCommute(true);
    try {
      const { data, error } = await supabase.functions.invoke('calculate-commute', {
        body: { origin, destination }
      });

      if (error) {
        console.error('Error calculating commute:', error);
        setCommuteData(null);
        return;
      }

      setCommuteData(data);
    } catch (error) {
      console.error('Error with commute:', error);
      setCommuteData(null);
    } finally {
      setIsLoadingCommute(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 65) return 'text-amber-500';
    return 'text-orange-500';
  };

  // Extract missing_skills from match_reasons (encoded as __missing_skills__:["..."])
  const missingSkills: string[] = (() => {
    if (!match.match_reasons) return [];
    for (const reason of match.match_reasons) {
      if (typeof reason === 'string' && reason.startsWith('__missing_skills__:')) {
        try {
          return JSON.parse(reason.replace('__missing_skills__:', ''));
        } catch { return []; }
      }
    }
    return [];
  })();

  // Filter out the encoded missing_skills entry from visible reasons
  const visibleReasons = (match.match_reasons || []).filter(
    (r: string) => typeof r !== 'string' || !r.startsWith('__missing_skills__:')
  );

  // Check commute fit
  const checkCommuteFit = () => {
    const maxCommute = match.candidates?.max_commute;
    const actualDuration = commuteData?.auto?.duration;
    
    if (!maxCommute || !actualDuration) return null;
    
    const maxMinutes = parseInt(maxCommute.replace(/\D/g, '')) || 60;
    let actualMinutes = 0;
    
    if (actualDuration.includes('h')) {
      const hours = parseInt(actualDuration.match(/(\d+)\s*h/)?.[1] || '0');
      const mins = parseInt(actualDuration.match(/(\d+)\s*min/)?.[1] || '0');
      actualMinutes = hours * 60 + mins;
    } else {
      actualMinutes = parseInt(actualDuration.replace(/\D/g, '')) || 0;
    }
    
    if (actualMinutes <= maxMinutes) return 'ok';
    if (actualMinutes <= maxMinutes * 1.2) return 'warning';
    return 'exceeded';
  };

  const commuteFit = checkCommuteFit();
  const candidate = match.candidates;
  const job = match.jobs;

  // Calculate skills overlap
  const skillsOverlap = (() => {
    const candidateSkills = candidate?.skills || [];
    const jobSkills = job?.skills || [];
    if (jobSkills.length === 0) return null;
    
    const matchingSkills = candidateSkills.filter(skill => 
      jobSkills.some(jobSkill => 
        jobSkill.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(jobSkill.toLowerCase())
      )
    );
    
    return {
      matched: matchingSkills.length,
      total: jobSkills.length,
      percentage: Math.round((matchingSkills.length / jobSkills.length) * 100)
    };
  })();

  // Estimate scores based on match_score
  const skillsScore = skillsOverlap ? skillsOverlap.percentage : Math.round(match.match_score * 0.9);
  const experienceScore = Math.round(match.match_score * 1.05);
  const salaryScore = Math.round(match.match_score * 0.95);

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[90vw] w-[1400px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t('aiMatches.matchDetails')}
              </DialogTitle>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-sm">
                  AI Match
                </Badge>
                <span className={`text-2xl font-bold ${getScoreColor(match.match_score)}`}>
                  {match.match_score}%
                </span>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription className="mt-1">
            Detaillierte Informationen über den Kandidaten und die Position
          </DialogDescription>

          {/* AI Analysis Collapsible */}
          <Collapsible open={isAnalysisOpen} onOpenChange={setIsAnalysisOpen} className="mt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI-Analyse anzeigen
                {isAnalysisOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 animate-fade-in">
              <div className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl border p-4 space-y-3">
                {/* Row 1: Score Circles + Category Bars + Commute */}
                <div className="grid grid-cols-12 gap-3">
                  {/* Match Score */}
                  <div className="col-span-2 flex flex-col items-center justify-center p-2 bg-background/60 rounded-lg border">
                    <div className="relative w-14 h-14">
                      <svg className="w-14 h-14 transform -rotate-90">
                        <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="5" fill="none" className="text-muted/30" />
                        <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="5" fill="none"
                          strokeDasharray={`${(match.match_score / 100) * 151} 151`} strokeLinecap="round"
                          className={match.match_score >= 80 ? 'text-green-500' : match.match_score >= 70 ? 'text-yellow-500' : 'text-orange-500'}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-base font-bold ${getScoreColor(match.match_score)}`}>
                          {match.match_score}%
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-1">Match</span>
                  </div>

                  {/* Category Progress Bars */}
                  <div className="col-span-5 flex flex-col justify-center gap-2 p-2 bg-background/60 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3 w-3 text-blue-500 flex-shrink-0" />
                      <span className="text-[9px] w-12 text-muted-foreground">Skills</span>
                      <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${skillsScore >= 80 ? 'bg-green-500' : skillsScore >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                          style={{ width: `${Math.min(skillsScore, 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-medium w-8 text-right">{Math.min(skillsScore, 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-3 w-3 text-purple-500 flex-shrink-0" />
                      <span className="text-[9px] w-12 text-muted-foreground">Karriere</span>
                      <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${experienceScore >= 80 ? 'bg-green-500' : experienceScore >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                          style={{ width: `${Math.min(experienceScore, 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-medium w-8 text-right">{Math.min(experienceScore, 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Wallet className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                      <span className="text-[9px] w-12 text-muted-foreground">Gehalt</span>
                      <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${salaryScore >= 80 ? 'bg-green-500' : salaryScore >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                          style={{ width: `${Math.min(salaryScore, 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-medium w-8 text-right">{Math.min(salaryScore, 100)}%</span>
                    </div>
                  </div>

                  {/* Commute Times */}
                  <div className="col-span-5 grid grid-cols-2 gap-2">
                    <div className="flex flex-col items-center justify-center p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <Car className="h-5 w-5 text-blue-500" />
                      <span className="text-sm font-bold text-blue-500 mt-1">
                        {isLoadingCommute ? <Loader2 className="h-4 w-4 animate-spin" /> : commuteData?.auto?.duration || '–'}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {commuteData?.auto?.distance ? `(${commuteData.auto.distance})` : 'Auto'}
                      </span>
                      {commuteFit && (
                        <div className="mt-1">
                          {commuteFit === 'ok' && <CheckCircle className="h-3 w-3 text-green-500" />}
                          {commuteFit === 'warning' && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                          {commuteFit === 'exceeded' && <XCircle className="h-3 w-3 text-red-500" />}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-center justify-center p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                      <Train className="h-5 w-5 text-purple-500" />
                      <span className="text-sm font-bold text-purple-500 mt-1">
                        {isLoadingCommute ? <Loader2 className="h-4 w-4 animate-spin" /> : commuteData?.oepnv?.duration || '–'}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {commuteData?.oepnv?.distance ? `(${commuteData.oepnv.distance})` : 'ÖPNV'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Match Reasons */}
                {visibleReasons.length > 0 && (
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground flex-wrap pt-2 border-t border-border/50">
                    {visibleReasons.map((r: string, i: number) => (
                      <span key={i} className="flex items-center gap-1 bg-muted/30 px-1.5 py-0.5 rounded">
                        <span className="w-1 h-1 rounded-full bg-primary" />
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                {/* Missing Skills */}
                {missingSkills.length > 0 && (
                  <div className="flex items-center gap-2 text-[9px] flex-wrap pt-2 border-t border-border/50">
                    <span className="text-muted-foreground font-medium">Fehlende Skills:</span>
                    {missingSkills.map((skill: string, i: number) => (
                      <span key={i} className="flex items-center gap-1 bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-hidden px-6 pb-6 pt-4">
          {/* Column 1: Candidate */}
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
                  {/* Avatar & Name */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={candidate?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary text-primary-foreground font-medium text-sm">
                        {candidate?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 
                        className="font-semibold text-sm hover:text-primary cursor-pointer transition-colors"
                        onClick={() => navigate(`/candidates/${match.candidate_id}`, { state: { from: '/ai-matches' } })}
                      >
                        {candidate?.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {candidate?.position || candidate?.desired_position}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Contact */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs">Kontakt</h4>
                    <div className="space-y-1.5">
                      {candidate?.email && (
                        <div className="flex items-center gap-2 text-xs">
                          <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="break-all">{candidate.email}</span>
                        </div>
                      )}
                      {candidate?.phone && (
                        <div className="flex items-center gap-2 text-xs">
                          <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>{candidate.phone}</span>
                        </div>
                      )}
                      {candidate?.location && (
                        <div className="flex items-center gap-2 text-xs">
                          <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>{candidate.location}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Details */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs">Details</h4>
                    <div className="space-y-1.5">
                      {candidate?.desired_salary && (
                        <div className="flex items-center gap-2 text-xs">
                          <Euro className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>Wunschgehalt: {candidate.desired_salary}</span>
                        </div>
                      )}
                      {candidate?.max_commute && (
                        <div className="flex items-center gap-2 text-xs">
                          <Car className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>Max. Pendeln: {candidate.max_commute}</span>
                        </div>
                      )}
                      {candidate?.workload && (
                        <div className="flex items-center gap-2 text-xs">
                          <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>Pensum: {candidate.workload}</span>
                        </div>
                      )}
                      {candidate?.industry && (
                        <div className="flex items-center gap-2 text-xs">
                          <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>Branche: {candidate.industry}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Skills */}
                  {candidate?.skills && candidate.skills.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2">Skills</h4>
                        <div className="flex flex-wrap gap-1">
                          {candidate.skills.map((skill, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Languages */}
                  {candidate?.languages && candidate.languages.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2 flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          Sprachen
                        </h4>
                        <div className="space-y-1">
                          {candidate.languages.map((lang, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span>{lang.name}</span>
                              <Badge variant="outline" className="text-[10px]">{lang.level}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Work Experience */}
                  {candidate?.work_experience && candidate.work_experience.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2 flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          Berufserfahrung
                        </h4>
                        <div className="space-y-3">
                          {candidate.work_experience.map((exp, idx) => (
                            <div key={idx} className="text-xs">
                              <p className="font-medium">{exp.position}</p>
                              <p className="text-muted-foreground">{exp.company}</p>
                              {(exp.startDate || exp.endDate || (exp as any).start_date || (exp as any).end_date) && (
                                <p className="text-muted-foreground text-[10px]">
                                  {exp.startDate || (exp as any).start_date || ''} - {exp.endDate || (exp as any).end_date || 'heute'}
                                </p>
                              )}
                              {exp.description && (
                                <div 
                                  className="text-muted-foreground pl-2 mt-1 prose prose-xs max-w-none 
                                             [&_ul]:list-disc [&_ul]:ml-3 [&_li]:my-0 [&_p]:my-0.5"
                                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatTextToHtml(exp.description)) }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Education */}
                  {candidate?.education && candidate.education.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2 flex items-center gap-1">
                          <GraduationCap className="h-3 w-3" />
                          Ausbildung
                        </h4>
                        <div className="space-y-2">
                          {candidate.education.map((edu, idx) => (
                            <div key={idx} className="text-xs">
                              <p className="font-medium">{edu.degree || edu.field}</p>
                              {edu.degree && edu.field && edu.degree !== edu.field && (
                                <p className="text-muted-foreground">{edu.field}</p>
                              )}
                              <p className="text-muted-foreground">{edu.institution}</p>
                              {(edu.startDate || edu.endDate || (edu as any).start_date || (edu as any).end_date) && (
                                <p className="text-muted-foreground text-[10px]">
                                  {edu.startDate || (edu as any).start_date || ''} - {edu.endDate || (edu as any).end_date || ''}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Weiterbildungen */}
                  {candidate?.further_education && candidate.further_education.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2 flex items-center gap-1">
                          <Award className="h-3 w-3" />
                          Weiterbildungen & Zertifikate
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {candidate.further_education.slice(0, 5).map((fe, idx) => (
                            <Badge key={idx} variant="outline" className="text-[10px]">
                              {fe.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* Column 2: Position */}
          <div className="flex flex-col overflow-hidden">
            <Card className="flex flex-col h-full overflow-hidden">
              <CardHeader className="flex-shrink-0 pb-3">
                <div className="flex items-center justify-between w-full">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Briefcase className="h-4 w-4" />
                    Position
                  </CardTitle>
                  {match.jobs?.source_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Originalinserat öffnen"
                      onClick={() => window.open(match.jobs.source_url, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <ScrollArea className="flex-1 px-6">
                <div className="space-y-3 text-sm pb-4">
                  {/* Title & Company */}
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 
                        className="font-semibold text-sm hover:text-primary cursor-pointer transition-colors"
                        onClick={() => navigate(`/jobs/${match.job_id}`, { state: { from: '/ai-matches' } })}
                      >
                        {job?.title}
                      </h3>
                      {job?.clients?.name && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {job.clients.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Location & Details */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs">Details</h4>
                    <div className="space-y-1.5">
                      {job?.location && (
                        <div className="flex items-center gap-2 text-xs">
                          <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>{job.location}</span>
                        </div>
                      )}
                      {job?.salary_range && (
                        <div className="flex items-center gap-2 text-xs">
                          <Euro className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>{job.salary_range}</span>
                        </div>
                      )}
                      {job?.employment_type && (
                        <div className="flex items-center gap-2 text-xs">
                          <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>{job.employment_type}</span>
                        </div>
                      )}
                      {job?.experience_level && (
                        <div className="flex items-center gap-2 text-xs">
                          <Award className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>{job.experience_level}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Required Skills */}
                  {job?.skills && job.skills.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2">Anforderungen (Skills)</h4>
                        <div className="flex flex-wrap gap-1">
                          {job.skills.map((skill, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Description */}
                  {job?.description && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2">Beschreibung</h4>
                        <div 
                          className="text-xs text-muted-foreground prose prose-xs max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:pl-0 [&_li]:my-0.5 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description) }}
                        />
                      </div>
                    </>
                  )}

                  {/* Responsibilities (Aufgaben) */}
                  {job?.responsibilities && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2">Aufgaben</h4>
                        <div 
                          className="text-xs text-muted-foreground prose prose-xs max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:pl-0 [&_li]:my-0.5 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.responsibilities) }}
                        />
                      </div>
                    </>
                  )}

                  {/* Requirements (Anforderungen) */}
                  {job?.requirements && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2">Anforderungen</h4>
                        <div 
                          className="text-xs text-muted-foreground prose prose-xs max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:pl-0 [&_li]:my-0.5 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.requirements) }}
                        />
                      </div>
                    </>
                  )}

                  {/* Benefits */}
                  {job?.benefits && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium text-xs mb-2">Benefits</h4>
                        <div 
                          className="text-xs text-muted-foreground prose prose-xs max-w-none [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:pl-0 [&_li]:my-0.5 [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.benefits) }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* Column 3: Candidate Notes + Actions */}
          <div className="flex flex-col overflow-hidden gap-4">
            <Card className="flex flex-col flex-1 overflow-hidden">
              <Tabs defaultValue="match" className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-shrink-0 px-6 pt-4 pb-2">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="match">
                      Match
                      {Array.isArray(match.match_reasons) && match.match_reasons.length > 0 && (
                         <span className="ml-0.5 text-[10px] text-muted-foreground font-normal align-baseline translate-y-[3px]">
                           {match.match_reasons.length}
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
                <TabsContent value="match" className="flex-1 overflow-hidden mt-0 min-h-0">
                  <CardHeader className="flex-shrink-0 pb-3 pt-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4" />
                      Match-Gründe
                    </CardTitle>
                  </CardHeader>
                  <ScrollArea className="flex-1 px-6" style={{ maxHeight: "calc(100vh - 350px)" }}>
                    <div className="pb-4 space-y-2">
                      {Array.isArray(match.match_reasons) && match.match_reasons.map((reason, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{String(reason)}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="kandidat" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                  <CardHeader className="flex-shrink-0 pb-3 pt-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4" />
                      Kandidaten-Notizen
                    </CardTitle>
                  </CardHeader>
                  <div className="flex-1 min-h-0 px-6 overflow-y-auto">
                    <div className="pb-8">
                      {(() => {
                        const parsedNotes = parseNotes(candidate?.notes);
                        if (parsedNotes.length > 0) {
                          return (
                            <div className="space-y-3">
                              {parsedNotes.map((note) => (
                                <div 
                                  key={note.id} 
                                  className={cn(
                                    "p-3 rounded-lg border text-sm",
                                    note.isImportant 
                                      ? "border-amber-300 bg-amber-50/50 dark:bg-amber-900/10" 
                                      : "border-border bg-muted/30"
                                  )}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-muted-foreground">{note.author}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(note.timestamp), "dd.MM.yy HH:mm", { locale: de })}
                                    </span>
                                  </div>
                                  <div 
                                    className="prose prose-sm max-w-none text-muted-foreground [&_p]:my-1 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:my-0.5"
                                    dangerouslySetInnerHTML={{
                                      __html: DOMPurify.sanitize(note.content, { ADD_ATTR: ['target', 'rel'] })
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return <p className="text-sm text-muted-foreground italic">Keine Notizen vorhanden</p>;
                      })()}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="stelle" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                  <CardHeader className="flex-shrink-0 pb-3 pt-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4" />
                      Stellen-Notizen
                    </CardTitle>
                  </CardHeader>
                  <div className="flex-1 min-h-0 px-6 overflow-y-auto">
                    <div className="pb-8">
                      <JobNotesTab jobId={match.job_id} onCountLoaded={setJobNotesCount} />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-2 flex-shrink-0">
              <Button 
                variant="outline" 
                onClick={onReject} 
                disabled={isUpdating || match.status === 'rejected'}
                className="flex-1"
              >
                <XCircle className="h-4 w-4 mr-2" />
                {t('aiMatches.reject')}
              </Button>
              <Button 
                onClick={onAccept} 
                disabled={isUpdating || match.status === 'accepted'}
                className="flex-1"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {t('aiMatches.accept')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
