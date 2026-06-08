import { useState, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Languages, Gift, FileUp, X, FileText, Upload } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RecognizedField {
  key: string;
  label: string;
  value: any;
  action: 'replace';
  selected: boolean;
}

interface UploadedFile {
  name: string;
  type: string;
  data: string; // base64
  preview?: string; // data URL for images
}

interface JobAIAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  currentData: any;
  onUpdate: (updates: Record<string, string>) => void;
}

const QUICK_PROMPTS = [
  {
    id: 'translate',
    icon: Languages,
    label: 'Übersetzen',
    instruction: `AUFGABE: Übersetze ALLE Stelleninhalte vollständig ins Schweizer Hochdeutsch.

REGELN:
- Kein "ß", immer "ss" (z.B. "gross" statt "groß", "Strasse" statt "Straße")
- UMLAUTE VERWENDEN: ä, ö, ü, Ä, Ö, Ü
- HTML-Struktur (<ul>, <li>, <p>) EXAKT beibehalten
- Jeder <li>-Eintrag beginnt mit Grossbuchstaben
- Bulletpoints enden NIE mit Punkt
- Fremdsprachige Inhalte (Englisch, Französisch, etc.) vollständig ins Deutsche übersetzen
- Fachbegriffe und Abkürzungen (z.B. KPI, ERP, SAP) beibehalten
- Bereits deutsche Texte nur auf "ss statt ß" und korrekte Umlaute prüfen

Gib NUR Felder zurück, die tatsächlich geändert wurden.`
  },
];

export function JobAIAssistant({ open, onOpenChange, jobId, currentData, onUpdate }: JobAIAssistantProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recognizedFields, setRecognizedFields] = useState<RecognizedField[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropContainerRef = useRef<HTMLDivElement>(null);

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024;

    for (const file of fileArray) {
      if (!validTypes.includes(file.type) && !file.name.endsWith('.pdf')) {
        toast({ title: 'Ungültiger Dateityp', description: `${file.name}: Nur Bilder und PDFs erlaubt.`, variant: 'destructive' });
        continue;
      }
      if (file.size > maxSize) {
        toast({ title: 'Datei zu gross', description: `${file.name}: Max. 10MB erlaubt.`, variant: 'destructive' });
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        const isImage = file.type.startsWith('image/');
        setUploadedFiles(prev => [...prev, {
          name: file.name,
          type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png'),
          data: base64,
          preview: isImage ? result : undefined,
        }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropContainerRef.current && !dropContainerRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setRecognizedFields([]);
      setHasAnalyzed(false);
      setUploadedFiles([]);
    }
    onOpenChange(isOpen);
  };

  const handleQuickPrompt = async (promptInstruction: string) => {
    setIsAnalyzing(true);
    setRecognizedFields([]);

    const jobFields: Record<string, string | null> = {
      description: currentData?.description || null,
      responsibilities: currentData?.responsibilities || null,
      requirements: currentData?.requirements || null,
      benefits: currentData?.benefits || null,
    };

    const nonEmptyFields = Object.fromEntries(
      Object.entries(jobFields).filter(([_, v]) => v && v.trim())
    );

    if (Object.keys(nonEmptyFields).length === 0) {
      toast({ title: 'Keine Inhalte', description: 'Die Stelle hat keine Inhalte zum Verarbeiten.', variant: 'destructive' });
      setIsAnalyzing(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('process-job-info', {
        body: { instruction: promptInstruction, currentData: nonEmptyFields }
      });

      if (error) {
        if (error.message?.includes('429') || (error as any).status === 429) {
          toast({ title: 'Rate Limit erreicht', description: 'Bitte warte einige Sekunden und versuche es erneut.', variant: 'destructive' });
          setIsAnalyzing(false);
          return;
        }
        throw error;
      }

      if (data?.error) {
        if (data.error.includes('Rate limit') || data.error.includes('402')) {
          toast({ title: 'Rate Limit erreicht', description: 'Bitte warte einige Sekunden und versuche es erneut.', variant: 'destructive' });
          setIsAnalyzing(false);
          return;
        }
        throw new Error(data.error);
      }

      if (data?.fields && Array.isArray(data.fields) && data.fields.length > 0) {
        setRecognizedFields(data.fields.map((f: any) => ({ ...f, selected: true })));
        setHasAnalyzed(true);
      } else {
        toast({ title: 'Keine Änderungen nötig', description: 'Die Stelleninhalte sind bereits korrekt.' });
      }
    } catch (error: any) {
      console.error('Error in JobAIAssistant:', error);
      toast({ title: t('common.error'), description: 'Fehler bei der KI-Verarbeitung.', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBenefitsExtract = async () => {
    if (uploadedFiles.length === 0) return;
    setIsAnalyzing(true);
    setRecognizedFields([]);

    try {
      const formData = new FormData();
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const byteString = atob(file.data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let j = 0; j < byteString.length; j++) {
          ia[j] = byteString.charCodeAt(j);
        }
        const blob = new Blob([ab], { type: file.type });
        formData.append(`file_${i}`, blob, file.name);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-benefits-from-files`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
          body: formData,
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          toast({ title: 'Rate Limit erreicht', description: 'Bitte warte einige Sekunden und versuche es erneut.', variant: 'destructive' });
          setIsAnalyzing(false);
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.benefits && data.benefits.trim()) {
        setRecognizedFields([{
          key: 'benefits',
          label: 'Benefits',
          value: data.benefits,
          action: 'replace' as const,
          selected: true,
        }]);
        setHasAnalyzed(true);
      } else {
        toast({ title: 'Keine Benefits gefunden', description: 'In den hochgeladenen Dateien wurden keine Benefits erkannt.' });
      }
    } catch (error: any) {
      console.error('Error extracting benefits:', error);
      toast({ title: t('common.error'), description: 'Fehler bei der Benefits-Extraktion.', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleFieldSelection = (index: number) => {
    setRecognizedFields(prev =>
      prev.map((field, i) => i === index ? { ...field, selected: !field.selected } : field)
    );
  };

  const handleApplySelected = () => {
    const selectedFields = recognizedFields.filter(f => f.selected);
    if (selectedFields.length === 0) {
      toast({ title: 'Keine Felder ausgewählt', description: 'Bitte wähle mindestens ein Feld aus.', variant: 'destructive' });
      return;
    }

    const updates: Record<string, string> = {};
    for (const field of selectedFields) {
      if (field.key === 'benefits' && currentData?.benefits?.trim()) {
        updates[field.key] = currentData.benefits + field.value;
      } else {
        updates[field.key] = field.value;
      }
    }

    onUpdate(updates);
    toast({ title: 'Übernommen', description: `${selectedFields.length} Feld(er) aktualisiert.` });
    setRecognizedFields([]);
    setHasAnalyzed(false);
    setUploadedFiles([]);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <div
          ref={dropContainerRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="flex flex-col flex-1 overflow-hidden p-6 relative"
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="border-2 border-dashed border-primary rounded-xl p-8 flex flex-col items-center gap-3">
                <FileUp className="h-10 w-10 text-primary" />
                <p className="text-sm font-medium text-primary">Datei hier ablegen</p>
                <p className="text-xs text-muted-foreground">Bilder oder PDFs zur Benefits-Extraktion</p>
              </div>
            </div>
          )}

          <SheetHeader>
            <SheetTitle>KI-Assistent</SheetTitle>
            <SheetDescription>Stelleninhalte mit KI verarbeiten</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4 mt-4">
            {/* Quick Prompts & Upload */}
            {!hasAnalyzed && !isAnalyzing && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Aktionen</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map(prompt => (
                      <Button
                        key={prompt.id}
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickPrompt(prompt.instruction)}
                        className="gap-2"
                      >
                        <prompt.icon className="h-4 w-4" />
                        {prompt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* File Upload Section */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Benefits aus Dokumenten extrahieren</p>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Dateien hochladen
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleBenefitsExtract}
                      disabled={uploadedFiles.length === 0}
                      className="gap-2"
                    >
                      <Gift className="h-4 w-4" />
                      Benefits extrahieren
                    </Button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        processFiles(e.target.files);
                      }
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  />

                  {/* Uploaded Files Preview */}
                  {uploadedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {uploadedFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="relative group border rounded-lg p-1.5 flex items-center gap-2 bg-muted/30 max-w-[200px]"
                        >
                          {file.preview ? (
                            <img src={file.preview} alt={file.name} className="h-10 w-10 rounded object-cover flex-shrink-0" />
                          ) : (
                            <FileText className="h-10 w-10 p-2 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="text-xs truncate">{file.name}</span>
                          <button
                            onClick={() => removeFile(index)}
                            className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Loading */}
            {isAnalyzing && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">KI analysiert Stelleninhalte...</p>
              </div>
            )}

            {/* Results */}
            {hasAnalyzed && recognizedFields.length > 0 && (
              <ScrollArea className="flex-1">
                <div className="space-y-3 pr-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    {recognizedFields.length} Feld(er) erkannt
                  </p>
                  {recognizedFields.map((field, index) => (
                    <div key={`${field.key}-${index}`} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={field.selected} onCheckedChange={() => toggleFieldSelection(index)} />
                        <span className="text-sm font-medium">{field.label}</span>
                      </div>
                      <div
                        className="text-xs text-muted-foreground max-h-32 overflow-y-auto bg-muted/30 rounded p-2 [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2"
                        dangerouslySetInnerHTML={{ __html: field.value }}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2 pb-4">
                    <Button onClick={handleApplySelected} className="flex-1">Übernehmen</Button>
                    <Button variant="outline" onClick={() => { setRecognizedFields([]); setHasAnalyzed(false); }}>Verwerfen</Button>
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
