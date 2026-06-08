import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, RefreshCw, AlertTriangle, User, Globe, Clock } from "lucide-react";

interface AccessLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  attempted_path: string;
  user_role: string | null;
  required_roles: string[] | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export function AccessLogsTable() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('access_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading access logs:', error);
      toast({
        title: "Fehler",
        description: "Zugriffsprotokolle konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Gerade eben";
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    return `vor ${diffDays} Tagen`;
  };

  const getRoleBadge = (role: string | null) => {
    if (!role) return <Badge variant="outline" className="text-muted-foreground">Keine Rolle</Badge>;
    
    const roleConfig: Record<string, { label: string; className: string }> = {
      admin: { label: "Admin", className: "bg-amber-500 hover:bg-amber-600" },
      manager: { label: "Manager", className: "bg-blue-500 hover:bg-blue-600" },
      user: { label: "Recruiter", className: "bg-slate-500 hover:bg-slate-600" },
      viewer: { label: "Viewer", className: "bg-slate-400 hover:bg-slate-500" },
    };

    const config = roleConfig[role] || { label: role, className: "bg-slate-500" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Zugriffsversuche
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Protokoll fehlgeschlagener Zugriffe auf geschützte Bereiche
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">Keine Zugriffsversuche protokolliert.</p>
            <p className="text-xs text-muted-foreground mt-1">Das ist gut! Keine unerlaubten Zugriffe.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Benutzer</TableHead>
                  <TableHead>Pfad</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Benötigt</TableHead>
                  <TableHead>Zeitpunkt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-destructive" />
                        </div>
                        <div>
                          <p className="text-sm font-medium truncate max-w-[180px]">
                            {log.user_email || 'Unbekannt'}
                          </p>
                          {log.ip_address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {log.ip_address}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {log.attempted_path}
                      </code>
                    </TableCell>
                    <TableCell>{getRoleBadge(log.user_role)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {log.required_roles?.map((role) => (
                          <Badge key={role} variant="outline" className="text-xs">
                            {role}
                          </Badge>
                        )) || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span title={formatDate(log.created_at)}>
                          {getRelativeTime(log.created_at)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
