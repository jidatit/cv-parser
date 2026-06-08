import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin, Briefcase, GraduationCap } from "lucide-react";

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
  skills?: string[];
  education?: Education[];
  work_experience?: WorkExperience[];
  current_salary?: string;
  desired_salary?: string;
  willing_to_relocate?: string;
}

interface TemplateCustomization {
  primaryColor: string;
  secondaryColor: string;
  fontSize: string;
  spacing: string;
  showPhoto: boolean;
}

interface CVElement {
  id: string;
  name: string;
  visible: boolean;
  order: number;
}

interface CVPreviewProps {
  candidate: CandidateInfo;
  template: string;
  customization: TemplateCustomization;
  elements?: CVElement[];
}

export function CVPreview({ candidate, template, customization, elements }: CVPreviewProps) {
  const getTemplateStyles = () => {
    const baseStyles = "bg-white p-8 shadow-lg rounded-lg overflow-hidden";
    
    switch (template) {
      case "modern":
        return `${baseStyles} border-l-8`;
      case "classic":
        return `${baseStyles} border-t-4`;
      case "creative":
        return `${baseStyles} border-l-8 border-r-8`;
      case "minimal":
        return baseStyles;
      default:
        return baseStyles;
    }
  };

  const getPrimaryColorClass = () => {
    const colorMap: { [key: string]: string } = {
      blue: "text-blue-600 border-blue-600",
      gray: "text-gray-700 border-gray-700",
      purple: "text-purple-600 border-purple-600",
      green: "text-green-600 border-green-600",
      red: "text-red-600 border-red-600",
      orange: "text-orange-600 border-orange-600",
    };
    return colorMap[customization.primaryColor] || colorMap.blue;
  };

  const getFontSizeClass = () => {
    const sizeMap: { [key: string]: { name: string; title: string; section: string; body: string } } = {
      small: { name: "text-2xl", title: "text-base", section: "text-lg", body: "text-sm" },
      medium: { name: "text-3xl", title: "text-lg", section: "text-xl", body: "text-base" },
      large: { name: "text-4xl", title: "text-xl", section: "text-2xl", body: "text-lg" },
    };
    return sizeMap[customization.fontSize] || sizeMap.medium;
  };

  const getSpacingClass = () => {
    const spacingMap: { [key: string]: string } = {
      compact: "space-y-3",
      normal: "space-y-4",
      relaxed: "space-y-6",
    };
    return spacingMap[customization.spacing] || spacingMap.normal;
  };

  const fontSize = getFontSizeClass();
  const spacing = getSpacingClass();
  const primaryColor = getPrimaryColorClass();

  // Default elements order if not provided
  const defaultElements: CVElement[] = [
    { id: "header", name: "Kopfzeile (Name & Kontakt)", visible: true, order: 0 },
    { id: "summary", name: "Zusammenfassung", visible: true, order: 1 },
    { id: "experience", name: "Berufserfahrung", visible: true, order: 2 },
    { id: "education", name: "Ausbildung", visible: true, order: 3 },
    { id: "skills", name: "Fähigkeiten", visible: true, order: 4 },
  ];

  const orderedElements = elements || defaultElements;

  const renderElement = (elementId: string) => {
    switch (elementId) {
      case "header":
        return (
          <div key="header">
            {/* Header */}
            <div className="space-y-2">
              <h1 className={`${fontSize.name} font-bold ${primaryColor}`}>
                {candidate.name}
              </h1>
              {candidate.position && (
                <p className={`${fontSize.title} text-gray-600 font-medium`}>
                  {candidate.position}
                </p>
              )}
            </div>

            {/* Contact Information */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              {candidate.email && (
                <div className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  <span>{candidate.email}</span>
                </div>
              )}
              {candidate.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  <span>{candidate.phone}</span>
                </div>
              )}
              {candidate.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>{candidate.location}</span>
                </div>
              )}
            </div>
          </div>
        );

      case "summary":
        return candidate.desired_position || candidate.experience || candidate.industry ? (
          <div key="summary">
            <h2 className={`${fontSize.section} font-bold ${primaryColor} flex items-center gap-2 mb-3`}>
              <Briefcase className="w-5 h-5" />
              Profil
            </h2>
            <div className={`${fontSize.body} text-gray-700 space-y-2`}>
              {candidate.desired_position && (
                <p><strong>Gewünschte Position:</strong> {candidate.desired_position}</p>
              )}
              {candidate.experience && (
                <p><strong>Erfahrung:</strong> {candidate.experience}</p>
              )}
              {candidate.industry && (
                <p><strong>Branche:</strong> {candidate.industry}</p>
              )}
            </div>
          </div>
        ) : null;

      case "experience":
        return candidate.work_experience && candidate.work_experience.length > 0 ? (
          <div key="experience">
            <h2 className={`${fontSize.section} font-bold ${primaryColor} flex items-center gap-2 mb-3`}>
              <Briefcase className="w-5 h-5" />
              Berufserfahrung
            </h2>
            <div className="space-y-4">
              {candidate.work_experience.map((exp, index) => (
                <div key={index} className="border-l-2 border-gray-300 pl-4">
                  <h3 className={`${fontSize.title} font-semibold text-gray-900`}>
                    {exp.position}
                  </h3>
                  <p className={`${fontSize.body} text-gray-600 font-medium`}>
                    {exp.company}
                  </p>
                  {(exp.startDate || exp.endDate) && (
                    <p className="text-sm text-gray-500">
                      {exp.startDate || "N/A"} - {exp.endDate || "Aktuell"}
                    </p>
                  )}
                  {exp.description && (
                    <p className={`${fontSize.body} text-gray-700 mt-2`}>
                      {exp.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null;

      case "education":
        return candidate.education && candidate.education.length > 0 ? (
          <div key="education">
            <h2 className={`${fontSize.section} font-bold ${primaryColor} flex items-center gap-2 mb-3`}>
              <GraduationCap className="w-5 h-5" />
              Ausbildung
            </h2>
            <div className="space-y-4">
              {candidate.education.map((edu, index) => (
                <div key={index} className="border-l-2 border-gray-300 pl-4">
                  <h3 className={`${fontSize.title} font-semibold text-gray-900`}>
                    {edu.degree}
                  </h3>
                  {edu.field && (
                    <p className={`${fontSize.body} text-gray-600`}>
                      Fachrichtung: {edu.field}
                    </p>
                  )}
                  <p className={`${fontSize.body} text-gray-600 font-medium`}>
                    {edu.institution}
                  </p>
                  {(edu.startDate || edu.endDate) && (
                    <p className="text-sm text-gray-500">
                      {edu.startDate || "N/A"} - {edu.endDate || "N/A"}
                    </p>
                  )}
                  {edu.grade && (
                    <p className={`${fontSize.body} text-gray-700`}>
                      Note: {edu.grade}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null;

      case "skills":
        return candidate.skills && candidate.skills.length > 0 ? (
          <div key="skills">
            <h2 className={`${fontSize.section} font-bold ${primaryColor} mb-3`}>
              Fähigkeiten
            </h2>
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((skill, index) => (
                <Badge key={index} variant="secondary" className={fontSize.body}>
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full overflow-auto bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <Card className={getTemplateStyles()}>
          <div className={spacing}>
            {orderedElements
              .filter(el => el.visible)
              .sort((a, b) => a.order - b.order)
              .map(el => renderElement(el.id))}
          </div>
        </Card>
      </div>
    </div>
  );
}
