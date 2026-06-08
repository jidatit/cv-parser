import { useState, useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface LanguagesComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selectedValue: string) => void;
  placeholder?: string;
}

export function LanguagesCombobox({ value, onChange, onSelect, placeholder = "Sprache suchen..." }: LanguagesComboboxProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [languages, setLanguages] = useState<Array<{ id: string; name: string }>>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { t } = useLanguage();

  // Lade Sprachen aus der Datenbank beim ersten Render
  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const { data, error } = await supabase
          .from('languages')
          .select('id, name')
          .order('name');
        
        if (error) throw error;
        setLanguages(data || []);
      } catch (error) {
        console.error('Fehler beim Laden der Sprachen:', error);
      }
    };

    fetchLanguages();
  }, []);

  // Schließe Vorschläge wenn außerhalb geklickt wird
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't close if clicking inside context menu
      if (target.closest('[data-languages-context-menu]')) {
        return;
      }
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter Sprachen basierend auf dem aktuellen Wert
  const filteredLanguages = languages.filter(lang =>
    lang.name.toLowerCase().includes(value.toLowerCase())
  ).slice(0, 5); // Zeige maximal 5 Vorschläge

  const handleSelect = async (selectedLanguage: string) => {
    // First update the value to the full selected language name
    onChange(selectedLanguage);
    setShowSuggestions(false);
    
    // Prüfe, ob Sprache bereits in der Datenbank existiert, wenn nicht, füge sie hinzu
    const languageExists = languages.some(lang => lang.name.toLowerCase() === selectedLanguage.toLowerCase());
    if (!languageExists && selectedLanguage.trim()) {
      try {
        const { data } = await supabase
          .from('languages')
          .insert([{ name: selectedLanguage.trim() }])
          .select()
          .single();
        
        if (data) {
          setLanguages(prev => [...prev, data]);
        }
      } catch (error) {
        console.error('Fehler beim Speichern der Sprache:', error);
      }
    }
    
    // Pass the selected language directly to onSelect
    onSelect(selectedLanguage);
  };

  const handleDeleteLanguage = async (languageId: string, languageName: string) => {
    try {
      const { error } = await supabase
        .from('languages')
        .delete()
        .eq('id', languageId);

      if (error) {
        if (error.code === '42501') {
          toast({
            title: t("languages.noPermission"),
            description: t("languages.noPermissionDesc"),
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      setLanguages(prev => prev.filter(lang => lang.id !== languageId));
      
      toast({
        title: t("languages.deleted"),
        description: t("languages.deletedDesc", { name: languageName }),
      });
    } catch (error) {
      console.error('Fehler beim Löschen der Sprache:', error);
      toast({
        title: t("toast.error"),
        description: t("languages.deleteError"),
        variant: "destructive",
      });
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
        
        {/* Vorschläge mit Rechtsklick-Löschfunktion */}
        {showSuggestions && value.trim() && filteredLanguages.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-[200px] overflow-auto">
            {filteredLanguages.map((lang) => (
              <ContextMenu key={lang.id}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleSelect(lang.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer"
                  >
                    {lang.name}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent 
                  data-languages-context-menu
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <ContextMenuItem
                    onClick={() => handleDeleteLanguage(lang.id, lang.name)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("languages.deleteFromDb")}
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
