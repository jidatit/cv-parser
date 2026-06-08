import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

interface UserFilterProps {
  storageKey: string;
  value: string | null;
  onChange: (userId: string | null) => void;
}

export function UserFilter({ storageKey, value, onChange }: UserFilterProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .order('full_name');

        if (error) throw error;
        setProfiles(data || []);
      } catch (error) {
        console.error('Error fetching profiles:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && saved !== 'null') {
      onChange(saved);
    }
  }, [storageKey]);

  // Save to localStorage when value changes
  useEffect(() => {
    if (value) {
      localStorage.setItem(storageKey, value);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [value, storageKey]);

  const getFirstName = (profile: Profile): string => {
    if (profile.full_name) {
      return profile.full_name.split(' ')[0];
    }
    if (profile.email) {
      return profile.email.split('@')[0];
    }
    return 'Unbekannt';
  };

  const handleChange = (newValue: string) => {
    if (newValue === 'all') {
      onChange(null);
    } else {
      onChange(newValue);
    }
  };

  if (loading) {
    return (
      <div className="w-[140px] h-9 bg-muted animate-pulse rounded-md" />
    );
  }

  return (
    <Select value={value || 'all'} onValueChange={handleChange}>
      <SelectTrigger className="h-9 w-[140px] text-sm">
        <Users className="h-4 w-4 mr-1.5" />
        <SelectValue placeholder="Alle Nutzer" />
      </SelectTrigger>
      <SelectContent className="bg-popover">
        <SelectItem value="all">Alle Nutzer</SelectItem>
        {profiles.map((profile) => (
          <SelectItem key={profile.id} value={profile.id}>
            {getFirstName(profile)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
