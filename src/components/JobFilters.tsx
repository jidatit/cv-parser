import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Filter, X, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface JobFilterCriteria {
  skills?: string[];
  location?: string;
  status?: string;
  employmentType?: string;
  experienceLevel?: string;
  minSalary?: string;
  maxSalary?: string;
  client?: string;
}

interface JobFiltersProps {
  onFilterChange: (filters: JobFilterCriteria) => void;
  onAISearch: (query: string) => void;
  isAISearching?: boolean;
  searchTerm: string;
  searchBar: React.ReactNode;
}

export function JobFilters({ onFilterChange, onAISearch, isAISearching, searchTerm, searchBar }: JobFiltersProps) {
  const [filters, setFilters] = useState<JobFilterCriteria>({});
  const [skillInput, setSkillInput] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const updateFilter = (key: keyof JobFilterCriteria, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
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
    onFilterChange({});
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
        <div className="flex gap-4 items-center">
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
              {isAISearching ? "KI sucht..." : "KI-Suche"}
            </Button>
          </div>
        </div>
      
        <CollapsibleContent>
        <Card className="border bg-card">
          <CardContent className="pt-4 pb-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Filterkriterien</h4>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Alle löschen
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Standort</Label>
                  <Input
                    placeholder="z.B. München..."
                    value={filters.location || ""}
                    onChange={(e) => updateFilter('location', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(value) => updateFilter('status', value)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Status..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Offen</SelectItem>
                      <SelectItem value="Active">Aktiv</SelectItem>
                      <SelectItem value="Filled">Besetzt</SelectItem>
                      <SelectItem value="On Hold">Pausiert</SelectItem>
                      <SelectItem value="Closed">Geschlossen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Anstellungsart</Label>
                  <Select
                    value={filters.employmentType}
                    onValueChange={(value) => updateFilter('employmentType', value)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Typ..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vollzeit">Vollzeit</SelectItem>
                      <SelectItem value="Teilzeit">Teilzeit</SelectItem>
                      <SelectItem value="Freelance">Freelance</SelectItem>
                      <SelectItem value="Praktikum">Praktikum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Erfahrung</Label>
                  <Input
                    placeholder="z.B. Senior..."
                    value={filters.experienceLevel || ""}
                    onChange={(e) => updateFilter('experienceLevel', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Min. Gehalt</Label>
                  <Input
                    placeholder="z.B. 50000"
                    value={filters.minSalary || ""}
                    onChange={(e) => updateFilter('minSalary', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Max. Gehalt</Label>
                  <Input
                    placeholder="z.B. 80000"
                    value={filters.maxSalary || ""}
                    onChange={(e) => updateFilter('maxSalary', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Kunde</Label>
                  <Input
                    placeholder="z.B. Firma..."
                    value={filters.client || ""}
                    onChange={(e) => updateFilter('client', e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5 col-span-2 md:col-span-1">
                  <Label className="text-xs">Skill hinzufügen</Label>
                  <div className="flex gap-1">
                    <Input
                      placeholder="Skill..."
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addSkill()}
                      className="h-9"
                    />
                    <Button 
                      size="sm" 
                      onClick={addSkill}
                      className="h-9 px-3"
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>

              {filters.skills && filters.skills.length > 0 && (
                <div className="pt-2">
                  <Label className="text-xs mb-2 block">Ausgewählte Skills</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {filters.skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="gap-1">
                        {skill}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => removeSkill(skill)}
                        />
                      </Badge>
                    ))}
                  </div>
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
