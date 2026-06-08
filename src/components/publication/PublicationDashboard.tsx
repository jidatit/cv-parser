import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { differenceInDays, format, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, Clock, Eye, Inbox, TrendingUp, CalendarPlus } from "lucide-react";
import { PublicationAnalyticsCharts } from "./PublicationAnalyticsCharts";

interface ExpiringJob {
  id: string;
  title: string;
  public_title: string | null;
  publication_expires_at: string;
  days_left: number;
}

interface TopJob {
  job_id: string;
  title: string;
  views: number;
  clicks: number;
  ctr: number;
}

export function PublicationDashboard() {
  const { t } = useLanguage();
  const [expiringJobs, setExpiringJobs] = useState<ExpiringJob[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [applicationsCount, setApplicationsCount] = useState(0);
  const [topJobs, setTopJobs] = useState<TopJob[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      // Expiring soon (live jobs, next 5 to expire)
      const { data: expiring } = await supabase
        .from('jobs')
        .select('id, title, public_title, publication_expires_at')
        .eq('publication_status', 'live')
        .not('publication_expires_at', 'is', null)
        .order('publication_expires_at', { ascending: true })
        .limit(5);

      if (expiring) {
        setExpiringJobs(expiring.map((j: any) => ({
          ...j,
          days_left: differenceInDays(new Date(j.publication_expires_at), new Date()),
        })));
      }

      // Review count
      const { count } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('publication_status', 'review')
        .in('status', ['N/D', 'Active', 'Offen', 'Assignment', 'External']);
      setReviewCount(count || 0);

      // Applications last 7 days
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { count: appCount } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo);
      setApplicationsCount(appCount || 0);

      // Top 5 performing jobs (from job_analytics)
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data: analytics } = await supabase
        .from('job_analytics' as any)
        .select('job_id, event_type')
        .gte('created_at', thirtyDaysAgo);

      if (analytics && (analytics as any[]).length > 0) {
        const byJob: Record<string, { views: number; clicks: number }> = {};
        (analytics as any[]).forEach((e: any) => {
          if (!byJob[e.job_id]) byJob[e.job_id] = { views: 0, clicks: 0 };
          if (e.event_type === 'view') byJob[e.job_id].views++;
          if (e.event_type === 'click') byJob[e.job_id].clicks++;
        });

        const jobIds = Object.keys(byJob);
        if (jobIds.length > 0) {
          const { data: jobTitles } = await supabase
            .from('jobs')
            .select('id, title, public_title')
            .in('id', jobIds.slice(0, 20));

          const titleMap: Record<string, string> = {};
          jobTitles?.forEach((j: any) => { titleMap[j.id] = j.public_title || j.title; });

          const sorted = Object.entries(byJob)
            .map(([job_id, m]) => ({
              job_id,
              title: titleMap[job_id] || 'Unbekannt',
              views: m.views,
              clicks: m.clicks,
              ctr: m.views > 0 ? (m.clicks / m.views) * 100 : 0,
            }))
            .sort((a, b) => b.views - a.views)
            .slice(0, 5);

          setTopJobs(sorted);
        }
      }
    };
    fetchAll();
  }, []);

  const handleExtend = async (jobId: string) => {
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('jobs').update({ publication_expires_at: newExpiry } as any).eq('id', jobId);
    toast.success(t('publicationManager.extended'));
    setExpiringJobs(prev => prev.map(j => j.id === jobId ? { ...j, publication_expires_at: newExpiry, days_left: 30 } : j));
  };

  return (
    <div className="space-y-6">
      {/* Quick stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Eye className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{reviewCount}</p>
              <p className="text-xs text-muted-foreground">{t('publicationManager.dashboard.inReview')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Inbox className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{applicationsCount}</p>
              <p className="text-xs text-muted-foreground">{t('publicationManager.dashboard.applications7d')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{expiringJobs.filter(j => j.days_left <= 5).length}</p>
              <p className="text-xs text-muted-foreground">{t('publicationManager.dashboard.expiringSoon')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring soon */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              {t('publicationManager.dashboard.expiringSoonTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expiringJobs.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">{t('publicationManager.dashboard.noExpiring')}</p>
            ) : (
              <div className="space-y-2">
                {expiringJobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{job.public_title || job.title}</p>
                      <Badge variant={job.days_left <= 5 ? 'destructive' : job.days_left <= 10 ? 'outline' : 'secondary'} className="text-xs mt-1">
                        {job.days_left} {t('publicationManager.days')}
                      </Badge>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleExtend(job.id)}>
                      <CalendarPlus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top performing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              {t('publicationManager.dashboard.topPerforming')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topJobs.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">{t('publicationManager.performance.noDataYet')}</p>
            ) : (
              <div className="space-y-2">
                {topJobs.map((job, i) => (
                  <div key={job.job_id} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{job.views} Views</span>
                        <span className="text-xs text-muted-foreground">{job.clicks} Clicks</span>
                        <Badge variant="secondary" className="text-xs">{job.ctr.toFixed(1)}% CTR</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PublicationAnalyticsCharts />
    </div>
  );
}
