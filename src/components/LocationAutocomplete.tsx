import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Loader2 } from "lucide-react";

interface Prediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

const createSessionToken = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = "Standort eingeben",
  className,
  id
}: LocationAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>(createSessionToken());
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync external value changes - only when not actively editing
  useEffect(() => {
    if (!isEditing) {
      setInputValue(value);
    }
  }, [value, isEditing]);

  const fetchPredictions = useCallback(async (input: string) => {
    if (input.trim().length < 3) {
      setPredictions([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('places-autocomplete', {
        body: { 
          input, 
          sessionToken: sessionTokenRef.current 
        }
      });

      if (error) {
        console.error('Error fetching predictions:', error);
        return; // Keep existing predictions on error
      }

      if (data?.predictions?.length > 0) {
        setPredictions(data.predictions);
      } else if (data?.predictions?.length === 0) {
        setPredictions([]);
      }
    } catch (err) {
      console.error('Failed to fetch predictions:', err);
      // Keep existing predictions on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((newValue: string) => {
    setIsEditing(true);
    setInputValue(newValue);
    onChange(newValue);
    setOpen(true);

    // Debounce API calls
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchPredictions(newValue);
    }, 500);
  }, [onChange, fetchPredictions]);

  const handleSelect = useCallback((prediction: Prediction) => {
    setInputValue(prediction.description);
    onChange(prediction.description);
    setPredictions([]);
    setOpen(false);
    setIsEditing(false);
    // Generate new session token after selection (Google best practice)
    sessionTokenRef.current = createSessionToken();
  }, [onChange]);

  const handleFocus = useCallback(() => {
    setOpen(true);
    if (inputValue.trim().length >= 3 && predictions.length === 0) {
      fetchPredictions(inputValue);
    }
  }, [inputValue, predictions.length, fetchPredictions]);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Check if focus is moving to an element inside the popover
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('[data-radix-popover-content]') || 
        relatedTarget?.closest('[cmdk-item]')) {
      return; // Don't close if clicking on a suggestion
    }
    
    setTimeout(() => {
      setOpen(false);
      setIsEditing(false);
    }, 200);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <Popover open={open && (predictions.length > 0 || isLoading)} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <Input
            id={id}
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={cn("pr-8", className)}
            autoComplete="off"
          />
          {isLoading && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[var(--radix-popover-trigger-width)] p-0" 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : predictions.length === 0 ? (
              <CommandEmpty>Keine Vorschläge gefunden</CommandEmpty>
            ) : (
              <CommandGroup>
                {predictions.map((prediction) => (
                  <CommandItem
                    key={prediction.placeId}
                    value={prediction.description}
                    onSelect={() => handleSelect(prediction)}
                    className="cursor-pointer"
                  >
                    <MapPin className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium">{prediction.mainText}</span>
                      {prediction.secondaryText && (
                        <span className="truncate text-xs text-muted-foreground">
                          {prediction.secondaryText}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
