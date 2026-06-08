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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CVUploadDialog } from "@/components/CVUploadDialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";

interface CandidateFormData {
  name: string;
  email: string;
  phone: string;
  location: string;
  position: string;
  desiredPosition: string;
  experience: string;
  salary: string;
  maxCommute: string;
  skills: string[];
  education: string[];
  workExperience: Array<{
    company: string;
    position: string;
    duration: string;
    description?: string;
  }>;
  status: string;
  notes: string;
}

interface NewCandidateDialogProps {
  onCandidateCreated?: (candidate: CandidateFormData) => void;
}

export function NewCandidateDialog({
  onCandidateCreated,
}: NewCandidateDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<CandidateFormData>({
    name: "",
    email: "",
    phone: "",
    location: "",
    position: "",
    desiredPosition: "",
    experience: "",
    salary: "",
    maxCommute: "",
    skills: [],
    education: [],
    workExperience: [],
    status: "Active",
    notes: "",
  });
  const [newSkill, setNewSkill] = useState("");
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleInputChange = (field: keyof CandidateFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddSkill = () => {
    if (newSkill.trim() && !formData.skills.includes(newSkill.trim())) {
      setFormData((prev) => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()],
      }));
      setNewSkill("");
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((skill) => skill !== skillToRemove),
    }));
  };

  const handleCVParsed = (parsedData: any) => {
    setFormData((prev) => ({
      ...prev,
      name: parsedData.name || prev.name,
      email: parsedData.email || prev.email,
      phone: parsedData.phone || prev.phone,
      location: parsedData.location || prev.location,
      position: parsedData.position || prev.position,
      experience: parsedData.experience || prev.experience,
      skills: parsedData.skills || prev.skills,
      education: parsedData.education || prev.education,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast({
        title: t("toast.requiredFieldsMissing"),
        description: t("toast.fillName"),
        variant: "destructive",
      });
      return;
    }

    // In a real app, this would make an API call
    onCandidateCreated?.(formData);

    toast({
      title: t("toast.candidateCreated"),
      description: t("toast.candidateCreatedDesc"),
    });

    // Reset form and close dialog
    setFormData({
      name: "",
      email: "",
      phone: "",
      location: "",
      position: "",
      desiredPosition: "",
      experience: "",
      salary: "",
      maxCommute: "",
      skills: [],
      education: [],
      workExperience: [],
      status: "Active",
      notes: "",
    });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("candidates.newCandidate")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogs.newCandidate")}</DialogTitle>
          <DialogDescription>{t("dialogs.newCandidateDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("common.name")} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder={t("form.namePlaceholder")}
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
                  placeholder={t("form.positionPlaceholder")}
                />
              </div>
            </div>

            {/* Contact Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("common.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder={t("form.emailPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("common.phone")}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder={t("form.phonePlaceholder")}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">{t("form.residence")}</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) =>
                    handleInputChange("location", e.target.value)
                  }
                  placeholder={t("form.locationPlaceholder")}
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
                  placeholder={t("form.commutePlaceholder")}
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
                  placeholder={t("form.desiredPositionPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">{t("common.status")}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleInputChange("status", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">{t("common.active")}</SelectItem>
                    <SelectItem value="Interview">
                      {t("candidates.statusInterview")}
                    </SelectItem>
                    <SelectItem value="Placed">
                      {t("candidates.statusPlaced")}
                    </SelectItem>
                    <SelectItem value="Inactive">
                      {t("common.inactive")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Professional Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="experience">{t("common.experience")}</Label>
                <Input
                  id="experience"
                  value={formData.experience}
                  onChange={(e) =>
                    handleInputChange("experience", e.target.value)
                  }
                  placeholder={t("form.experiencePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary">{t("form.salaryWish")}</Label>
                <Input
                  id="salary"
                  value={formData.salary}
                  onChange={(e) => handleInputChange("salary", e.target.value)}
                  placeholder={t("form.salaryPlaceholder")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="education">{t("candidates.education")}</Label>
              <Input
                id="education"
                value={formData.education}
                onChange={(e) => handleInputChange("education", e.target.value)}
                placeholder={t("form.educationPlaceholder")}
              />
            </div>

            {/* Skills */}
            <div className="space-y-2">
              <Label>{t("common.skills")}</Label>
              <div className="flex gap-2">
                <Input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder={t("dialogs.addSkillPlaceholder")}
                  onKeyPress={(e) =>
                    e.key === "Enter" && (e.preventDefault(), handleAddSkill())
                  }
                />
                <Button
                  type="button"
                  onClick={handleAddSkill}
                  variant="outline"
                >
                  {t("common.add")}
                </Button>
              </div>
              {formData.skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.skills.map((skill, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => handleRemoveSkill(skill)}
                    >
                      {skill} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">{t("common.notes")}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange("notes", e.target.value)}
                placeholder={t("form.additionalInfo")}
                rows={3}
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("candidates.createCandidate")}</Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
