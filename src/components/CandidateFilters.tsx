import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Filter, X, Sparkles, ChevronDown, ChevronUp, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SaveFilterDialog } from "@/components/SaveFilterDialog";
import { SavedFiltersBar } from "@/components/SavedFiltersBar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export interface FilterCriteria {
  skills?: string[];
  industries?: string[];
  position?: string;
  location?: string;
  statuses?: string[];
  experienceLevel?: string;
  minSalary?: string;
  maxSalary?: string;
}

const ALL_STATUSES = [
  { value: "N/D", label: "N/D" },
  { value: "Active", label: "Active" },
  { value: "Not available", label: "Not available" },
  { value: "Passive", label: "Passive" },
  { value: "Placed", label: "Placed" },
  { value: "Archived", label: "Archived" },
];

interface CandidateFiltersProps {
  onFilterChange: (filters: FilterCriteria) => void;
  onAISearch: (query: string) => void;
  isAISearching?: boolean;
  searchTerm: string;
  searchBar: React.ReactNode;
}

export function CandidateFilters({ onFilterChange, onAISearch, isAISearching, searchTerm, searchBar }: CandidateFiltersProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<FilterCriteria>({});
  const [skillInput, setSkillInput] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [industries, setIndustries] = useState<Array<{ id: string; name: string }>>([]);

  // Load industries from database
  useEffect(() => {
    const fetchIndustries = async () => {
      try {
        const { data, error } = await supabase
          .from('industries')
          .select('id, name')
          .order('name');
        
        if (error) throw error;
        setIndustries(data || []);
      } catch (error) {
        console.error('Fehler beim Laden der Branchen:', error);
      }
    };

    fetchIndustries();
  }, []);

  const updateFilter = (key: keyof FilterCriteria, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    setActiveFilterId(null); // Clear saved filter selection when manually editing
    onFilterChange(newFilters);
  };

  const addSkill = () => {
    if (skillInput.trim()) {
      const currentSkills = filters.skills || [];
      const newSkills = [...currentSkills, skillInput.trim()];
      updateFilter('skills', newSkills);
      setSkillInput("");
    }
  };

  const removeSkill = (skill: string) => {
    const currentSkills = filters.skills || [];
    const newSkills = currentSkills.filter(s => s !== skill);
    updateFilter('skills', newSkills);
  };

  const clearFilters = () => {
    setFilters({});
    setActiveFilterId(null);
    onFilterChange({});
  };

  const handleSavedFilterSelect = (savedFilters: FilterCriteria) => {
    setFilters(savedFilters);
    onFilterChange(savedFilters);
  };

  const handleFilterSaved = () => {
    setRefreshKey(prev => prev + 1);
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  const handleAISearch = () => {
    if (searchTerm.trim()) {
      onAISearch(searchTerm.trim());
    }
  };

  return (
    <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen}>
      <div className="space-y-4">
        <div className="flex gap-2 items-center">
          {searchBar}
          <div className="flex gap-2 items-center shrink-0">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Filter
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                    {Object.keys(filters).length}
                  </Badge>
                )}
                {isFilterOpen ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
              </Button>
            </CollapsibleTrigger>

            <Button 
              variant="outline" 
              className="gap-2"
              onClick={handleAISearch}
              disabled={!searchTerm.trim() || isAISearching}
            >
              <Sparkles className="h-4 w-4" />
              {isAISearching ? t("candidates.aiSearching", "KI sucht...") : t("candidates.aiSearch", "KI-Suche")}
            </Button>
          </div>
        </div>

        {/* Saved Filters Bar */}
        <SavedFiltersBar
          key={refreshKey}
          onFilterSelect={handleSavedFilterSelect}
          activeFilterId={activeFilterId}
          onActiveFilterChange={setActiveFilterId}
        />
      
        <CollapsibleContent>
        <Card className="border bg-card">
          <CardContent className="pt-4 pb-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">{t("filters.criteria")}</h4>
                <div className="flex gap-2">
                  <SaveFilterDialog 
                    currentFilters={filters} 
                    onFilterSaved={handleFilterSaved}
                    disabled={!hasActiveFilters}
                  />
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      {t("filters.clearAll")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("filters.industryLabel")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 w-full justify-between font-normal"
                      >
                        {filters.industries && filters.industries.length > 0
                          ? `${filters.industries.length} ${t("filters.selected")}`
                          : t("filters.industryPlaceholder")}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-2" align="start">
                      <div className="space-y-1 max-h-[200px] overflow-auto">
                        {industries.map((industry) => {
                          const isSelected = filters.industries?.includes(industry.name) || false;
                          return (
                            <div
                              key={industry.id}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent",
                                isSelected && "bg-accent"
                              )}
                              onClick={() => {
                                const currentIndustries = filters.industries || [];
                                const newIndustries = isSelected
                                  ? currentIndustries.filter(i => i !== industry.name)
                                  : [...currentIndustries, industry.name];
                                updateFilter('industries', newIndustries.length > 0 ? newIndustries : undefined);
                              }}
                            >
                              <Checkbox checked={isSelected} />
                              <span className="text-sm">{industry.name}</span>
                            </div>
                          );
                        })}
                        {industries.length === 0 && (
                          <p className="px-2 py-1.5 text-sm text-muted-foreground">
                            {t("filters.noIndustries", "Keine Branchen gefunden")}
                          </p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("common.position")}</Label>
                  <Input
                    placeholder="z.B. Engineer..."
                    value={filters.position || ""}
                    onChange={(e) => updateFilter('position', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("common.location")}</Label>
                  <Input
                    placeholder="z.B. München..."
                    value={filters.location || ""}
                    onChange={(e) => updateFilter('location', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("common.status")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 w-full justify-between font-normal"
                      >
                        {filters.statuses && filters.statuses.length > 0
                          ? `${filters.statuses.length} ${t("filters.selected")}`
                          : `${t("common.status")}...`}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-2" align="start">
                      <div className="space-y-1">
                        {ALL_STATUSES.map((status) => {
                          const isSelected = filters.statuses?.includes(status.value) || false;
                          return (
                            <div
                              key={status.value}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent",
                                isSelected && "bg-accent"
                              )}
                              onClick={() => {
                                const currentStatuses = filters.statuses || [];
                                const newStatuses = isSelected
                                  ? currentStatuses.filter(s => s !== status.value)
                                  : [...currentStatuses, status.value];
                                updateFilter('statuses', newStatuses.length > 0 ? newStatuses : undefined);
                              }}
                            >
                              <Checkbox checked={isSelected} />
                              <span className="text-sm">{status.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("common.experience")}</Label>
                  <Input
                    placeholder="z.B. Senior..."
                    value={filters.experienceLevel || ""}
                    onChange={(e) => updateFilter('experienceLevel', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("candidates.minSalary", "Min. Gehalt")}</Label>
                  <Input
                    placeholder="z.B. 50000"
                    value={filters.minSalary || ""}
                    onChange={(e) => updateFilter('minSalary', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("candidates.maxSalary", "Max. Gehalt")}</Label>
                  <Input
                    placeholder="z.B. 80000"
                    value={filters.maxSalary || ""}
                    onChange={(e) => updateFilter('maxSalary', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5 col-span-2 md:col-span-1">
                  <Label className="text-xs">{t("candidates.addSkill", "Skill hinzufügen")}</Label>
                  <div className="flex gap-1">
                    <Input
                      placeholder="Skill..."
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSkill();
                        }
                      }}
                      className="h-9"
                    />
                    <Button onClick={addSkill} size="sm" className="h-9 px-2">+</Button>
                  </div>
                </div>
              </div>

              {filters.skills && filters.skills.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {filters.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="gap-1 h-6 text-xs">
                      {skill}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeSkill(skill)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
