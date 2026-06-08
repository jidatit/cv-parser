import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/hooks/useLanguage";

interface FunnelStage {
  stage: string;
  count: number;
  conversionFromPrevious: number;
}

interface ConversionFunnelProps {
  funnelData: FunnelStage[];
}

export function ConversionFunnel({ funnelData }: ConversionFunnelProps) {
  const { t } = useLanguage();
  const maxCount = Math.max(...funnelData.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("analytics.conversionFunnel")}</CardTitle>
        <CardDescription>{t("analytics.conversionFunnelDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {funnelData.map((stage, index) => {
          const width = (stage.count / maxCount) * 100;
          return (
            <div key={stage.stage} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{stage.stage}</span>
                <span className="text-muted-foreground">
                  {stage.count}
                  {index > 0 && stage.conversionFromPrevious > 0 && (
                    <span className="ml-2 text-xs">
                      ({stage.conversionFromPrevious.toFixed(1)}% {t("analytics.fromPreviousStage")})
                    </span>
                  )}
                </span>
              </div>
              <div className="h-8 bg-muted rounded-md overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500 flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(width, 5)}%` }}
                >
                  {width > 20 && (
                    <span className="text-xs text-primary-foreground font-medium">
                      {stage.count}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
