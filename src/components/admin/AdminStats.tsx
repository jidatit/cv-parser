import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserCheck, ShieldCheck, Shield } from "lucide-react";

interface Stats {
  totalUsers: number;
  activeInvitations: number;
  adminCount: number;
  managerCount: number;
}

export function AdminStats() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeInvitations: 0,
    adminCount: 0,
    managerCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [profilesRes, invitationsRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('invitations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('user_roles').select('role'),
      ]);

      const roles = rolesRes.data || [];
      const adminCount = roles.filter(r => r.role === 'admin').length;
      const managerCount = roles.filter(r => r.role === 'manager').length;

      setStats({
        totalUsers: profilesRes.count || 0,
        activeInvitations: invitationsRes.count || 0,
        adminCount,
        managerCount,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      label: "Aktive Benutzer",
      value: stats.totalUsers,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Offene Einladungen",
      value: stats.activeInvitations,
      icon: UserCheck,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Administratoren",
      value: stats.adminCount,
      icon: ShieldCheck,
      color: "text-rose-500",
      bgColor: "bg-rose-500/10",
    },
    {
      label: "Manager",
      value: stats.managerCount,
      icon: Shield,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
