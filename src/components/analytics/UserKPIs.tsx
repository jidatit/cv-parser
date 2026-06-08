import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface UserKPI {
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
}

interface UserKPIsProps {
  userKPIs: UserKPI[];
}

export function UserKPIs({ userKPIs }: UserKPIsProps) {
  const getTrendIcon = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case "down":
        return <TrendingDown className="h-4 w-4 text-rose-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getPerformanceBadge = (conversionRate: number) => {
    if (conversionRate >= 20) {
      return <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">Top Performer</Badge>;
    } else if (conversionRate >= 10) {
      return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">Gut</Badge>;
    } else if (conversionRate > 0) {
      return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">Entwicklung</Badge>;
    }
    return <Badge variant="secondary">Neu</Badge>;
  };

  if (userKPIs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nutzer KPIs</CardTitle>
          <CardDescription>Leistungskennzahlen der einzelnen Nutzer</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Keine Nutzerdaten verfügbar</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nutzer KPIs</CardTitle>
        <CardDescription>Leistungskennzahlen und Aktivitäten der einzelnen CRM-Nutzer</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nutzer</TableHead>
              <TableHead className="text-center">Kandidaten</TableHead>
              <TableHead className="text-center">Jobs</TableHead>
              <TableHead className="text-center">Klienten</TableHead>
              <TableHead className="text-center">Placements</TableHead>
              <TableHead className="text-center">Tasks</TableHead>
              <TableHead className="text-center">Conversion</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userKPIs.map((user) => (
              <TableRow key={user.userId}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(user.userName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{user.userName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center font-medium">{user.candidatesCreated}</TableCell>
                <TableCell className="text-center font-medium">{user.jobsCreated}</TableCell>
                <TableCell className="text-center font-medium">{user.clientsCreated}</TableCell>
                <TableCell className="text-center font-medium">{user.placementsCreated}</TableCell>
                <TableCell className="text-center">
                  <span className="text-emerald-600">{user.tasksCompleted}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-amber-600">{user.tasksOpen}</span>
                </TableCell>
                <TableCell className="text-center font-medium">{user.conversionRate.toFixed(1)}%</TableCell>
                <TableCell className="text-center">{getPerformanceBadge(user.conversionRate)}</TableCell>
                <TableCell className="text-center">{getTrendIcon(user.trend)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
