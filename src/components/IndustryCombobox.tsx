import { useState, useEffect, useRef } from "react";
import { Check, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface IndustryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function IndustryCombobox({ value, onChange, placeholder = "-" }: IndustryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [industries, setIndustries] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lade Industries aus der Datenbank beim ersten Render
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

  // Schließe Dropdown wenn außerhalb geklickt wird
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

  // Filter industries basierend auf der Suche
  const filteredIndustries = industries.filter(industry =>
    industry.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Prüfe ob der Suchbegriff bereits existiert
  const exactMatch = industries.some(
    industry => industry.name.toLowerCase() === searchValue.toLowerCase()
  );

  const handleSelect = async (selectedIndustry: string) => {
    onChange(selectedIndustry);
    setOpen(false);
    setSearchValue("");
    
    // Prüfe, ob Industry bereits in der Datenbank existiert, wenn nicht, füge sie hinzu
    const industryExists = industries.some(
      industry => industry.name.toLowerCase() === selectedIndustry.toLowerCase()
    );
    
    if (!industryExists && selectedIndustry.trim()) {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('industries')
          .insert([{ name: selectedIndustry.trim() }])
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
  };

  const handleAddNew = () => {
    if (searchValue.trim() && !exactMatch) {
      handleSelect(searchValue.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchValue.trim() && !exactMatch) {
        handleAddNew();
      } else if (filteredIndustries.length === 1) {
        handleSelect(filteredIndustries[0].name);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearchValue("");
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Display wie andere Felder - klickbarer Text */}
      <p
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
        className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
      >
        {value || placeholder}
      </p>
      
      {open && (
        <div className="absolute z-50 w-64 mt-1 bg-popover border rounded-md shadow-lg">
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
            {/* Option zum Hinzufügen einer neuen Branche */}
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
            
            {/* Bestehende Optionen */}
            {filteredIndustries.length > 0 ? (
              filteredIndustries.map((industry) => (
                <button
                  key={industry.id}
                  type="button"
                  onClick={() => handleSelect(industry.name)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-sm transition-colors cursor-pointer flex items-center justify-between"
                >
                  {industry.name}
                  {value === industry.name && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))
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
