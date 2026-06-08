import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { Users, Shield, ShieldCheck, Loader2, RefreshCw, Eye, Briefcase } from "lucide-react";

type AppRole = 'admin' | 'manager' | 'user' | 'viewer';

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  role: AppRole | null;
}

export function AdminUserTable() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.id);
        return {
          id: profile.id,
          email: profile.email || '',
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at || '',
          role: userRole?.role as AppRole | null
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.usersLoadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: AppRole) => {
    setUpdatingUserId(userId);
    try {
      const existingRole = users.find(u => u.id === userId)?.role;

      if (existingRole) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });
        if (error) throw error;
      }

      setUsers(users.map(u => 
        u.id === userId ? { ...u, role: newRole } : u
      ));

      const roleLabels: Record<AppRole, string> = {
        admin: 'Admin',
        manager: 'Manager',
        user: 'Recruiter',
        viewer: 'Viewer'
      };

      toast({
        title: t("toast.roleUpdated"),
        description: t("toast.roleUpdatedDesc", { role: roleLabels[newRole] }),
      });
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast({
        title: t("toast.error"),
        description: error.message || t("toast.roleUpdateError"),
        variant: "destructive",
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getRoleBadge = (role: AppRole | null) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-amber-500 hover:bg-amber-600"><ShieldCheck className="h-3 w-3 mr-1" />Admin</Badge>;
      case 'manager':
        return <Badge className="bg-blue-500 hover:bg-blue-600"><Briefcase className="h-3 w-3 mr-1" />Manager</Badge>;
      case 'user':
        return <Badge variant="secondary"><Shield className="h-3 w-3 mr-1" />Recruiter</Badge>;
      case 'viewer':
        return <Badge variant="outline"><Eye className="h-3 w-3 mr-1" />Viewer</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">{t("admin.noRole")}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5" />
              {t("admin.activeUsers")}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {t("admin.activeUsersDesc")}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t("admin.refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("admin.noUsersFound")}
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.users")}</TableHead>
                  <TableHead>{t("admin.role")}</TableHead>
                  <TableHead>{t("admin.registered")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="text-xs bg-primary/10">
                            {getInitials(user.full_name, user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{user.full_name || t("admin.unknown")}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Select
                        value={user.role || 'none'}
                        onValueChange={(value) => {
                          if (value !== 'none') {
                            updateUserRole(user.id, value as AppRole);
                          }
                        }}
                        disabled={updatingUserId === user.id}
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          {updatingUserId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <SelectValue placeholder={t("admin.selectRole")} />
                          )}
                        </SelectTrigger>
                        <SelectContent className="w-[360px] p-1" align="end">
                          <SelectItem value="viewer" textValue="Viewer" checkRight className="py-2 px-2 rounded-md">
                            <div className="flex items-center gap-2 w-full">
                              <Eye className="h-4 w-4 text-slate-500 shrink-0" />
                              <span className="font-medium text-sm w-20 shrink-0">Viewer</span>
                              <span className="text-xs text-muted-foreground truncate">{t("admin.roleViewerDesc")}</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="user" textValue="Recruiter" checkRight className="py-2 px-2 rounded-md">
                            <div className="flex items-center gap-2 w-full">
                              <Briefcase className="h-4 w-4 text-blue-500 shrink-0" />
                              <span className="font-medium text-sm w-20 shrink-0">Recruiter</span>
                              <span className="text-xs text-muted-foreground truncate">{t("admin.roleRecruiterDesc")}</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="manager" textValue="Manager" checkRight className="py-2 px-2 rounded-md">
                            <div className="flex items-center gap-2 w-full">
                              <Users className="h-4 w-4 text-amber-500 shrink-0" />
                              <span className="font-medium text-sm w-20 shrink-0">Manager</span>
                              <span className="text-xs text-muted-foreground truncate">{t("admin.roleManagerDesc")}</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="admin" textValue="Admin" checkRight className="py-2 px-2 rounded-md">
                            <div className="flex items-center gap-2 w-full">
                              <ShieldCheck className="h-4 w-4 text-red-500 shrink-0" />
                              <span className="font-medium text-sm w-20 shrink-0">Admin</span>
                              <span className="text-xs text-muted-foreground truncate">{t("admin.roleAdminDesc")}</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
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
