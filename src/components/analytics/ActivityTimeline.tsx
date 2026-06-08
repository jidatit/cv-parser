import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useLanguage } from "@/hooks/useLanguage";

interface ActivityData {
  date: string;
  candidates: number;
  jobs: number;
  placements: number;
  clients: number;
}

interface ActivityTimelineProps {
  activityData: ActivityData[];
}

export function ActivityTimeline({ activityData }: ActivityTimelineProps) {
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("analytics.activityOverTime") || "Aktivitäten über Zeit"}</CardTitle>
        <CardDescription>{t("analytics.activityOverTimeDesc") || "Erstellte Einträge der letzten 30 Tage"}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={activityData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="candidates"
              stroke="#8b5cf6"
              name={t("nav.candidates") || "Kandidaten"}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="jobs"
              stroke="#10b981"
              name={t("nav.jobs") || "Jobs"}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="placements"
              stroke="#3b82f6"
              name={t("pipeline.placements") || "Placements"}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="clients"
              stroke="#f59e0b"
              name={t("nav.clients") || "Kunden"}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
