import { useState, useEffect, useRef } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface IndustryMultiSelectProps {
  value: string[]; // Array of selected industries
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function IndustryMultiSelect({ value = [], onChange, placeholder = "Branchen auswählen..." }: IndustryMultiSelectProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [industries, setIndustries] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ensure value is always an array
  const selectedIndustries = Array.isArray(value) ? value : [];

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearchValue("");
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter industries based on search
  const filteredIndustries = industries.filter(industry =>
    industry.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Check if search term already exists
  const exactMatch = industries.some(
    industry => industry.name.toLowerCase() === searchValue.toLowerCase()
  );

  const handleToggle = async (industryName: string) => {
    const isSelected = selectedIndustries.includes(industryName);
    
    if (isSelected) {
      // Remove from selection
      onChange(selectedIndustries.filter(i => i !== industryName));
    } else {
      // Add to selection
      onChange([...selectedIndustries, industryName]);
      
      // Check if industry exists in database, if not add it
      const industryExists = industries.some(
        industry => industry.name.toLowerCase() === industryName.toLowerCase()
      );
      
      if (!industryExists && industryName.trim()) {
        setIsLoading(true);
        try {
          const { data } = await supabase
            .from('industries')
            .insert([{ name: industryName.trim() }])
            .select()
            .single();
          
          if (data) {
            setIndustries(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
          }
        } catch (error) {
          console.error('Fehler beim Speichern der Branche:', error);
        } finally {
          setIsLoading(false);
        }
      }
    }
    
    setSearchValue("");
  };

  const handleDeleteIndustry = async (industryId: string, industryName: string) => {
    try {
      const { error } = await supabase
        .from("industries")
        .delete()
        .eq("id", industryId);

      if (error) throw error;

      // Remove from local list
      setIndustries((prev) => prev.filter((i) => i.id !== industryId));

      // Remove from current selection if selected
      if (selectedIndustries.includes(industryName)) {
        onChange(selectedIndustries.filter((i) => i !== industryName));
      }

      toast({
        title: t("industries.deleted"),
        description: t("industries.deletedDesc", { name: industryName }),
      });
    } catch (error: any) {
      console.error("Fehler beim Löschen der Branche:", error);
      toast({
        title: t("toast.error"),
        description: error?.message || t("industries.deleteError"),
      });
    }
  };

  const handleAddNew = () => {
    if (searchValue.trim() && !exactMatch) {
      handleToggle(searchValue.trim());
    }
  };


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchValue.trim() && !exactMatch) {
        handleAddNew();
      } else if (filteredIndustries.length === 1) {
        handleToggle(filteredIndustries[0].name);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearchValue("");
    } else if (e.key === 'Backspace' && !searchValue && selectedIndustries.length > 0) {
      // Remove last selected industry when backspace is pressed with empty input
      onChange(selectedIndustries.slice(0, -1));
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Display selected industries as badges or placeholder text */}
      <div
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
        className="min-h-[28px] flex items-center cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
      >
        {selectedIndustries.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {selectedIndustries.map((industry) => (
              <Badge 
                key={industry} 
                variant="secondary" 
                className="text-xs"
              >
                {industry}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        )}
      </div>
      
      {open && (
        <div className="absolute z-50 w-72 mt-1 bg-popover border rounded-md shadow-lg">
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Suchen oder neue hinzufügen..."
              className="w-full px-2 py-1.5 text-sm bg-transparent border rounded focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          
          <div className="max-h-[200px] overflow-auto p-1">
            {/* Option to add new industry */}
            {searchValue.trim() && !exactMatch && (
              <button
                type="button"
                onClick={handleAddNew}
                disabled={isLoading}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-sm transition-colors cursor-pointer flex items-center gap-2 text-primary"
              >
                <Plus className="h-4 w-4" />
                "{searchValue}" hinzufügen
              </button>
            )}
            
            {/* Existing options */}
            {filteredIndustries.length > 0 ? (
              filteredIndustries.map((industry) => {
                const isSelected = selectedIndustries.includes(industry.name);
                return (
                  <ContextMenu key={industry.id}>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleToggle(industry.name)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-sm transition-colors cursor-pointer flex items-center justify-between ${isSelected ? 'bg-accent/50' : ''}`}
                      >
                        {industry.name}
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onMouseDown={() => handleDeleteIndustry(industry.id, industry.name)}
                        onTouchStart={() => handleDeleteIndustry(industry.id, industry.name)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Löschen
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })
            ) : (
              !searchValue.trim() && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Keine Branchen gefunden
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to parse industry string to array
export function parseIndustryString(industry: string | null | undefined): string[] {
  if (!industry) return [];
  // Try to parse as JSON array first
  try {
    const parsed = JSON.parse(industry);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Not JSON, treat as comma-separated or single value
  }
  // Split by comma and trim
  return industry.split(',').map(i => i.trim()).filter(Boolean);
}

// Helper function to convert array back to string
export function industryArrayToString(industries: string[]): string {
  if (!industries || industries.length === 0) return '';
  // Store as comma-separated for backwards compatibility
  return industries.join(', ');
}
