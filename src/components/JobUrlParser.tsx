import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, Loader2, ClipboardPaste, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

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

interface JobUrlParserProps {
  onJobParsed: (data: ParsedJobData) => void;
}

export function JobUrlParser({ onJobParsed }: JobUrlParserProps) {
  const [url, setUrl] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualText, setManualText] = useState("");
  const [blockedUrl, setBlockedUrl] = useState("");
  const { toast } = useToast();
  const { t } = useTranslation();

  const parseJobUrl = async () => {
    if (!url.trim()) return;

    if (!isValidUrl(url)) {
      toast({
        title: t("jobParser.invalidUrl"),
        description: t("jobParser.invalidUrlDesc"),
        variant: "destructive",
      });
      return;
    }

    setIsParsing(true);
    
    try {
      console.log('Parsing job posting from URL:', url);
      
      const { data: parsedData, error } = await supabase.functions.invoke('parse-job-posting', {
        body: { url },
      });

      if (error) {
        throw new Error(error.message || 'Failed to parse job posting');
      }

      // Check if blocked - show manual paste UI
      if (parsedData?.blocked) {
        setShowManualInput(true);
        setBlockedUrl(url);
        toast({
          title: t("jobParser.blockedTitle", "Seite nicht erreichbar"),
          description: t("jobParser.blockedDesc", "Die Stellenanzeige konnte nicht automatisch abgerufen werden. Bitte kopiere den Stellentext manuell."),
          variant: "destructive",
        });
        return;
      }

      console.log('Parsed job data:', parsedData);
      onJobParsed({ ...parsedData, source_url: url });
      
      toast({
        title: t("jobParser.importSuccess"),
        description: t("jobParser.importSuccessDesc"),
      });
      
      setUrl("");
    } catch (error) {
      console.error('Error parsing job URL:', error);
      toast({
        title: t("jobParser.importError"),
        description: error instanceof Error ? error.message : t("jobParser.importErrorDesc"),
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const parseManualText = async () => {
    if (!manualText.trim()) return;

    setIsParsing(true);
    try {
      console.log('Parsing manually pasted text, length:', manualText.length);
      
      const { data: parsedData, error } = await supabase.functions.invoke('parse-job-posting', {
        body: { url: blockedUrl, manualText: manualText.trim() },
      });

      if (error) {
        throw new Error(error.message || 'Failed to parse job posting');
      }

      console.log('Parsed manual text data:', parsedData);
      onJobParsed({ ...parsedData, source_url: blockedUrl });
      
      toast({
        title: t("jobParser.importSuccess"),
        description: t("jobParser.importSuccessDesc"),
      });
      
      setUrl("");
      setManualText("");
      setShowManualInput(false);
      setBlockedUrl("");
    } catch (error) {
      console.error('Error parsing manual text:', error);
      toast({
        title: t("jobParser.importError"),
        description: error instanceof Error ? error.message : t("jobParser.importErrorDesc"),
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const isValidUrl = (string: string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  if (showManualInput) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("jobParser.manualPasteHint", "Kopiere den Stellentext von der Website und füge ihn hier ein:")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowManualInput(false);
              setManualText("");
              setBlockedUrl("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder={t("jobParser.manualPastePlaceholder", "Stellentext hier einfügen...")}
          className="min-h-[150px]"
          disabled={isParsing}
        />
        <Button
          type="button"
          onClick={parseManualText}
          disabled={!manualText.trim() || isParsing}
          className="w-full"
        >
          {isParsing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ClipboardPaste className="h-4 w-4 mr-2" />
          )}
          {t("jobParser.parseManualText", "Text analysieren")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t("jobParser.placeholder")}
        className="flex-1"
        disabled={isParsing}
      />
      <Button 
        type="button"
        variant="outline" 
        onClick={parseJobUrl}
        disabled={!url.trim() || isParsing}
      >
        {isParsing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Link className="h-4 w-4 mr-2" />
            {t("jobParser.import")}
          </>
        )}
      </Button>
    </div>
  );
}
