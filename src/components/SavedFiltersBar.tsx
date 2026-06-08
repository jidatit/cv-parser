import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Bookmark, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { FilterCriteria } from "@/components/CandidateFilters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditFilterDialog } from "@/components/EditFilterDialog";

interface SavedFilter {
  id: string;
  name: string;
  color: string;
  filter_criteria: FilterCriteria;
}

interface SavedFiltersBarProps {
  onFilterSelect: (filters: FilterCriteria) => void;
  activeFilterId?: string | null;
  onActiveFilterChange: (filterId: string | null) => void;
}

export function SavedFiltersBar({ onFilterSelect, activeFilterId, onActiveFilterChange }: SavedFiltersBarProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null);
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    fetchSavedFilters();
  }, []);

  const fetchSavedFilters = async () => {
    try {
      const { data, error } = await supabase
        .from('saved_filters')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      const mappedFilters: SavedFilter[] = (data || []).map(item => ({
        id: item.id,
        name: item.name,
        color: item.color,
        filter_criteria: item.filter_criteria as unknown as FilterCriteria,
      }));
      setSavedFilters(mappedFilters);
    } catch (error) {
      console.error('Error fetching saved filters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterClick = (filter: SavedFilter) => {
    if (activeFilterId === filter.id) {
      onActiveFilterChange(null);
      onFilterSelect({});
    } else {
      onActiveFilterChange(filter.id);
      onFilterSelect(filter.filter_criteria);
    }
  };

  const handleDeleteFilter = async (filterId: string) => {
    try {
      const { error } = await supabase
        .from('saved_filters')
        .delete()
        .eq('id', filterId);

      if (error) throw error;

      setSavedFilters(savedFilters.filter(f => f.id !== filterId));
      
      if (activeFilterId === filterId) {
        onActiveFilterChange(null);
        onFilterSelect({});
      }

      toast({
        title: t("filters.deleted"),
        description: t("filters.deletedDesc"),
      });
    } catch (error) {
      console.error('Error deleting filter:', error);
      toast({
        title: t("toast.error"),
        description: t("filters.deleteError"),
        variant: "destructive",
      });
    }
  };

  const handleFilterUpdated = (updatedFilter: SavedFilter) => {
    setSavedFilters(savedFilters.map(f => 
      f.id === updatedFilter.id ? updatedFilter : f
    ));
  };

  if (loading || savedFilters.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Bookmark className="h-4 w-4 text-muted-foreground" />
        {savedFilters.map((filter) => (
          <div key={filter.id} className="flex items-center">
            <Button
              variant={activeFilterId === filter.id ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1.5 rounded-r-none border-r-0"
              style={{
                backgroundColor: activeFilterId === filter.id ? filter.color : 'transparent',
                borderColor: filter.color,
                color: activeFilterId === filter.id ? 'white' : filter.color,
              }}
              onClick={() => handleFilterClick(filter)}
            >
              {filter.name}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={activeFilterId === filter.id ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-1.5 rounded-l-none"
                  style={{
                    backgroundColor: activeFilterId === filter.id ? filter.color : 'transparent',
                    borderColor: filter.color,
                    color: activeFilterId === filter.id ? 'white' : filter.color,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setEditingFilter(filter)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Bearbeiten
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleDeleteFilter(filter.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      <EditFilterDialog
        filter={editingFilter}
        open={!!editingFilter}
        onOpenChange={(open) => !open && setEditingFilter(null)}
        onFilterUpdated={handleFilterUpdated}
      />
    </>
  );
}
