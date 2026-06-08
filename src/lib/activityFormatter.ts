// Activity formatter for human-readable activity messages

interface ActivityChange {
  old: any;
  new: any;
}

interface ActivityLogData {
  action: string;
  entity_type: string;
  changes?: Record<string, ActivityChange>;
  new_data?: Record<string, any>;
  old_data?: Record<string, any>;
}

export interface FormattedActivity {
  message: string;
  details?: string;
  icon: 'create' | 'update' | 'delete' | 'match' | 'stage' | 'assign' | 'document' | 'status' | 'ai';
}

// Fields that should be ignored in activity logs (internal/technical fields)
const IGNORED_FIELDS = [
  'updated_at',
  'created_at',
  'id',
  'user_id',
  'old_data',
  'new_data',
];

// Technical/AI analysis fields that get special treatment
const AI_ANALYSIS_FIELDS = [
  'analysis_completed_at',
  'commute_calculated_at',
  'match_gaps',
  'match_reasons',
  'match_risks',
  'match_strengths',
  'match_summary',
  'match_score',
  'commute_auto_duration',
  'commute_auto_distance',
  'commute_oepnv_duration',
  'commute_oepnv_distance',
];

// Fields typically updated via CV parser
const CV_PARSER_FIELDS = [
  'name',
  'email',
  'phone',
  'location',
  'position',
  'desired_position',
  'experience',
  'skills',
  'education',
  'work_experience',
  'languages',
  'certifications',
  'awards_publications',
  'summary',
  'birthdate',
  'current_salary',
  'desired_salary',
  'notice_period',
  'willing_to_relocate',
  'max_commute',
  'workload',
  'industry',
];

// Threshold for cumulative display
const CUMULATIVE_THRESHOLD = 3;

// Helper to safely extract value from potentially complex change object
function extractValue(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return null;
    return val.map(v => extractValue(v)).filter(Boolean).join(', ');
  }
  // Handle map[old:... new:...] format from triggers
  if (typeof val === 'object') {
    if ('new' in val) return extractValue(val.new);
    if ('old' in val) return extractValue(val.old);
    // Try to stringify objects meaningfully
    try {
      const str = JSON.stringify(val);
      if (str.length < 100) return str;
      return null; // Too complex to display
    } catch {
      return null;
    }
  }
  return null;
}

// Format change with old → new value
function formatChange(oldVal: any, newVal: any, t: (key: string) => string): string {
  const old = extractValue(oldVal);
  const newValue = extractValue(newVal);
  
  // Limit length for display
  const maxLen = 30;
  const truncate = (s: string) => s.length > maxLen ? s.substring(0, maxLen) + '…' : s;
  
  if (!old && newValue) return `→ ${truncate(newValue)}`;
  if (old && !newValue) return `${truncate(old)} → (${t('activity.empty') || 'leer'})`;
  if (old && newValue) return `${truncate(old)} → ${truncate(newValue)}`;
  return '';
}

// Format assignment change with user names
function formatAssignmentChange(
  oldVal: any, 
  newVal: any, 
  t: (key: string) => string,
  getUserName?: (userId: string) => string
): string {
  const oldId = extractValue(oldVal);
  const newId = extractValue(newVal);
  
  const notAssigned = t('activity.notAssigned') || 'Nicht zugewiesen';
  
  // Resolve user names or show "not assigned"
  const oldName = oldId ? (getUserName?.(oldId) || oldId) : notAssigned;
  const newName = newId ? (getUserName?.(newId) || newId) : notAssigned;
  
  // Limit length for display
  const maxLen = 25;
  const truncate = (s: string) => s.length > maxLen ? s.substring(0, maxLen) + '…' : s;
  
  if (oldName === newName) return '';
  
  return `${truncate(oldName)} → ${truncate(newName)}`;
}

// Priority fields that generate specific activity messages
const PRIORITY_FIELD_HANDLERS: Record<string, (change: ActivityChange, entityType: string, t: (key: string) => string) => FormattedActivity | null> = {
  stage: (change, entityType, t) => {
    const oldStage = extractValue(change.old);
    const newStage = extractValue(change.new);
    if (!newStage || oldStage === newStage) return null;
    
    // Check if this is a rejection (stage changed to "Abgelehnt" or "Rejected")
    const isRejection = newStage.toLowerCase() === 'abgelehnt' || newStage.toLowerCase() === 'rejected';
    
    if (isRejection) {
      return {
        message: t('activity.events.matchRejected') || 'Match abgelehnt',
        details: oldStage ? `${oldStage} → ${newStage}` : undefined,
        icon: 'delete'
      };
    }
    
    const details = formatChange(change.old, change.new, t);
    return {
      message: t('activity.events.stageChanged') || 'Phase geändert',
      details,
      icon: 'stage'
    };
  },
  
  recruiting_status: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.recruitingStatusChanged') || 'Recruiting-Status geändert',
      details,
      icon: 'status'
    };
  },
  
  status: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.statusChanged') || 'Status geändert',
      details,
      icon: 'status'
    };
  },
  
  // assigned_to is handled specially in formatActivityLog to use getUserName

  name: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.nameChanged') || 'Name geändert',
      details,
      icon: 'update'
    };
  },

  title: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.titleChanged') || 'Titel geändert',
      details,
      icon: 'update'
    };
  },

  email: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.emailChanged') || 'E-Mail geändert',
      details,
      icon: 'update'
    };
  },

  phone: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.phoneChanged') || 'Telefon geändert',
      details,
      icon: 'update'
    };
  },

  location: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.locationChanged') || 'Standort geändert',
      details,
      icon: 'update'
    };
  },

  position: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.positionChanged') || 'Position geändert',
      details,
      icon: 'update'
    };
  },

  salary_range: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.salaryChanged') || 'Gehalt geändert',
      details,
      icon: 'update'
    };
  },

  desired_salary: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.salaryChanged') || 'Gehaltsvorstellung geändert',
      details,
      icon: 'update'
    };
  },

  current_salary: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.salaryChanged') || 'Aktuelles Gehalt geändert',
      details,
      icon: 'update'
    };
  },

  skills: (change, entityType, t) => {
    const oldSkills = Array.isArray(change.old) ? change.old : [];
    const newSkills = Array.isArray(change.new) ? change.new : [];
    const added = newSkills.filter((s: string) => !oldSkills.includes(s));
    const removed = oldSkills.filter((s: string) => !newSkills.includes(s));
    
    let details = '';
    if (added.length > 0) details += `+${added.slice(0, 3).join(', ')}${added.length > 3 ? '…' : ''}`;
    if (removed.length > 0) details += (details ? ' | ' : '') + `-${removed.slice(0, 3).join(', ')}${removed.length > 3 ? '…' : ''}`;
    
    if (!details && oldSkills.length === 0 && newSkills.length > 0) {
      details = `+${newSkills.slice(0, 3).join(', ')}${newSkills.length > 3 ? '…' : ''}`;
    }
    
    return {
      message: t('activity.events.skillsUpdated') || 'Skills aktualisiert',
      details: details || undefined,
      icon: 'update'
    };
  },

  industry: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.industryChanged') || 'Branche geändert',
      details,
      icon: 'update'
    };
  },

  client_id: (change, entityType, t) => {
    return {
      message: t('activity.events.clientChanged') || 'Kunde geändert',
      details: undefined,
      icon: 'update'
    };
  },

  experience: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.experienceChanged') || 'Erfahrung aktualisiert',
      details,
      icon: 'update'
    };
  },

  workload: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.workloadChanged') || 'Pensum geändert',
      details,
      icon: 'update'
    };
  },

  employment_type: (change, entityType, t) => {
    const details = formatChange(change.old, change.new, t);
    if (!details) return null;
    return {
      message: t('activity.events.employmentTypeChanged') || 'Beschäftigungsart geändert',
      details,
      icon: 'update'
    };
  },

  notes: (change, entityType, t) => ({
    message: t('activity.events.notesUpdated') || 'Notizen aktualisiert',
    details: undefined,
    icon: 'update'
  }),

  description: (change, entityType, t) => ({
    message: t('activity.events.descriptionUpdated') || 'Beschreibung aktualisiert',
    details: undefined,
    icon: 'update'
  }),

  requirements: (change, entityType, t) => ({
    message: t('activity.events.requirementsUpdated') || 'Anforderungen aktualisiert',
    details: undefined,
    icon: 'update'
  }),

  summary: (change, entityType, t) => ({
    message: t('activity.events.summaryUpdated') || 'Zusammenfassung aktualisiert',
    details: undefined,
    icon: 'update'
  }),

  avatar_url: (change, entityType, t) => ({
    message: t('activity.events.avatarChanged') || 'Profilbild geändert',
    details: undefined,
    icon: 'update'
  }),

  logo_url: (change, entityType, t) => ({
    message: t('activity.events.logoChanged') || 'Logo geändert',
    details: undefined,
    icon: 'update'
  }),
};

// Check if all changes are AI-related
function isOnlyAiChanges(changes: Record<string, ActivityChange>): boolean {
  const keys = Object.keys(changes).filter(k => !IGNORED_FIELDS.includes(k));
  return keys.length > 0 && keys.every(k => AI_ANALYSIS_FIELDS.includes(k));
}

// Check if changes look like CV parser bulk update
function isCvParserUpdate(changes: Record<string, ActivityChange>): boolean {
  const keys = Object.keys(changes).filter(k => !IGNORED_FIELDS.includes(k) && !AI_ANALYSIS_FIELDS.includes(k));
  if (keys.length < 3) return false;
  
  // Check if most changes are CV parser fields
  const cvFieldCount = keys.filter(k => CV_PARSER_FIELDS.includes(k)).length;
  return cvFieldCount >= Math.ceil(keys.length * 0.7); // At least 70% are CV parser fields
}

export function formatActivityLog(
  log: ActivityLogData,
  t: (key: string) => string,
  getUserName?: (userId: string) => string
): FormattedActivity[] {
  const tSafe = (key: string) => {
    const res = t(key);
    return res === key ? '' : res;
  };

  const activities: FormattedActivity[] = [];
  const { action, entity_type, changes, new_data } = log;

  // Handle INSERT action
  if (action === 'INSERT') {
    switch (entity_type) {
      case 'placements':
        activities.push({
          message: tSafe('activity.events.matchCreated') || 'Match erstellt',
          icon: 'match'
        });
        break;
      case 'candidates':
        activities.push({
          message: tSafe('activity.events.candidateCreated') || 'Kandidat erstellt',
          icon: 'create'
        });
        break;
      case 'jobs':
        activities.push({
          message: tSafe('activity.events.jobCreated') || 'Stelle erstellt',
          icon: 'create'
        });
        break;
      case 'clients':
        activities.push({
          message: tSafe('activity.events.clientCreated') || 'Kunde erstellt',
          icon: 'create'
        });
        break;
      default:
        activities.push({
          message: tSafe('activity.created') || 'Erstellt',
          icon: 'create'
        });
    }
    return activities;
  }

  // Handle custom events (document upload, expose creation)
  if (action === 'DOCUMENT_UPLOAD') {
    activities.push({
      message: tSafe('activity.events.documentUploaded') || 'Dokument hochgeladen',
      details: new_data?.file_name || undefined,
      icon: 'document'
    });
    return activities;
  }

  if (action === 'DOCUMENT_DELETE') {
    activities.push({
      message: tSafe('activity.events.documentDeleted') || 'Dokument gelöscht',
      details: new_data?.file_name || undefined,
      icon: 'document'
    });
    return activities;
  }

  if (action === 'EXPOSE_CREATED') {
    activities.push({
      message: tSafe('activity.events.exposeCreated') || 'Exposé erstellt',
      details: new_data?.template || undefined,
      icon: 'document'
    });
    return activities;
  }

  // Handle DELETE action
  if (action === 'DELETE') {
    switch (entity_type) {
      case 'placements':
        activities.push({
          message: tSafe('activity.events.matchRemoved') || 'Match aufgelöst',
          icon: 'delete'
        });
        break;
      default:
        activities.push({
          message: tSafe('activity.deleted') || 'Gelöscht',
          icon: 'delete'
        });
    }
    return activities;
  }

  // Handle UPDATE action - check specific field changes
  if (action === 'UPDATE' && changes) {
    // First check if only AI analysis fields changed
    if (isOnlyAiChanges(changes)) {
      activities.push({
        message: tSafe('activity.events.aiAnalysisUpdated') || 'KI-Analyse aktualisiert',
        details: undefined,
        icon: 'ai'
      });
      return activities;
    }

    const changedKeys = Object.keys(changes).filter(
      key => !IGNORED_FIELDS.includes(key) && !AI_ANALYSIS_FIELDS.includes(key)
    );

    // Check if this looks like a CV parser update (many fields, mostly CV-related)
    if (isCvParserUpdate(changes) && entity_type === 'candidates') {
      activities.push({
        message: tSafe('activity.events.cvParserUpdate') || 'Daten via CV-Parser aktualisiert',
        details: `${changedKeys.length} ${tSafe('activity.fields.fieldsUpdated') || 'Felder aktualisiert'}`,
        icon: 'document'
      });
      return activities;
    }

    // Check if more than threshold fields changed - show cumulative
    if (changedKeys.length > CUMULATIVE_THRESHOLD) {
      // Still show assigned_to separately if it changed
      if (changedKeys.includes('assigned_to') && changes['assigned_to']) {
        const details = formatAssignmentChange(
          changes['assigned_to'].old, 
          changes['assigned_to'].new, 
          tSafe, 
          getUserName
        );
        activities.push({
          message: tSafe('activity.events.assignedChanged') || 'Zuweisung geändert',
          details: details || undefined,
          icon: 'assign'
        });
      }

      // Show cumulative update for the rest
      const otherKeys = changedKeys.filter(k => k !== 'assigned_to');
      if (otherKeys.length > 0) {
        activities.push({
          message: tSafe('activity.events.multipleFieldsUpdated') || 'Mehrere Felder aktualisiert',
          details: `${otherKeys.length} ${tSafe('activity.fields.fieldsUpdated') || 'Felder geändert'}`,
          icon: 'update'
        });
      }
      return activities;
    }

    // Handle assigned_to specially to use getUserName
    if (changedKeys.includes('assigned_to') && changes['assigned_to']) {
      const details = formatAssignmentChange(
        changes['assigned_to'].old, 
        changes['assigned_to'].new, 
        tSafe, 
        getUserName
      );
      activities.push({
        message: tSafe('activity.events.assignedChanged') || 'Zuweisung geändert',
        details: details || undefined,
        icon: 'assign'
      });
    }

    // Check priority fields first
    for (const key of changedKeys) {
      if (key === 'assigned_to') continue; // Already handled above
      const handler = PRIORITY_FIELD_HANDLERS[key];
      if (handler) {
        const activity = handler(changes[key], entity_type, tSafe);
        if (activity) {
          activities.push(activity);
        }
      }
    }

    // If no priority fields were found, show generic update with field names
    if (activities.length === 0 && changedKeys.length > 0) {
      const relevantFields = changedKeys.slice(0, 3);
      const fieldLabels = relevantFields.map(key => {
        const translated = tSafe(`activity.fields.${key}`);
        if (!translated) {
          return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return translated;
      });

      activities.push({
        message: tSafe('activity.events.fieldsUpdated') || 'Daten aktualisiert',
        details: fieldLabels.join(', '),
        icon: 'update'
      });
    }

    // If still no activities (only ignored fields), return a minimal update
    if (activities.length === 0) {
      activities.push({
        message: tSafe('activity.updated') || 'Aktualisiert',
        details: undefined,
        icon: 'update'
      });
    }

    return activities;
  }

  // Fallback
  return [{
    message: tSafe(`activity.${action.toLowerCase()}`) || tSafe('activity.updated') || 'Aktualisiert',
    icon: 'update'
  }];
}

export function getActivityIcon(type: FormattedActivity['icon']) {
  return type;
}
