import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus,
  Upload,
  X,
  Loader2,
  GraduationCap,
  Briefcase,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CVUploadDialog } from "./CVUploadDialog";
import { SkillsCombobox } from "./SkillsCombobox";
import { LocationAutocomplete } from "./LocationAutocomplete";
import { AvatarUpload } from "./AvatarUpload";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { processWorkExperienceCompanies } from "@/lib/companyUtils";
import { useLanguage } from "@/hooks/useLanguage";

interface CandidateFormData {
  name: string;
  email: string;
  position: string;
  desiredPosition: string;
  phone: string;
  location: string;
  maxCommute: string;
  experience: string;
  skills: string[];
  notes: string;
  birthdate: string;
  profileImage: string;
  education: Array<{
    degree: string;
    institution: string;
    startDate: string;
    endDate: string;
    field?: string;
    location?: string;
    grade?: string;
  }>;
  further_education: Array<{
    // NEW
    name: string;
    institution: string;
    date: string;
    description?: string;
  }>;
  workExperience: Array<{
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    description?: string;
    location?: string;
  }>;
  // certifications removed - merged into further_education
  languages: Array<{
    name: string;
    level: string;
  }>;
  summary: string;
  signatureAchievements: string[];
  growthPotential: string[];
  aiSummary: string;
  currentSalary: string;
  desiredSalary: string;
  workload: string;
  willingToRelocate: boolean;
  noticePeriod: string;
  reasonForChange: string;
  mostProudOf: string;
  potentialRisks: string;
  insightsNotes: string;
  candidateValues: string[];
  awardsPublications: any;
  industry: string;
  yearsOfExperience: string;
  linkedinUrl: string;
}

interface NewCandidateDialogProps {
  onCandidateCreated?: () => void;
  trigger?: React.ReactNode;
  defaultRecruitingStatus?: string | null;
}

export function EnhancedNewCandidateDialog({
  onCandidateCreated,
  trigger,
  defaultRecruitingStatus,
}: NewCandidateDialogProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<CandidateFormData>({
    name: "",
    email: "",
    position: "",
    desiredPosition: "",
    phone: "",
    location: "",
    maxCommute: "",
    experience: "",
    skills: [],
    notes: "",
    birthdate: "",
    profileImage: "",
    education: [],
    further_education: [], // NEW
    workExperience: [],
    // certifications removed - merged into further_education
    languages: [],
    summary: "",
    signatureAchievements: [],
    growthPotential: [],
    aiSummary: "",
    currentSalary: "",
    desiredSalary: "",
    workload: "",
    willingToRelocate: false,
    noticePeriod: "",
    reasonForChange: "",
    mostProudOf: "",
    potentialRisks: "",
    insightsNotes: "",
    candidateValues: [],
    awardsPublications: null,
    industry: "",
    yearsOfExperience: "",
    linkedinUrl: "",
  });

  const [newSkill, setNewSkill] = useState("");
  const [newEducation, setNewEducation] = useState({
    degree: "",
    institution: "",
    startDate: "",
    endDate: "",
    field: "",
    location: "",
    grade: "",
  });
  const [newWorkExp, setNewWorkExp] = useState({
    company: "",
    position: "",
    startDate: "",
    endDate: "",
    description: "",
    location: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (field: keyof CandidateFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddSkill = async () => {
    if (newSkill.trim() && !formData.skills.includes(newSkill.trim())) {
      setFormData((prev) => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()],
      }));

      try {
        const { error } = await supabase
          .from("skills")
          .insert([{ name: newSkill.trim() }])
          .select();

        if (error && error.code !== "23505") {
          console.error("Error saving skill:", error);
        }
      } catch (error) {
        console.error("Error saving skill:", error);
      }

      setNewSkill("");
    }
  };

  const handleRemoveSkill = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index),
    }));
  };

  const handleAddEducation = () => {
    if (newEducation.degree.trim() || newEducation.institution.trim()) {
      setFormData((prev) => ({
        ...prev,
        education: [...prev.education, { ...newEducation }],
      }));
      setNewEducation({
        degree: "",
        institution: "",
        startDate: "",
        endDate: "",
        field: "",
        location: "",
        grade: "",
      });
    }
  };

  const handleRemoveEducation = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  };

  const handleAddWorkExperience = () => {
    if (newWorkExp.company.trim() && newWorkExp.position.trim()) {
      setFormData((prev) => ({
        ...prev,
        workExperience: [...prev.workExperience, { ...newWorkExp }],
      }));
      setNewWorkExp({
        company: "",
        position: "",
        startDate: "",
        endDate: "",
        description: "",
        location: "",
      });
    }
  };

  const handleRemoveWorkExperience = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      workExperience: prev.workExperience.filter((_, i) => i !== index),
    }));
  };
  // const handleCVParsed = (parsedData: any) => {

  //   // Map work experience from ParsedCandidateData format to form format
  //   const formattedWorkExperience =
  //     parsedData.experiences?.map((exp: any) => ({
  //       company: exp.company_name || "",
  //       position: exp.role_title || "",
  //       startDate: exp.start_date || "",
  //       endDate: exp.end_date || "",
  //       description: exp.description || "",
  //       location: "", // Not provided in parsed data
  //     })) || [];

  //   setFormData((prev) => ({
  //     ...prev,
  //     name: parsedData.person?.full_name || prev.name,
  //     email: parsedData.person?.email || prev.email,
  //     phone: parsedData.person?.phone || prev.phone,
  //     location: parsedData.person?.location || prev.location,
  //     position: parsedData.person?.current_role || prev.position,
  //     birthdate: parsedData.person?.birthdate || prev.birthdate,
  //     skills: parsedData.skills || prev.skills,
  //     education: parsedData.education || prev.education,
  //     workExperience:
  //       formattedWorkExperience.length > 0
  //         ? formattedWorkExperience
  //         : prev.workExperience,
  //   }));
  // };
  const handleCVParsed = (parsedData: any) => {
    const formattedWorkExperience =
      parsedData.experiences?.map((exp: any) => ({
        company: exp.company_name || "",
        position: exp.role_title || "",
        startDate: exp.start_date || "",
        endDate: exp.end_date || "",
        description: exp.description || "",
        location: "",
      })) || [];

    const formattedEducation =
      parsedData.education?.map((edu: any) => ({
        institution: edu.institution || "",
        degree: edu.degree || "",
        startDate: edu.start_date || "",
        endDate: edu.end_date || "",
        grade: edu.grade || "",
        field: edu.field || "",
        location: edu.location || "",
      })) || [];

    // NEW - Format further education
    const formattedFurtherEducation =
      parsedData.further_education?.map((furtherEdu: any) => ({
        name: furtherEdu.name || "",
        institution: furtherEdu.institution || "",
        date: furtherEdu.date || "",
        description: furtherEdu.description || "",
      })) || [];

    // Map certifications from parser to further_education format
    const formattedCertsAsFE =
      parsedData.certifications?.map((cert: any) => ({
        name: cert.name || "",
        institution: cert.issuer || "",
        date: cert.date || "",
        description: cert.description || "",
      })) || [];

    const formattedLanguages =
      parsedData.languages?.map((lang: any) => ({
        name: lang.name || "",
        level: lang.level || "",
      })) || [];

    const formattedSkills = parsedData.skills || [];

    setFormData((prev) => ({
      ...prev,
      name: parsedData.person?.full_name || prev.name,
      email: parsedData.person?.email || prev.email,
      phone: parsedData.person?.phone || prev.phone,
      location: parsedData.person?.location || prev.location,
      position: parsedData.person?.current_role || prev.position,
      birthdate: parsedData.person?.birthdate || prev.birthdate,
      skills: formattedSkills.length > 0 ? formattedSkills : prev.skills,
      education:
        formattedEducation.length > 0 ? formattedEducation : prev.education,
      further_education:
        formattedFurtherEducation.length > 0 || formattedCertsAsFE.length > 0
          ? [...(formattedFurtherEducation.length > 0 ? formattedFurtherEducation : prev.further_education), ...formattedCertsAsFE]
          : prev.further_education,
      workExperience:
        formattedWorkExperience.length > 0
          ? formattedWorkExperience
          : prev.workExperience,
      languages:
        formattedLanguages.length > 0 ? formattedLanguages : prev.languages,
      maxCommute: parsedData.max_commute || prev.maxCommute,
      summary: parsedData.summary || prev.summary,
      desiredPosition: parsedData.desired_position || prev.desiredPosition,
      signatureAchievements: Array.isArray(parsedData.signature_achievements)
        ? parsedData.signature_achievements
        : typeof parsedData.signature_achievements === "string"
          ? [parsedData.signature_achievements]
          : prev.signatureAchievements,
      growthPotential: Array.isArray(parsedData.growth_potential)
        ? parsedData.growth_potential
        : typeof parsedData.growth_potential === "string"
          ? [parsedData.growth_potential]
          : prev.growthPotential,
      aiSummary: parsedData.ai_summary || prev.aiSummary,
      currentSalary: parsedData.current_salary || prev.currentSalary,
      desiredSalary: parsedData.desired_salary || prev.desiredSalary,
      workload: parsedData.workload || prev.workload,
      willingToRelocate:
        parsedData.willing_to_relocate === true ||
        parsedData.willing_to_relocate === "Yes" ||
        prev.willingToRelocate,
      noticePeriod: parsedData.notice_period || prev.noticePeriod,
      reasonForChange: parsedData.reason_for_change || prev.reasonForChange,
      mostProudOf: parsedData.most_proud_of || prev.mostProudOf,
      potentialRisks: parsedData.potential_risks || prev.potentialRisks,
      insightsNotes: parsedData.insights_notes || prev.insightsNotes,
      candidateValues: Array.isArray(parsedData.candidate_values)
        ? parsedData.candidate_values
        : typeof parsedData.candidate_values === "string"
          ? [parsedData.candidate_values]
          : prev.candidateValues,
      awardsPublications:
        parsedData.awards_publications || prev.awardsPublications,
      industry: parsedData.industry || prev.industry,
      yearsOfExperience:
        parsedData.years_of_experience || prev.yearsOfExperience,
      linkedinUrl: parsedData.linkedin_url || prev.linkedinUrl,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast({
        title: t("toast.requiredFieldsMissing"),
        description: t("toast.fillName"),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsSubmitting(false);
        toast({
          title: t("toast.notLoggedIn"),
          description: t("toast.pleaseLogin"),
          variant: "destructive",
        });
        return;
      }

      const currentDate = format(new Date(), "dd.MM.yyyy", { locale: de });
      const logEntry = `[${currentDate}] ${t("toast.candidateCreated")}`;
      const notesWithLog = formData.notes
        ? `${logEntry}\n\n${formData.notes}`
        : logEntry;

      const processedWorkExperience = await processWorkExperienceCompanies(
        formData.workExperience,
        user.id,
      );

      const educationFormatted =
        formData.education?.map((edu) => ({
          degree: edu.degree || null,
          institution: edu.institution || null,
          start_date: edu.startDate || null,
          end_date: edu.endDate || null,
          grade: edu.grade || null,
          field: edu.field || null,
          location: edu.location || null,
        })) || [];
      console.log("formData", formData);
      const { error } = await supabase.from("candidates").insert({
        user_id: user.id,
        assigned_to: user.id,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        position: formData.position,
        desired_position: formData.desiredPosition,
        experience: formData.experience,
        current_salary: formData.currentSalary,
        desired_salary: formData.desiredSalary,
        max_commute: formData.maxCommute,
        skills: formData.skills,
        education: educationFormatted as any,
        further_education: formData.further_education as any, // NEW
        work_experience: processedWorkExperience as any,
        notes: notesWithLog,
        birthdate: formData.birthdate || null,
        avatar_url: formData.profileImage || null,
        // certifications removed - data merged into further_education
        languages: formData.languages as any,
        summary: formData.summary,
        signature_achievements: formData.signatureAchievements,
        growth_potential: formData.growthPotential,
        ai_summary: formData.aiSummary,
        workload: formData.workload,
        willing_to_relocate: formData.willingToRelocate ? "Yes" : "No",
        notice_period: formData.noticePeriod,
        reason_for_change: formData.reasonForChange,
        most_proud_of: formData.mostProudOf,
        potential_risks: formData.potentialRisks,
        insights_notes: formData.insightsNotes,
        candidate_values: formData.candidateValues,
        awards_publications: formData.awardsPublications as any,
        industry: formData.industry,
        linkedin_url: formData.linkedinUrl,
        recruiting_status: defaultRecruitingStatus || null,
      });

      if (error) throw error;

      onCandidateCreated?.();

      toast({
        title: t("toast.candidateCreated"),
        description: t("toast.candidateCreatedDesc"),
      });

      // Reset form including further_education
      setFormData({
        name: "",
        email: "",
        position: "",
        desiredPosition: "",
        phone: "",
        location: "",
        maxCommute: "",
        experience: "",
        skills: [],
        notes: "",
        birthdate: "",
        profileImage: "",
        education: [],
        further_education: [], // NEW
        workExperience: [],
        // certifications removed
        languages: [],
        summary: "",
        signatureAchievements: [],
        growthPotential: [],
        aiSummary: "",
        currentSalary: "",
        desiredSalary: "",
        workload: "",
        willingToRelocate: false,
        noticePeriod: "",
        reasonForChange: "",
        mostProudOf: "",
        potentialRisks: "",
        insightsNotes: "",
        candidateValues: [],
        awardsPublications: null,
        industry: "",
        yearsOfExperience: "",
        linkedinUrl: "",
      });
      setIsSubmitting(false);
      setIsOpen(false);
    } catch (error: any) {
      console.error("Error creating candidate:", error);
      setIsSubmitting(false);
      toast({
        title: t("toast.error"),
        description: error.message || t("toast.createError"),
        variant: "destructive",
      });
    }
  };

  const defaultTrigger = (
    <Button>
      <Plus className="mr-2 h-4 w-4" />
      {t("candidates.newCandidate")}
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogs.newCandidate")}</DialogTitle>
          <DialogDescription>{t("dialogs.newCandidateDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* CV Upload Section */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <h4 className="font-medium">{t("dialogs.cvAutoparse")}</h4>
              <p className="text-sm text-muted-foreground">
                {t("dialogs.cvAutoparseDesc")}
              </p>
            </div>
            <CVUploadDialog onCandidateParsed={handleCVParsed} />
          </div>

          <Separator />

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {t("candidates.personalInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Profile Image Upload */}
                <div className="flex items-center gap-4">
                  <AvatarUpload
                    currentImage={formData.profileImage}
                    fallbackText={
                      formData.name
                        ? formData.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)
                        : "?"
                    }
                    onImageChange={(url) =>
                      handleInputChange("profileImage", url)
                    }
                    size="xl"
                    bucket="profile-avatars"
                    folder="candidates"
                  />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">
                      {t("avatar.uploadProfile") || "Profilbild hochladen"}
                    </p>
                    <p>
                      {t("avatar.dragDropHint") ||
                        "Klicken oder Bild hierher ziehen"}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("common.name")} *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        handleInputChange("name", e.target.value)
                      }
                      placeholder="Max Mustermann"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="position">{t("common.position")}</Label>
                    <Input
                      id="position"
                      value={formData.position}
                      onChange={(e) =>
                        handleInputChange("position", e.target.value)
                      }
                      placeholder="Senior Developer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("common.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        handleInputChange("email", e.target.value)
                      }
                      placeholder="max@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("common.phone")}</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) =>
                        handleInputChange("phone", e.target.value)
                      }
                      placeholder="+49 30 12345678"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location">{t("form.residence")}</Label>
                    <LocationAutocomplete
                      id="location"
                      value={formData.location}
                      onChange={(value) => handleInputChange("location", value)}
                      placeholder="Zürich, Schweiz"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxCommute">{t("form.maxCommute")}</Label>
                    <Input
                      id="maxCommute"
                      value={formData.maxCommute}
                      onChange={(e) =>
                        handleInputChange("maxCommute", e.target.value)
                      }
                      placeholder="30 km"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="desiredPosition">
                      {t("form.desiredPosition")}
                    </Label>
                    <Input
                      id="desiredPosition"
                      value={formData.desiredPosition}
                      onChange={(e) =>
                        handleInputChange("desiredPosition", e.target.value)
                      }
                      placeholder="Lead Developer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentSalary">
                      {t("candidates.currentSalary") || "Aktuelles Gehalt"}
                    </Label>
                    <Input
                      id="currentSalary"
                      value={formData.currentSalary}
                      onChange={(e) =>
                        handleInputChange("currentSalary", e.target.value)
                      }
                      placeholder="60.000 €"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desiredSalary">
                      {t("candidates.desiredSalary") || "Gehaltswunsch"}
                    </Label>
                    <Input
                      id="desiredSalary"
                      value={formData.desiredSalary}
                      onChange={(e) =>
                        handleInputChange("desiredSalary", e.target.value)
                      }
                      placeholder="70.000 €"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="experience">{t("common.experience")}</Label>
                    <Input
                      id="experience"
                      value={formData.experience}
                      onChange={(e) =>
                        handleInputChange("experience", e.target.value)
                      }
                      placeholder="5+ Jahre"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birthdate">
                      {t("form.birthdate") || "Geburtsdatum"}
                    </Label>
                    <Input
                      id="birthdate"
                      type="date"
                      value={formData.birthdate}
                      onChange={(e) =>
                        handleInputChange("birthdate", e.target.value)
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("common.skills")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SkillsCombobox
                  value={newSkill}
                  onChange={setNewSkill}
                  onSelect={handleAddSkill}
                  placeholder={t("dialogs.addSkillPlaceholder")}
                />
                {formData.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.skills.map((skill, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="cursor-pointer"
                      >
                        {skill}
                        <X
                          className="h-3 w-3 ml-1"
                          onClick={() => handleRemoveSkill(index)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Education */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  {t("candidates.education")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    value={newEducation.degree}
                    onChange={(e) =>
                      setNewEducation((prev) => ({
                        ...prev,
                        degree: e.target.value,
                      }))
                    }
                    placeholder="z.B. Bachelor of Computer Science"
                  />
                  <Input
                    value={newEducation.institution}
                    onChange={(e) =>
                      setNewEducation((prev) => ({
                        ...prev,
                        institution: e.target.value,
                      }))
                    }
                    placeholder="z.B. Air University"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input
                    value={newEducation.startDate}
                    onChange={(e) =>
                      setNewEducation((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                    placeholder="Start (z.B. Aug 2020)"
                  />
                  <Input
                    value={newEducation.endDate}
                    onChange={(e) =>
                      setNewEducation((prev) => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                    placeholder="Ende (z.B. Jun 2024)"
                  />
                  <Button
                    type="button"
                    onClick={handleAddEducation}
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.education.length > 0 && (
                  <div className="space-y-2">
                    {formData.education.map((edu: any, index: number) => (
                      <div key={index} className="p-3 bg-muted/50 rounded">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{edu.degree}</p>
                            <p className="text-xs text-muted-foreground">
                              {edu.institution}
                            </p>
                            {(edu.startDate || edu.endDate) && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {[edu.startDate, edu.endDate]
                                  .filter(Boolean)
                                  .join(" - ")}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveEducation(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Work Experience */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  {t("candidates.workExperience")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input
                    value={newWorkExp.company}
                    onChange={(e) =>
                      setNewWorkExp((prev) => ({
                        ...prev,
                        company: e.target.value,
                      }))
                    }
                    placeholder={t("common.company")}
                  />
                  <Input
                    value={newWorkExp.position}
                    onChange={(e) =>
                      setNewWorkExp((prev) => ({
                        ...prev,
                        position: e.target.value,
                      }))
                    }
                    placeholder={t("common.position")}
                  />
                  <Input
                    value={newWorkExp.location}
                    onChange={(e) =>
                      setNewWorkExp((prev) => ({
                        ...prev,
                        location: e.target.value,
                      }))
                    }
                    placeholder="Standort"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    value={newWorkExp.startDate}
                    onChange={(e) =>
                      setNewWorkExp((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                    placeholder="Start (z.B. Jul 2024)"
                  />
                  <Input
                    value={newWorkExp.endDate}
                    onChange={(e) =>
                      setNewWorkExp((prev) => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                    placeholder="Ende (z.B. Present)"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newWorkExp.description}
                    onChange={(e) =>
                      setNewWorkExp((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder={t("dialogs.additionalInfo")}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={handleAddWorkExperience}
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.workExperience.length > 0 && (
                  <div className="space-y-2">
                    {formData.workExperience.map((exp: any, index: number) => (
                      <div key={index} className="p-3 bg-muted/50 rounded">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-sm">
                                  {exp.position}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {exp.company}
                                </p>
                                {exp.location && (
                                  <p className="text-xs text-muted-foreground">
                                    {exp.location}
                                  </p>
                                )}
                              </div>
                              {(exp.startDate || exp.endDate) && (
                                <p className="text-xs text-muted-foreground">
                                  {[exp.startDate, exp.endDate]
                                    .filter(Boolean)
                                    .join(" - ")}
                                </p>
                              )}
                            </div>
                            {exp.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {exp.description}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveWorkExperience(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("common.notes")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange("notes", e.target.value)}
                  placeholder={t("dialogs.additionalInfo")}
                  rows={3}
                />
              </CardContent>
            </Card>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("common.create")} {t("common.candidate")}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
