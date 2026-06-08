import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { Trophy, RotateCcw, TrendingUp, TrendingDown, Eye, MousePointer, FileCheck, Users } from "lucide-react";

interface Props {
  jobId: string;
  onUpdate?: () => void;
}

interface VariantMetrics {
  views: number;
  clicks: number;
  applies: number;
  ctr: number;
  conversionRate: number;
}

export function PublicationPerformanceMatrix({ jobId, onUpdate }: Props) {
  const { t } = useLanguage();
  const [metricsA, setMetricsA] = useState<VariantMetrics>({ views: 0, clicks: 0, applies: 0, ctr: 0, conversionRate: 0 });
  const [metricsB, setMetricsB] = useState<VariantMetrics>({ views: 0, clicks: 0, applies: 0, ctr: 0, conversionRate: 0 });
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const fetchData = async () => {
    const { data: jobData } = await supabase.from('jobs').select('active_variant, winner_variant, auto_optimize, framework_a, framework_b').eq('id', jobId).single();
    if (jobData) setJob(jobData);

    // Fetch analytics
    const { data: analytics } = await supabase
      .from('job_analytics' as any)
      .select('variant_shown, event_type')
      .eq('job_id', jobId);

    // Fetch applications with variant_shown
    const { data: applications } = await supabase
      .from('applications')
      .select('variant_shown')
      .eq('job_id', jobId);

    const calcMetrics = (variant: string): VariantMetrics => {
      const events = (analytics as any[] || []).filter((e: any) => e.variant_shown === variant);
      const views = events.filter((e: any) => e.event_type === 'view').length;
      const clicks = events.filter((e: any) => e.event_type === 'click').length;
      const applies = (applications || []).filter((a: any) => a.variant_shown === variant).length;
      return {
        views, clicks, applies,
        ctr: views > 0 ? (clicks / views) * 100 : 0,
        conversionRate: views > 0 ? (applies / views) * 100 : 0,
      };
    };

    setMetricsA(calcMetrics('A'));
    setMetricsB(calcMetrics('B'));
  };

  useEffect(() => { fetchData(); }, [jobId]);

  const lift = metricsA.conversionRate > 0
    ? ((metricsB.conversionRate - metricsA.conversionRate) / metricsA.conversionRate) * 100
    : 0;

  const handleSetWinner = async (variant: 'A' | 'B') => {
    setLoading(true);
    await supabase.from('jobs').update({ active_variant: variant, winner_variant: variant, auto_optimize: false } as any).eq('id', jobId);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('publication_audit_log').insert({
        job_id: jobId, user_id: user.id, action: 'winner_set', details: { winner: variant },
      } as any);
    }
    toast.success(t('publicationManager.performance.winnerSet'));
    setLoading(false);
    fetchData();
    onUpdate?.();
  };

  const handleRestartTest = async () => {
    setConfirmRestart(false);
    setLoading(true);
    await supabase.from('jobs').update({ active_variant: 'split', winner_variant: null, auto_optimize: true } as any).eq('id', jobId);
    await supabase.from('job_analytics' as any).delete().eq('job_id', jobId);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('publication_audit_log').insert({
        job_id: jobId, user_id: user.id, action: 'test_restarted', details: {},
      } as any);
    }
    toast.success(t('publicationManager.performance.testRestarted'));
    setLoading(false);
    fetchData();
    onUpdate?.();
  };

  const MetricCard = ({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) => (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {t('publicationManager.performance.title')}
            {job?.winner_variant && (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                {t('publicationManager.performance.winner')}: {job.winner_variant}
              </Badge>
            )}
            {job?.active_variant === 'split' && (
              <Badge variant="outline">{t('publicationManager.performance.splitActive')}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div className="p-4 rounded-lg border space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">{t('publicationManager.variantA')}</h4>
                <Badge variant="secondary">{job?.framework_a || 'AIDA'}</Badge>
                {job?.winner_variant === 'A' && <Trophy className="h-4 w-4 text-yellow-500" />}
              </div>
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Views" value={metricsA.views} icon={Eye} />
                <MetricCard label="CTR" value={`${metricsA.ctr.toFixed(1)}%`} icon={MousePointer} />
                <MetricCard label={t('publicationManager.performance.applications')} value={metricsA.applies} icon={Users} />
                <MetricCard label="Conv." value={`${metricsA.conversionRate.toFixed(1)}%`} icon={FileCheck} />
              </div>
            </div>

            <div className="p-4 rounded-lg border space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">{t('publicationManager.variantB')}</h4>
                <Badge variant="secondary">{job?.framework_b || 'PAS'}</Badge>
                {job?.winner_variant === 'B' && <Trophy className="h-4 w-4 text-yellow-500" />}
              </div>
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Views" value={metricsB.views} icon={Eye} />
                <MetricCard label="CTR" value={`${metricsB.ctr.toFixed(1)}%`} icon={MousePointer} />
                <MetricCard label={t('publicationManager.performance.applications')} value={metricsB.applies} icon={Users} />
                <MetricCard label="Conv." value={`${metricsB.conversionRate.toFixed(1)}%`} icon={FileCheck} />
              </div>
            </div>
          </div>

          {(metricsA.views > 0 || metricsB.views > 0) && (
            <div className={`p-3 rounded-lg text-center font-medium ${lift > 0 ? 'bg-green-500/10 text-green-600' : lift < 0 ? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground'}`}>
              <div className="flex items-center justify-center gap-2">
                {lift > 0 ? <TrendingUp className="h-4 w-4" /> : lift < 0 ? <TrendingDown className="h-4 w-4" /> : null}
                {lift !== 0
                  ? `${t('publicationManager.variantB')} ${t('publicationManager.performance.converts')} ${lift > 0 ? '+' : ''}${lift.toFixed(1)}% ${lift > 0 ? t('publicationManager.performance.better') : t('publicationManager.performance.worse')}`
                  : t('publicationManager.performance.noDataYet')
                }
              </div>
            </div>
          )}

          <div className="flex justify-center gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => handleSetWinner('A')} disabled={loading || job?.winner_variant === 'A'}>
              {t('publicationManager.performance.setWinnerA')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleSetWinner('B')} disabled={loading || job?.winner_variant === 'B'}>
              {t('publicationManager.performance.setWinnerB')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRestart(true)} disabled={loading}>
              <RotateCcw className="h-4 w-4 mr-1" />
              {t('publicationManager.performance.restartTest')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('publicationManager.confirm.restartTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('publicationManager.confirm.restartDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('publicationManager.confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestartTest}>{t('publicationManager.performance.restartTest')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
