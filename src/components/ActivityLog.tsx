import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, History, Plus, Pencil, Trash2, User, GitBranch, UserCheck, RefreshCw, FileText } from "lucide-react";
import { formatDistanceToNow, format, differenceInMinutes } from "date-fns";
import { de, enUS, fr, it, es } from "date-fns/locale";
import { useLanguage } from "@/hooks/useLanguage";
import { formatActivityLog, FormattedActivity } from "@/lib/activityFormatter";

interface ActivityLogEntry {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_data: any;
  new_data: any;
  changes: any;
  created_at: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
}

interface GroupedLogEntry {
  logs: ActivityLogEntry[];
  message: string;
  icon: FormattedActivity['icon'];
  count: number;
  user_id: string;
  created_at: string;
  details?: string;
}

interface ActivityLogProps {
  entityType: string;
  entityId: string;
  maxHeight?: string;
}

export function ActivityLog({ entityType, entityId, maxHeight = "400px" }: ActivityLogProps) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const { t, currentLanguage } = useLanguage();

  const getLocale = () => {
    const locales: Record<string, typeof de> = { de, en: enUS, fr, it, es };
    return locales[currentLanguage] || de;
  };

  useEffect(() => {
    loadLogs();
  }, [entityType, entityId]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);

      // Fetch profiles for user names
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(log => log.user_id))];
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        
        if (profileData) {
          const profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
          profileData.forEach(p => {
            profileMap[p.id] = { full_name: p.full_name, email: p.email };
          });
          setProfiles(profileMap);
        }
      }
    } catch (error) {
      console.error('Error loading activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (icon: FormattedActivity['icon']) => {
    switch (icon) {
      case 'create':
        return <Plus className="h-4 w-4 text-green-500" />;
      case 'delete':
        return <Trash2 className="h-4 w-4 text-red-500" />;
      case 'match':
        return <GitBranch className="h-4 w-4 text-purple-500" />;
      case 'stage':
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
      case 'assign':
        return <UserCheck className="h-4 w-4 text-orange-500" />;
      case 'status':
        return <RefreshCw className="h-4 w-4 text-yellow-500" />;
      case 'document':
        return <FileText className="h-4 w-4 text-cyan-500" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityBadgeVariant = (icon: FormattedActivity['icon']): "default" | "secondary" | "destructive" | "outline" => {
    switch (icon) {
      case 'create':
      case 'match':
        return 'default';
      case 'delete':
        return 'destructive';
      case 'update':
      case 'stage':
      case 'status':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getUserName = (userId: string) => {
    const profile = profiles[userId];
    if (profile?.full_name) return profile.full_name;
    if (profile?.email) return profile.email.split('@')[0];
    return t("common.unknown") || 'Unbekannt';
  };

  // Group consecutive similar activities (same user, same message type, within 5 minutes)
  const groupedLogs = useMemo(() => {
    const groups: GroupedLogEntry[] = [];
    
    for (const log of logs) {
      const activities = formatActivityLog(
        {
          action: log.action,
          entity_type: log.entity_type,
          changes: log.changes,
          new_data: log.new_data,
          old_data: log.old_data
        },
        t
      );
      const mainActivity = activities[0];
      if (!mainActivity) continue;

      const lastGroup = groups[groups.length - 1];
      
      // Check if this can be grouped with the previous entry
      if (
        lastGroup &&
        lastGroup.user_id === log.user_id &&
        lastGroup.message === mainActivity.message &&
        lastGroup.icon === mainActivity.icon &&
        Math.abs(differenceInMinutes(new Date(log.created_at), new Date(lastGroup.created_at))) <= 5
      ) {
        // Add to existing group
        lastGroup.logs.push(log);
        lastGroup.count++;
        // Update details to show count
        lastGroup.details = `${lastGroup.count}x`;
      } else {
        // Create new group
        groups.push({
          logs: [log],
          message: mainActivity.message,
          icon: mainActivity.icon,
          count: 1,
          user_id: log.user_id,
          created_at: log.created_at,
          details: mainActivity.details
        });
      }
    }
    
    return groups;
  }, [logs, t]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {t("activity.log") || "Aktivitätslog"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          {t("activity.log") || "Aktivitätslog"}
          {groupedLogs.length > 0 && (
            <Badge variant="outline" className="ml-auto">{groupedLogs.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groupedLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("activity.noActivity") || "Keine Aktivitäten vorhanden"}
          </p>
        ) : (
          <ScrollArea style={{ maxHeight }}>
            <div className="space-y-4">
              {groupedLogs.map((group, index) => (
                <div key={group.logs[0].id} className="flex gap-3 pb-4 border-b last:border-0 last:pb-0">
                  <div className="flex-shrink-0 mt-1">
                    {getActivityIcon(group.icon)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={getActivityBadgeVariant(group.icon)} className="text-xs">
                        {group.message}
                      </Badge>
                      {group.count > 1 && (
                        <Badge variant="outline" className="text-xs">
                          {group.count}x
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {getUserName(group.user_id)}
                      </span>
                    </div>
                    {group.details && group.count === 1 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {group.details}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1" title={format(new Date(group.created_at), 'PPpp', { locale: getLocale() })}>
                      {formatDistanceToNow(new Date(group.created_at), { addSuffix: true, locale: getLocale() })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
