import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { format, subDays } from "date-fns";
import { de } from "date-fns/locale";

interface AuditEntry {
  id: string;
  job_id: string;
  user_id: string;
  action: string;
  details: any;
  created_at: string;
  user_name?: string;
  job_title?: string;
}

export function PublicationAuditLog() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [actionFilter, setActionFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("30");

  useEffect(() => {
    const fetchEntries = async () => {
      let query = supabase
        .from('publication_audit_log')
        .select('*, jobs(title), profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const daysAgo = parseInt(periodFilter);
      if (daysAgo > 0) {
        query = query.gte('created_at', subDays(new Date(), daysAgo).toISOString());
      }

      const { data } = await query;

      if (data) {
        setEntries(data.map((e: any) => ({
          ...e,
          job_title: e.jobs?.title || 'Unbekannt',
          user_name: e.profiles?.full_name || 'System',
        })));
      }
    };
    fetchEntries();
  }, [actionFilter, periodFilter]);

  const actionColor = (action: string) => {
    const map: Record<string, string> = {
      approved: 'default', rejected: 'destructive', regenerated: 'secondary',
      published: 'default', unpublished: 'outline', expired: 'destructive',
      edited: 'secondary', winner_set: 'default', test_restarted: 'outline',
      auto_winner_set: 'default',
    };
    return (map[action] || 'secondary') as any;
  };

  const actions = ['all', 'approved', 'unpublished', 'regenerated', 'edited', 'winner_set', 'test_restarted', 'auto_winner_set'];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle>{t("publicationManager.tabs.auditLog")}</CardTitle>
          <div className="flex gap-2">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {actions.map(a => (
                  <SelectItem key={a} value={a}>
                    {a === 'all' ? t('publicationManager.auditFilter.all') : t(`publicationManager.audit.${a}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('publicationManager.auditFilter.7days')}</SelectItem>
                <SelectItem value="30">{t('publicationManager.auditFilter.30days')}</SelectItem>
                <SelectItem value="90">{t('publicationManager.auditFilter.90days')}</SelectItem>
                <SelectItem value="0">{t('publicationManager.auditFilter.all')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t('publicationManager.auditFilter.noEntries')}</p>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {entry.user_name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{entry.user_name}</span>
                    <Badge variant={actionColor(entry.action)} className="text-xs">
                      {t(`publicationManager.audit.${entry.action}`)}
                    </Badge>
                    <span className="text-sm text-muted-foreground truncate">{entry.job_title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(entry.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
