import { useState, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Linkedin, Mail, Phone, Wrench, FileUp, X, FileText, Award, Trophy, Briefcase, GraduationCap, CaseSensitive, Lightbulb, Languages } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RecognizedField {
  key: string;
  label: string;
  value: any;
  action: 'replace' | 'append' | 'add';
  selected: boolean;
  matched_index?: number;
  matched_company?: string;
  extracted_tasks?: string[];
}

interface UploadedFile {
  name: string;
  type: string;
  data: string; // Base64 data URL
}

interface CandidateAIAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  currentData: any;
  onUpdate: (updates: any) => void;
  onStartSkillDetection?: () => void;
}

const QUICK_PROMPTS = {
  input: [
    {
      id: 'linkedin',
      icon: Linkedin,
      labelKey: 'aiAssistant.linkedInProfile',
      instruction: 'Das ist ein LinkedIn-Profil. Extrahiere alle relevanten Informationen wie Skills, Berufserfahrung, Ausbildung, Sprachen und Kontaktdaten. Formatiere die Berufserfahrung mit Firma, Position, Zeitraum und Beschreibung.'
    },
    {
      id: 'email',
      icon: Mail,
      labelKey: 'aiAssistant.emailContent',
      instruction: 'Das ist eine E-Mail vom oder über den Kandidaten. Extrahiere Verfügbarkeit, Gehaltswunsch, Interesse, Kündigungsfrist und alle anderen wichtigen Details.'
    },
    {
      id: 'phone',
      icon: Phone,
      labelKey: 'aiAssistant.phoneNotes',
      instruction: 'Das sind Notizen von einem Telefonat. Extrahiere Gehaltswunsch (aktuell und gewünscht), aktuelle Situation, Wechselmotivation, Verfügbarkeit, Kündigungsfrist und persönliche Eindrücke.'
    },
    {
      id: 'document',
      icon: FileText,
      label: 'Dokument',
      instruction: 'Das ist ein Dokument (z.B. Arbeitszeugnis, Diplom). Extrahiere alle relevanten Informationen wie Name, Institution, Datum, Beschreibung und andere wichtige Details. Falls mehrere Einträge erkennbar sind, extrahiere alle.'
    },
  ],
  extract: [
    {
      id: 'work_experience',
      icon: Briefcase,
      label: 'Berufserfahrung',
      instruction: 'Extrahiere alle Berufserfahrungen aus diesem Inhalt. Es können eine oder mehrere Stationen sein. Für jede Position: Firma/Arbeitgeber, Position/Jobtitel, Zeitraum (Start- und Enddatum), Standort und eine Beschreibung der Tätigkeiten. Füge alle zum Feld "work_experience" als Array hinzu.'
    },
    {
      id: 'education',
      icon: GraduationCap,
      label: 'Ausbildung',
      instruction: 'Extrahiere alle Ausbildungen, Studien oder Schulabschlüsse aus diesem Inhalt. Es können eine oder mehrere sein. Für jeden Eintrag: Institution/Schule/Universität, Abschluss/Studiengang, Zeitraum (Start- und Enddatum), Standort und ggf. Beschreibung oder Schwerpunkte. Füge alle zum Feld "education" als Array hinzu.'
    },
    {
      id: 'skills',
      icon: Wrench,
      label: 'Skills',
      instruction: 'Extrahiere nur die technischen Skills und Soft Skills aus diesem Text. Liste sie einzeln auf.'
    },
    {
      id: 'certification',
      icon: Award,
      label: 'Zertifikat',
      instruction: 'Extrahiere alle Zertifikate und Weiterbildungen aus diesem Inhalt. Es können eine oder mehrere sein. Für jeden Eintrag: Name des Zertifikats/Kurses, Institution/Anbieter, Datum und ggf. Beschreibung. Füge alle zum Feld "further_education" als Array hinzu.'
    },
    {
      id: 'award',
      icon: Trophy,
      label: 'Award/Publikation',
      instruction: 'Extrahiere alle Auszeichnungen, Publikationen oder Engagements aus diesem Inhalt. Es können eine oder mehrere sein. Für jeden Eintrag: Name/Titel, Herausgeber oder Organisation, Datum und ggf. Beschreibung. Füge alle zum Feld "awards_publications" als Array hinzu.'
    },
    {
      id: 'work_certificate_tasks',
      icon: FileText,
      label: 'Arbeitszeugnis Tätigkeiten',
      instruction: '' // Will be dynamically generated with current work experience data
    },
  ],
  tools: [
    {
      id: 'detect_skills',
      icon: Lightbulb,
      label: 'Skills Panel',
      instruction: '',
      isSpecial: true
    },
    {
      id: 'fix_capitalization',
      icon: CaseSensitive,
      label: 'Gross-/Kleinschreibung',
      instruction: 'WICHTIG: Korrigiere die Gross-/Kleinschreibung aller Kandidatendaten nach deutschen Grammatikregeln. Wandle durchgehend GROSSGESCHRIEBENEN Text oder Text Mit Jedem Wort Gross in normale Schreibweise um. Behalte nur Eigennamen, Firmen, Städte, Länder und Satzanfänge gross. Gib ALLE Felder zurück, die korrigiert wurden: name, position, desired_position, location, notes, summary, reason_for_change, work_experience (company, position, location, description), education (institution, degree, field, location), skills, further_education (name, institution, description), awards_publications (title, publisher, organization, description). Setze action="replace" für alle korrigierten Felder.'
    },
    {
      id: 'translate_to_german',
      icon: Languages,
      label: 'Übersetzen',
      instruction: `AUFGABE: Übersetze ALLE fremdsprachigen Inhalte vollständig ins Deutsche. Kein französischer, englischer oder anderer fremdsprachiger Text darf übrig bleiben.

SCHRITT 1 - ERKENNE FREMDSPRACHE:
Durchsuche ALLE Felder nach nicht-deutschen Wörtern: "à", "la", "le", "les", "de", "du", "des", "pour", "sur", "lors", "d'une", "réunion", "conférence", "congrès", "européen/européenne", "mondial", "annuelle", "prix", "croisé", "cérébelleux", "bilatéralement", etc.

SCHRITT 2 - WAS ÜBERSETZEN:
- ALLE französischen/englischen Phrasen und Wörter
- Beschreibende Konferenznamen: "27e Conférence européenne" → "27. Europäische Konferenz"
- Beschreibende Titel: "Premier prix" → "Erster Preis"
- Adjektive: "Bilatéralement" → "Bilateral", "croisé" → "gekreuzt"
- Präpositionen: "à" → "am/an/in", "pour" → "für", "sur" → "über", "lors de" → "bei"
- Nummern: "27e" → "27.", "15e" → "15.", "24e" → "24."

SCHRITT 3 - WAS NICHT ÜBERSETZEN:
- Akronyme: ESOC, ISMRM, ZNZ, CVR, BOLD, PET
- Journal-Namen: "Stroke", "Neurology", "JCBFM", "J Am Heart Assoc."
- Städtenamen: Zürich, Athènes (→ Athen), Venise (→ Venedig), Rome (→ Rom)
- Personennamen
- Offizielle Institutsnamen als Eigennamen

BEISPIELE:
- "Eingeladener Redner à l'ESOC 2023" → "Eingeladener Redner am ESOC 2023"
- "lors d'une session d'évaluation par les pairs" → "in einer Peer-Review-Sitzung"
- "27e Conférence européenne sur les accidents vasculaires cérébraux à Athènes" → "27. Europäische Schlaganfallkonferenz in Athen"
- "17e Congrès européen de neurochirurgie" → "17. Europäischer Neurochirurgie-Kongress"
- "Fédération mondiale de neurochirurgie" → "Weltverband für Neurochirurgie"
- "24e réunion annuelle de l'ISMRM" → "24. Jahrestagung der ISMRM"
- "Diaschisis croisé cérébelleux" → "Gekreuzte zerebellare Diaschisis"
- "Bilatéralement veränderte" → "Bilateral veränderte"
- "Premier prix du Centre de neurosciences cliniques" → "Erster Preis des Zentrums für klinische Neurowissenschaften"
- "Auszeichnungen du mérite Magna Cum Laude" → "Magna Cum Laude Auszeichnung für Verdienste"
- "Reisestipendium pour l'abstract" → "Reisestipendium für das Abstract"

ZU PRÜFENDE FELDER (ALLE durchgehen):
- awards_publications: title, description, publisher, organization
- education: degree, field
- work_experience: position, description
- further_education: name, description
- notes, summary, reason_for_change, insights_notes, most_proud_of, potential_risks

Schweizer Hochdeutsch: "ss" statt "ß", Umlaute (ä, ö, ü).
Gib ALLE korrigierten Felder mit action="replace" zurück. Bei Arrays das gesamte korrigierte Array zurückgeben.`
    },
  ]
};

export function CandidateAIAssistant({ 
  open, 
  onOpenChange, 
  candidateId,
  currentData, 
  onUpdate,
  onStartSkillDetection 
}: CandidateAIAssistantProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [instruction, setInstruction] = useState("");
  const [inputText, setInputText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recognizedFields, setRecognizedFields] = useState<RecognizedField[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropContainerRef = useRef<HTMLDivElement>(null);

  // Reset state when sheet is closed
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedPromptId(null);
      setInstruction("");
      setInputText("");
      setRecognizedFields([]);
      setHasAnalyzed(false);
      setUploadedFiles([]);
    }
    onOpenChange(isOpen);
  };

  const handleQuickPrompt = (promptId: string, promptInstruction: string) => {
    // Special handling for detect_skills - close sheet and trigger skill detection mode
    if (promptId === 'detect_skills') {
      handleOpenChange(false);
      onStartSkillDetection?.();
      return;
    }
    
    // Track selected prompt
    setSelectedPromptId(promptId);
    
    // Special handling for work_certificate_tasks - generate dynamic instruction
    // This feature is STRICTLY LIMITED to only extracting and adding tasks/responsibilities
    // Supports MULTIPLE work certificates in a single document or multiple documents
    if (promptId === 'work_certificate_tasks') {
      const workCertificateInstruction = `STRIKTE EINSCHRÄNKUNG: Du darfst bei dieser Funktion NUR Tätigkeiten und Verantwortlichkeiten extrahieren. KEINE anderen Felder dürfen geändert werden!

WICHTIG: Das Dokument kann MEHRERE Arbeitszeugnisse enthalten (z.B. ein PDF mit mehreren Zeugnissen oder mehrere hochgeladene Dateien). 
Analysiere ALLE enthaltenen Arbeitszeugnisse und extrahiere für JEDES die Tätigkeiten separat.

SCHRITT 1 - IDENTIFIZIERUNG ALLER ARBEITSZEUGNISSE:
Erkenne alle Arbeitszeugnisse im Dokument anhand von:
- Typischen Einleitungen wie "Herr/Frau ... war bei uns beschäftigt", "Zwischenzeugnis", "Arbeitszeugnis"
- Firmen-Briefköpfen oder Unterschriften
- Datumsangaben und Beschäftigungszeiträumen
- Trennungen durch Seitenumbrüche oder Leerräume

SCHRITT 2 - FÜR JEDES ARBEITSZEUGNIS:
a) Identifiziere Firma und Position (NUR zum Matching, NICHT zum Ändern)
b) Extrahiere ALLE genannten Tätigkeiten, Verantwortlichkeiten und Aufgaben als einzelne Bulletpoints
   - Formuliere prägnant und aktiv (z.B. "Leitung eines Teams von 5 Mitarbeitern")
   - Jeder Bulletpoint beschreibt eine konkrete Tätigkeit
   - Keine Punkte am Ende der Bulletpoints
   - Maximale Präzision, minimale Wortanzahl

VORHANDENE BERUFSERFAHRUNGEN DES KANDIDATEN:
${JSON.stringify((currentData?.work_experience || []).map((exp: any, idx: number) => ({ index: idx, company: exp.company, position: exp.position, start_date: exp.start_date, end_date: exp.end_date })), null, 2)}

MATCHING: Finde für JEDES Arbeitszeugnis die passende Berufserfahrung anhand von Firmenname, Position oder Zeitraum.

STRIKTE REGELN:
1. Du darfst NUR das Feld "work_experience" zurückgeben
2. Du darfst NUR die "description" der gematchten Einträge ändern
3. Du darfst KEINE anderen Felder (company, position, start_date, end_date, location) ändern
4. Du darfst KEINE anderen Kandidatenfelder (name, email, skills, etc.) zurückgeben
5. JEDER Eintrag im Array MUSS matched_index und extracted_tasks enthalten

ANTWORTFORMAT FÜR MEHRERE ARBEITSZEUGNISSE:
{
  "fields": [
    {
      "key": "work_experience",
      "label": "Tätigkeiten hinzugefügt: Firma A",
      "value": [{"description": "<ul><li>Tätigkeit 1</li><li>Tätigkeit 2</li></ul>"}],
      "action": "replace",
      "matched_index": 0,
      "matched_company": "Firma A",
      "extracted_tasks": ["Tätigkeit 1", "Tätigkeit 2"]
    },
    {
      "key": "work_experience",
      "label": "Tätigkeiten hinzugefügt: Firma B",
      "value": [{"description": "<ul><li>Tätigkeit 3</li><li>Tätigkeit 4</li></ul>"}],
      "action": "replace",
      "matched_index": 2,
      "matched_company": "Firma B",
      "extracted_tasks": ["Tätigkeit 3", "Tätigkeit 4"]
    }
  ]
}

Wenn für ein Arbeitszeugnis KEINE passende Berufserfahrung gefunden wurde:
- Setze matched_index auf -1 für dieses Zeugnis
- Gib trotzdem die extracted_tasks zurück mit einem Hinweis im Label

Wenn GAR KEINE Arbeitszeugnisse erkannt wurden:
{
  "fields": [],
  "error": "Keine Arbeitszeugnisse im Dokument erkannt."
}`;
      setInstruction(workCertificateInstruction);
      return;
    }
    
    setInstruction(promptInstruction);
    
    // Special handling for fix_capitalization - analyze existing data immediately
    if (promptId === 'fix_capitalization') {
      handleAnalyzeExistingData(promptInstruction);
    }
  };

  const handleAnalyzeExistingData = async (customInstruction: string) => {
    setIsAnalyzing(true);
    setRecognizedFields([]);

    try {
      const { data, error } = await supabase.functions.invoke('process-candidate-info', {
        body: {
          instruction: customInstruction,
          text: null,
          images: null,
          currentData,
          analyzeExistingData: true
        }
      });

      if (error) {
        if (error.message?.includes('429') || error.status === 429) {
          toast({
            title: t('aiAssistant.rateLimitTitle') || 'Rate Limit erreicht',
            description: t('aiAssistant.rateLimitDescription') || 'Bitte warte einige Sekunden und versuche es erneut.',
            variant: 'destructive'
          });
          setIsAnalyzing(false);
          return;
        }
        throw error;
      }

      if (data?.error) {
        if (data.error.includes('Rate limit')) {
          toast({
            title: t('aiAssistant.rateLimitTitle') || 'Rate Limit erreicht',
            description: t('aiAssistant.rateLimitDescription') || 'Bitte warte einige Sekunden und versuche es erneut.',
            variant: 'destructive'
          });
          setIsAnalyzing(false);
          return;
        }
        throw new Error(data.error);
      }

      if (data?.fields && Array.isArray(data.fields)) {
        const fieldsWithSelection = data.fields.map((field: any) => ({
          ...field,
          selected: true
        }));
        setRecognizedFields(fieldsWithSelection);
        setHasAnalyzed(true);
      } else {
        toast({
          title: 'Keine Änderungen nötig',
          description: 'Die Kandidatendaten sind bereits korrekt formatiert.',
          variant: 'default'
        });
      }
    } catch (error: any) {
      console.error('Error analyzing existing data:', error);
      toast({
        title: t('common.error'),
        description: t('aiAssistant.analysisError'),
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processFiles = (files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      
      if (!isImage && !isPdf) {
        toast({
          title: t('common.error'),
          description: t('aiAssistant.invalidFileType') || 'Nur Bilder und PDFs werden unterstützt',
          variant: 'destructive'
        });
        return;
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: t('common.error'),
          description: t('aiAssistant.fileTooLarge') || 'Datei ist zu groß (max. 10MB)',
          variant: 'destructive'
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setUploadedFiles(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: base64
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the container entirely
    if (!dropContainerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (!inputText.trim() && uploadedFiles.length === 0 && !instruction.trim()) {
      toast({
        title: t('common.error'),
        description: t('aiAssistant.noInputError'),
        variant: 'destructive'
      });
      return;
    }

    setIsAnalyzing(true);
    setRecognizedFields([]);

    try {
      // Extract base64 data from uploaded files for the API
      const fileDataForApi = uploadedFiles.length > 0 ? uploadedFiles.map(f => f.data) : null;
      
      const { data, error } = await supabase.functions.invoke('process-candidate-info', {
        body: {
          instruction: instruction.trim() || null,
          text: inputText || null,
          images: fileDataForApi,
          currentData
        }
      });

      if (error) {
        // Check for rate limit error (429)
        if (error.message?.includes('429') || error.status === 429 || data?.error?.includes('Rate limit')) {
          toast({
            title: t('aiAssistant.rateLimitTitle') || 'Rate Limit erreicht',
            description: t('aiAssistant.rateLimitDescription') || 'Bitte warte einige Sekunden und versuche es erneut.',
            variant: 'destructive'
          });
          setIsAnalyzing(false);
          return;
        }
        throw error;
      }

      // Also check if data contains an error (rate limit returns 429 status)
      if (data?.error) {
        if (data.error.includes('Rate limit')) {
          toast({
            title: t('aiAssistant.rateLimitTitle') || 'Rate Limit erreicht',
            description: t('aiAssistant.rateLimitDescription') || 'Bitte warte einige Sekunden und versuche es erneut.',
            variant: 'destructive'
          });
          setIsAnalyzing(false);
          return;
        }
        throw new Error(data.error);
      }

      if (data?.fields && Array.isArray(data.fields)) {
        const fieldsWithSelection = data.fields.map((field: any) => {
          if (!isWorkCertificateMode) {
            return { ...field, selected: true };
          }

          const hasDescription = Array.isArray(field.value) && Boolean(field.value?.[0]?.description);
          const hasTasks = Array.isArray(field.extracted_tasks) ? field.extracted_tasks.length > 0 : hasDescription;
          const isValidWorkCertField =
            field.key === 'work_experience' &&
            typeof field.matched_index === 'number' &&
            field.matched_index >= 0 &&
            hasTasks;

          // In Arbeitszeugnis-Modus: nur work_experience Felder mit gültigem matched_index sind übernehmbar.
          // Bei mehreren Arbeitszeugnissen können mehrere Felder selected=true haben.
          return { ...field, selected: isValidWorkCertField };
        });
        setRecognizedFields(fieldsWithSelection);
        setHasAnalyzed(true);
      } else {
        toast({
          title: t('aiAssistant.noFieldsFound'),
          description: t('aiAssistant.tryDifferentText'),
          variant: 'default'
        });
      }
    } catch (error: any) {
      console.error('Error analyzing text:', error);
      
      // Handle rate limit in catch block as well
      if (error?.message?.includes('429') || error?.message?.includes('Rate limit')) {
        toast({
          title: t('aiAssistant.rateLimitTitle') || 'Rate Limit erreicht',
          description: t('aiAssistant.rateLimitDescription') || 'Bitte warte einige Sekunden und versuche es erneut.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: t('common.error'),
          description: t('aiAssistant.analysisError'),
          variant: 'destructive'
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleFieldSelection = (index: number) => {
    setRecognizedFields(prev => 
      prev.map((field, i) => 
        i === index ? { ...field, selected: !field.selected } : field
      )
    );
  };

  // Helper function to sort entries by date (most recent first)
  const sortByDateDescending = (items: any[], dateFields: string[] = ['end_date', 'endDate', 'date', 'year', 'start_date', 'startDate']) => {
    return [...items].sort((a, b) => {
      // Find the first available date field for comparison
      const getDateValue = (item: any): number => {
        for (const field of dateFields) {
          const value = item[field];
          if (value) {
            // Handle "heute", "present", "current", "aktuell" as current date
            if (typeof value === 'string' && /^(heute|present|current|aktuell|laufend|ongoing)$/i.test(value.trim())) {
              return Date.now();
            }
            // Try to parse date
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return date.getTime();
            }
            // Try MM/YYYY or MM.YYYY format
            const monthYearMatch = String(value).match(/(\d{1,2})[\/\.](\d{4})/);
            if (monthYearMatch) {
              return new Date(parseInt(monthYearMatch[2]), parseInt(monthYearMatch[1]) - 1, 1).getTime();
            }
            // Try year only (e.g., "2023")
            const yearMatch = String(value).match(/\d{4}/);
            if (yearMatch) {
              return new Date(parseInt(yearMatch[0]), 11, 31).getTime(); // End of year
            }
          }
        }
        return 0; // If no date found, put at the end
      };

      return getDateValue(b) - getDateValue(a);
    });
  };

  const isWorkCertificateMode = selectedPromptId === 'work_certificate_tasks';

  const stableStringify = (value: any): string => {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  };

  const stripDescription = (workExpEntry: any) => {
    if (!workExpEntry || typeof workExpEntry !== 'object') return workExpEntry;
    const { description, ...rest } = workExpEntry;
    return rest;
  };

  const extractTasksFromHtml = (html: string): string[] => {
    if (!html || typeof html !== 'string') return [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const items = Array.from(doc.querySelectorAll('li'))
        .map((li) => (li.textContent || '').trim())
        .filter(Boolean);
      return items;
    } catch {
      // Fallback: very naive li extraction
      const matches = Array.from(html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m) =>
        String(m[1])
          .replace(/<[^>]+>/g, '')
          .trim()
      );
      return matches.filter(Boolean);
    }
  };

  const mergeTasksIntoDescription = (existingHtml: string, tasksToAdd: string[], fallbackNewHtml?: string): string => {
    const existingTasks = extractTasksFromHtml(existingHtml);
    const normalizedExisting = new Set(existingTasks.map((t) => t.toLowerCase().trim()));

    const uniqueNewTasks = tasksToAdd
      .map((t) => String(t).trim())
      .filter(Boolean)
      .filter((t) => !normalizedExisting.has(t.toLowerCase().trim()));

    // Nothing new to add
    if (uniqueNewTasks.length === 0) {
      return existingHtml || fallbackNewHtml || existingHtml;
    }

    // Prefer preserving existing HTML as-is and only appending <li> items
    if (existingHtml && typeof existingHtml === 'string' && existingHtml.trim()) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(existingHtml, 'text/html');
        const ul = doc.querySelector('ul');

        if (ul) {
          uniqueNewTasks.forEach((t) => {
            const li = doc.createElement('li');
            li.textContent = t;
            ul.appendChild(li);
          });
          return doc.body.innerHTML;
        }
      } catch {
        // ignore and fall back below
      }

      // No UL found: append a new list at the end, keeping existing content intact
      return `${existingHtml}\n<ul>${uniqueNewTasks.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    }

    // No existing description: build list from new tasks
    return `<ul>${uniqueNewTasks.map((t) => `<li>${t}</li>`).join('')}</ul>`;
  };

  // Keys that should be sorted by date
  const dateSortedKeys = ['education', 'further_education', 'awards_publications', 'work_experience'];

  const handleApplySelected = () => {
    const selectedFields = recognizedFields.filter((f) => f.selected);
    if (selectedFields.length === 0) {
      toast({
        title: t('common.error'),
        description: t('aiAssistant.noFieldsSelected'),
        variant: 'destructive',
      });
      return;
    }

    const updates: any = {};

    // STRICT MODE: Arbeitszeugnis Tätigkeiten darf NUR die description der gematchten Einträge ergänzen
    // Supports MULTIPLE work certificates - processes each matched entry separately
    if (isWorkCertificateMode) {
      // Filter only valid work_experience fields with matched_index >= 0
      const workFields = selectedFields.filter(
        (f) => f.key === 'work_experience' && typeof f.matched_index === 'number' && f.matched_index >= 0
      );

      if (workFields.length === 0) {
        // Check if there are any unmatched certificates (matched_index === -1)
        const unmatchedFields = selectedFields.filter(
          (f) => f.key === 'work_experience' && f.matched_index === -1
        );
        
        if (unmatchedFields.length > 0) {
          const companies = unmatchedFields.map(f => f.matched_company || 'Unbekannt').join(', ');
          toast({
            title: 'Keine passenden Berufserfahrungen',
            description: `Keine passenden Berufserfahrungen gefunden für: ${companies}. Bitte füge diese zuerst hinzu.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: t('common.error'),
            description: 'Keine Berufserfahrung-Änderung gefunden',
            variant: 'destructive',
          });
        }
        return;
      }

      const existingWorkExp = Array.isArray(currentData?.work_experience) ? currentData.work_experience : [];
      const nextWorkExp = existingWorkExp.map((e: any) => ({ ...e }));
      let updatedCount = 0;
      const updatedCompanies: string[] = [];

      // Process each work certificate separately
      for (const workField of workFields) {
        const idx = workField.matched_index!;
        
        if (idx < 0 || idx >= existingWorkExp.length) {
          console.warn(`[AI Assistant] Invalid matched_index ${idx} for ${workField.matched_company}, skipping`);
          continue;
        }

        const aiDescription = Array.isArray(workField.value) ? workField.value?.[0]?.description : undefined;
        const extractedTasks = Array.isArray(workField.extracted_tasks) ? workField.extracted_tasks : [];
        const tasks = extractedTasks.length > 0 ? extractedTasks : (aiDescription ? extractTasksFromHtml(aiDescription) : []);

        if (!tasks.length) {
          console.warn(`[AI Assistant] No tasks found for ${workField.matched_company}, skipping`);
          continue;
        }

        // Merge tasks into description
        const beforeEntry = nextWorkExp[idx];
        const mergedDescription = mergeTasksIntoDescription(beforeEntry?.description || '', tasks, aiDescription);
        nextWorkExp[idx] = { ...beforeEntry, description: mergedDescription };
        updatedCount++;
        updatedCompanies.push(workField.matched_company || existingWorkExp[idx]?.company || `Position ${idx + 1}`);
      }

      if (updatedCount === 0) {
        toast({
          title: t('common.error'),
          description: 'Keine Tätigkeiten konnten übernommen werden',
          variant: 'destructive',
        });
        return;
      }

      // Safety check: no deletes
      if (nextWorkExp.length !== existingWorkExp.length) {
        toast({
          title: t('common.error'),
          description: 'Sicherheitscheck fehlgeschlagen (Array-Länge) – es wird nichts geändert',
          variant: 'destructive',
        });
        return;
      }

      // Safety check: only descriptions of matched entries changed
      const processedIndices = new Set(workFields.map(f => f.matched_index));
      const allOk = nextWorkExp.every((entry: any, i: number) => {
        if (processedIndices.has(i)) {
          // For processed entries: only description should differ
          return stableStringify(stripDescription(entry)) === stableStringify(stripDescription(existingWorkExp[i]));
        }
        // For non-processed entries: must be identical
        return stableStringify(entry) === stableStringify(existingWorkExp[i]);
      });

      if (!allOk) {
        toast({
          title: t('common.error'),
          description: 'Die KI wollte mehr als nur Tätigkeiten ändern – es wird nichts übernommen',
          variant: 'destructive',
        });
        return;
      }

      onUpdate({ work_experience: nextWorkExp });

      toast({
        title: t('aiAssistant.fieldsApplied'),
        description: updatedCount === 1 
          ? `Tätigkeiten für ${updatedCompanies[0]} hinzugefügt`
          : `Tätigkeiten für ${updatedCount} Berufserfahrungen hinzugefügt: ${updatedCompanies.join(', ')}`,
      });

      // Reset state
      setRecognizedFields([]);
      setHasAnalyzed(false);
      setInputText("");
      setInstruction("");
      setUploadedFiles([]);
      handleOpenChange(false);
      return;
    }

    const toArray = (value: any) => {
      if (Array.isArray(value)) return value;
      if (value === null || value === undefined) return [];
      return [value];
    };

    // Normalize work_experience and education entries to use correct field names
    const normalizeEntry = (entry: any, fieldKey: string): any => {
      if (!entry || typeof entry !== 'object') return entry;
      
      const normalized: any = { ...entry };
      
      // Convert camelCase date fields to snake_case
      if (entry.startDate !== undefined) {
        normalized.start_date = entry.startDate;
        delete normalized.startDate;
      }
      if (entry.endDate !== undefined) {
        normalized.end_date = entry.endDate;
        delete normalized.endDate;
      }
      
      // For work_experience: ensure company and position fields exist
      if (fieldKey === 'work_experience') {
        if (entry.title && !entry.position) {
          normalized.position = entry.title;
          delete normalized.title;
        }
      }
      
      // For education: ensure institution and degree fields exist
      if (fieldKey === 'education') {
        if (entry.school && !entry.institution) {
          normalized.institution = entry.school;
          delete normalized.school;
        }
        if (entry.title && !entry.degree) {
          normalized.degree = entry.title;
          delete normalized.title;
        }
      }
      
      return normalized;
    };

    const normalizeArrayField = (items: any[], fieldKey: string): any[] => {
      return items.map(item => normalizeEntry(item, fieldKey));
    };

    // Fields that need normalization (work_experience, education, certifications, awards_publications)
    const normalizedFields = ['work_experience', 'education', 'further_education', 'awards_publications'];

    try {
      selectedFields.forEach((field) => {
        const existingValue = currentData?.[field.key];
        const needsNormalization = normalizedFields.includes(field.key);

        if (field.action === 'append') {
          // Append even if the AI returns a single object instead of an array
          const existingArray = Array.isArray(existingValue) ? existingValue : [];
          let incomingArray = toArray(field.value);
          
          // Normalize if needed
          if (needsNormalization) {
            incomingArray = normalizeArrayField(incomingArray, field.key);
          }
          
          const combined = [...existingArray, ...incomingArray];

          updates[field.key] = dateSortedKeys.includes(field.key)
            ? sortByDateDescending(combined)
            : combined;
          return;
        }

        if (field.action === 'add') {
          const existingArray = Array.isArray(existingValue) ? existingValue : [];
          let incomingArray = toArray(field.value);
          
          // Normalize if needed
          if (needsNormalization) {
            incomingArray = normalizeArrayField(incomingArray, field.key);
          }

          // Add new items, avoiding duplicates for simple arrays like skills
          if (field.key === 'skills') {
            const incomingSkills = incomingArray.map((s: any) => String(s)).filter(Boolean);
            const newSkills = incomingSkills.filter((s: string) => !existingArray.includes(s));
            updates[field.key] = [...existingArray, ...newSkills];
          } else {
            const combined = [...existingArray, ...incomingArray];
            updates[field.key] = dateSortedKeys.includes(field.key)
              ? sortByDateDescending(combined)
              : combined;
          }
          return;
        }

        // Special handling for work_experience with matched_index (work certificate extraction)
        // NOTE: In Arbeitszeugnis-Modus we early-return above. This block is a safe fallback for any legacy flows.
        if (!isWorkCertificateMode && field.key === 'work_experience' && field.matched_index !== undefined && field.matched_index >= 0) {
          const existingWorkExp = Array.isArray(currentData?.work_experience) ? [...currentData.work_experience] : [];
          
          if (field.matched_index < existingWorkExp.length && Array.isArray(field.value) && field.value.length > 0) {
            // Get ONLY the description from AI response - ignore all other fields
            const aiResponse = field.value[0];
            const newDescription = aiResponse?.description;
            
            if (newDescription) {
              // STRICTLY preserve all existing fields, only update description
              existingWorkExp[field.matched_index] = {
                ...existingWorkExp[field.matched_index], // Keep ALL existing data (company, position, dates, location, etc.)
                description: newDescription // Only update description with new tasks
              };
              
              updates[field.key] = dateSortedKeys.includes(field.key)
                ? sortByDateDescending(existingWorkExp)
                : existingWorkExp;
                
              console.log('[AI Assistant] Work certificate: Updated ONLY description for entry at index', field.matched_index);
            } else {
              console.warn('[AI Assistant] No description in AI response, skipping update');
            }
          } else {
            console.warn('[AI Assistant] matched_index out of bounds or invalid value, skipping update');
          }
          return;
        }

        // Replace value - normalize and sort if it's an array that needs it
        if (Array.isArray(field.value)) {
          let processedValue = needsNormalization 
            ? normalizeArrayField(field.value, field.key) 
            : field.value;
            
          updates[field.key] = dateSortedKeys.includes(field.key)
            ? sortByDateDescending(processedValue)
            : processedValue;
        } else {
          updates[field.key] = field.value;
        }
      });
    } catch (error) {
      console.error('[AI Assistant] Failed to apply fields:', error);
      toast({
        title: t('common.error'),
        description: t('aiAssistant.analysisError') || 'Konnte die Felder nicht übernehmen',
        variant: 'destructive',
      });
      return;
    }

    onUpdate(updates);
    

    toast({
      title: t('aiAssistant.fieldsApplied'),
      description: t('aiAssistant.fieldsAppliedDescription', { count: selectedFields.length }),
    });

    // Reset state
    setRecognizedFields([]);
    setHasAnalyzed(false);
    setInputText("");
    setInstruction("");
    setUploadedFiles([]);
    handleOpenChange(false);
  };

  const renderFieldValue = (field: RecognizedField) => {
    if (Array.isArray(field.value)) {
      if (field.key === 'skills') {
        return (
          <div className="flex flex-wrap gap-1 mt-2">
            {field.value.slice(0, 10).map((skill: string, i: number) => (
              <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
            ))}
            {field.value.length > 10 && (
              <Badge variant="outline" className="text-xs">+{field.value.length - 10}</Badge>
            )}
          </div>
        );
      }
      if (field.key === 'languages') {
        return (
          <div className="flex flex-wrap gap-1 mt-2">
            {field.value.map((lang: any, i: number) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {lang.name} {lang.level && `(${lang.level})`}
              </Badge>
            ))}
          </div>
        );
      }
      if (field.key === 'work_experience') {
        // Check if this is a work certificate extraction with matched company
        const hasExtractedTasks = field.extracted_tasks && field.extracted_tasks.length > 0;
        
        return (
          <div className="mt-2 space-y-2">
            {/* Show matched company info if available */}
            {hasExtractedTasks && field.matched_company && (
              <div className="bg-green-50 dark:bg-green-950/20 rounded-md p-2 text-xs border-l-2 border-green-500">
                <div className="font-medium text-green-700 dark:text-green-400">
                  Zugeordnet zu: {field.matched_company}
                </div>
                <div className="text-muted-foreground mt-1">
                  Extrahierte Tätigkeiten:
                </div>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {field.extracted_tasks!.map((task: string, i: number) => (
                    <li key={i} className="text-foreground">{task}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Show new work experience info if no match was found */}
            {hasExtractedTasks && field.matched_index === -1 && (
              <div className="bg-amber-50 dark:bg-amber-950/20 rounded-md p-2 text-xs border-l-2 border-amber-500">
                <div className="font-medium text-amber-700 dark:text-amber-400">
                  Kein Match gefunden - Neue Berufserfahrung wird erstellt
                </div>
                <div className="text-muted-foreground mt-1">
                  Extrahierte Tätigkeiten:
                </div>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {field.extracted_tasks!.map((task: string, i: number) => (
                    <li key={i} className="text-foreground">{task}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Standard work experience display */}
            {field.value.map((exp: any, i: number) => (
              <div key={i} className="bg-muted/50 rounded-md p-2 text-xs border-l-2 border-primary/50">
                <div className="font-medium text-foreground">{exp.position || exp.title}</div>
                <div className="text-muted-foreground">{exp.company}</div>
                <div className="text-muted-foreground/70 text-[10px]">
                  {exp.start_date || exp.startDate} - {exp.end_date || exp.endDate || 'heute'}
                </div>
                {exp.location && <div className="text-muted-foreground/70 text-[10px]">{exp.location}</div>}
                {exp.description && (
                  <div className="text-muted-foreground mt-1 line-clamp-2">{exp.description}</div>
                )}
              </div>
            ))}
          </div>
        );
      }
      if (field.key === 'education') {
        return (
          <div className="mt-2 space-y-2">
            {field.value.map((edu: any, i: number) => (
              <div key={i} className="bg-muted/50 rounded-md p-2 text-xs border-l-2 border-blue-500/50">
                <div className="font-medium text-foreground">{edu.degree || edu.title}</div>
                <div className="text-muted-foreground">{edu.institution || edu.school}</div>
                {edu.field && <div className="text-muted-foreground/70">{edu.field}</div>}
                <div className="text-muted-foreground/70 text-[10px]">
                  {edu.start_date || edu.startDate} - {edu.end_date || edu.endDate || 'heute'}
                </div>
                {edu.location && <div className="text-muted-foreground/70 text-[10px]">{edu.location}</div>}
              </div>
            ))}
          </div>
        );
      }
      if (field.key === 'further_education') {
        return (
          <div className="mt-2 space-y-2">
            {field.value.map((fe: any, i: number) => (
              <div key={i} className="bg-muted/50 rounded-md p-2 text-xs border-l-2 border-green-500/50">
                <div className="font-medium text-foreground">{fe.name || fe.title}</div>
                {fe.institution && <div className="text-muted-foreground">{fe.institution}</div>}
                {fe.date && <div className="text-muted-foreground/70 text-[10px]">{fe.date}</div>}
                {fe.description && <div className="text-muted-foreground mt-1 line-clamp-2">{fe.description}</div>}
              </div>
            ))}
          </div>
        );
      }
      if (field.key === 'awards_publications') {
        return (
          <div className="mt-2 space-y-2">
            {field.value.map((item: any, i: number) => (
              <div key={i} className="bg-muted/50 rounded-md p-2 text-xs border-l-2 border-yellow-500/50">
                <div className="font-medium text-foreground">{item.title || item.name}</div>
                <div className="text-muted-foreground/70 text-[10px] capitalize">
                  {item.type === 'award' ? 'Auszeichnung' : item.type === 'publication' ? 'Publikation' : item.type === 'engagement' ? 'Engagement' : item.type}
                </div>
                {item.publisher && <div className="text-muted-foreground">{item.publisher}</div>}
                {item.organization && <div className="text-muted-foreground">{item.organization}</div>}
                {item.issuer && <div className="text-muted-foreground">{item.issuer}</div>}
                {(item.year || item.date) && (
                  <div className="text-muted-foreground/70 text-[10px]">
                    {item.year || item.date}{item.year_end ? ` - ${item.year_end}` : ''}
                  </div>
                )}
                {item.description && <div className="text-muted-foreground mt-1 line-clamp-2">{item.description}</div>}
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className="text-xs text-muted-foreground mt-2 bg-muted/30 rounded p-2">
          {JSON.stringify(field.value, null, 2).slice(0, 200)}
          {JSON.stringify(field.value).length > 200 && '...'}
        </div>
      );
    }
    
    // For single values, show in a styled preview box
    const stringValue = String(field.value);
    if (stringValue.length > 100) {
      return (
        <div className="mt-2 text-sm bg-muted/30 rounded-md p-2 text-foreground whitespace-pre-wrap">
          {stringValue}
        </div>
      );
    }
    return (
      <div className="mt-1 text-sm font-medium text-foreground bg-muted/30 rounded px-2 py-1 inline-block">
        {stringValue}
      </div>
    );
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'replace':
        return <Badge variant="default" className="text-xs">{t('aiAssistant.replace')}</Badge>;
      case 'append':
        return <Badge variant="secondary" className="text-xs">{t('aiAssistant.append')}</Badge>;
      case 'add':
        return <Badge variant="outline" className="text-xs">{t('aiAssistant.add')}</Badge>;
      default:
        return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0">
        <div 
          ref={dropContainerRef}
          className="flex flex-col h-full p-6 relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
              <div className="text-primary font-medium flex items-center gap-2">
                <FileUp className="h-6 w-6" />
                {t('aiAssistant.dropFileHere') || 'Datei hier ablegen'}
              </div>
            </div>
          )}
          
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('aiAssistant.title')}
            </SheetTitle>
            <SheetDescription>
              {t('aiAssistant.description')}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col gap-4 mt-4 overflow-hidden">
          {!hasAnalyzed ? (
            <>
              {/* Input Type Prompts */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Eingabetyp</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {QUICK_PROMPTS.input.map((prompt) => (
                    <Button
                      key={prompt.id}
                      variant={selectedPromptId === prompt.id ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleQuickPrompt(prompt.id, prompt.instruction)}
                    >
                      <prompt.icon className="h-3.5 w-3.5 mr-1" />
                      {prompt.label || t(prompt.labelKey)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Extract Prompts */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Extrahieren</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {QUICK_PROMPTS.extract.map((prompt) => (
                    <Button
                      key={prompt.id}
                      variant={selectedPromptId === prompt.id ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleQuickPrompt(prompt.id, prompt.instruction)}
                    >
                      <prompt.icon className="h-3.5 w-3.5 mr-1" />
                      {prompt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Tool Prompts */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Werkzeuge</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {QUICK_PROMPTS.tools.map((prompt) => (
                    <Button
                      key={prompt.id}
                      variant={selectedPromptId === prompt.id && !prompt.isSpecial ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleQuickPrompt(prompt.id, prompt.instruction)}
                    >
                      <prompt.icon className="h-3.5 w-3.5 mr-1" />
                      {prompt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Custom Instruction */}
              <div>
                <Label htmlFor="instruction" className="text-sm font-medium">
                  {t('aiAssistant.instruction')}
                </Label>
                <Textarea
                  id="instruction"
                  placeholder={t('aiAssistant.instructionPlaceholder')}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  className="mt-1.5 min-h-[80px]"
                />
              </div>

              {/* Input Text */}
              <div className="flex-1 flex flex-col min-h-0">
                <Label htmlFor="inputText" className="text-sm font-medium">
                  {t('aiAssistant.pasteTextHere')}
                </Label>
                <Textarea
                  id="inputText"
                  placeholder={t('aiAssistant.textPlaceholder')}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="mt-1.5 flex-1 min-h-[200px] resize-none"
                />
              </div>

              {/* File Upload Section */}
              <div>
                <Label className="text-sm font-medium">{t('aiAssistant.files') || 'Dateien (Bilder & PDFs)'}</Label>
                <div className="mt-2 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <FileUp className="h-4 w-4 mr-2" />
                    {t('aiAssistant.uploadFile') || 'Datei hochladen'}
                  </Button>
                  
                  {uploadedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="relative group">
                          {file.type.startsWith('image/') ? (
                            <img 
                              src={file.data} 
                              alt={`File ${index + 1}`}
                              className="h-16 w-16 object-cover rounded-md border"
                            />
                          ) : (
                            <div className="h-16 w-16 flex flex-col items-center justify-center bg-muted rounded-md border gap-1">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <span className="text-[9px] text-muted-foreground truncate max-w-14 px-1">{file.name.split('.').pop()?.toUpperCase()}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Analyze Button */}
              <Button 
                onClick={handleAnalyze} 
                disabled={isAnalyzing || (!inputText.trim() && uploadedFiles.length === 0 && !instruction.trim())}
                className="w-full"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('aiAssistant.analyzing')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t('aiAssistant.analyze')}
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              {/* Recognized Fields */}
              <div className="flex-1 flex flex-col min-h-0">
                <Label className="text-sm font-medium mb-2">
                  {t('aiAssistant.recognizedFields')} ({recognizedFields.filter(f => f.selected).length}/{recognizedFields.length})
                </Label>
                <ScrollArea className="flex-1 border rounded-md p-3">
                  <div className="space-y-3">
                    {recognizedFields.map((field, index) => (
                      <div 
                        key={index}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          field.selected ? 'bg-accent/50 border-primary/30' : 'bg-muted/30'
                        }`}
                      >
                        <Checkbox
                          checked={field.selected}
                          onCheckedChange={() => toggleFieldSelection(index)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{field.label}</span>
                            {getActionBadge(field.action)}
                          </div>
                          {renderFieldValue(field)}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Action Buttons */}
              <div className="sticky bottom-0 z-10 bg-background pt-3 border-t border-border">
                <div className="flex gap-2">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={(e) => {
                      e.preventDefault();
                      setHasAnalyzed(false);
                      setRecognizedFields([]);
                    }}
                    className="flex-1"
                  >
                    {t('common.back')}
                  </Button>
                  <Button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleApplySelected();
                    }}
                    disabled={!recognizedFields.some(f => f.selected)}
                    className="flex-1"
                  >
                    {t('aiAssistant.applySelected')} ({recognizedFields.filter(f => f.selected).length})
                  </Button>
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
