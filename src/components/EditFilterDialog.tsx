import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FilterCriteria } from "@/components/CandidateFilters";
import { cn } from "@/lib/utils";

interface SavedFilter {
  id: string;
  name: string;
  color: string;
  filter_criteria: FilterCriteria;
}

interface EditFilterDialogProps {
  filter: SavedFilter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterUpdated: (filter: SavedFilter) => void;
}

const PRESET_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Green
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#F97316", // Orange
  "#6B7280", // Gray
];

export function EditFilterDialog({ filter, open, onOpenChange, onFilterUpdated }: EditFilterDialogProps) {
  const [filterName, setFilterName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [criteria, setCriteria] = useState<FilterCriteria>({});
  const [skillInput, setSkillInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [industries, setIndustries] = useState<Array<{ id: string; name: string }>>([]);
  const { toast } = useToast();

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

  useEffect(() => {
    if (filter) {
      setFilterName(filter.name);
      setSelectedColor(filter.color);
      setCriteria(filter.filter_criteria || {});
    }
  }, [filter]);

  const updateCriteria = (key: keyof FilterCriteria, value: any) => {
    setCriteria(prev => ({ ...prev, [key]: value }));
  };

  const addSkill = () => {
    if (skillInput.trim()) {
      const currentSkills = criteria.skills || [];
      updateCriteria('skills', [...currentSkills, skillInput.trim()]);
      setSkillInput("");
    }
  };

  const removeSkill = (skill: string) => {
    const currentSkills = criteria.skills || [];
    updateCriteria('skills', currentSkills.filter(s => s !== skill));
  };

  const handleSave = async () => {
    if (!filter) return;
    
    if (!filterName.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Namen für den Filter ein.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('saved_filters')
        .update({
          name: filterName.trim(),
          color: selectedColor,
          filter_criteria: JSON.parse(JSON.stringify(criteria)),
        })
        .eq('id', filter.id);

      if (error) throw error;

      const updatedFilter: SavedFilter = {
        ...filter,
        name: filterName.trim(),
        color: selectedColor,
        filter_criteria: criteria,
      };

      toast({
        title: "Filter aktualisiert",
        description: `"${filterName}" wurde erfolgreich aktualisiert.`,
      });

      onFilterUpdated(updatedFilter);
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating filter:', error);
      toast({
        title: "Fehler",
        description: "Filter konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter bearbeiten</DialogTitle>
          <DialogDescription>
            Ändern Sie Name, Farbe und Filterkriterien.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Name & Color */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-filter-name">Filtername</Label>
              <Input
                id="edit-filter-name"
                placeholder="z.B. Senior Entwickler München"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Farbe</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-7 h-7 rounded-full transition-all ${
                      selectedColor === color 
                        ? 'ring-2 ring-offset-2 ring-primary scale-110' 
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setSelectedColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Filter Criteria */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Filterkriterien</Label>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Branche</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 w-full justify-between font-normal"
                    >
                      {criteria.industries && criteria.industries.length > 0
                        ? `${criteria.industries.length} ausgewählt`
                        : "Branche..."}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-2" align="start">
                    <div className="space-y-1 max-h-[200px] overflow-auto">
                      {industries.map((industry) => {
                        const isSelected = criteria.industries?.includes(industry.name) || false;
                        return (
                          <div
                            key={industry.id}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent",
                              isSelected && "bg-accent"
                            )}
                            onClick={() => {
                              const currentIndustries = criteria.industries || [];
                              const newIndustries = isSelected
                                ? currentIndustries.filter(i => i !== industry.name)
                                : [...currentIndustries, industry.name];
                              updateCriteria('industries', newIndustries.length > 0 ? newIndustries : undefined);
                            }}
                          >
                            <Checkbox checked={isSelected} />
                            <span className="text-sm">{industry.name}</span>
                          </div>
                        );
                      })}
                      {industries.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                          Keine Branchen gefunden
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Position</Label>
                <Input
                  placeholder="z.B. Engineer..."
                  value={criteria.position || ""}
                  onChange={(e) => updateCriteria('position', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Standort</Label>
                <Input
                  placeholder="z.B. München..."
                  value={criteria.location || ""}
                  onChange={(e) => updateCriteria('location', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={criteria.statuses?.[0] || ""}
                  onValueChange={(value) => updateCriteria('statuses', value ? [value] : undefined)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="N/D">N/D</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Not available">Not available</SelectItem>
                    <SelectItem value="Passive">Passive</SelectItem>
                    <SelectItem value="Placed">Placed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Erfahrung</Label>
                <Input
                  placeholder="z.B. Senior..."
                  value={criteria.experienceLevel || ""}
                  onChange={(e) => updateCriteria('experienceLevel', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Min. Gehalt</Label>
                <Input
                  placeholder="z.B. 50000"
                  value={criteria.minSalary || ""}
                  onChange={(e) => updateCriteria('minSalary', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Max. Gehalt</Label>
                <Input
                  placeholder="z.B. 80000"
                  value={criteria.maxSalary || ""}
                  onChange={(e) => updateCriteria('maxSalary', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5 col-span-2 md:col-span-2">
                <Label className="text-xs">Skill hinzufügen</Label>
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
                  <Button onClick={addSkill} size="sm" className="h-9 px-3">+</Button>
                </div>
              </div>
            </div>

            {criteria.skills && criteria.skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {criteria.skills.map((skill) => (
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Speichern..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
