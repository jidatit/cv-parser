import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Lightbulb, X, Check, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DetectedSkill {
  skill: string;
  source: string;
  context: string;
  alreadyExists: boolean;
}

interface SkillDetectionModeProps {
  isActive: boolean;
  onClose: () => void;
  candidateData: {
    work_experience?: any[];
    education?: any[];
    notes?: string;
    summary?: string;
    further_education?: any[];
    position?: string;
    desired_position?: string;
  };
  currentSkills: string[];
  onAddSkill: (skill: string) => void;
  cachedSkills: DetectedSkill[] | null;
  onSkillsDetected: (skills: DetectedSkill[]) => void;
}

interface DetectedSkill {
  skill: string;
  source: string;
  context: string;
  alreadyExists: boolean;
}

export function SkillDetectionMode({
  isActive,
  onClose,
  candidateData,
  currentSkills,
  onAddSkill,
  cachedSkills,
  onSkillsDetected,
}: SkillDetectionModeProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedSkills, setDetectedSkills] = useState<DetectedSkill[]>(cachedSkills || []);
  const [addedSkills, setAddedSkills] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync with cached skills when they change
  useEffect(() => {
    if (cachedSkills) {
      setDetectedSkills(cachedSkills);
    }
  }, [cachedSkills]);

  // Build text content from candidate data
  const buildTextContent = useCallback(() => {
    const parts: string[] = [];

    // Work experience
    if (candidateData.work_experience?.length) {
      candidateData.work_experience.forEach((exp: any) => {
        if (exp.position) parts.push(exp.position);
        if (exp.description) parts.push(exp.description);
        if (exp.company) parts.push(exp.company);
      });
    }

    // Education
    if (candidateData.education?.length) {
      candidateData.education.forEach((edu: any) => {
        if (edu.degree) parts.push(edu.degree);
        if (edu.field) parts.push(edu.field);
        if (edu.institution) parts.push(edu.institution);
        if (edu.description) parts.push(edu.description);
      });
    }

    // Further education (includes certifications)
    if (candidateData.further_education?.length) {
      candidateData.further_education.forEach((fe: any) => {
        if (fe.name) parts.push(fe.name);
        if (fe.description) parts.push(fe.description);
      });
    }

    // Notes and summary
    if (candidateData.notes) parts.push(candidateData.notes);
    if (candidateData.summary) parts.push(candidateData.summary);
    if (candidateData.position) parts.push(candidateData.position);
    if (candidateData.desired_position) parts.push(candidateData.desired_position);

    return parts.join("\n\n");
  }, [candidateData]);

  // Analyze text for skills when mode becomes active (only if not cached)
  useEffect(() => {
    if (isActive && (!cachedSkills || cachedSkills.length === 0) && detectedSkills.length === 0 && !isAnalyzing) {
      analyzeForSkills();
    }
  }, [isActive, cachedSkills]);

  // Handle click outside to close
  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Delay adding listener to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isActive, onClose]);

  // Handle escape key to close
  useEffect(() => {
    if (!isActive) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isActive, onClose]);

  const analyzeForSkills = async () => {
    const textContent = buildTextContent();
    if (!textContent.trim()) {
      toast({
        title: t("skillDetection.noData"),
        description: t("skillDetection.noDataDesc"),
        variant: "default",
      });
      onClose();
      return;
    }

    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke("process-candidate-info", {
        body: {
          instruction: `AUFGABE: Analysiere den folgenden Text und identifiziere ALLE erwähnten Skills, Technologien, Werkzeuge, Fähigkeiten und Kompetenzen.

WICHTIG: 
- Extrahiere sowohl technische Skills (Programmiersprachen, Tools, Software, Frameworks) als auch Soft Skills (Kommunikation, Führung, etc.)
- Gib jeden Skill einzeln zurück, nicht als Kombination
- Normalisiere die Skills (z.B. "MS Office" statt "Microsoft Office Suite")
- Identifiziere auch implizite Skills aus Tätigkeitsbeschreibungen
- Gib für jeden Skill den Kontext an, wo er gefunden wurde (z.B. "Berufserfahrung", "Ausbildung", "Zertifikate", "Notizen")

AUSGABEFORMAT: Gib NUR ein JSON-Objekt zurück mit folgendem Format:
{
  "detected_skills": [
    { "skill": "Python", "source": "Berufserfahrung", "context": "Senior Developer bei XYZ" },
    { "skill": "Projektmanagement", "source": "Zertifikate", "context": "PMP Zertifizierung" }
  ]
}`,
          text: textContent,
          images: null,
          currentData: null,
          extractSkillsOnly: true,
        },
      });

      if (error) {
        if (error.message?.includes("429") || error.status === 429) {
          toast({
            title: t("skillDetection.rateLimitReached"),
            description: t("skillDetection.rateLimitReachedDesc"),
            variant: "destructive",
          });
          onClose();
          return;
        }
        throw error;
      }

      // Parse the response - it might come as fields or as detected_skills
      let skills: DetectedSkill[] = [];
      
      if (data?.detected_skills && Array.isArray(data.detected_skills)) {
        skills = data.detected_skills.map((s: any) => ({
          skill: s.skill || s.name || String(s),
          source: s.source || "Lebenslauf",
          context: s.context || "",
          alreadyExists: currentSkills.some(
            (existing) => existing.toLowerCase() === (s.skill || s.name || String(s)).toLowerCase()
          ),
        }));
      } else if (data?.fields && Array.isArray(data.fields)) {
        // Handle standard response format
        const skillsField = data.fields.find((f: any) => f.key === "skills");
        if (skillsField && Array.isArray(skillsField.value)) {
          skills = skillsField.value.map((s: any) => ({
            skill: typeof s === "string" ? s : s.skill || s.name || String(s),
            source: typeof s === "string" ? "Lebenslauf" : s.source || "Lebenslauf",
            context: typeof s === "string" ? "" : s.context || "",
            alreadyExists: currentSkills.some(
              (existing) =>
                existing.toLowerCase() ===
                (typeof s === "string" ? s : s.skill || s.name || String(s)).toLowerCase()
            ),
          }));
        }
      }

      // Remove duplicates
      const uniqueSkills = skills.reduce((acc: DetectedSkill[], curr) => {
        if (!acc.some((s) => s.skill.toLowerCase() === curr.skill.toLowerCase())) {
          acc.push(curr);
        }
        return acc;
      }, []);

      // Sort: new skills first, then alphabetically
      uniqueSkills.sort((a, b) => {
        if (a.alreadyExists !== b.alreadyExists) {
          return a.alreadyExists ? 1 : -1;
        }
        return a.skill.localeCompare(b.skill, "de");
      });

      setDetectedSkills(uniqueSkills);
      onSkillsDetected(uniqueSkills); // Cache the results

      if (uniqueSkills.length === 0) {
        toast({
          title: t("skillDetection.noSkillsFound"),
          description: t("skillDetection.noSkillsFoundDesc"),
          variant: "default",
        });
      }
    } catch (error: any) {
      console.error("Error analyzing for skills:", error);
      toast({
        title: t("skillDetection.error"),
        description: t("skillDetection.errorDesc"),
        variant: "destructive",
      });
      onClose();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSkillClick = (skill: DetectedSkill) => {
    if (skill.alreadyExists) {
      return;
    }

    const isAdded = addedSkills.has(skill.skill);
    
    if (isAdded) {
      // Remove the skill
      onAddSkill(skill.skill); // This toggles/removes the skill
      setAddedSkills((prev) => {
        const next = new Set(prev);
        next.delete(skill.skill);
        return next;
      });
    } else {
      // Add the skill
      onAddSkill(skill.skill);
      setAddedSkills((prev) => new Set([...prev, skill.skill]));
    }
  };

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-4 pointer-events-none">
      <div
        ref={containerRef}
        className="pointer-events-auto bg-card border border-border/50 rounded-xl shadow-2xl animate-in slide-in-from-bottom-5 duration-300 w-full max-w-3xl mx-4"
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Lightbulb className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-medium text-sm">{t("skillDetection.title")}</h3>
              {!isAnalyzing && detectedSkills.length > 0 && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                  {detectedSkills.filter((s) => !s.alreadyExists && !addedSkills.has(s.skill)).length} {t("skillDetection.new")}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          {isAnalyzing ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">{t("skillDetection.analyzing")}</span>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                {t("skillDetection.clickToAdd")}
              </p>
              <ScrollArea className="max-h-[30vh] overflow-y-auto">
                <div className="flex flex-wrap gap-1.5 pb-2 pr-3">
                  {detectedSkills.map((skill, index) => {
                    const isAdded = addedSkills.has(skill.skill);
                    const isExisting = skill.alreadyExists;
                    const isClickable = !isExisting;

                    return (
                      <Badge
                        key={`${skill.skill}-${index}`}
                        variant={isExisting ? "outline" : isAdded ? "default" : "secondary"}
                        className={`
                          py-0.5 px-2 text-xs font-normal transition-all
                          ${isClickable ? "cursor-pointer hover:scale-105" : ""}
                          ${!isExisting && !isAdded ? "hover:bg-primary hover:text-primary-foreground" : ""}
                          ${isExisting ? "opacity-40 cursor-not-allowed border-dashed" : ""}
                          ${isAdded ? "bg-green-600 hover:bg-red-500 text-white" : ""}
                        `}
                        onClick={() => isClickable && handleSkillClick(skill)}
                        title={skill.context ? `${skill.source}: ${skill.context}` : skill.source}
                      >
                        {isAdded && <Check className="h-2.5 w-2.5 mr-1" />}
                        {isClickable && !isAdded && <Plus className="h-2.5 w-2.5 mr-0.5 opacity-60" />}
                        {skill.skill}
                      </Badge>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Footer */}
              {detectedSkills.length > 0 && addedSkills.size > 0 && (
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    {t("skillDetection.skillsAdded", { count: addedSkills.size })}
                  </span>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
                    {t("skillDetection.done")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
