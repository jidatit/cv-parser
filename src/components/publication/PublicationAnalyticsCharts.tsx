import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { format, subDays } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AnalyticsDay {
  date: string;
  clicks: number;
  views: number;
}

interface VariantData {
  date: string;
  views_a: number;
  views_b: number;
  clicks_a: number;
  clicks_b: number;
}

export function PublicationAnalyticsCharts() {
  const { t } = useLanguage();
  const [data, setData] = useState<AnalyticsDay[]>([]);
  const [variantData, setVariantData] = useState<VariantData[]>([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

      // Legacy publication_analytics
      const { data: analytics } = await supabase
        .from('publication_analytics')
        .select('date, clicks, views')
        .gte('date', thirtyDaysAgo)
        .order('date');

      if (!analytics || analytics.length === 0) {
        const emptyData: AnalyticsDay[] = [];
        for (let i = 30; i >= 0; i--) {
          emptyData.push({ date: format(subDays(new Date(), i), 'dd.MM'), clicks: 0, views: 0 });
        }
        setData(emptyData);
      } else {
        const byDate: Record<string, AnalyticsDay> = {};
        analytics.forEach((a: any) => {
          const d = format(new Date(a.date), 'dd.MM');
          if (!byDate[d]) byDate[d] = { date: d, clicks: 0, views: 0 };
          byDate[d].clicks += a.clicks;
          byDate[d].views += a.views;
        });
        setData(Object.values(byDate));
      }

      // New job_analytics with variant split
      const thirtyDaysAgoISO = subDays(new Date(), 30).toISOString();
      const { data: jobAnalytics } = await supabase
        .from('job_analytics' as any)
        .select('variant_shown, event_type, created_at')
        .gte('created_at', thirtyDaysAgoISO);

      if (jobAnalytics && (jobAnalytics as any[]).length > 0) {
        const byDateVariant: Record<string, VariantData> = {};
        (jobAnalytics as any[]).forEach((e: any) => {
          const d = format(new Date(e.created_at), 'dd.MM');
          if (!byDateVariant[d]) byDateVariant[d] = { date: d, views_a: 0, views_b: 0, clicks_a: 0, clicks_b: 0 };
          const isB = e.variant_shown === 'B';
          if (e.event_type === 'view') {
            isB ? byDateVariant[d].views_b++ : byDateVariant[d].views_a++;
          } else if (e.event_type === 'click') {
            isB ? byDateVariant[d].clicks_b++ : byDateVariant[d].clicks_a++;
          }
        });
        setVariantData(Object.values(byDateVariant));
      }
    };
    fetchAnalytics();
  }, []);

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">{t("publicationManager.analytics.last30Days")}</TabsTrigger>
        <TabsTrigger value="variants">{t("publicationManager.performance.variantComparison")}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <Card>
          <CardHeader>
            <CardTitle>{t("publicationManager.analytics.last30Days")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="views" name={t("publicationManager.analytics.views")} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="clicks" name={t("publicationManager.analytics.clicks")} stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="variants">
        <Card>
          <CardHeader>
            <CardTitle>{t("publicationManager.performance.variantComparison")}</CardTitle>
          </CardHeader>
          <CardContent>
            {variantData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={variantData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="views_a" name={`${t("publicationManager.variantA")} - Views`} fill="hsl(var(--primary))" />
                  <Bar dataKey="views_b" name={`${t("publicationManager.variantB")} - Views`} fill="hsl(var(--accent))" />
                  <Bar dataKey="clicks_a" name={`${t("publicationManager.variantA")} - Clicks`} fill="hsl(var(--destructive))" />
                  <Bar dataKey="clicks_b" name={`${t("publicationManager.variantB")} - Clicks`} fill="hsl(var(--muted-foreground))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">{t("publicationManager.performance.noDataYet")}</p>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
