import { useState, useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";

interface SkillsComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selectedSkill: string) => void;
  placeholder?: string;
}

export function SkillsCombobox({ value, onChange, onSelect, placeholder = "Fähigkeit suchen..." }: SkillsComboboxProps) {
  const { t } = useLanguage();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [skills, setSkills] = useState<Array<{ id: string; name: string }>>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Lade Skills aus der Datenbank beim ersten Render
  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const { data, error } = await supabase
          .from('skills')
          .select('id, name')
          .order('name');
        
        if (error) throw error;
        setSkills(data || []);
      } catch (error) {
        console.error('Fehler beim Laden der Skills:', error);
      }
    };

    fetchSkills();
  }, []);

  // Schließe Vorschläge wenn außerhalb geklickt wird
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element | null;

      // ContextMenu wird per Portal gerendert (liegt nicht innerhalb wrapperRef).
      // Deshalb dürfen Klicks im ContextMenu die Vorschlagsliste nicht schließen.
      if (target?.closest?.('[data-skills-context-menu="true"]')) return;

      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter skills basierend auf dem aktuellen Wert
  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(value.toLowerCase())
  ).slice(0, 5); // Zeige maximal 5 Vorschläge

  const handleSelect = async (selectedSkill: string) => {
    onChange(selectedSkill);
    setShowSuggestions(false);
    
    // Prüfe, ob Skill bereits in der Datenbank existiert, wenn nicht, füge ihn hinzu
    const skillExists = skills.some(skill => skill.name.toLowerCase() === selectedSkill.toLowerCase());
    if (!skillExists && selectedSkill.trim()) {
      try {
        const { data } = await supabase
          .from('skills')
          .insert([{ name: selectedSkill.trim() }])
          .select()
          .single();
        
        if (data) {
          setSkills(prev => [...prev, data]);
        }
      } catch (error) {
        console.error('Fehler beim Speichern des Skills:', error);
      }
    }
    
    // Trigger onSelect mit dem ausgewählten Skill
    onSelect(selectedSkill);
  };

  const handleDeleteSkill = async (skillId: string, skillName: string) => {
    try {
      const { error } = await supabase
        .from('skills')
        .delete()
        .eq('id', skillId);
      
      if (error) {
        if (error.code === '42501') {
          toast.error(t("skills.noPermissionDelete"));
        } else {
          throw error;
        }
        return;
      }
      
      setSkills(prev => prev.filter(s => s.id !== skillId));
      setShowSuggestions(true);
      toast.success(t("skills.deleted", { name: skillName }));
    } catch (error) {
      console.error('Fehler beim Löschen des Skills:', error);
      toast.error(t("skills.deleteError"));
    }
  };

  const handleAddNew = () => {
    if (value.trim()) {
      handleSelect(value.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddNew();
    }
  };

  return (
    <div className="flex gap-2 relative" ref={wrapperRef}>
      <div className="flex-1 relative">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        
        {/* Vorschläge */}
        {showSuggestions && value.trim() && filteredSkills.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-[200px] overflow-auto">
            {filteredSkills.map((skill) => (
              <ContextMenu key={skill.id}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleSelect(skill.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer"
                  >
                    {skill.name}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent
                  data-skills-context-menu="true"
                  onMouseDown={(e) => e.stopPropagation()}
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <ContextMenuItem
                    onSelect={(e) => {
                      // Prevent Radix default (so our document mousedown handler doesn't interfere)
                      e.preventDefault();
                      handleDeleteSkill(skill.id, skill.name);
                    }}
                    className="text-destructive focus:text-destructive cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("skills.deleteSkill")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </div>
      
      <Button type="button" onClick={handleAddNew} variant="outline" disabled={!value.trim()}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
