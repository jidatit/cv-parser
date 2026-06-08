import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Download,
  MapPin,
  Briefcase,
  GraduationCap,
  Plus,
  Trash2,
  Check,
  Camera,
  Loader2,
  Languages,
  Award,
  Calendar,
  Clock,
  Euro,
  Target,
  Globe,
  Save,
  Sparkles,
  TrendingUp,
  Trophy,
  Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import CvPrintView from "./cv-template/cv-print-view";
import { CVErrorBoundary } from "./cv-template/CVErrorBoundary";

interface WorkExperience {
  company: string;
  position: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

interface Education {
  degree: string;
  field?: string;
  institution: string;
  startDate?: string;
  endDate?: string;
  grade?: string;
}

interface Language {
  name: string;
  level?: string; // A1, A2, B1, B2, C1, C2, M (Muttersprache)
}

const LANGUAGE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "M"] as const;

// Certification interface removed - merged into further_education

interface CandidateInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  position?: string;
  desired_position?: string;
  industry?: string;
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
  work_experience?: WorkExperience[];
  languages?: Language[];
  summary?: string;
  avatar_url?: string;
  full_image_url?: string;
  // Candidate Insights fields
  ai_summary?: string;
  signature_achievements?: string[];
  growth_potential?: string[];
  most_proud_of?: string;
  potential_risks?: string;
  insights_notes?: string;
}

interface CVCreatorTabProps {
  candidate: CandidateInfo;
}

interface EditableCVData {
  name: string;
  position: string;
  desired_position: string;
  location: string;
  industry: string;
  experience: string;
  current_salary: string;
  desired_salary: string;
  max_commute: string;
  willing_to_relocate: string;
  workload: string;
  reason_for_change: string;
  birthdate: string;
  notice_period: string;
  summary: string;
  work_experience: WorkExperience[];
  education: Education[];
  skills: string[];
  languages: Language[];
  photo_url: string;
  // Insights fields for CV
  ai_summary: string;
  signature_achievements: string[];
  growth_potential: string[];
  most_proud_of: string;
  insights_notes: string;
  potential_risks: string;
}

export function CVCreatorTab({ candidate }: CVCreatorTabProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [cvData, setCvData] = useState<EditableCVData>(() => ({
    name: candidate.name || "",
    position: candidate.position || "",
    desired_position: candidate.desired_position || "",
    location: candidate.location || "",
    industry: candidate.industry || "",
    experience: candidate.experience || "",
    current_salary: candidate.current_salary || "",
    desired_salary: candidate.desired_salary || "",
    max_commute: candidate.max_commute || "",
    willing_to_relocate: candidate.willing_to_relocate || "",
    workload: candidate.workload || "",
    reason_for_change: candidate.reason_for_change || "",
    birthdate: candidate.birthdate || "",
    notice_period: candidate.notice_period || "",
    summary: candidate.summary || "",
    work_experience: candidate.work_experience || [],
    education: candidate.education || [],
    skills: candidate.skills || [],
    languages: (candidate.languages as Language[]) || [],
    photo_url: candidate.full_image_url || candidate.avatar_url || "",
    ai_summary: candidate.ai_summary || "",
    signature_achievements: candidate.signature_achievements || [],
    growth_potential: candidate.growth_potential || [],
    most_proud_of: candidate.most_proud_of || "",
    insights_notes: candidate.insights_notes || "",
    potential_risks: candidate.potential_risks || "",
  }));
  const [newSkill, setNewSkill] = useState("");
  const [isPhotoHovered, setIsPhotoHovered] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const { t } = useLanguage();

  // Sync cvData when candidate prop changes (e.g., after page refresh)
  useEffect(() => {
    setCvData({
      name: candidate.name || "",
      position: candidate.position || "",
      desired_position: candidate.desired_position || "",
      location: candidate.location || "",
      industry: candidate.industry || "",
      experience: candidate.experience || "",
      current_salary: candidate.current_salary || "",
      desired_salary: candidate.desired_salary || "",
      max_commute: candidate.max_commute || "",
      willing_to_relocate: candidate.willing_to_relocate || "",
      workload: candidate.workload || "",
      reason_for_change: candidate.reason_for_change || "",
      birthdate: candidate.birthdate || "",
      notice_period: candidate.notice_period || "",
      summary: candidate.summary || "",
      work_experience: candidate.work_experience || [],
      education: candidate.education || [],
      skills: candidate.skills || [],
      languages: (candidate.languages as Language[]) || [],
      photo_url: candidate.full_image_url || candidate.avatar_url || "",
      ai_summary: candidate.ai_summary || "",
      signature_achievements: candidate.signature_achievements || [],
      growth_potential: candidate.growth_potential || [],
      most_proud_of: candidate.most_proud_of || "",
      insights_notes: candidate.insights_notes || "",
      potential_risks: candidate.potential_risks || "",
    });
    setHasChanges(false);
  }, [candidate.id]);

  // Auto-save with debounce
  const saveToDatabase = useCallback(
    async (data: EditableCVData) => {
      setIsSaving(true);
      try {
        const updateData = {
          name: data.name,
          position: data.position,
          desired_position: data.desired_position,
          location: data.location,
          industry: data.industry,
          experience: data.experience,
          current_salary: data.current_salary,
          desired_salary: data.desired_salary,
          max_commute: data.max_commute,
          willing_to_relocate: data.willing_to_relocate,
          workload: data.workload,
          reason_for_change: data.reason_for_change,
          birthdate: data.birthdate,
          notice_period: data.notice_period,
          summary: data.summary,
          work_experience: data.work_experience as any,
          education: data.education as any,
          skills: data.skills,
          languages: data.languages as any,
          avatar_url: data.photo_url,
        };

        const { error } = await supabase
          .from("candidates")
          .update(updateData)
          .eq("id", candidate.id);

        if (error) throw error;
        setHasChanges(false);
      } catch (error) {
        console.error("Auto-save error:", error);
        toast({
          title: t("cv.saveError"),
          description: t("cv.saveErrorDesc"),
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [candidate.id, toast],
  );

  // Debounced auto-save effect
  useEffect(() => {
    if (hasChanges) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveToDatabase(cvData);
      }, 1500); // Save 1.5 seconds after last change
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [cvData, hasChanges, saveToDatabase]);

  const handleGenerateCV = async () => {
    try {
      setIsGenerating(true);
      toast({
        title: t("cv.generating"),
        description: t("cv.generatingDesc"),
      });

      // Get the marked CV path and document order from localStorage
      const markedCvPath = localStorage.getItem(`cv_document_${candidate.id}`);
      const documentOrderRaw = localStorage.getItem(
        `document_order_${candidate.id}`,
      );
      let documentOrder: string[] = [];
      if (documentOrderRaw) {
        try {
          documentOrder = JSON.parse(documentOrderRaw);
        } catch (e) {
          console.error("Error parsing document order:", e);
        }
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cv`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            candidate: {
              ...cvData,
              // Explicitly exclude contact data for anonymization
              email: undefined,
              phone: undefined,
            },
            template: "standard",
            candidateId: candidate.id,
            markedCvPath: markedCvPath,
            documentOrder: documentOrder,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to generate CV");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${cvData.name.replace(/\s+/g, "_")}_CV.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("activity_logs").insert({
          user_id: user.id,
          entity_type: "candidates",
          entity_id: candidate.id,
          action: "EXPOSE_CREATED",
          new_data: { template: "standard", candidate_name: cvData.name },
        });
      }

      toast({
        title: t("toast.cvCreated"),
        description: t("toast.cvCreatedDesc"),
      });
    } catch (error) {
      console.error("Error generating CV:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.cvGenerationError"),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const updateField = (field: keyof EditableCVData, value: any) => {
    setCvData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: t("cv.invalidFileType"),
        description: t("cv.invalidFileTypeDesc"),
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("cv.fileTooLarge"),
        description: t("cv.fileTooLargeDesc"),
        variant: "destructive",
      });
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `cv-photos/${candidate.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(fileName, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("profile-avatars").getPublicUrl(fileName);

      updateField("photo_url", publicUrl);
      toast({
        title: t("cv.photoUploaded"),
        description: t("cv.photoUploadedDesc"),
      });
    } catch (error) {
      console.error("Photo upload error:", error);
      toast({
        title: t("toast.error"),
        description: t("cv.photoUploadError"),
        variant: "destructive",
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handlePhotoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoUpload(file);
  };

  const removePhoto = () => {
    updateField("photo_url", "");
  };

  const addSkill = () => {
    if (newSkill.trim() && !cvData.skills.includes(newSkill.trim())) {
      updateField("skills", [...cvData.skills, newSkill.trim()]);
      setNewSkill("");
    }
  };

  const removeSkill = (skillToRemove: string) => {
    updateField(
      "skills",
      cvData.skills.filter((s) => s !== skillToRemove),
    );
  };

  const updateWorkExperience = (
    index: number,
    field: keyof WorkExperience,
    value: string,
  ) => {
    const updated = [...cvData.work_experience];
    updated[index] = { ...updated[index], [field]: value };
    updateField("work_experience", updated);
  };

  const addWorkExperience = () => {
    updateField("work_experience", [
      ...cvData.work_experience,
      {
        company: "",
        position: "",
        startDate: "",
        endDate: "",
        description: "",
      },
    ]);
  };

  const removeWorkExperience = (index: number) => {
    updateField(
      "work_experience",
      cvData.work_experience.filter((_, i) => i !== index),
    );
  };

  const updateEducation = (
    index: number,
    field: keyof Education,
    value: string,
  ) => {
    const updated = [...cvData.education];
    updated[index] = { ...updated[index], [field]: value };
    updateField("education", updated);
  };

  const addEducation = () => {
    updateField("education", [
      ...cvData.education,
      { degree: "", field: "", institution: "", startDate: "", endDate: "" },
    ]);
  };

  const removeEducation = (index: number) => {
    updateField(
      "education",
      cvData.education.filter((_, i) => i !== index),
    );
  };

  const updateLanguageLevel = (index: number, level: string) => {
    const updated = [...cvData.languages];
    updated[index] = { ...updated[index], level };
    updateField("languages", updated);
  };

  const [newLanguageInput, setNewLanguageInput] = useState("");

  const addLanguageQuick = (name: string) => {
    if (!name.trim()) return;
    updateField("languages", [
      ...cvData.languages,
      { name: name.trim(), level: "B1" },
    ]);
    setNewLanguageInput("");
  };

  const removeLanguage = (index: number) => {
    updateField(
      "languages",
      cvData.languages.filter((_, i) => i !== index),
    );
  };

  // Certification functions removed - merged into further_education

  const EditableText = ({
    value,
    fieldKey,
    className = "",
    multiline = false,
    placeholder = "Klicken zum Bearbeiten",
  }: {
    value: string;
    fieldKey: keyof EditableCVData;
    className?: string;
    multiline?: boolean;
    placeholder?: string;
  }) => {
    const isEditing = editingField === fieldKey;

    if (isEditing) {
      return multiline ? (
        <div className="flex gap-2">
          <Textarea
            value={value}
            onChange={(e) => updateField(fieldKey, e.target.value)}
            className="min-h-[100px]"
            autoFocus
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setEditingField(null)}
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <Input
            value={value}
            onChange={(e) => updateField(fieldKey, e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setEditingField(null)}
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <span
        className={`cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors ${className} ${!value ? "text-muted-foreground italic" : ""}`}
        onClick={() => setEditingField(fieldKey)}
      >
        {value || placeholder}
      </span>
    );
  };

  return (
    <div className="space-y-4 mt-6">
      {/* Header with Generate Button */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Klicken Sie auf die Texte um sie zu bearbeiten.
          </p>
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Speichern...
            </div>
          )}
          {hasChanges && !isSaving && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <Save className="h-4 w-4" />
              Ungespeicherte Änderungen
            </div>
          )}
          {!hasChanges && !isSaving && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Gespeichert
            </div>
          )}
        </div>
        {/* <Button onClick={handleGenerateCV} disabled={isGenerating} size="lg">
          <Download className="h-4 w-4 mr-2" />
          {isGenerating ? "Wird generiert..." : "PDF Generieren"}
        </Button> */}
      </div>

      {/* New CV template (2 pages) with full candidate data */}
      <CVErrorBoundary>
        <CvPrintView candidate={candidate as any} />
      </CVErrorBoundary>
    </div>
  );
}
