import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ParsedJobData {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  tasks?: string;
  requirements?: string;  
  salary?: string;
  client_id?: string;
  source_url?: string;
  company_website?: string;
}

interface JobPdfParserProps {
  onJobParsed: (data: ParsedJobData) => void;
}

export function JobPdfParser({ onJobParsed }: JobPdfParserProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  const processFile = async (file: File) => {
    // Validate file type
    if (!validTypes.includes(file.type)) {
      toast({
        title: t("jobParser.invalidFileType"),
        description: t("jobParser.invalidFileTypeDesc"),
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t("jobParser.fileTooLarge"),
        description: t("jobParser.fileTooLargeDesc"),
        variant: "destructive",
      });
      return;
    }

    setFileName(file.name);
    setIsParsing(true);

    try {
      console.log('Parsing job posting from PDF:', file.name);
      
      const formData = new FormData();
      formData.append('file', file);

      const { data: parsedData, error } = await supabase.functions.invoke('parse-job-pdf', {
        body: formData,
      });

      if (error) {
        throw new Error(error.message || 'Failed to parse job posting PDF');
      }

      console.log('Parsed job data from PDF:', parsedData);
      
      // Upload file to storage after successful parsing
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      if (userId) {
        // Sanitize filename for storage
        const sanitizedFileName = file.name
          .replace(/[äÄ]/g, 'ae')
          .replace(/[öÖ]/g, 'oe')
          .replace(/[üÜ]/g, 'ue')
          .replace(/ß/g, 'ss')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        
        const filePath = `${userId}/${Date.now()}_${sanitizedFileName}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('job-documents')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Error uploading file to storage:', uploadError);
        } else if (uploadData) {
          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('job-documents')
            .getPublicUrl(uploadData.path);
          
          console.log('File uploaded, public URL:', publicUrl);
          parsedData.source_url = publicUrl;
          parsedData.source_document_url = publicUrl;
        }
      }
      
      onJobParsed(parsedData);
      
      toast({
        title: t("jobParser.importSuccess"),
        description: t("jobParser.pdfImportSuccessDesc"),
      });
      
      setFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error parsing job PDF:', error);
      toast({
        title: t("jobParser.importError"),
        description: error instanceof Error ? error.message : t("jobParser.pdfImportErrorDesc"),
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  }, []);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer",
        isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50",
        isParsing && "pointer-events-none opacity-60"
      )}
      onClick={() => !isParsing && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isParsing}
      />
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        {isParsing ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">{t("jobParser.parsing")}</span>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground" />
            <div className="text-sm">
              {fileName ? (
                <span className="text-foreground font-medium truncate max-w-[250px] block">{fileName}</span>
              ) : (
                <>
                  <span className="text-foreground font-medium">{t("jobParser.dragAndDrop")}</span>
                  <span className="text-muted-foreground"> {t("jobParser.orBrowse")}</span>
                </>
              )}
            </div>
            <span className="text-xs text-muted-foreground">PDF, DOC, DOCX (max. 10 MB)</span>
          </>
        )}
      </div>
    </div>
  );
}
