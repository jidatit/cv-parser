import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Cpu, Eye, Radio, Clock, Split, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

interface StatusCount {
  draft: number;
  ai_processing: number;
  review: number;
  live: number;
  expired: number;
  scheduled: number;
  split_tests: number;
}

interface Props {
  onStatusClick?: (status: string) => void;
}

export function PublicationStatusCards({ onStatusClick }: Props) {
  const { t } = useLanguage();
  const [counts, setCounts] = useState<StatusCount>({
    draft: 0, ai_processing: 0, review: 0, live: 0, expired: 0, scheduled: 0, split_tests: 0,
  });

  const fetchCounts = useCallback(async () => {
    const { data } = await supabase.from('jobs').select('publication_status, active_variant, status').in('status', ['N/D', 'Active', 'Offen', 'Assignment', 'External']);
    if (!data) return;
    const c: StatusCount = { draft: 0, ai_processing: 0, review: 0, live: 0, expired: 0, scheduled: 0, split_tests: 0 };
    data.forEach((j: any) => {
      const s = j.publication_status as keyof Omit<StatusCount, 'split_tests'>;
      if (s in c) (c as any)[s]++;
      if (j.active_variant === 'split' && j.publication_status === 'live') c.split_tests++;
    });
    setCounts(c);
  }, []);

  useEffect(() => {
    fetchCounts();

    const channel = supabase
      .channel('publication-status-cards')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: 'publication_status=neq.' }, () => {
        fetchCounts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchCounts]);

  const cards = [
    { key: 'draft' as const, icon: FileText, color: 'text-muted-foreground' },
    { key: 'ai_processing' as const, icon: Cpu, color: 'text-blue-500' },
    { key: 'review' as const, icon: Eye, color: 'text-amber-500' },
    { key: 'scheduled' as const, icon: CalendarClock, color: 'text-violet-500' },
    { key: 'live' as const, icon: Radio, color: 'text-green-500' },
    { key: 'expired' as const, icon: Clock, color: 'text-destructive' },
    { key: 'split_tests' as const, icon: Split, color: 'text-primary' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
      {cards.map(({ key, icon: Icon, color }) => (
        <Card
          key={key}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onStatusClick?.(key)}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Icon className={`h-8 w-8 ${color}`} />
            <div>
              <p className="text-2xl font-bold">{counts[key]}</p>
              <p className="text-xs text-muted-foreground">{t(`publicationManager.status.${key}`)}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
