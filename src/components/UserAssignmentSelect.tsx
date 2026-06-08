import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { UserCircle } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

interface UserAssignmentSelectProps {
  label?: string;
  currentUserId: string | null;
  onAssign: (userId: string | null) => void;
  disabled?: boolean;
}

export function UserAssignmentSelect({ 
  label, 
  currentUserId, 
  onAssign,
  disabled = false 
}: UserAssignmentSelectProps) {
  const { t } = useLanguage();
  const displayLabel = label || t("common.assigned");
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

  const getFirstName = (profile: Profile): string => {
    if (profile.full_name) {
      return profile.full_name.split(' ')[0];
    }
    if (profile.email) {
      return profile.email.split('@')[0];
    }
    return 'Unknown';
  };

  // ... keep existing code (handleChange, loading state, return JSX)

  const handleChange = (value: string) => {
    if (value === 'none') {
      onAssign(null);
    } else {
      onAssign(value);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>{displayLabel}</Label>
        <div className="w-full h-10 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <UserCircle className="h-4 w-4" />
        {displayLabel}
      </Label>
      <Select 
        value={currentUserId || 'none'} 
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("common.notAssigned")} />
        </SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="none">{t("common.notAssigned")}</SelectItem>
          {profiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              {getFirstName(profile)} ({profile.email})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
