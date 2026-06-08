import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, TrendingUp, Users, Briefcase, Building2, Target, Share2, CheckSquare, Send, CalendarCheck } from "lucide-react";
import { EnhancedNewCandidateDialog } from "@/components/EnhancedNewCandidateDialog";
import { NewJobDialog } from "@/components/NewJobDialog";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { formatDistanceToNow, startOfDay, startOfWeek, startOfMonth, startOfYear, format, getISOWeek, endOfWeek } from "date-fns";
import { de, enUS, fr, it, es } from "date-fns/locale";
import { Link } from "react-router-dom";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import { useLanguage } from "@/hooks/useLanguage";

type TimeFilter = 'day' | 'week' | 'month' | 'year';

interface DashboardStats {
  activeCandidates: number;
  openJobs: number;
  activeClients: number;
  totalCandidates: number;
  totalJobs: number;
  totalMatches: number;
  sharedMatches: number;
  sentMatches: number;
  invitations: number;
  totalTasks: number;
}

interface PipelineStats {
  recruitingPipeline: { [key: string]: number };
  placementsPipeline: { [key: string]: number };
}

interface Activity {
  type: string;
  name: string;
  time: string;
  status: string;
  link?: string;
  userId: string;
  userEmail?: string;
  userAvatarUrl?: string;
  timestamp: Date;
}

export default function Dashboard() {
  const { t, currentLanguage } = useLanguage();
  const { configurations, loading: configLoading } = useStatusConfigurations();
  const [stats, setStats] = useState<DashboardStats>({
    activeCandidates: 0,
    openJobs: 0,
    activeClients: 0,
    totalCandidates: 0,
    totalJobs: 0,
    totalMatches: 0,
    sharedMatches: 0,
    sentMatches: 0,
    invitations: 0,
    totalTasks: 0,
  });
  const [pipelineStats, setPipelineStats] = useState<PipelineStats>({
    recruitingPipeline: {},
    placementsPipeline: {},
  });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(() => {
    const saved = localStorage.getItem('dashboardTimeFilter');
    return (saved as TimeFilter) || 'month';
  });

  const getDateLocale = () => {
    switch (currentLanguage) {
      case 'de': return de;
      case 'fr': return fr;
      case 'it': return it;
      case 'es': return es;
      default: return enUS;
    }
  };

  const handleFilterChange = (filter: TimeFilter) => {
    setTimeFilter(filter);
    localStorage.setItem('dashboardTimeFilter', filter);
  };

  useEffect(() => {
    if (!configLoading) {
      fetchDashboardData();
    }
  }, [timeFilter, configLoading, configurations]);

  const getFilterDate = () => {
    const now = new Date();
    switch (timeFilter) {
      case 'day':
        return startOfDay(now).toISOString();
      case 'week':
        return startOfWeek(now, { weekStartsOn: 1 }).toISOString();
      case 'month':
        return startOfMonth(now).toISOString();
      case 'year':
        return startOfYear(now).toISOString();
      default:
        return startOfMonth(now).toISOString();
    }
  };

  const getPeriodLabel = () => {
    const now = new Date();
    const dateLocale = getDateLocale();
    switch (timeFilter) {
      case 'day':
        return format(now, 'EEEE, dd.MM.yyyy', { locale: dateLocale });
      case 'week': {
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
        return `KW ${getISOWeek(now)} (${format(weekStart, 'dd.MM.', { locale: dateLocale })} - ${format(weekEnd, 'dd.MM.yyyy', { locale: dateLocale })})`;
      }
      case 'month':
        return format(now, 'MMMM yyyy', { locale: dateLocale });
      case 'year':
        return format(now, 'yyyy');
      default:
        return '';
    }
  };

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const filterDate = getFilterDate();
      const dateLocale = getDateLocale();

      // Single DB function call replaces 8 parallel queries
      const [statsRes, allCandidatesRes, allPlacementsRes] = await Promise.all([
        supabase.rpc('get_dashboard_stats', {
          _user_id: user.id,
          _filter_date: filterDate,
        }),
        supabase.from('candidates').select('id, recruiting_status').eq('user_id', user.id),
        supabase.from('placements').select('id, stage').eq('user_id', user.id),
      ]);

      if (statsRes.error) throw statsRes.error;
      const dbStats = statsRes.data as any;

      setStats({
        activeCandidates: dbStats.activeCandidates || 0,
        openJobs: dbStats.openJobs || 0,
        activeClients: dbStats.activeClients || 0,
        totalCandidates: dbStats.totalCandidates || 0,
        totalJobs: dbStats.totalJobs || 0,
        totalMatches: dbStats.totalMatches || 0,
        sharedMatches: dbStats.sharedMatches || 0,
        sentMatches: dbStats.sentMatches || 0,
        invitations: dbStats.invitations || 0,
        totalTasks: dbStats.totalTasks || 0,
      });

      const recruitingPipeline: { [key: string]: number } = {};
      
      configurations.recruitingStages.forEach(stage => {
        recruitingPipeline[stage.label] = allCandidatesRes.data?.filter(c => c.recruiting_status === stage.label).length || 0;
      });

      const placementsPipeline: { [key: string]: number } = {};
      
      configurations.matchStages.forEach(stage => {
        placementsPipeline[stage.label] = allPlacementsRes.data?.filter(p => p.stage === stage.label).length || 0;
      });

      setPipelineStats({
        recruitingPipeline,
        placementsPipeline,
      });

      const recentActivities: Activity[] = [];

      const { data: recentCandidates } = await supabase
        .from("candidates")
        .select("id, name, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentCandidates) {
        recentCandidates.forEach((candidate) => {
          recentActivities.push({
            type: t("dashboard.candidateAdded"),
            name: candidate.name,
            time: formatDistanceToNow(new Date(candidate.created_at), {
              addSuffix: true,
              locale: dateLocale,
            }),
            status: "new",
            link: `/candidates/${candidate.id}`,
            userId: candidate.user_id,
            timestamp: new Date(candidate.created_at),
          });
        });
      }

      const inquiryIndex = configurations.matchStages.findIndex(s => s.label === "Inquiry");
      if (inquiryIndex !== -1) {
        const relevantStages = configurations.matchStages.slice(inquiryIndex).map(s => s.label);
        
        const { data: recentPlacements } = await supabase
          .from("placements")
          .select(`
            id,
            stage,
            updated_at,
            candidate_id,
            user_id,
            candidates!inner(name)
          `)
          .in("stage", relevantStages)
          .order("updated_at", { ascending: false })
          .limit(5);

        if (recentPlacements) {
          recentPlacements.forEach((placement: any) => {
            recentActivities.push({
              type: `${t("dashboard.candidateInStage")} ${placement.stage}`,
              name: placement.candidates.name,
              time: formatDistanceToNow(new Date(placement.updated_at), {
                addSuffix: true,
                locale: dateLocale,
              }),
              status: "new",
              link: `/pipeline?placement=${placement.id}`,
              userId: placement.user_id,
              timestamp: new Date(placement.updated_at),
            });
          });
        }
      }

      const { data: recentClients } = await supabase
        .from("clients")
        .select("id, name, status, updated_at, user_id")
        .in("status", ["Offen", "Partner"])
        .order("updated_at", { ascending: false })
        .limit(5);

      if (recentClients) {
        recentClients.forEach((client) => {
          recentActivities.push({
            type: `${t("dashboard.clientStatusSet")} ${client.status}`,
            name: client.name,
            time: formatDistanceToNow(new Date(client.updated_at), {
              addSuffix: true,
              locale: dateLocale,
            }),
            status: "new",
            link: `/clients/${client.id}`,
            userId: client.user_id,
            timestamp: new Date(client.updated_at),
          });
        });
      }

      recentActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const userIds = [...new Set(recentActivities.map(a => a.userId))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .in("id", userIds);

      if (profiles) {
        recentActivities.forEach(activity => {
          const profile = profiles.find(p => p.id === activity.userId);
          if (profile) {
            activity.userEmail = profile.email || profile.full_name || t("dashboard.unknown");
            activity.userAvatarUrl = profile.avatar_url || undefined;
          }
        });
      }

      setActivities(recentActivities.slice(0, 8));
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const kpiCards = [
    {
      title: t("dashboard.addedCandidates"),
      value: stats.totalCandidates.toString(),
      icon: Users,
      color: "bg-blue-500",
    },
    {
      title: t("dashboard.addedJobs"),
      value: stats.totalJobs.toString(),
      icon: Briefcase,
      color: "bg-amber-500",
    },
    {
      title: t("dashboard.createdMatches"),
      value: stats.totalMatches.toString(),
      icon: Target,
      color: "bg-rose-500",
    },
    {
      title: t("dashboard.sentMatches"),
      value: stats.sentMatches.toString(),
      icon: Send,
      color: "bg-teal-500",
    },
    {
      title: t("dashboard.sharings"),
      value: stats.sharedMatches.toString(),
      icon: Share2,
      color: "bg-green-500",
    },
    {
      title: t("dashboard.invitations"),
      value: stats.invitations.toString(),
      icon: CalendarCheck,
      color: "bg-orange-500",
    },
    {
      title: t("dashboard.createdTasks"),
      value: stats.totalTasks.toString(),
      icon: CheckSquare,
      color: "bg-purple-500",
    },
  ];

  const statsCards = [
    {
      title: t("dashboard.openPositions"),
      value: stats.openJobs.toString(),
      icon: Briefcase,
      color: "bg-success",
    },
    {
      title: t("dashboard.activeClients"),
      value: stats.activeClients.toString(),
      icon: Building2,
      color: "bg-warning",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            <Button 
              variant={timeFilter === 'day' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => handleFilterChange('day')}
              className="text-xs"
            >
              {t("dashboard.day")}
            </Button>
            <Button 
              variant={timeFilter === 'week' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => handleFilterChange('week')}
              className="text-xs"
            >
              {t("dashboard.week")}
            </Button>
            <Button 
              variant={timeFilter === 'month' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => handleFilterChange('month')}
              className="text-xs"
            >
              {t("dashboard.month")}
            </Button>
            <Button 
              variant={timeFilter === 'year' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => handleFilterChange('year')}
              className="text-xs"
            >
              {t("dashboard.year")}
            </Button>
          </div>
          <span className="text-xs text-muted-foreground ml-1">{getPeriodLabel()}</span>
          <div className="flex gap-2">
            <EnhancedNewCandidateDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  {t("common.candidate")}
                </Button>
              }
              onCandidateCreated={() => {
                console.log("New candidate created");
              }}
            />
            <NewJobDialog
              trigger={
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  {t("common.position")}
                </Button>
              }
              onJobCreated={(job) => {
                console.log("New job created:", job);
              }}
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-7">
        {kpiCards.map((stat) => (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.color} text-white`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {loading ? "..." : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t("dashboard.pipelineOverview")}</CardTitle>
          <CardDescription>{t("dashboard.pipelineDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <>
                {Object.entries(pipelineStats.recruitingPipeline).map(([stage, count]) => (
                  <div key={stage} className="flex flex-col items-center gap-2 flex-1 min-w-0">
                    <Badge variant="secondary" className="font-semibold px-2.5 py-1 whitespace-nowrap h-6 flex items-center justify-center">{count}</Badge>
                    <span className="text-[10px] text-muted-foreground text-center whitespace-nowrap h-8 flex items-center">{stage}</span>
                  </div>
                ))}
                
                <div className="h-14 w-px bg-border flex-shrink-0" />
                
                {Object.entries(pipelineStats.placementsPipeline).map(([stage, count]) => (
                  <>
                    <div key={stage} className="flex flex-col items-center gap-2 flex-1 min-w-0">
                      <Badge variant="secondary" className="font-semibold px-2.5 py-1 whitespace-nowrap h-6 flex items-center justify-center">{count}</Badge>
                      <span className="text-[10px] text-muted-foreground text-center whitespace-nowrap h-8 flex items-center">{stage}</span>
                    </div>
                    {stage === "Shared" && <div key={`sep-${stage}`} className="h-14 w-px bg-border flex-shrink-0" />}
                  </>
                ))}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {statsCards.map((stat) => (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.color} text-white`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {loading ? "..." : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">{t("dashboard.recentActivities")}</CardTitle>
            <CardDescription>
              {t("dashboard.recentActivitiesDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="text-sm text-muted-foreground p-4">{t("common.loading")}</p>
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t("dashboard.noActivities")}</p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-0 p-4">
                  {activities.map((activity, index) => {
                    const linkTo = activity.link 
                      ? activity.link.includes('?')
                        ? {
                            pathname: activity.link.split('?')[0],
                            search: '?' + activity.link.split('?')[1]
                          }
                        : activity.link
                      : "#";
                    
                    return (
                    <Link
                      key={index}
                      to={linkTo}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/50 transition-colors rounded px-2"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {activity.type}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {activity.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          {activity.userAvatarUrl && (
                            <AvatarImage src={activity.userAvatarUrl} alt={activity.userEmail || ""} />
                          )}
                          <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                            {activity.userEmail?.charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {activity.time}
                        </span>
                      </div>
                    </Link>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">{t("dashboard.quickActions")}</CardTitle>
            <CardDescription>
              {t("dashboard.recentActivitiesDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <EnhancedNewCandidateDialog
              trigger={
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Users className="mr-2 h-4 w-4" />
                  {t("dashboard.newCandidate")}
                </Button>
              }
              onCandidateCreated={() => {
                console.log("New candidate created");
              }}
            />
            <NewJobDialog
              trigger={
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Briefcase className="mr-2 h-4 w-4" />
                  {t("dashboard.newPosition")}
                </Button>
              }
              onJobCreated={(job) => {
                console.log("New job created:", job);
              }}
            />
            <Link to="/clients" className="block">
              <Button variant="outline" className="w-full justify-start" size="sm">
                <Building2 className="mr-2 h-4 w-4" />
                {t("clients.title")}
              </Button>
            </Link>
            <Link to="/pipeline" className="block">
              <Button variant="outline" className="w-full justify-start" size="sm">
                <Target className="mr-2 h-4 w-4" />
                {t("pipeline.title")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
