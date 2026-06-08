import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface TopSkillsChartProps {
  topSkills: Array<{ skill: string; count: number }>;
}

export function TopSkillsChart({ topSkills }: TopSkillsChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Skills</CardTitle>
        <CardDescription>Häufigste Fähigkeiten im Kandidatenpool</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={topSkills} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis type="number" />
            <YAxis dataKey="skill" type="category" width={120} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Anzahl" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
