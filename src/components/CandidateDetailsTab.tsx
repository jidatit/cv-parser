import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  GraduationCap,
  Star,
  Clock,
  Target,
  Route,
  Plus,
  X,
  Check,
  DollarSign,
  Home,
  TrendingUp,
  Repeat,
  Timer,
  Languages,
  Award,
  Wrench,
  Linkedin,
  UserCheck,
  ScrollText,
  Sparkles,
  Loader2,
  GripVertical,
  CheckCircle2,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarUpload } from "@/components/AvatarUpload";
import { NotesSection } from "@/components/NotesSection";
import { DocumentUpload } from "@/components/DocumentUpload";
import { CandidateInsights } from "@/components/CandidateInsights";
import { SkillsCombobox } from "@/components/SkillsCombobox";
import { LanguagesCombobox } from "@/components/LanguagesCombobox";
import {
  IndustryMultiSelect,
  parseIndustryString,
  industryArrayToString,
} from "@/components/IndustryMultiSelect";
import { StatusDropdown } from "@/components/StatusDropdown";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useStatusConfigurations } from "@/hooks/useStatusConfigurations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Building2, UserCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAIMatching } from "@/contexts/AIMatchingContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { RichTextEditor } from "./ui/richText-editor";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WorkExperience {
  company: string;
  position: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  client_id?: string;
}

interface Education {
  degree: string;
  field?: string;
  institution: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  // Support legacy snake_case keys coming from DB
  start_date?: string;
  end_date?: string;
  grade?: string;
}

interface FurtherEducation {
  name: string;
  institution: string;
  date?: string;
  description?: string;
}

interface Language {
  name: string;
  level?: string; // A1, A2, B1, B2, C1, C2, M (Muttersprache)
}

interface AwardPublication {
  /** Display/UI: prefer title; DB may send name */
  title?: string;
  name?: string;
  type?: "award" | "publication" | "engagement";
  year?: string;
  date?: string;
  publisher?: string;
  organization?: string;
  issuer?: string;
  description?: string;
}

// Certification interface removed - merged into FurtherEducation

const LANGUAGE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "M"] as const;

/** Extract sort key (year) from award/publication for reverse-chronological order (newest first) */
function awardPublicationSortKey(item: AwardPublication): number {
  const dateStr = (item.year ?? item.date ?? "").trim();
  if (!dateStr) return 0;
  const years = dateStr.match(/\b(19|20)\d{2}\b/g);
  if (!years || years.length === 0) return 0;
  return Math.max(...years.map((y) => parseInt(y, 10)));
}

// Normalize awards_publications from DB (name/date/issuer) to UI shape (title/year/publisher/organization)
function normalizeAwardPublication(item: AwardPublication): AwardPublication & {
  title: string;
  type: "award" | "publication" | "engagement";
  year: string;
  publisher: string;
  organization: string;
} {
  const type = item.type ?? "award";
  const title = (item.title ?? item.name ?? "").trim();
  const year = (item.year ?? item.date ?? "").trim();
  const issuer = (item.issuer ?? "").trim();
  return {
    ...item,
    title: title || "",
    type,
    year,
    publisher:
      type !== "engagement"
        ? (item.publisher ?? issuer)
        : (item.publisher ?? ""),
    organization:
      type === "engagement"
        ? (item.organization ?? issuer)
        : (item.organization ?? ""),
    description: item.description ?? "",
  };
}

interface CandidateInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  position?: string;
  desired_position?: string;
  industry?: string;
  status?: string;
  recruiting_status?: string;
  experience?: string;
  current_salary?: string;
  desired_salary?: string;
  max_commute?: string;
  willing_to_relocate?: string;
  workload?: string;
  reason_for_change?: string;
  birthdate?: string;
  notice_period?: string;
  skills?: string[];
  education?: Education[];
  further_education?: FurtherEducation[];
  work_experience?: WorkExperience[];
  languages?: Language[];
  awards_publications?: AwardPublication[];
  last_contact?: string;
  notes?: string;
  avatar_url?: string;
  assigned_to?: string | null;
  linkedin_url?: string;
  source_contact?: string;
  summary?: string;
  // Candidate Insights fields
  ai_summary?: string;
  signature_achievements?: string[];
  growth_potential?: string[];
  most_proud_of?: string;
  potential_risks?: string;
  insights_notes?: string;
  full_image_url?: string;
}

interface CandidateDetailsTabProps {
  candidate: CandidateInfo;
  onUpdate: (updates: Partial<CandidateInfo>) => Promise<void>;
  editingField: string | null;
  setEditingField: (field: string | null) => void;
  editValue: string;
  setEditValue: (value: string) => void;
  newSkill: string;
  setNewSkill: (skill: string) => void;
  editingWorkExp: number | null;
  setEditingWorkExp: (index: number | null) => void;
  editingEducation: number | null;
  setEditingEducation: (index: number | null) => void;
  // further_education is edited entirely inside this component for now
  profiles: { id: string; email: string | null; full_name: string | null }[];
}

// Helper function to calculate total work experience in years from work_experience array
const calculateTotalExperience = (
  workExperience: WorkExperience[] | undefined,
): string => {
  if (!workExperience || workExperience.length === 0) return "-";

  let totalMonths = 0;
  const now = new Date();

  workExperience.forEach((exp) => {
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    // Parse start date
    const rawStart = exp.startDate || exp.start_date;
    if (rawStart) {
      const parsed = new Date(rawStart);
      if (!isNaN(parsed.getTime())) {
        startDate = parsed;
      }
    }

    // Parse end date (use current date if ongoing/empty)
    const rawEnd = exp.endDate || exp.end_date;
    if (
      rawEnd &&
      rawEnd.toLowerCase() !== "heute" &&
      rawEnd.toLowerCase() !== "present" &&
      rawEnd.toLowerCase() !== "current"
    ) {
      const parsed = new Date(rawEnd);
      if (!isNaN(parsed.getTime())) {
        endDate = parsed;
      }
    }

    if (!endDate) {
      endDate = now;
    }

    if (startDate && endDate) {
      const months =
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth());
      if (months > 0) {
        totalMonths += months;
      }
    }
  });

  if (totalMonths === 0) return "-";

  const years = Math.round((totalMonths / 12) * 10) / 10; // Round to 1 decimal
  return years === 1 ? "1 Jahr" : `${years.toString().replace(".", ",")} Jahre`;
};
// Decode HTML entities (&nbsp;, &amp;, etc.) to their actual characters
const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

// Convert HTML with <ul>/<li>/<p> tags to plain text with bullet markers
const htmlToPlainBullets = (html: string): string => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const container = doc.body.firstElementChild;
    if (!container) return html;

    const lines: string[] = [];
    for (const node of Array.from(container.childNodes)) {
      if (node instanceof Element && (node.tagName === 'UL' || node.tagName === 'OL')) {
        for (const li of Array.from(node.querySelectorAll('li'))) {
          const text = (li.textContent || '').replace(/\u00A0/g, ' ').trim();
          if (text) lines.push(`• ${text}`);
        }
      } else {
        const text = (node.textContent || '').replace(/\u00A0/g, ' ').trim();
        if (text) lines.push(text);
      }
    }
    return lines.join('\n');
  } catch {
    return html;
  }
};

const renderDescription = (description: string) => {
  if (!description) return null;

  // If input contains HTML tags, convert to plain text first
  let text = description;
  if (/<(ul|ol|li|p)\b/i.test(text)) {
    text = htmlToPlainBullets(text);
  }

  // Decode any remaining HTML entities (e.g. &nbsp; &amp; &lt;)
  text = decodeHtmlEntities(text);

  return (
    <div className="text-sm mt-2 space-y-1">
      {text
        .split("\n")
        .filter((line) => line.trim())
        .map((line, i) => {
          const trimmed = line.trim();

          // Main bullet: "• ..."
          if (trimmed.startsWith("•")) {
            return (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground flex-shrink-0">•</span>
                <span className="flex-1">{trimmed.substring(1).trim()}</span>
              </div>
            );
          }

          // Sub‑bullet: "○ ..." (one level indented)
          if (trimmed.startsWith("○")) {
            return (
              <div key={i} className="flex gap-2 pl-6">
                <span className="text-muted-foreground flex-shrink-0">○</span>
                <span className="flex-1">{trimmed.substring(1).trim()}</span>
              </div>
            );
          }

          // Regular line
          return trimmed ? <p key={i}>{trimmed}</p> : null;
        })}
    </div>
  );
};
// Helper function to format salary with thousand separators (German format)
const formatSalaryWithSeparators = (value: string): string => {
  // Handle ranges like "100000-200000" or "100000–200000"
  const parts = value.split(/[-–]/);
  const formattedParts = parts.map((part) => {
    const num = parseInt(part.replace(/\./g, "").trim(), 10);
    if (!isNaN(num)) {
      return num.toLocaleString("de-CH");
    }
    return part.trim();
  });
  return formattedParts.join("-");
};

// Helper function to format display values with units
const formatWithUnit = (
  value: string | undefined | null,
  field: string,
): string => {
  if (!value || value === "-") return "-";

  // Remove existing units to get clean number
  const cleanValue = value.replace(/[^\d.,\-–]/g, "").trim();
  const numericValue = parseFloat(
    cleanValue.replace(",", ".").split(/[-–]/)[0],
  );

  switch (field) {
    case "experience":
      // Berufserfahrung: Jahre
      if (!isNaN(numericValue)) {
        return `${cleanValue} Jahre`;
      }
      return value;
    case "current_salary":
    case "desired_salary":
      // Gehalt: CHF with thousand separators
      if (cleanValue) {
        const formattedValue = formatSalaryWithSeparators(cleanValue);
        return `CHF ${formattedValue}`;
      }
      return value;
    case "workload":
      // Arbeitspensum: %
      if (!isNaN(numericValue)) {
        return `${cleanValue}%`;
      }
      return value;
    case "max_commute":
      // Max. Pendelweg: < 3 = Stunden (h), >= 3 = Minuten (min)
      if (!isNaN(numericValue)) {
        if (numericValue < 3) {
          return `${cleanValue} h`;
        } else {
          return `${cleanValue} min`;
        }
      }
      return value;
    case "notice_period":
      // Kündigungsfrist: Monate
      if (!isNaN(numericValue)) {
        return numericValue === 1
          ? `${cleanValue} Monat`
          : `${cleanValue} Monate`;
      }
      return value;
    default:
      return value;
  }
};

// Helper to extract raw value for editing (removes units and thousand separators)
const extractRawValue = (
  value: string | undefined | null,
  field: string,
): string => {
  if (!value) return "";

  switch (field) {
    case "experience":
      return value.replace(/\s*Jahre?\s*/gi, "").trim();
    case "current_salary":
    case "desired_salary":
      // Remove CHF and thousand separators (dots in German format, but keep dash for ranges)
      return value
        .replace(/CHF\s*/gi, "")
        .replace(/\./g, "")
        .replace(/'/g, "")
        .trim();
    case "workload":
      return value.replace(/%/g, "").trim();
    case "max_commute":
      // Just return the number, user enters in the unit they see
      return value.replace(/\s*(min|h)\s*/gi, "").trim();
    case "notice_period":
      return value.replace(/\s*Monate?\s*/gi, "").trim();
    default:
      return value;
  }
};

export function CandidateDetailsTab({
  candidate,
  onUpdate,
  editingField,
  setEditingField,
  editValue,
  setEditValue,
  newSkill,
  setNewSkill,
  editingWorkExp,
  setEditingWorkExp,
  editingEducation,
  setEditingEducation,
  profiles,
}: CandidateDetailsTabProps) {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const { t } = useTranslation();
  const { configurations } = useStatusConfigurations();
  const { startMatchingForCandidate } = useAIMatching();

  const [isAIFillingDetails, setIsAIFillingDetails] = useState(false);

  const handleAIFillDetails = async () => {
    setIsAIFillingDetails(true);
    try {
      const detailFields = [
        { key: 'desired_position', label: 'Gewünschte Position' },
        { key: 'industry', label: 'Branche' },
        { key: 'current_salary', label: 'Aktuelles Gehalt' },
        { key: 'desired_salary', label: 'Gewünschtes Gehalt' },
        { key: 'workload', label: 'Arbeitspensum' },
        { key: 'willing_to_relocate', label: 'Umzugsbereitschaft' },
        { key: 'max_commute', label: 'Max. Pendelweg' },
        { key: 'notice_period', label: 'Kündigungsfrist' },
        { key: 'reason_for_change', label: 'Wechselgrund' },
      ];

      const emptyFields = detailFields.filter(f => {
        const val = candidate[f.key as keyof CandidateInfo];
        return !val || (typeof val === 'string' && val.trim() === '');
      });

      if (emptyFields.length === 0) {
        toast({ title: t('candidateDetails.allFieldsFilled'), description: t('candidateDetails.allFieldsFilledDesc') });
        setIsAIFillingDetails(false);
        return;
      }

      const emptyFieldsList = emptyFields.map(f => `- ${f.label} (${f.key})`).join('\n');
      const instruction = `Analysiere die vorhandenen Kandidatendaten (Berufserfahrung, Skills, Ausbildung, Notizen) und schlage Werte für die folgenden LEEREN Felder vor. Gib NUR diese Felder zurück, keine anderen:\n\n${emptyFieldsList}\n\nWICHTIG: Gib NUR Felder zurück, die in dieser Liste stehen. Erfinde keine Daten - leite die Werte aus den vorhandenen Informationen ab.`;

      const { data, error } = await supabase.functions.invoke('process-candidate-info', {
        body: {
          analyzeExistingData: true,
          currentData: candidate,
          instruction,
        },
      });

      if (error) throw error;

      if (data?.fields && data.fields.length > 0) {
        const updates: Partial<CandidateInfo> = {};
        const allowedKeys = detailFields.map(f => f.key);
        
        for (const field of data.fields) {
          if (allowedKeys.includes(field.key) && field.value) {
            const currentVal = candidate[field.key as keyof CandidateInfo];
            if (!currentVal || (typeof currentVal === 'string' && currentVal.trim() === '')) {
              (updates as any)[field.key] = field.value;
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          await onUpdate(updates);
          toast({ title: t('candidateDetails.detailsFilled'), description: t('candidateDetails.detailsFilledDesc', { count: Object.keys(updates).length }) });
        } else {
          toast({ title: t('candidateDetails.noSuggestions'), description: t('candidateDetails.noSuggestionsDesc') });
        }
      } else {
        toast({ title: t('candidateDetails.noSuggestions'), description: t('candidateDetails.noSuggestionsDesc') });
      }
    } catch (error) {
      console.error('AI fill details error:', error);
      toast({ title: t('candidateDetails.aiFillError'), description: t('candidateDetails.aiFillErrorDesc'), variant: 'destructive' });
    } finally {
      setIsAIFillingDetails(false);
    }
  };

  console.log("candidate", candidate);
  // Local state for work experience editing
  const [editingWorkExpData, setEditingWorkExpData] =
    useState<WorkExperience | null>(null);

  // Sync local state when starting to edit a work experience
  useEffect(() => {
    if (
      editingWorkExp !== null &&
      candidate.work_experience?.[editingWorkExp]
    ) {
      const raw = candidate.work_experience[editingWorkExp];
      setEditingWorkExpData({
        ...raw,
        startDate: raw.startDate || raw.start_date || "",
        endDate: raw.endDate || raw.end_date || "",
      });
    } else {
      setEditingWorkExpData(null);
    }
  }, [editingWorkExp, candidate.work_experience]);

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    // Extract raw value for fields with units
    const rawValue = extractRawValue(currentValue, field);
    setEditValue(rawValue || "");
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  // Handle Enter key to save, Escape to cancel
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: string,
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit(field);
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  // Convert salary shorthand like "80k" to "80000" or "80-100k" to "80000-100000"
  const convertSalaryShorthand = (value: string): string => {
    if (!value) return value;

    // Handle ranges with k suffix (e.g., "80-100k" or "80k-100k")
    const rangeMatch = value.match(/^(\d+)(?:k)?\s*[-–]\s*(\d+)k$/i);
    if (rangeMatch) {
      const lower =
        parseInt(rangeMatch[1], 10) *
        (value.toLowerCase().includes("k-") ||
        !value.toLowerCase().match(/^\d+k/i)
          ? 1000
          : 1);
      const upper = parseInt(rangeMatch[2], 10) * 1000;
      // Check if first number also needs conversion (no k after first number means it's already the full range format like "80-100k")
      const lowerValue = value.toLowerCase().match(/^(\d+)k\s*[-–]/i)
        ? parseInt(rangeMatch[1], 10) * 1000
        : parseInt(rangeMatch[1], 10) * 1000;
      return `${lowerValue}-${upper}`;
    }

    // Handle single value with k suffix (e.g., "80k")
    const singleMatch = value.match(/^(\d+)k$/i);
    if (singleMatch) {
      return String(parseInt(singleMatch[1], 10) * 1000);
    }

    return value;
  };

  const saveEdit = async (field: string) => {
    let valueToSave = editValue;

    // Format Swiss phone numbers
    if (field === "phone" && valueToSave) {
      valueToSave = formatSwissPhoneNumber(valueToSave);
    }

    // Convert salary shorthand (e.g., 80k -> 80000, 80-100k -> 80000-100000)
    if (
      (field === "current_salary" || field === "desired_salary") &&
      valueToSave
    ) {
      valueToSave = convertSalaryShorthand(valueToSave);
    }

    await onUpdate({ [field]: valueToSave });
    setEditingField(null);
    setEditValue("");
  };

  // Format Swiss phone numbers with country code and proper spacing
  // Input: "077 498 27 63" or "0774982763" -> Output: "+41 77 498 27 63"
  const formatSwissPhoneNumber = (phone: string): string => {
    // Remove all non-digit characters
    let digits = phone.replace(/\D/g, "");

    // If it starts with 41, it already has country code
    if (digits.startsWith("41") && digits.length >= 11) {
      // Already has country code, just format
      const areaCode = digits.slice(2, 4);
      const part1 = digits.slice(4, 7);
      const part2 = digits.slice(7, 9);
      const part3 = digits.slice(9, 11);
      return `+41 ${areaCode} ${part1} ${part2} ${part3}`;
    }

    // If it starts with 0, it's a Swiss number without country code
    if (digits.startsWith("0") && digits.length >= 10) {
      // Remove leading 0 and add +41
      digits = digits.slice(1);
      const areaCode = digits.slice(0, 2);
      const part1 = digits.slice(2, 5);
      const part2 = digits.slice(5, 7);
      const part3 = digits.slice(7, 9);
      return `+41 ${areaCode} ${part1} ${part2} ${part3}`;
    }

    // If it's 9 digits (without leading 0), assume Swiss number
    if (digits.length === 9) {
      const areaCode = digits.slice(0, 2);
      const part1 = digits.slice(2, 5);
      const part2 = digits.slice(5, 7);
      const part3 = digits.slice(7, 9);
      return `+41 ${areaCode} ${part1} ${part2} ${part3}`;
    }

    // Return original if format not recognized
    return phone;
  };

  const handleAvatarChange = async (url: string) => {
    await onUpdate({ avatar_url: url });
  };

  const handleAddSkill = async (skill: string) => {
    if (!skill.trim()) return;
    const updatedSkills = [...(candidate.skills || []), skill];
    await onUpdate({ skills: updatedSkills });
    setNewSkill("");
  };

  const handleRemoveSkill = async (skillToRemove: string) => {
    const updatedSkills = (candidate.skills || []).filter(
      (skill) => skill !== skillToRemove,
    );
    await onUpdate({ skills: updatedSkills });
  };

  // State for editing a skill inline
  const [editingSkillIndex, setEditingSkillIndex] = useState<number | null>(
    null,
  );
  const [editingSkillValue, setEditingSkillValue] = useState("");

  const startEditSkill = (index: number, skill: string) => {
    setEditingSkillIndex(index);
    setEditingSkillValue(skill);
  };

  const saveEditSkill = async () => {
    if (editingSkillIndex === null) return;
    const updatedSkills = [...(candidate.skills || [])];
    if (editingSkillValue.trim()) {
      updatedSkills[editingSkillIndex] = editingSkillValue.trim();
    } else {
      // If empty, remove the skill
      updatedSkills.splice(editingSkillIndex, 1);
    }
    await onUpdate({ skills: updatedSkills });
    setEditingSkillIndex(null);
    setEditingSkillValue("");
  };

  const cancelEditSkill = () => {
    setEditingSkillIndex(null);
    setEditingSkillValue("");
  };

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditSkill();
    } else if (e.key === "Escape") {
      cancelEditSkill();
    }
  };

  const addWorkExperience = async () => {
    const newExp: WorkExperience = {
      company: "",
      position: "",
      startDate: "",
      endDate: "",
      description: "",
    };
    const updatedWorkExp = [...(candidate.work_experience || []), newExp];
    await onUpdate({ work_experience: updatedWorkExp });
  };

  const removeWorkExperience = async (index: number) => {
    const updatedWorkExp = (candidate.work_experience || []).filter(
      (_, i) => i !== index,
    );
    await onUpdate({ work_experience: updatedWorkExp });
  };

  // Update local state only (doesn't save to DB)
  const updateLocalWorkExp = (field: keyof WorkExperience, value: string) => {
    if (editingWorkExpData) {
      setEditingWorkExpData({ ...editingWorkExpData, [field]: value });
    }
  };

  // Save work experience to DB
  const saveWorkExperience = async () => {
    if (editingWorkExp !== null && editingWorkExpData) {
      const updatedWorkExp = [...(candidate.work_experience || [])];
      updatedWorkExp[editingWorkExp] = editingWorkExpData;
      await onUpdate({ work_experience: updatedWorkExp });
      setEditingWorkExp(null);
      setEditingWorkExpData(null);
    }
  };

  const cancelWorkExpEdit = () => {
    setEditingWorkExp(null);
    setEditingWorkExpData(null);
  };

  // Convert work experience to education entry
  const convertWorkExpToEducation = async (index: number) => {
    const workExp = candidate.work_experience?.[index];
    if (!workExp) return;

    const newEducation: Education = {
      degree: workExp.position || "",
      field: "",
      institution: workExp.company || "",
      location: workExp.location || "",
      startDate: workExp.startDate || "",
      endDate: workExp.endDate || "",
      grade: "",
    };

    const updatedEducation = [...(candidate.education || []), newEducation];
    await onUpdate({ education: updatedEducation });
    toast({ title: "Berufserfahrung wurde als Ausbildung hinzugefügt" });
  };

  // Local state for education editing
  const [editingEducationData, setEditingEducationData] =
    useState<Education | null>(null);

  // Sync local state when starting to edit education
  useEffect(() => {
    if (editingEducation !== null && candidate.education?.[editingEducation]) {
      const edu = candidate.education[editingEducation] as Education;
      // Normalize possible snake_case dates from DB into camelCase for editing
      setEditingEducationData({
        ...edu,
        startDate: edu.startDate ?? edu.start_date ?? "",
        endDate: edu.endDate ?? edu.end_date ?? "",
      });
    } else {
      setEditingEducationData(null);
    }
  }, [editingEducation, candidate.education]);

  const addEducation = async () => {
    const newEdu: Education = {
      degree: "",
      field: "",
      institution: "",
      location: "",
      startDate: "",
      endDate: "",
      grade: "",
    };
    const updatedEducation = [...(candidate.education || []), newEdu];
    await onUpdate({ education: updatedEducation });
  };

  const removeEducation = async (index: number) => {
    const updatedEducation = (candidate.education || []).filter(
      (_, i) => i !== index,
    );
    await onUpdate({ education: updatedEducation });
  };

  // Update local state only (doesn't save to DB)
  const updateLocalEducation = (field: keyof Education, value: string) => {
    if (editingEducationData) {
      setEditingEducationData({ ...editingEducationData, [field]: value });
    }
  };

  // Save education to DB
  const saveEducation = async () => {
    if (editingEducation !== null && editingEducationData) {
      const updatedEducation = [...(candidate.education || [])];
      updatedEducation[editingEducation] = editingEducationData;
      await onUpdate({ education: updatedEducation });
      setEditingEducation(null);
      setEditingEducationData(null);
    }
  };

  const cancelEducationEdit = () => {
    setEditingEducation(null);
    setEditingEducationData(null);
  };

  // Further education (Weiterbildungen / Kurse) management
  const [editingFurtherEduIndex, setEditingFurtherEduIndex] = useState<
    number | null
  >(null);
  const [editingFurtherEduData, setEditingFurtherEduData] =
    useState<FurtherEducation | null>(null);

  useEffect(() => {
    if (
      editingFurtherEduIndex !== null &&
      (candidate.further_education as FurtherEducation[])?.[
        editingFurtherEduIndex
      ]
    ) {
      setEditingFurtherEduData({
        ...(candidate.further_education as FurtherEducation[])[
          editingFurtherEduIndex
        ],
      });
    } else {
      setEditingFurtherEduData(null);
    }
  }, [editingFurtherEduIndex, candidate.further_education]);

  const addFurtherEducation = async () => {
    const newItem: FurtherEducation = {
      name: "",
      institution: "",
      date: "",
      description: "",
    };

    const updated = [
      ...((candidate.further_education as FurtherEducation[]) || []),
      newItem,
    ];

    await onUpdate({ further_education: updated } as any);
  };

  const removeFurtherEducation = async (index: number) => {
    const updated = (
      (candidate.further_education as FurtherEducation[]) || []
    ).filter((_, i) => i !== index);

    await onUpdate({ further_education: updated } as any);
  };

  const updateLocalFurtherEdu = (
    field: keyof FurtherEducation,
    value: string,
  ) => {
    if (editingFurtherEduData) {
      setEditingFurtherEduData({ ...editingFurtherEduData, [field]: value });
    }
  };

  const saveFurtherEducation = async () => {
    if (editingFurtherEduIndex !== null && editingFurtherEduData) {
      const updated = [
        ...((candidate.further_education as FurtherEducation[]) || []),
      ];
      updated[editingFurtherEduIndex] = editingFurtherEduData;
      await onUpdate({ further_education: updated } as any);
      setEditingFurtherEduIndex(null);
      setEditingFurtherEduData(null);
    }
  };

  // Drag & Drop between Education and Further Education
  const [dragOverSection, setDragOverSection] = useState<'education' | 'further_education' | null>(null);
  const isDragDisabled = editingEducation !== null || editingFurtherEduIndex !== null;

  const handleDragStart = (e: React.DragEvent, sourceType: 'education' | 'further_education', index: number) => {
    if (isDragDisabled) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/json', JSON.stringify({ sourceType, index }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, section: 'education' | 'further_education') => {
    if (isDragDisabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSection(section);
  };

  const handleDragLeave = () => {
    setDragOverSection(null);
  };

  const handleDrop = async (e: React.DragEvent, targetSection: 'education' | 'further_education') => {
    e.preventDefault();
    setDragOverSection(null);
    if (isDragDisabled) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { sourceType, index } = data as { sourceType: 'education' | 'further_education'; index: number };

      // Don't do anything if dropping in the same section
      if (sourceType === targetSection) return;

      if (sourceType === 'education' && targetSection === 'further_education') {
        // Education → FurtherEducation
        const eduList = [...(candidate.education || [])];
        const item = eduList[index];
        if (!item) return;
        eduList.splice(index, 1);

        const start = item.startDate || item.start_date || '';
        const end = item.endDate || item.end_date || '';
        const dateParts = [start, end].filter(Boolean);

        const converted: FurtherEducation = {
          name: [item.degree, item.field].filter(Boolean).join(' - '),
          institution: item.institution || '',
          date: dateParts.join(' - '),
          description: item.grade || '',
        };

        const furtherList = [...((candidate.further_education as FurtherEducation[]) || []), converted];
        await onUpdate({ education: eduList, further_education: furtherList } as any);
        toast({ title: 'Eintrag zu Weiterbildungen verschoben' });
      } else if (sourceType === 'further_education' && targetSection === 'education') {
        // FurtherEducation → Education
        const furtherList = [...((candidate.further_education as FurtherEducation[]) || [])];
        const item = furtherList[index];
        if (!item) return;
        furtherList.splice(index, 1);

        const converted: Education = {
          degree: item.name || '',
          field: '',
          institution: item.institution || '',
          startDate: item.date || '',
          endDate: '',
          grade: item.description || '',
        };

        const eduList = [...(candidate.education || []), converted];
        await onUpdate({ education: eduList, further_education: furtherList } as any);
        toast({ title: 'Eintrag zu Ausbildung verschoben' });
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  const cancelFurtherEducationEdit = () => {
    setEditingFurtherEduIndex(null);
    setEditingFurtherEduData(null);
  };

  // Certification management removed - merged into further_education

  // Language management - simplified
  const [newLanguageName, setNewLanguageName] = useState("");

  // Awards & Publications management
  const [editingAwardIndex, setEditingAwardIndex] = useState<number | null>(
    null,
  );
  const [editingAwardData, setEditingAwardData] =
    useState<AwardPublication | null>(null);

  useEffect(() => {
    if (
      editingAwardIndex !== null &&
      (candidate.awards_publications as AwardPublication[])?.[editingAwardIndex]
    ) {
      const raw = (candidate.awards_publications as AwardPublication[])[
        editingAwardIndex
      ];
      setEditingAwardData(normalizeAwardPublication(raw));
    } else {
      setEditingAwardData(null);
    }
  }, [editingAwardIndex, candidate.awards_publications]);

  const addAwardPublication = async () => {
    // Persist canonical shape only (same as Gemini edge function): name, date, issuer, description
    const newItem: AwardPublication = {
      name: "",
      date: "",
      issuer: "",
      description: "",
    };
    const updated = [
      ...((candidate.awards_publications as AwardPublication[]) || []),
      newItem,
    ];
    await onUpdate({ awards_publications: updated } as any);
  };

  const removeAwardPublication = async (index: number) => {
    const updated = (
      (candidate.awards_publications as AwardPublication[]) || []
    ).filter((_, i) => i !== index);
    await onUpdate({ awards_publications: updated } as any);
  };

  const updateLocalAward = (field: keyof AwardPublication, value: string) => {
    if (editingAwardData) {
      setEditingAwardData({ ...editingAwardData, [field]: value });
    }
  };

  const saveAwardPublication = async () => {
    if (editingAwardIndex !== null && editingAwardData) {
      const updated = [
        ...((candidate.awards_publications as AwardPublication[]) || []),
      ];
      // Persist only canonical shape (same as Gemini): name, date, issuer, description — no type/title/year/publisher/organization
      const name = (
        editingAwardData.title ??
        editingAwardData.name ??
        ""
      ).trim();
      const date = (
        editingAwardData.year ??
        editingAwardData.date ??
        ""
      ).trim();
      const issuer =
        (editingAwardData.type === "engagement"
          ? (editingAwardData.organization ?? editingAwardData.issuer)
          : (editingAwardData.publisher ?? editingAwardData.issuer)) ?? "";
      const description = (editingAwardData.description ?? "").trim();
      updated[editingAwardIndex] = {
        name: name || undefined,
        date: date || undefined,
        issuer: issuer || undefined,
        description: description || undefined,
      } as AwardPublication;
      await onUpdate({ awards_publications: updated } as any);
      setEditingAwardIndex(null);
      setEditingAwardData(null);
    }
  };

  const cancelAwardEdit = () => {
    setEditingAwardIndex(null);
    setEditingAwardData(null);
  };

  const addLanguageQuick = async (name: string) => {
    if (!name.trim()) return;
    const newLang: Language = { name: name.trim(), level: "B1" }; // Default to B1
    const updatedLanguages = [
      ...((candidate.languages as Language[]) || []),
      newLang,
    ];
    await onUpdate({ languages: updatedLanguages } as any);
    setNewLanguageName("");
  };

  const removeLanguage = async (index: number) => {
    const updatedLanguages = ((candidate.languages as Language[]) || []).filter(
      (_, i) => i !== index,
    );
    await onUpdate({ languages: updatedLanguages } as any);
  };

  const updateLanguageLevel = async (index: number, level: string) => {
    const updatedLanguages = [...((candidate.languages as Language[]) || [])];
    // Toggle off if clicking the same level
    const newLevel =
      updatedLanguages[index].level === level ? undefined : level;
    updatedLanguages[index] = { ...updatedLanguages[index], level: newLevel };
    await onUpdate({ languages: updatedLanguages } as any);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
      {/* Hauptbereich */}
      <Card className="lg:col-span-2">
        <CardContent className="p-6 space-y-6">
          {/* Header mit Avatar und grundlegenden Infos */}
          <div className="flex flex-col sm:flex-row gap-6 relative">
            {/* Status Button und User Assignment oben rechts */}
            <div className="absolute top-0 right-0 flex flex-wrap items-center gap-2 justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-accent cursor-pointer bg-background text-foreground">
                    <UserCircle className="h-3 w-3" />
                    {candidate.assigned_to
                      ? profiles
                          .find((p) => p.id === candidate.assigned_to)
                          ?.full_name?.split(" ")[0] ||
                        profiles
                          .find((p) => p.id === candidate.assigned_to)
                          ?.email?.split("@")[0] ||
                        "Zugewiesen"
                      : "Nicht zugewiesen"}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50 bg-popover">
                  {profiles.map((profile) => (
                    <DropdownMenuItem
                      key={profile.id}
                      onClick={async () => {
                        await onUpdate({ assigned_to: profile.id });
                      }}
                      className="cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold bg-background text-foreground mr-2">
                        <UserCircle className="h-3 w-3" />
                        {profile.full_name?.split(" ")[0] ||
                          profile.email?.split("@")[0]}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Recruiting Pipeline Badge */}
              {candidate.recruiting_status && (
                <StatusDropdown
                  currentStatus={
                    candidate.recruiting_status === "austausch"
                      ? "Austausch ausstehend"
                      : candidate.recruiting_status === "unterlagen_offen"
                        ? "Unterlagen offen"
                        : candidate.recruiting_status === "unterlagen_geschickt"
                          ? "Unterlagen geschickt"
                          : candidate.recruiting_status === "ready2push"
                            ? "Ready2Push"
                            : candidate.recruiting_status
                  }
                  currentColor={
                    candidate.recruiting_status === "austausch"
                      ? "bg-purple-100 text-purple-800"
                      : candidate.recruiting_status === "unterlagen_offen"
                        ? "bg-amber-100 text-amber-800"
                        : candidate.recruiting_status === "unterlagen_geschickt"
                          ? "bg-sky-100 text-sky-800"
                          : candidate.recruiting_status === "ready2push"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-purple-100 text-purple-800"
                  }
                  availableStatuses={[
                    {
                      id: "austausch",
                      title: "Austausch ausstehend",
                      color: "bg-purple-100 text-purple-800",
                    },
                    {
                      id: "unterlagen_offen",
                      title: "Unterlagen offen",
                      color: "bg-amber-100 text-amber-800",
                    },
                    {
                      id: "unterlagen_geschickt",
                      title: "Unterlagen geschickt",
                      color: "bg-sky-100 text-sky-800",
                    },
                    {
                      id: "ready2push",
                      title: "Ready2Push",
                      color: "bg-emerald-100 text-emerald-800",
                    },
                  ]}
                  onStatusChange={async (value) => {
                    // If clicking the current status, remove it
                    if (value === candidate.recruiting_status) {
                      onUpdate({ recruiting_status: null });
                      return;
                    }
                    // Auto-set status to Active when reaching ready2push
                    const updates: Partial<CandidateInfo> = {
                      recruiting_status: value,
                    };
                    if (value === "ready2push") {
                      updates.status = "Active";
                    }
                    await onUpdate(updates);

                    // Auto-trigger AI match generation when set to ready2push
                    if (value === 'ready2push') {
                      startMatchingForCandidate(candidate.id, candidate.name);
                    }
                  }}
                />
              )}
              <StatusDropdown
                currentStatus={candidate.status || "Active"}
                currentColor={
                  candidate.status === "N/D"
                    ? "bg-gray-100 text-gray-800"
                    : candidate.status === "Not available"
                      ? "bg-red-100 text-red-800"
                      : candidate.status === "Passive"
                        ? "bg-orange-100 text-orange-800"
                        : candidate.status === "Placed"
                          ? "bg-blue-100 text-blue-800"
                          : candidate.status === "Archived"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-green-100 text-green-800"
                }
                availableStatuses={[
                  { title: "N/D", color: "bg-gray-100 text-gray-800" },
                  { title: "Active", color: "bg-green-100 text-green-800" },
                  { title: "Not available", color: "bg-red-100 text-red-800" },
                  { title: "Passive", color: "bg-orange-100 text-orange-800" },
                  { title: "Placed", color: "bg-blue-100 text-blue-800" },
                  { title: "Archived", color: "bg-gray-100 text-gray-800" },
                ]}
                onStatusChange={(value) => onUpdate({ status: value })}
              />
            </div>

            <AvatarUpload
              currentImage={candidate.avatar_url}
              fallbackText={candidate.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
              onImageChange={handleAvatarChange}
              onFullImageChange={(url) => onUpdate({ full_image_url: url })}
            />
            <div className="flex-1 space-y-4">
              {/* Name */}
              <div>
                {editingField === "name" ? (
                  <div className="flex gap-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                    />
                    <Button size="sm" onClick={() => saveEdit("name")}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2
                      className="text-2xl font-bold cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                      onDoubleClick={() =>
                        startEdit("name", candidate.name || "")
                      }
                    >
                      {candidate.name}
                    </h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onUpdate({ is_verified: !(candidate as any).is_verified } as any)}
                          className="focus:outline-none"
                        >
                          <CheckCircle2
                            className={`h-5 w-5 transition-colors ${
                              (candidate as any).is_verified
                                ? "text-green-500"
                                : "text-muted-foreground hover:text-muted-foreground/80"
                            }`}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {(candidate as any).is_verified ? "Verifiziert" : "Als verifiziert markieren"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>

              {/* Position */}
              <div>
                {editingField === "position" ? (
                  <div className="flex gap-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Position"
                      autoFocus
                    />
                    <Button size="sm" onClick={() => saveEdit("position")}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p
                    className="text-muted-foreground flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                    onDoubleClick={() =>
                      startEdit("position", candidate.position || "")
                    }
                  >
                    <Briefcase className="h-4 w-4" />
                    {candidate.position || "Position nicht angegeben"}
                  </p>
                )}
              </div>

              {/* Kontaktinformationen und Quelle/Links nebeneinander */}
              <div className="flex justify-between items-start pt-2 gap-4">
                {/* Linke Seite: Kontaktinformationen */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide">
                    Kontaktinformationen
                  </h3>

                  <div className="flex flex-col gap-1 text-sm">
                    {/* E-Mail */}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {editingField === "email" ? (
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="E-Mail"
                            autoFocus
                          />
                          <Button size="sm" onClick={() => saveEdit("email")}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() =>
                            startEdit("email", candidate.email || "")
                          }
                        >
                          <Mail className="h-4 w-4" />
                          {candidate.email || "N/A"}
                        </span>
                      )}
                    </div>

                    {/* Telefon */}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {editingField === "phone" ? (
                        <div className="flex gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="Telefon"
                            autoFocus
                          />
                          <Button size="sm" onClick={() => saveEdit("phone")}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() =>
                            startEdit("phone", candidate.phone || "")
                          }
                        >
                          <Phone className="h-4 w-4" />
                          {candidate.phone || "N/A"}
                        </span>
                      )}
                    </div>

                    {/* Standort */}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {editingField === "location" ? (
                        <div className="flex gap-2 items-center">
                          <div className="w-[320px]">
                            <LocationAutocomplete
                              value={editValue}
                              onChange={setEditValue}
                              placeholder="Standort"
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={() => saveEdit("location")}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() =>
                            startEdit("location", candidate.location || "")
                          }
                        >
                          <MapPin className="h-4 w-4" />
                          {candidate.location || "N/A"}
                        </span>
                      )}
                    </div>

                    {/* Geburtsdatum & Alter */}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {editingField === "birthdate" ? (
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => saveEdit("birthdate")}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                          onDoubleClick={() =>
                            startEdit("birthdate", candidate.birthdate || "")
                          }
                        >
                          <Calendar className="h-4 w-4" />
                          {candidate.birthdate || "N/A"}
                          {candidate.birthdate &&
                            (() => {
                              // Parse DD.MM.YYYY format
                              const parts = candidate.birthdate.split(".");
                              if (parts.length === 3) {
                                const day = parseInt(parts[0], 10);
                                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                                const year = parseInt(parts[2], 10);
                                const birthDate = new Date(year, month, day);

                                if (!isNaN(birthDate.getTime())) {
                                  const today = new Date();
                                  let age =
                                    today.getFullYear() -
                                    birthDate.getFullYear();
                                  const monthDiff =
                                    today.getMonth() - birthDate.getMonth();
                                  if (
                                    monthDiff < 0 ||
                                    (monthDiff === 0 &&
                                      today.getDate() < birthDate.getDate())
                                  ) {
                                    age--;
                                  }
                                  return (
                                    <span className="text-muted-foreground">
                                      ({age} Jahre)
                                    </span>
                                  );
                                }
                              }
                              // Fallback for ISO format (YYYY-MM-DD)
                              const birthDate = new Date(candidate.birthdate);
                              if (!isNaN(birthDate.getTime())) {
                                const today = new Date();
                                let age =
                                  today.getFullYear() - birthDate.getFullYear();
                                const monthDiff =
                                  today.getMonth() - birthDate.getMonth();
                                if (
                                  monthDiff < 0 ||
                                  (monthDiff === 0 &&
                                    today.getDate() < birthDate.getDate())
                                ) {
                                  age--;
                                }
                                return (
                                  <span className="text-muted-foreground">
                                    ({age} Jahre)
                                  </span>
                                );
                              }
                              return null;
                            })()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rechte Seite: Quelle & Links */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide">
                    {t("candidates.sourceAndLinks")}
                  </h3>

                  <div className="flex flex-col gap-2 items-end">
                    {/* Source Contact Dropdown - kompakt */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-accent cursor-pointer bg-background text-foreground">
                          <UserCheck className="h-3 w-3" />
                          {candidate.source_contact
                            ? configurations.sourceContacts.find(
                                (c) => c.id === candidate.source_contact,
                              )?.label || candidate.source_contact
                            : t("candidates.selectSourceContact")}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="z-50 bg-popover"
                      >
                        <DropdownMenuItem
                          onClick={() =>
                            onUpdate({ source_contact: undefined })
                          }
                        >
                          {t("candidates.noSourceContact")}
                        </DropdownMenuItem>
                        {configurations.sourceContacts.map((contact) => (
                          <DropdownMenuItem
                            key={contact.id}
                            onClick={() =>
                              onUpdate({ source_contact: contact.id })
                            }
                          >
                            {contact.label}
                            {candidate.source_contact === contact.id && " ✓"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* LinkedIn Button - kompakt */}
                    {editingField === "linkedin_url" ? (
                      <div className="flex gap-1 items-center">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder="linkedin.com/in/..."
                          className="h-6 text-xs w-40"
                          autoFocus
                        />
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-border h-6 w-6 hover:bg-accent transition-colors"
                          onClick={() => saveEdit("linkedin_url")}
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-border h-6 w-6 hover:bg-accent transition-colors"
                          onClick={cancelEdit}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : candidate.linkedin_url ? (
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-accent cursor-pointer bg-background text-foreground"
                        onClick={() =>
                          window.open(candidate.linkedin_url, "_blank")
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          startEdit(
                            "linkedin_url",
                            candidate.linkedin_url || "",
                          );
                        }}
                        title="Linksklick: Öffnen | Rechtsklick: Bearbeiten"
                      >
                        <Linkedin className="h-3 w-3" />
                        LinkedIn
                      </button>
                    ) : (
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-accent cursor-pointer bg-background text-muted-foreground"
                        onClick={() => startEdit("linkedin_url", "")}
                      >
                        <Linkedin className="h-3 w-3" />
                        {t("candidates.addLinkedIn")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Weitere Details Überschrift */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide">
              Weitere Details
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAIFillDetails}
              disabled={isAIFillingDetails}
              className="h-7 w-7 p-0"
              title="KI-Vorschläge für weitere Details"
            >
              {isAIFillingDetails ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {/* Weitere Details in Grid-Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Gewünschte Position */}
            <div>
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <Target className="h-3 w-3" />
                Gewünschte Position
              </Label>
              {editingField === "desired_position" ? (
                <div className="flex gap-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "desired_position")}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={() => saveEdit("desired_position")}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                  onDoubleClick={() =>
                    startEdit(
                      "desired_position",
                      candidate.desired_position || "",
                    )
                  }
                >
                  {candidate.desired_position || "-"}
                </p>
              )}
            </div>

            {/* Branche */}
            <div>
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <Briefcase className="h-3 w-3" />
                Branche
              </Label>
              <IndustryMultiSelect
                value={parseIndustryString(candidate.industry)}
                onChange={(industries) =>
                  onUpdate({ industry: industryArrayToString(industries) })
                }
                placeholder="Branchen auswählen..."
              />
            </div>

            {/* Erfahrung - automatisch berechnet */}
            <div>
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <Star className="h-3 w-3" />
                Berufserfahrung
              </Label>
              <p className="text-sm text-muted-foreground px-1 -mx-1">
                {calculateTotalExperience(candidate.work_experience)}
              </p>
            </div>

            {/* Aktuelles Gehalt */}
            <div>
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <DollarSign className="h-3 w-3" />
                Aktuelles Gehalt
              </Label>
              {editingField === "current_salary" ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      CHF
                    </span>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "current_salary")}
                      placeholder="z.B. 120000"
                      className="pl-12"
                      autoFocus
                    />
                  </div>
                  <Button size="sm" onClick={() => saveEdit("current_salary")}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                  onDoubleClick={() =>
                    startEdit("current_salary", candidate.current_salary || "")
                  }
                >
                  {formatWithUnit(candidate.current_salary, "current_salary")}
                </p>
              )}
            </div>

            {/* Gewünschtes Gehalt */}
            <div>
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <TrendingUp className="h-3 w-3" />
                Gewünschtes Gehalt
              </Label>
              {editingField === "desired_salary" ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      CHF
                    </span>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "desired_salary")}
                      placeholder="z.B. 140000"
                      className="pl-12"
                      autoFocus
                    />
                  </div>
                  <Button size="sm" onClick={() => saveEdit("desired_salary")}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                  onDoubleClick={() =>
                    startEdit("desired_salary", candidate.desired_salary || "")
                  }
                >
                  {formatWithUnit(candidate.desired_salary, "desired_salary")}
                </p>
              )}
            </div>

            {/* Arbeitspensum */}
            <div>
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <Clock className="h-3 w-3" />
                Arbeitspensum
              </Label>
              {editingField === "workload" ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "workload")}
                      placeholder="z.B. 80-100"
                      autoFocus
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      %
                    </span>
                  </div>
                  <Button size="sm" onClick={() => saveEdit("workload")}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                  onDoubleClick={() =>
                    startEdit("workload", candidate.workload || "")
                  }
                >
                  {formatWithUnit(candidate.workload, "workload")}
                </p>
              )}
            </div>

            {/* Umzugsbereitschaft */}
            <div>
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <Home className="h-3 w-3" />
                Umzugsbereitschaft
              </Label>
              {editingField === "willing_to_relocate" ? (
                <div className="flex gap-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "willing_to_relocate")}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={() => saveEdit("willing_to_relocate")}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                  onDoubleClick={() =>
                    startEdit(
                      "willing_to_relocate",
                      candidate.willing_to_relocate || "",
                    )
                  }
                >
                  {candidate.willing_to_relocate || "-"}
                </p>
              )}
            </div>

            {/* Max. Pendelweg */}
            <div>
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <Route className="h-3 w-3" />
                Max. Pendelweg
              </Label>
              {editingField === "max_commute" ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "max_commute")}
                      placeholder="z.B. 45"
                      autoFocus
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      min
                    </span>
                  </div>
                  <Button size="sm" onClick={() => saveEdit("max_commute")}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                  onDoubleClick={() =>
                    startEdit("max_commute", candidate.max_commute || "")
                  }
                >
                  {formatWithUnit(candidate.max_commute, "max_commute")}
                </p>
              )}
            </div>

            {/* Kündigungsfrist */}
            <div>
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <Timer className="h-3 w-3" />
                Kündigungsfrist
              </Label>
              {editingField === "notice_period" ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "notice_period")}
                      placeholder="z.B. 3"
                      autoFocus
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      Monate
                    </span>
                  </div>
                  <Button size="sm" onClick={() => saveEdit("notice_period")}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                  onDoubleClick={() =>
                    startEdit("notice_period", candidate.notice_period || "")
                  }
                >
                  {formatWithUnit(candidate.notice_period, "notice_period")}
                </p>
              )}
            </div>

            {/* Wechselgrund */}
            <div className="col-span-1 sm:col-span-3">
              <Label className="text-xs font-bold flex items-center gap-1 mb-1">
                <Repeat className="h-3 w-3" />
                Wechselgrund
              </Label>
              {editingField === "reason_for_change" ? (
                <div className="flex gap-2">
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveEdit("reason_for_change")}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                  onDoubleClick={() =>
                    startEdit(
                      "reason_for_change",
                      candidate.reason_for_change || "",
                    )
                  }
                >
                  {candidate.reason_for_change || "-"}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Berufserfahrung */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Berufserfahrungsad
              </h3>
              <Button size="sm" variant="outline" onClick={addWorkExperience}>
                <Plus className="h-4 w-4 mr-1" />
                Hinzufügen
              </Button>
            </div>
            <div className="space-y-4">
              {(candidate.work_experience || [])
                .map((exp, originalIndex) => ({ ...exp, _originalIndex: originalIndex }))
                .sort((a, b) => {
                  const endA = a.endDate || (a as any).end_date || "";
                  const endB = b.endDate || (b as any).end_date || "";
                  const startA = a.startDate || (a as any).start_date || "";
                  const startB = b.startDate || (b as any).start_date || "";
                  const isCurrentA = !endA || /heute|present|aktuell|today|laufend/i.test(endA);
                  const isCurrentB = !endB || /heute|present|aktuell|today|laufend/i.test(endB);
                  if (isCurrentA && !isCurrentB) return -1;
                  if (!isCurrentA && isCurrentB) return 1;
                  const parseDateKey = (d: string): number => {
                    if (!d) return 0;
                    const m = d.match(/(\d{1,2})[.\/](\d{4})/);
                    if (m) return parseInt(m[2]) * 100 + parseInt(m[1]);
                    const y = d.match(/(\d{4})/);
                    return y ? parseInt(y[1]) * 100 : 0;
                  };
                  const diff = parseDateKey(endB) - parseDateKey(endA);
                  return diff !== 0 ? diff : parseDateKey(startB) - parseDateKey(startA);
                })
                .map((exp) => {
                  const index = exp._originalIndex;
                  return (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      {editingWorkExp === index && editingWorkExpData ? (
                        <div className="space-y-2">
                          <Input
                            placeholder="Unternehmen"
                            value={editingWorkExpData.company}
                            onChange={(e) =>
                              updateLocalWorkExp("company", e.target.value)
                            }
                          />
                          <Input
                            placeholder="Position"
                            value={editingWorkExpData.position}
                            onChange={(e) =>
                              updateLocalWorkExp("position", e.target.value)
                            }
                          />
                          <Input
                            placeholder="Standort"
                            value={editingWorkExpData.location || ""}
                            onChange={(e) =>
                              updateLocalWorkExp("location", e.target.value)
                            }
                          />
                          <div className="flex gap-2">
                            <Input
                              placeholder="Von"
                              value={editingWorkExpData.startDate || ""}
                              onChange={(e) =>
                                updateLocalWorkExp("startDate", e.target.value)
                              }
                            />
                            <Input
                              placeholder="Bis"
                              value={editingWorkExpData.endDate || ""}
                              onChange={(e) =>
                                updateLocalWorkExp("endDate", e.target.value)
                              }
                            />
                          </div>
                          {/* <Textarea
                            placeholder="Beschreibung"
                            value={editingWorkExpData.description || ""}
                            onChange={(e) =>
                              updateLocalWorkExp("description", e.target.value)
                            }
                          /> */}

                          <RichTextEditor
                            value={editingWorkExpData.description || ""}
                            onChange={(value) =>
                              updateLocalWorkExp("description", value)
                            }
                            placeholder="Beschreibung (Bullet-Punkte mit • beginnen)"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveWorkExperience}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelWorkExpEdit}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors"
                          onDoubleClick={() => setEditingWorkExp(index)}
                        >
                          <h4 className="font-medium">
                            {exp.position || "Position nicht angegeben"}
                          </h4>
                          {exp.client_id ? (
                            <Link
                              to={`/clients/${exp.client_id}`}
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Building2 className="h-3 w-3" />
                              {exp.company || "Unternehmen nicht angegeben"}
                            </Link>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {exp.company || "Unternehmen nicht angegeben"}
                            </p>
                          )}
                          {exp.location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" />
                              {exp.location}
                            </p>
                          )}
                          {(exp.startDate || exp.start_date || exp.endDate || exp.end_date) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {exp.startDate || exp.start_date || "N/A"} -{" "}
                              {exp.endDate || exp.end_date || "Heute"}
                            </p>
                          )}
                          {/* {exp.description && (
                            <ul className="text-sm mt-2 list-disc space-y-1">
                              {exp.description
                                .split("\n")
                                .filter((line) => line.trim())
                                .map((line, i) => (
                                  <li key={i} className="pl-1 list-none">
                                    {line.trim()}
                                  </li>
                                ))}
                            </ul>
                          )} */}

                          {renderDescription(exp.description || "")}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {editingWorkExp !== index && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => convertWorkExpToEducation(index)}
                            title="Als Ausbildung hinzufügen"
                          >
                            <GraduationCap className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeWorkExperience(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                );
                })}
            </div>
          </div>

          <Separator />

          {/* Ausbildung */}
          <div
            onDragOver={(e) => handleDragOver(e, 'education')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'education')}
            className={`rounded-lg transition-all ${dragOverSection === 'education' ? 'border-2 border-dashed border-primary bg-primary/5 p-2' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Ausbildung
              </h3>
              <Button size="sm" variant="outline" onClick={addEducation}>
                <Plus className="h-4 w-4 mr-1" />
                Hinzufügen
              </Button>
            </div>
            <div className="space-y-4">
              {(candidate.education || [])
                .map((edu, originalIndex) => ({ ...edu, _originalIndex: originalIndex }))
                .sort((a, b) => {
                  const endA = a.endDate || (a as any).end_date || "";
                  const endB = b.endDate || (b as any).end_date || "";
                  const startA = a.startDate || (a as any).start_date || "";
                  const startB = b.startDate || (b as any).start_date || "";
                  const isCurrentA = !endA || /heute|present|aktuell|today|laufend/i.test(endA);
                  const isCurrentB = !endB || /heute|present|aktuell|today|laufend/i.test(endB);
                  if (isCurrentA && !isCurrentB) return -1;
                  if (!isCurrentA && isCurrentB) return 1;
                  const parseDateKey = (d: string): number => {
                    if (!d) return 0;
                    const m = d.match(/(\d{1,2})[.\/](\d{4})/);
                    if (m) return parseInt(m[2]) * 100 + parseInt(m[1]);
                    const y = d.match(/(\d{4})/);
                    return y ? parseInt(y[1]) * 100 : 0;
                  };
                  const diff = parseDateKey(endB) - parseDateKey(endA);
                  return diff !== 0 ? diff : parseDateKey(startB) - parseDateKey(startA);
                })
                .map((edu) => {
                  const index = edu._originalIndex;
                  return (
                <div
                  key={index}
                  className="border rounded-lg p-4 flex gap-2"
                  draggable={!isDragDisabled}
                  onDragStart={(e) => handleDragStart(e, 'education', index)}
                >
                  <div className={`flex items-center pt-1 text-muted-foreground ${isDragDisabled ? 'opacity-30 cursor-default' : 'cursor-grab hover:text-foreground'}`}>
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {editingEducation === index && editingEducationData ? (
                        <div className="space-y-2">
                          <Input
                            placeholder="Abschluss"
                            value={editingEducationData.degree}
                            onChange={(e) =>
                              updateLocalEducation("degree", e.target.value)
                            }
                          />
                          <Input
                            placeholder="Fachrichtung"
                            value={editingEducationData.field || ""}
                            onChange={(e) =>
                              updateLocalEducation("field", e.target.value)
                            }
                          />
                          <Input
                            placeholder="Institution"
                            value={editingEducationData.institution}
                            onChange={(e) =>
                              updateLocalEducation(
                                "institution",
                                e.target.value,
                              )
                            }
                          />
                          <Input
                            placeholder="Standort"
                            value={editingEducationData.location || ""}
                            onChange={(e) =>
                              updateLocalEducation("location", e.target.value)
                            }
                          />
                          <div className="flex gap-2">
                            <Input
                              placeholder="Von"
                              value={editingEducationData.startDate || ""}
                              onChange={(e) =>
                                updateLocalEducation(
                                  "startDate",
                                  e.target.value,
                                )
                              }
                            />
                            <Input
                              placeholder="Bis"
                              value={editingEducationData.endDate || ""}
                              onChange={(e) =>
                                updateLocalEducation("endDate", e.target.value)
                              }
                            />
                          </div>

                          <RichTextEditor
                            value={editingEducationData.grade || ""}
                            onChange={(value) =>
                              updateLocalEducation("grade", value)
                            }
                            placeholder="Notiz/Details"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveEducation}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEducationEdit}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors"
                          onDoubleClick={() => setEditingEducation(index)}
                        >
                          {(() => {
                            // Support both camelCase and snake_case dates from DB
                            const start = edu.startDate || edu.start_date;
                            const end = edu.endDate || edu.end_date;
                            return (
                              <>
                                <h4 className="font-medium">
                                  {edu.degree || "Abschluss nicht angegeben"}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {edu.field ? `${edu.field} - ` : ""}
                                  {edu.institution ||
                                    "Institution nicht angegeben"}
                                </p>
                                {edu.location && (
                                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {edu.location}
                                  </p>
                                )}
                                {(start || end) && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {start || "N/A"} - {end || "N/A"}
                                  </p>
                                )}
                              </>
                            );
                          })()}
                          {/* {edu.grade && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Notiz: {edu.grade}
                            </p>
                          )} */}
                          {renderDescription(edu.grade || "")}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {editingEducation !== index && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeEducation(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
                  );
                })}
            </div>
          </div>

          {/* Weiterbildungen / Kurse */}
          <div
            onDragOver={(e) => handleDragOver(e, 'further_education')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'further_education')}
            className={`rounded-lg transition-all ${dragOverSection === 'further_education' ? 'border-2 border-dashed border-primary bg-primary/5 p-2' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Weiterbildungen & Zertifikate
              </h3>
              <Button size="sm" variant="outline" onClick={addFurtherEducation}>
                <Plus className="h-4 w-4 mr-1" />
                Hinzufügen
              </Button>
            </div>
            <div className="space-y-4">
              {((candidate.further_education as FurtherEducation[]) || [])
                .map((item, originalIndex) => ({ ...item, _originalIndex: originalIndex }))
                .sort((a, b) => {
                  const parseDateKey = (d: string): number => {
                    if (!d) return 0;
                    const m = d.match(/(\d{1,2})[.\/](\d{4})/);
                    if (m) return parseInt(m[2]) * 100 + parseInt(m[1]);
                    const y = d.match(/(\d{4})/);
                    return y ? parseInt(y[1]) * 100 : 0;
                  };
                  return parseDateKey(b.date || "") - parseDateKey(a.date || "");
                })
                .map((item) => {
                  const index = item._originalIndex;
                  return (
                  <div
                    key={index}
                    className="border rounded-lg p-4 flex gap-2"
                    draggable={!isDragDisabled}
                    onDragStart={(e) => handleDragStart(e, 'further_education', index)}
                  >
                    <div className={`flex items-center pt-1 text-muted-foreground ${isDragDisabled ? 'opacity-30 cursor-default' : 'cursor-grab hover:text-foreground'}`}>
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {editingFurtherEduIndex === index &&
                        editingFurtherEduData ? (
                          <div className="space-y-2">
                            <Input
                              placeholder="Name der Weiterbildung / des Kurses"
                              value={editingFurtherEduData.name}
                              onChange={(e) =>
                                updateLocalFurtherEdu("name", e.target.value)
                              }
                            />
                            <Input
                              placeholder="Institution / Anbieter"
                              value={editingFurtherEduData.institution}
                              onChange={(e) =>
                                updateLocalFurtherEdu(
                                  "institution",
                                  e.target.value,
                                )
                              }
                            />
                            <Input
                              placeholder="Datum (z.B. 2024 oder 03/2024)"
                              value={editingFurtherEduData.date || ""}
                              onChange={(e) =>
                                updateLocalFurtherEdu("date", e.target.value)
                              }
                            />
                            <RichTextEditor
                              value={editingFurtherEduData.description || ""}
                              onChange={(value) =>
                                updateLocalFurtherEdu("description", value)
                              }
                              placeholder="Inhalte / Schwerpunkte (Bullet-Punkte mit • beginnen)"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={saveFurtherEducation}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelFurtherEducationEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors"
                            onDoubleClick={() =>
                              setEditingFurtherEduIndex(index)
                            }
                          >
                            <h4 className="font-medium">
                              {item.name || "Weiterbildung / Kurs"}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {item.institution ||
                                "Institution nicht angegeben"}
                            </p>
                            {item.date && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {item.date}
                              </p>
                            )}
                            {renderDescription(item.description || "")}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {editingFurtherEduIndex !== index && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFurtherEducation(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                  );
                })}
            </div>
          </div>

          <Separator />

          {/* Awards & Publications */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Award className="h-4 w-4" />
                {t("candidates.awardsPublicationsEngagement")}
              </h3>
              <Button size="sm" variant="outline" onClick={addAwardPublication}>
                <Plus className="h-4 w-4 mr-1" />
                {t("common.add")}
              </Button>
            </div>
            <div className="space-y-4">
              {(() => {
                const list =
                  (candidate.awards_publications as AwardPublication[]) || [];
                const sortedByDate = list
                  .map((item, originalIndex) => ({ originalIndex, item }))
                  .sort(
                    (a, b) =>
                      awardPublicationSortKey(b.item) -
                      awardPublicationSortKey(a.item),
                  );
                return sortedByDate.map(({ originalIndex, item }) => {
                  const norm = normalizeAwardPublication(item);
                  return (
                    <div key={originalIndex} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {editingAwardIndex === originalIndex &&
                          editingAwardData ? (
                            <div className="space-y-2">
                              <Input
                                placeholder={t("common.title")}
                                value={editingAwardData.title ?? ""}
                                onChange={(e) =>
                                  updateLocalAward("title", e.target.value)
                                }
                              />
                              <select
                                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                                value={editingAwardData.type ?? "award"}
                                onChange={(e) =>
                                  updateLocalAward(
                                    "type",
                                    e.target.value as AwardPublication["type"],
                                  )
                                }
                              >
                                <option value="award">
                                  {t("candidates.award")}
                                </option>
                                <option value="publication">
                                  {t("candidates.publication")}
                                </option>
                                <option value="engagement">
                                  {t("candidates.engagement")}
                                </option>
                              </select>
                              <Input
                                placeholder={t("candidates.year")}
                                value={editingAwardData.year ?? ""}
                                onChange={(e) =>
                                  updateLocalAward("year", e.target.value)
                                }
                              />
                              {editingAwardData.type === "engagement" ? (
                                <Input
                                  placeholder={t("candidates.organization")}
                                  value={editingAwardData.organization ?? ""}
                                  onChange={(e) =>
                                    updateLocalAward(
                                      "organization",
                                      e.target.value,
                                    )
                                  }
                                />
                              ) : (
                                <Input
                                  placeholder={t("candidates.publisher")}
                                  value={editingAwardData.publisher ?? ""}
                                  onChange={(e) =>
                                    updateLocalAward(
                                      "publisher",
                                      e.target.value,
                                    )
                                  }
                                />
                              )}
                              <RichTextEditor
                                value={editingAwardData.description ?? ""}
                                onChange={(value) =>
                                  updateLocalAward("description", value)
                                }
                                placeholder={t("common.description")}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={saveAwardPublication}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={cancelAwardEdit}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors"
                              onDoubleClick={() =>
                                setEditingAwardIndex(originalIndex)
                              }
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {norm.type === "award"
                                    ? t("candidates.award")
                                    : norm.type === "publication"
                                      ? t("candidates.publication")
                                      : t("candidates.engagement")}
                                </Badge>
                                {norm.year && (
                                  <span className="text-xs text-muted-foreground">
                                    {norm.year}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-medium mt-1">
                                {norm.title ||
                                  t("candidates.titleNotSpecified")}
                              </h4>
                              {norm.type === "engagement" &&
                                norm.organization && (
                                  <p className="text-sm text-muted-foreground">
                                    {t("candidates.organization")}:{" "}
                                    {norm.organization}
                                  </p>
                                )}
                              {norm.type !== "engagement" && norm.publisher && (
                                <p className="text-sm text-muted-foreground">
                                  {t("candidates.publisher")}: {norm.publisher}
                                </p>
                              )}
                              {renderDescription(norm.description ?? "")}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {editingAwardIndex !== originalIndex && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                removeAwardPublication(originalIndex)
                              }
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <Separator />

          {/* Fähigkeiten */}
          <div>
            <h3 className="font-semibold flex items-center gap-2 mb-3">
              <Wrench className="h-4 w-4" />
              Fähigkeiten
            </h3>
            <div className="flex flex-wrap gap-1 mb-3">
              {(candidate.skills || []).map((skill, index) => (
                <ContextMenu key={index}>
                  <ContextMenuTrigger>
                    <Badge
                      variant="secondary"
                      className={`text-xs cursor-pointer hover:bg-muted transition-colors ${
                        editingSkillIndex === index
                          ? "ring-2 ring-primary ring-offset-1"
                          : ""
                      }`}
                      onDoubleClick={() => startEditSkill(index, skill)}
                    >
                      {editingSkillIndex === index ? (
                        <span
                          contentEditable
                          suppressContentEditableWarning
                          onInput={(e) =>
                            setEditingSkillValue(
                              e.currentTarget.textContent || "",
                            )
                          }
                          onKeyDown={handleSkillKeyDown}
                          onBlur={saveEditSkill}
                          className="outline-none min-w-[20px] cursor-text"
                          ref={(el) => {
                            if (el && editingSkillIndex === index) {
                              el.focus();
                              // Move cursor to end
                              const range = document.createRange();
                              const sel = window.getSelection();
                              range.selectNodeContents(el);
                              range.collapse(false);
                              sel?.removeAllRanges();
                              sel?.addRange(range);
                            }
                          }}
                        >
                          {skill}
                        </span>
                      ) : (
                        skill
                      )}
                    </Badge>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() => handleRemoveSkill(skill)}
                      className="text-destructive focus:text-destructive"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Fähigkeit entfernen
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
            <SkillsCombobox
              value={newSkill}
              onChange={setNewSkill}
              onSelect={(selectedSkill) => handleAddSkill(selectedSkill)}
              placeholder="Fähigkeit suchen oder hinzufügen..."
            />
          </div>

          <Separator />

          {/* Sprachen */}
          <div>
            <h3 className="font-semibold flex items-center gap-2 mb-3">
              <Languages className="h-4 w-4" />
              Sprachen
            </h3>

            {/* Quick add input with autocomplete */}
            <LanguagesCombobox
              value={newLanguageName}
              onChange={setNewLanguageName}
              onSelect={(selectedLanguage) =>
                addLanguageQuick(selectedLanguage)
              }
              placeholder="Sprache suchen oder hinzufügen..."
            />

            {/* Languages list with CEFR levels */}
            <div className="space-y-2">
              {((candidate.languages as Language[]) || []).map(
                (lang, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between py-2 px-3 bg-muted/30 rounded-lg group gap-3"
                  >
                    <span className="font-medium text-sm flex-1 min-w-0 whitespace-normal break-words">
                      {lang.name}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* CEFR level buttons: A1-C2 + M */}
                      <div className="flex gap-0.5">
                        {LANGUAGE_LEVELS.map((level) => (
                          <button
                            key={level}
                            onClick={() => updateLanguageLevel(index, level)}
                            className={`px-1.5 py-0.5 text-xs font-medium rounded transition-colors ${
                              lang.level === level
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted-foreground/20 hover:bg-muted-foreground/40 text-muted-foreground"
                            }`}
                            title={level === "M" ? "Muttersprache" : level}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeLanguage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ),
              )}
              {((candidate.languages as Language[]) || []).length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  Tippen Sie eine Sprache ein und drücken Sie Enter
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Notizen */}
        <Card>
          <CardContent className="p-4">
            <NotesSection
              initialNotes={(() => {
                if (!candidate.notes) return [];
                try {
                  return JSON.parse(candidate.notes);
                } catch {
                  return [
                    {
                      id: Date.now().toString(),
                      content: candidate.notes,
                      author: "Migriert",
                      timestamp: new Date().toISOString(),
                    },
                  ];
                }
              })()}
              onSave={async (notes) => {
                await onUpdate({ notes: JSON.stringify(notes) });
                toast({
                  title: "Notiz gespeichert",
                  description:
                    "Die Notiz wurde erfolgreich in der Datenbank gespeichert.",
                });
              }}
              userName={userProfile?.full_name?.split(" ")[0] || "User"}
              userAvatarUrl={userProfile?.avatar_url}
              entityType="candidates"
              entityId={candidate.id}
            />
          </CardContent>
        </Card>

        {/* Kandidaten-Insights */}
        <CandidateInsights
          candidateId={candidate.id}
          candidateData={{
            name: candidate.name,
            position: candidate.position,
            desired_position: candidate.desired_position,
            industry: candidate.industry,
            experience: candidate.experience,
            skills: candidate.skills,
            education: candidate.education,
            work_experience: candidate.work_experience,
            languages: candidate.languages as any,
            awards_publications: candidate.awards_publications,
            summary: (candidate as any).summary,
            reason_for_change: candidate.reason_for_change,
            ai_summary: (candidate as any).ai_summary,
            signature_achievements: (candidate as any).signature_achievements,
            growth_potential: (candidate as any).growth_potential,
            most_proud_of: (candidate as any).most_proud_of,
            potential_risks: (candidate as any).potential_risks,
            insights_notes: (candidate as any).insights_notes,
            candidate_values: (candidate as any).candidate_values,
          }}
          onUpdate={onUpdate}
        />

        {/* Dokumente */}
        <DocumentUpload
          candidateId={candidate.id}
          candidateName={candidate.name}
        />
      </div>
    </div>
  );
}
