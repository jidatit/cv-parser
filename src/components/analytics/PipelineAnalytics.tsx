import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface PipelineStage {
  stage: string;
  count: number;
  percentage: number;
}

interface PipelineAnalyticsProps {
  pipelineData: PipelineStage[];
}

const STAGE_COLORS: Record<string, string> = {
  "Ready2Send": "#8b5cf6",
  "Sent": "#3b82f6",
  "Interview": "#10b981",
  "Offer": "#f59e0b",
  "Placed": "#22c55e",
  "Rejected": "#ef4444",
};

export function PipelineAnalytics({ pipelineData }: PipelineAnalyticsProps) {
  const totalCandidates = pipelineData.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Analyse</CardTitle>
        <CardDescription>
          Kandidaten-Verteilung über alle Pipeline-Stages ({totalCandidates} gesamt)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={pipelineData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis type="number" />
            <YAxis dataKey="stage" type="category" width={100} />
            <Tooltip
              formatter={(value: number, name: string, props: any) => [
                `${value} (${props.payload.percentage.toFixed(1)}%)`,
                "Kandidaten",
              ]}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {pipelineData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={STAGE_COLORS[entry.stage] || "#6b7280"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
