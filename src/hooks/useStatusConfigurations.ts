import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { HonorarBracket, defaultHonorarStructure } from '@/lib/honorarUtils';
import { useAuth } from '@/contexts/AuthContext';

interface Status {
  id: string;
  label: string;
}

interface StatusConfigurations {
  candidateStatuses: Status[];
  clientStatuses: Status[];
  jobStatuses: Status[];
  recruitingStages: Status[];
  matchStages: Status[];
  honorarStructure: HonorarBracket[];
  sourceContacts: Status[];
}

const defaultConfigurations: StatusConfigurations = {
  candidateStatuses: [
    { id: "nd", label: "N/D" },
    { id: "active", label: "Active" },
    { id: "passive", label: "Passive" },
    { id: "not_available", label: "Not available" },
    { id: "placed", label: "Placed" },
    { id: "archived", label: "Archived" }
  ],
  clientStatuses: [
    { id: "nd", label: "N/D" },
    { id: "offen", label: "Offen" },
    { id: "nicht_offen", label: "Nicht offen" },
    { id: "partner", label: "Partner" }
  ],
  jobStatuses: [
    { id: "nd", label: "N/D" },
    { id: "active", label: "Active" },
    { id: "not_available", label: "Not available" },
    { id: "nicht_offen", label: "Nicht offen" },
    { id: "offen", label: "Offen" },
    { id: "assignment", label: "Assignment" },
    { id: "placed", label: "Placed" },
    { id: "archived", label: "Archived" }
  ],
  recruitingStages: [
    { id: "austausch", label: "Austausch ausstehend" },
    { id: "unterlagen_offen", label: "Unterlagen offen" },
    { id: "unterlagen_geschickt", label: "Unterlagen geschickt" },
    { id: "ready2push", label: "Ready2Push" }
  ],
  matchStages: [
    { id: "ready2send", label: "Ready2Send" },
    { id: "vorgestellt", label: "Vorgestellt" },
    { id: "ready2share", label: "Ready2Share" },
    { id: "shared", label: "Shared" },
    { id: "inquiry", label: "Inquiry" },
    { id: "invitation", label: "Invitation" },
    { id: "interview1", label: "Interview 1" },
    { id: "interview2", label: "Interview 2" },
    { id: "trial", label: "Trial Day" },
    { id: "offered", label: "Offered" },
    { id: "placed", label: "Placed" },
    { id: "abgelehnt", label: "Abgelehnt" }
  ],
  honorarStructure: defaultHonorarStructure,
  sourceContacts: [
    { id: "nicola_lube", label: "Nicola Lube" },
    { id: "sebastian_jansche", label: "Sebastian Jansche" },
    { id: "fabian_jansche", label: "Fabian Jansche" },
    { id: "celine_glabonjat", label: "Celine Glabonjat" },
    { id: "davide_di_cesare", label: "Davide di Cesare" },
    { id: "jacqueline_soel", label: "Jacqueline Soel" }
  ]
};

export function useStatusConfigurations() {
  const { user, loading: authLoading } = useAuth();
  const [configurations, setConfigurations] = useState<StatusConfigurations>(defaultConfigurations);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);

  useEffect(() => {
    // Don't load until auth is ready
    if (authLoading) return;
    
    // Only load once per user
    if (hasLoaded.current && user?.id) return;

    loadConfigurations();
    const cleanup = setupRealtimeSubscription();
    
    return cleanup;
  }, [user?.id, authLoading]);

  const loadConfigurations = async () => {
    try {
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('status_configurations')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const newConfigs = { ...defaultConfigurations };

      // Sync status configurations (candidate, client, job) to defaults
      const statusDefaults: Record<string, any> = {
        'candidate_status': defaultConfigurations.candidateStatuses,
        'client_status': defaultConfigurations.clientStatuses,
        'job_status': defaultConfigurations.jobStatuses
      };

      for (const [configType, defaultVal] of Object.entries(statusDefaults)) {
        const existing = data?.find(c => c.config_type === configType);
        if (existing) {
          // Update existing config to new defaults
          await supabase.from('status_configurations')
            .update({ config_value: defaultVal })
            .eq('id', existing.id);
        } else {
          // Insert new default config
          await supabase.from('status_configurations')
            .insert({ user_id: user.id, config_type: configType as any, config_value: defaultVal });
        }
      }

      // Load other configurations from DB (not status configs)
      if (data && data.length > 0) {
        data.forEach((config) => {
          const value = config.config_value as any[];
          switch (config.config_type) {
            case 'recruiting_stage':
              newConfigs.recruitingStages = value;
              break;
            case 'match_stage':
              newConfigs.matchStages = value;
              break;
            case 'honorar_structure':
              newConfigs.honorarStructure = value;
              break;
            case 'source_contacts':
              newConfigs.sourceContacts = value;
              break;
          }
        });
        
        // If honorar_structure is not in DB, save default
        if (!data.some(c => c.config_type === "honorar_structure")) {
          await supabase
            .from("status_configurations")
            .insert({
              user_id: user.id,
              config_type: "honorar_structure",
              config_value: defaultConfigurations.honorarStructure as any,
            });
        }
        
        setConfigurations(newConfigs);
        hasLoaded.current = true;
      } else {
        // No configurations yet, save all defaults
        const configsToInsert = [
          { user_id: user.id, config_type: "recruiting_stage" as const, config_value: defaultConfigurations.recruitingStages as any },
          { user_id: user.id, config_type: "match_stage" as const, config_value: defaultConfigurations.matchStages as any },
          { user_id: user.id, config_type: "honorar_structure" as const, config_value: defaultConfigurations.honorarStructure as any },
          { user_id: user.id, config_type: "source_contacts" as const, config_value: defaultConfigurations.sourceContacts as any },
        ];

        await supabase.from("status_configurations").insert(configsToInsert);
        setConfigurations(defaultConfigurations);
        hasLoaded.current = true;
      }
    } catch (error) {
      console.error('Error loading configurations:', error);
      setConfigurations(defaultConfigurations);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('status-configurations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'status_configurations'
        },
        () => {
          // Reset hasLoaded to allow reload
          hasLoaded.current = false;
          loadConfigurations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  return { configurations, loading, userId: user?.id ?? null };
}
