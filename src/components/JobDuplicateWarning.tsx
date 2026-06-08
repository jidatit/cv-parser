import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, MapPin, Briefcase } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";

interface DuplicateJob {
  id: string;
  title: string;
  clientName: string | null;
  location: string | null;
  status: string | null;
  matchType: 'title_company_location';
}

interface JobDuplicateWarningProps {
  duplicates: DuplicateJob[];
  onIgnore?: () => void;
}

export function JobDuplicateWarning({ duplicates, onIgnore }: JobDuplicateWarningProps) {
  const { t } = useLanguage();

  if (duplicates.length === 0) return null;

  return (
    <Alert variant="destructive" className="my-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t("duplicates.warning") || "Mögliche Duplikate gefunden"}</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm mb-3">
          {t("duplicates.jobDescription") || "Die folgenden Stellen könnten bereits im System existieren:"}
        </p>
        <div className="space-y-2 mb-3">
          {duplicates.slice(0, 3).map((dup) => (
            <div key={dup.id} className="flex items-center justify-between bg-background/50 p-2 rounded text-sm">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">
                    <Briefcase className="h-3 w-3 mr-1" />
                    Titel+Firma+Ort
                  </Badge>
                  <span className="font-medium">{dup.title}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {dup.clientName && <span>{dup.clientName}</span>}
                  {dup.location && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {dup.location}
                    </span>
                  )}
                  {dup.status && (
                    <Badge variant="outline" className="text-xs py-0">
                      {dup.status}
                    </Badge>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/jobs/${dup.id}`} target="_blank">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  {t("common.view") || "Ansehen"}
                </Link>
              </Button>
            </div>
          ))}
          {duplicates.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{duplicates.length - 3} {t("duplicates.moreFound") || "weitere mögliche Duplikate"}
            </p>
          )}
        </div>
        {onIgnore && (
          <Button variant="outline" size="sm" onClick={onIgnore}>
            {t("duplicates.ignoreAndContinue") || "Ignorieren und fortfahren"}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
