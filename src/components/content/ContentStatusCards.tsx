import { FileText, Clock, Globe, Archive } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/hooks/useLanguage";

interface ContentStatusCardsProps {
  counts: {
    draft: number;
    scheduled: number;
    published: number;
    archived: number;
  };
  activeFilter: string | null;
  onFilterChange: (status: string | null) => void;
}

export function ContentStatusCards({ counts, activeFilter, onFilterChange }: ContentStatusCardsProps) {
  const { t } = useLanguage();
  
  const cards = [
    { key: null, label: t("common.all"), count: counts.draft + counts.scheduled + counts.published + counts.archived, icon: FileText, color: "text-foreground" },
    { key: 'draft', label: t("content.statusDraft"), count: counts.draft, icon: FileText, color: "text-muted-foreground" },
    { key: 'scheduled', label: t("content.statusScheduled"), count: counts.scheduled, icon: Clock, color: "text-amber-500" },
    { key: 'published', label: t("content.statusPublished"), count: counts.published, icon: Globe, color: "text-emerald-500" },
    { key: 'archived', label: t("content.statusArchived"), count: counts.archived, icon: Archive, color: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((card) => (
        <Card 
          key={card.key ?? 'all'} 
          className={`cursor-pointer transition-all hover:shadow-md ${activeFilter === card.key ? 'ring-2 ring-primary' : ''}`}
          onClick={() => onFilterChange(card.key)}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <card.icon className={`h-5 w-5 ${card.color}`} />
            <div>
              <p className="text-2xl font-bold">{card.count}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
