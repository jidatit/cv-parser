import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, Mail, Phone, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";

interface DuplicateCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  matchType: 'email' | 'name' | 'phone';
}

interface DuplicateWarningProps {
  duplicates: DuplicateCandidate[];
  onIgnore?: () => void;
}

export function DuplicateWarning({ duplicates, onIgnore }: DuplicateWarningProps) {
  const { t } = useLanguage();
  
  if (duplicates.length === 0) return null;

  const getMatchTypeBadge = (matchType: 'email' | 'name' | 'phone') => {
    switch (matchType) {
      case 'email':
        return <Badge variant="destructive" className="text-xs"><Mail className="h-3 w-3 mr-1" />E-Mail</Badge>;
      case 'name':
        return <Badge variant="secondary" className="text-xs"><User className="h-3 w-3 mr-1" />Name</Badge>;
      case 'phone':
        return <Badge variant="outline" className="text-xs"><Phone className="h-3 w-3 mr-1" />Telefon</Badge>;
    }
  };

  return (
    <Alert variant="destructive" className="my-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t("duplicates.warning") || "Mögliche Duplikate gefunden"}</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm mb-3">
          {t("duplicates.description") || "Die folgenden Kandidaten könnten bereits im System existieren:"}
        </p>
        <div className="space-y-2 mb-3">
          {duplicates.slice(0, 3).map((dup) => (
            <div key={dup.id} className="flex items-center justify-between bg-background/50 p-2 rounded text-sm">
              <div className="flex items-center gap-2">
                {getMatchTypeBadge(dup.matchType)}
                <span className="font-medium">{dup.name}</span>
                {dup.email && <span className="text-muted-foreground text-xs">({dup.email})</span>}
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/candidates/${dup.id}`} target="_blank">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  {t("common.view") || "Ansehen"}
                </Link>
              </Button>
            </div>
          ))}
          {duplicates.length > 3 && (
            <p className="text-xs text-muted-foreground">
              {t("duplicates.moreFound") || `+${duplicates.length - 3} weitere mögliche Duplikate`}
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
