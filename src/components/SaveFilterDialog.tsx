import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FilterCriteria } from "@/components/CandidateFilters";

interface SaveFilterDialogProps {
  currentFilters: FilterCriteria;
  onFilterSaved: () => void;
  disabled?: boolean;
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

export function SaveFilterDialog({ currentFilters, onFilterSaved, disabled }: SaveFilterDialogProps) {
  const [open, setOpen] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('saved_filters')
        .insert([{
          user_id: user.id,
          name: filterName.trim(),
          color: selectedColor,
          filter_criteria: JSON.parse(JSON.stringify(currentFilters)),
        }]);

      if (error) throw error;

      toast({
        title: "Filter gespeichert",
        description: `"${filterName}" wurde erfolgreich gespeichert.`,
      });

      setFilterName("");
      setSelectedColor(PRESET_COLORS[0]);
      setOpen(false);
      onFilterSaved();
    } catch (error) {
      console.error('Error saving filter:', error);
      toast({
        title: "Fehler",
        description: "Filter konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const hasFilters = Object.keys(currentFilters).some(key => {
    const value = currentFilters[key as keyof FilterCriteria];
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 h-9"
          disabled={disabled || !hasFilters}
        >
          <Save className="h-4 w-4" />
          Filter speichern
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Filter speichern</DialogTitle>
          <DialogDescription>
            Speichern Sie die aktuellen Filterkriterien für schnellen Zugriff.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="filter-name">Filtername</Label>
            <Input
              id="filter-name"
              placeholder="z.B. Senior Entwickler München"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Farbe</Label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full transition-all ${
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
          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Aktive Filter:</Label>
            <div className="text-sm bg-muted p-3 rounded-md">
              {Object.entries(currentFilters).map(([key, value]) => {
                if (!value || (Array.isArray(value) && value.length === 0)) return null;
                const displayValue = Array.isArray(value) ? value.join(', ') : value;
                const displayKey = {
                  skills: 'Skills',
                  industry: 'Branche',
                  position: 'Position',
                  location: 'Standort',
                  status: 'Status',
                  experienceLevel: 'Erfahrung',
                  minSalary: 'Min. Gehalt',
                  maxSalary: 'Max. Gehalt',
                }[key] || key;
                return (
                  <div key={key} className="flex justify-between">
                    <span className="font-medium">{displayKey}:</span>
                    <span className="text-muted-foreground">{displayValue}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
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
