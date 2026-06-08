import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewStats } from "@/components/analytics/OverviewStats";
import { UserKPIs } from "@/components/analytics/UserKPIs";
import { PipelineAnalytics } from "@/components/analytics/PipelineAnalytics";
import { ActivityTimeline } from "@/components/analytics/ActivityTimeline";
import { ControllerAI } from "@/components/analytics/ControllerAI";
import { ConversionFunnel } from "@/components/analytics/ConversionFunnel";
import { TopSkillsChart } from "@/components/analytics/TopSkillsChart";

interface AnalyticsData {
  stats: {
    totalCandidates: number;
    totalJobs: number;
    totalClients: number;
    totalPlacements: number;
    openJobs: number;
    activeCandidates: number;
    conversionRate: number;
    avgTimeToFill: number;
  };
  userKPIs: Array<{
    userId: string;
    userName: string;
    email: string;
    candidatesCreated: number;
    jobsCreated: number;
    clientsCreated: number;
    placementsCreated: number;
    tasksCompleted: number;
    tasksOpen: number;
    conversionRate: number;
    trend: "up" | "down" | "stable";
  }>;
  pipelineData: Array<{
    stage: string;
    count: number;
    percentage: number;
  }>;
  activityData: Array<{
    date: string;
    candidates: number;
    jobs: number;
    placements: number;
    clients: number;
  }>;
  funnelData: Array<{
    stage: string;
    count: number;
    conversionFromPrevious: number;
  }>;
  topSkills: Array<{ skill: string; count: number }>;
}

export default function Analytics() {
  const { toast } = useToast();
  const { t, currentLanguage } = useLanguage();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Fetch all data in parallel
      const [
        { data: candidates },
        { data: jobs },
        { data: clients },
        { data: placements },
        { data: tasks },
        { data: profiles },
      ] = await Promise.all([
        supabase.from("candidates").select("*"),
        supabase.from("jobs").select("*"),
        supabase.from("clients").select("*"),
        supabase.from("placements").select("*"),
        supabase.from("tasks").select("*"),
        supabase.from("profiles").select("*"),
      ]);

      // Calculate basic stats - only count "Placed" stage as actual placements
      // Only count active candidates (Active, Passive statuses)
      const activeCandidateStatuses = ["Active", "Passive"];
      const totalCandidates = candidates?.filter((c) => activeCandidateStatuses.includes(c.status || "")).length || 0;
      // Only count active jobs (Open, Auftrag, Active statuses)
      const activeJobStatuses = ["Offen", "Assignment", "Active", "External"];
      const totalJobs = jobs?.filter((j) => activeJobStatuses.includes(j.status || "")).length || 0;
      const totalClients = clients?.length || 0;
      const totalPlacements = placements?.filter((p) => p.stage === "Placed").length || 0;
      const openJobs = jobs?.filter((j) => j.status === "Offen" || j.status === "Assignment" || j.status === "External").length || 0;
      const activeCandidates = candidates?.filter((c) => c.status === "Active").length || 0;
      const conversionRate = totalCandidates > 0 ? (totalPlacements / totalCandidates) * 100 : 0;

      // Calculate avg time to fill (simplified - based on placement creation)
      const avgTimeToFill = 0; // Would need job creation date vs placement date

      // Calculate User KPIs
      const userMap = new Map<string, any>();
      profiles?.forEach((profile) => {
        userMap.set(profile.id, {
          userId: profile.id,
          userName: profile.full_name || profile.email || t("dashboard.unknown"),
          email: profile.email || "",
          candidatesCreated: 0,
          jobsCreated: 0,
          clientsCreated: 0,
          placementsCreated: 0,
          tasksCompleted: 0,
          tasksOpen: 0,
          conversionRate: 0,
          trend: "stable" as const,
        });
      });

      candidates?.forEach((c) => {
        const user = userMap.get(c.user_id);
        if (user) user.candidatesCreated++;
      });

      jobs?.forEach((j) => {
        const user = userMap.get(j.user_id);
        if (user) user.jobsCreated++;
      });

      clients?.forEach((c) => {
        const user = userMap.get(c.user_id);
        if (user) user.clientsCreated++;
      });

      placements?.forEach((p) => {
        if (p.stage === "Placed") {
          const user = userMap.get(p.user_id);
          if (user) user.placementsCreated++;
        }
      });

      tasks?.forEach((t) => {
        const user = userMap.get(t.user_id);
        if (user) {
          if (t.completed) {
            user.tasksCompleted++;
          } else {
            user.tasksOpen++;
          }
        }
      });

      // Calculate conversion rate per user
      userMap.forEach((user) => {
        if (user.candidatesCreated > 0) {
          user.conversionRate = (user.placementsCreated / user.candidatesCreated) * 100;
        }
        // Simple trend calculation based on recent placements
        if (user.placementsCreated > 2) {
          user.trend = "up";
        } else if (user.placementsCreated === 0 && user.candidatesCreated > 5) {
          user.trend = "down";
        }
      });

      const userKPIs = Array.from(userMap.values()).filter(
        (u) => u.candidatesCreated > 0 || u.jobsCreated > 0 || u.clientsCreated > 0
      );

      // Pipeline data
      const stageOrder = ["Ready2Send", "Sent", "Interview", "Offer", "Placed", "Rejected"];
      const stageCounts: Record<string, number> = {};
      stageOrder.forEach((stage) => (stageCounts[stage] = 0));

      placements?.forEach((p) => {
        const stage = p.stage || "Ready2Send";
        if (stageCounts[stage] !== undefined) {
          stageCounts[stage]++;
        }
      });

      const totalInPipeline = Object.values(stageCounts).reduce((a, b) => a + b, 0);
      const pipelineData = stageOrder.map((stage) => ({
        stage,
        count: stageCounts[stage],
        percentage: totalInPipeline > 0 ? (stageCounts[stage] / totalInPipeline) * 100 : 0,
      }));

      // Activity timeline (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const activityMap = new Map<string, any>();
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString(currentLanguage === 'de' ? 'de-DE' : currentLanguage === 'fr' ? 'fr-FR' : currentLanguage === 'es' ? 'es-ES' : currentLanguage === 'it' ? 'it-IT' : 'en-US', { day: "2-digit", month: "2-digit" });
        activityMap.set(dateStr, { date: dateStr, candidates: 0, jobs: 0, placements: 0, clients: 0 });
      }

      candidates?.forEach((c) => {
        const date = new Date(c.created_at);
        if (date >= thirtyDaysAgo) {
          const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
          const entry = activityMap.get(dateStr);
          if (entry) entry.candidates++;
        }
      });

      jobs?.forEach((j) => {
        const date = new Date(j.created_at);
        if (date >= thirtyDaysAgo) {
          const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
          const entry = activityMap.get(dateStr);
          if (entry) entry.jobs++;
        }
      });

      placements?.forEach((p) => {
        const date = new Date(p.created_at);
        if (date >= thirtyDaysAgo) {
          const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
          const entry = activityMap.get(dateStr);
          if (entry) entry.placements++;
        }
      });

      clients?.forEach((c) => {
        const date = new Date(c.created_at);
        if (date >= thirtyDaysAgo) {
          const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
          const entry = activityMap.get(dateStr);
          if (entry) entry.clients++;
        }
      });

      const activityData = Array.from(activityMap.values()).reverse();

      // Conversion funnel
      const funnelData = [
        { stage: t("analytics.candidates"), count: totalCandidates, conversionFromPrevious: 100 },
        {
          stage: t("analytics.inPipeline"),
          count: totalInPipeline,
          conversionFromPrevious: totalCandidates > 0 ? (totalInPipeline / totalCandidates) * 100 : 0,
        },
        {
          stage: t("analytics.interview"),
          count: stageCounts["Interview"] + stageCounts["Offer"] + stageCounts["Placed"],
          conversionFromPrevious:
            totalInPipeline > 0
              ? ((stageCounts["Interview"] + stageCounts["Offer"] + stageCounts["Placed"]) / totalInPipeline) * 100
              : 0,
        },
        {
          stage: t("analytics.offer"),
          count: stageCounts["Offer"] + stageCounts["Placed"],
          conversionFromPrevious:
            stageCounts["Interview"] + stageCounts["Offer"] + stageCounts["Placed"] > 0
              ? ((stageCounts["Offer"] + stageCounts["Placed"]) /
                  (stageCounts["Interview"] + stageCounts["Offer"] + stageCounts["Placed"])) *
                100
              : 0,
        },
        {
          stage: "Placed",
          count: stageCounts["Placed"],
          conversionFromPrevious:
            stageCounts["Offer"] + stageCounts["Placed"] > 0
              ? (stageCounts["Placed"] / (stageCounts["Offer"] + stageCounts["Placed"])) * 100
              : 0,
        },
      ];

      // Top skills
      const skillsMap: Record<string, number> = {};
      candidates?.forEach((candidate) => {
        candidate.skills?.forEach((skill: string) => {
          skillsMap[skill] = (skillsMap[skill] || 0) + 1;
        });
      });
      const topSkills = Object.entries(skillsMap)
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setData({
        stats: {
          totalCandidates,
          totalJobs,
          totalClients,
          totalPlacements,
          openJobs,
          activeCandidates,
          conversionRate,
          avgTimeToFill,
        },
        userKPIs,
        pipelineData,
        activityData,
        funnelData,
        topSkills,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.loadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("analytics.title")}</h1>
        <p className="text-muted-foreground">
          {t("analytics.subtitle")}
        </p>
      </div>

      {/* Overview Stats */}
      {data && <OverviewStats stats={data.stats} />}

      {/* Tabs for different views */}
      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline">{t("nav.pipeline")}</TabsTrigger>
          <TabsTrigger value="users">{t("analytics.kpis")}</TabsTrigger>
          <TabsTrigger value="activity">{t("analytics.timeline")}</TabsTrigger>
          <TabsTrigger value="skills">{t("analytics.skills")}</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {data && <PipelineAnalytics pipelineData={data.pipelineData} />}
            {data && <ConversionFunnel funnelData={data.funnelData} />}
          </div>
        </TabsContent>

        <TabsContent value="users">
          {data && <UserKPIs userKPIs={data.userKPIs} />}
        </TabsContent>

        <TabsContent value="activity">
          {data && <ActivityTimeline activityData={data.activityData} />}
        </TabsContent>

        <TabsContent value="skills">
          {data && <TopSkillsChart topSkills={data.topSkills} />}
        </TabsContent>
      </Tabs>

      {/* Controller AI */}
      <ControllerAI onQueryComplete={fetchAnalytics} />
    </div>
  );
}
