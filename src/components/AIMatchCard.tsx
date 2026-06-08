import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  MapPin, Briefcase, Euro, User, Building2, Car, 
  ArrowRight, CheckCircle, AlertTriangle, XCircle 
} from "lucide-react";
import { useState } from "react";

interface AIMatchCardProps {
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
      avatar_url?: string;
      max_commute?: string;
    };
    jobs: {
      id: string;
      title: string;
      location: string;
      salary_range: string;
      clients: {
        name: string;
      } | null;
    };
  };
  onClick: () => void;
  onAccept?: (e: React.MouseEvent) => void;
  onReject?: (e: React.MouseEvent) => void;
  isUpdating?: boolean;
}

interface CommuteData {
  auto: { duration: string | null; distance: string | null } | null;
  oepnv: { duration: string | null; distance: string | null } | null;
}

// Extrahiert nur den Ortsnamen aus einer Adresse
const extractCity = (location: string): string => {
  if (!location) return '';
  const parts = location.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    // Wenn letzter Teil ein Ländercode ist, nimm vorletzten Teil
    if (lastPart.length <= 3 || /^(CH|DE|AT|Schweiz|Deutschland|Österreich)$/i.test(lastPart)) {
      const secondLast = parts[parts.length - 2];
      // PLZ entfernen falls vorhanden
      return secondLast.replace(/^\d{4,5}\s*/, '');
    }
    // PLZ entfernen falls vorhanden
    return lastPart.replace(/^\d{4,5}\s*/, '');
  }
  return parts[0];
};

// Konvertiert Zeitstring zu Minuten
const parseMinutesFromString = (str: string): number => {
  if (!str) return 0;
  let minutes = 0;
  const hoursMatch = str.match(/(\d+)\s*(?:h|stunden?)/i);
  if (hoursMatch) minutes += parseInt(hoursMatch[1]) * 60;
  const minsMatch = str.match(/(\d+)\s*(?:min|minuten?)/i);
  if (minsMatch) minutes += parseInt(minsMatch[1]);
  if (minutes === 0) {
    const plainNumber = parseInt(str.replace(/\D/g, ''));
    if (plainNumber > 0) minutes = plainNumber;
  }
  return minutes;
};

// Bestimmt das Status-Icon für Commute-Vergleich
const getCommuteStatusIcon = (actual: string, max: string) => {
  const actualMins = parseMinutesFromString(actual);
  const maxMins = parseMinutesFromString(max);
  if (maxMins === 0) return null;
  // 4-tier tolerance
  let tolerance: number;
  if (maxMins <= 20) tolerance = 0.30;
  else if (maxMins <= 35) tolerance = 0.25;
  else if (maxMins <= 60) tolerance = 0.15;
  else tolerance = 0.10;
  const toleranceLimit = maxMins * (1 + tolerance);
  if (actualMins <= maxMins) {
    return <CheckCircle className="h-3 w-3 text-success ml-1" />;
  } else if (actualMins <= toleranceLimit) {
    return <AlertTriangle className="h-3 w-3 text-warning ml-1" />;
  } else {
    return <XCircle className="h-3 w-3 text-destructive ml-1" />;
  }
};

export function AIMatchCard({ match, onClick, onAccept, onReject, isUpdating }: AIMatchCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // No automatic commute calculation - data comes from placement or detail dialog

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success bg-success/10';
    if (score >= 70) return 'text-warning bg-warning/10';
    return 'text-muted-foreground bg-muted';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return <Badge variant="default" className="bg-success">{t('aiMatches.accepted')}</Badge>;
      case 'rejected':
        return <Badge variant="destructive">{t('aiMatches.rejected')}</Badge>;
      default:
        return <Badge variant="secondary">{t('common.new')}</Badge>;
    }
  };

  return (
    <Card 
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 relative overflow-hidden group flex flex-col h-full"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          {getStatusBadge(match.status)}
          <div className={`text-xl font-bold ${getScoreColor(match.match_score).split(' ')[0]}`}>
            {match.match_score}%
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        <div className="space-y-3 flex-1">
        {/* Candidate Info */}
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={match.candidates?.avatar_url || ''} />
            <AvatarFallback className="text-xs">
              {match.candidates?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p 
              className="font-medium truncate flex items-center gap-1 hover:text-primary hover:underline cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/candidates/${match.candidate_id}`, { state: { from: '/ai-matches' } });
              }}
            >
              <User className="h-3 w-3 shrink-0" />
              {match.candidates?.name || t('common.unknown')}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {match.candidates?.position || match.candidates?.desired_position}
            </p>
          </div>
        </div>

        {/* Arrow divider */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          <ArrowRight className="h-4 w-4" />
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Job Info */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p 
              className="font-medium hover:text-primary hover:underline cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/jobs/${match.job_id}`, { state: { from: '/ai-matches' } });
              }}
            >
              {match.jobs?.title || t('common.unknown')}
            </p>
            {match.jobs?.clients?.name && (
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {match.jobs.clients.name}
              </p>
            )}
          </div>
        </div>

        {/* Divider after job */}
        <div className="h-px bg-border" />

        {/* Quick info row */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {/* Location with city names only */}
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="truncate max-w-[80px]">
              {extractCity(match.candidates?.location || '')}
            </span>
            <ArrowRight className="h-3 w-3" />
            <span className="truncate max-w-[80px]">
              {extractCity(match.jobs?.location || '')}
            </span>
          </div>
        </div>

        {/* Commute info - no auto-calculation, show dash */}
        <div className="flex items-center gap-2 text-xs">
          <Car className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">—</span>
          {match.candidates?.max_commute && (
            <span className="text-muted-foreground">max. {match.candidates.max_commute}</span>
          )}
        </div>

        {/* Salary comparison */}
        {(match.candidates?.desired_salary || match.jobs?.salary_range) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Euro className="h-3 w-3" />
            {match.candidates?.desired_salary && (
              <span>{match.candidates.desired_salary}</span>
            )}
            {match.candidates?.desired_salary && match.jobs?.salary_range && (
              <ArrowRight className="h-3 w-3" />
            )}
            {match.jobs?.salary_range && (
              <span>{match.jobs.salary_range}</span>
            )}
          </div>
        )}

        {/* Top match reasons - fully displayed */}
        {match.match_reasons && match.match_reasons.length > 0 && (
          <div className="pt-2 border-t">
            <div className="flex flex-wrap gap-1">
              {match.match_reasons.slice(0, 2).map((reason, idx) => (
                <Badge key={idx} variant="outline" className="text-xs font-normal">
                  {reason}
                </Badge>
              ))}
              {match.match_reasons.length > 2 && (
                <Badge variant="outline" className="text-xs font-normal">
                  +{match.match_reasons.length - 2}
                </Badge>
              )}
            </div>
          </div>
        )}

        </div>

        {/* Accept/Reject buttons - always at bottom */}
        <div className="flex gap-2 pt-3 border-t mt-auto">
          <Button 
            variant="outline" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onReject?.(e);
            }}
            disabled={isUpdating}
            className="flex-1"
          >
            <XCircle className="h-3 w-3 mr-1" />
            {t('aiMatches.reject')}
          </Button>
          <Button 
            variant="default"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onAccept?.(e);
            }}
            disabled={isUpdating}
            className="flex-1"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            {t('aiMatches.accept')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
