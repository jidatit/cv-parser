import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, Building2, TrendingUp, Target, CheckCircle2 } from "lucide-react";

interface OverviewStatsProps {
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
}

export function OverviewStats({ stats }: OverviewStatsProps) {
  const statCards = [
    {
      title: "Aktive Kandidaten",
      value: stats.totalCandidates,
      icon: Users,
      color: "text-primary",
    },
    {
      title: "Aktive Jobs",
      value: stats.totalJobs,
      icon: Briefcase,
      color: "text-emerald-500",
    },
    {
      title: "Klienten",
      value: stats.totalClients,
      icon: Building2,
      color: "text-amber-500",
    },
    {
      title: "Placements",
      value: stats.totalPlacements,
      icon: CheckCircle2,
      color: "text-blue-500",
    },
    {
      title: "Conversion Rate",
      value: `${stats.conversionRate.toFixed(1)}%`,
      subtitle: "Kandidat → Placement",
      icon: Target,
      color: "text-violet-500",
    },
    {
      title: "Ø Time-to-Fill",
      value: stats.avgTimeToFill > 0 ? `${stats.avgTimeToFill} Tage` : "N/A",
      icon: TrendingUp,
      color: "text-rose-500",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{stat.value}</div>
            {stat.subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
