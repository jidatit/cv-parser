import { useState, useEffect, useRef } from "react";
import { getSignedLogoUrl } from "@/lib/storageUtils";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  Building2,
  MapPin,
  Briefcase,
  Euro,
  Clock,
  Check,
  Loader2,
  Save,
  Globe,
  FileText,
  Mail,
  Phone,
  Gift,
  Plus,
  Minus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    return new Promise<string | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 3;
        canvas.width = (img.naturalWidth || 300) * scale;
        canvas.height = (img.naturalHeight || 300) * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, img.naturalWidth || 300, img.naturalHeight || 300);
        }
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
      img.src = objectUrl;
    });
  } catch { return null; }
}
import { de } from "date-fns/locale";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import PrintPage, {
  type JobForTemplate,
} from "@/components/cv-template/2ndcvPrintView";

interface MatchData {
  id: string;
  jobId: string;
  clientId: string;
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string;
  jobResponsibilities: string;
  jobBenefits: string;
  jobLocation: string;
  jobSalaryRange: string;
  jobEmploymentType: string;
  jobExperienceLevel: string;
  jobSkills: string[];
  companyName: string;
  companyIndustry: string;
  companyWebsite: string;
  companyAddress: string;
  companyDescription: string;
  companyLogoUrl: string | null;
  issueDate: string;
}

interface CoverData {
  candidateName: string;
  year: string;
  preparedBy: string;
  preparedByEmail: string;
  preparedByPhone: string;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyWebsite: string;
}

interface EditableExposeData {
  candidateName: string;
  matches: MatchData[];
  cover: CoverData;
}

interface JobExposeCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateName: string;
  onNavigateAway?: (state: { candidateId: string; candidateName: string; activeTab: string }) => void;
  initialActiveTab?: string;
}

export function JobExposeCreatorDialog({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  onNavigateAway,
  initialActiveTab,
}: JobExposeCreatorDialogProps) {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(initialActiveTab || "position-0");
  const [zoomLevel, setZoomLevel] = useState(0.6); // Default scale
  const [exposeData, setExposeData] = useState<EditableExposeData>({
    candidateName: candidateName,
    matches: [],
    cover: {
      candidateName: candidateName,
      year: new Date().getFullYear().toString(),
      preparedBy: "",
      preparedByEmail: "",
      preparedByPhone: "",
      companyName: "Beckett Stone",
      companyEmail: "info@beckettstone.ch",
      companyPhone: "+41 76 801 83 70",
      companyWebsite: "beckettstone.ch",
    },
  });
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [isCapturingPdf, setIsCapturingPdf] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();
  /** Ref so the active position tab's PrintPage can be triggered to download from the top button */
  const printDownloadRef = useRef<(() => void) | null>(null);
  /** Ref to the cover card for PDF capture when Cover tab is active */
  const coverCardRef = useRef<HTMLDivElement>(null);
  /** Hidden container that holds all pages (cover + all positions) for combined PDF download */
  const allPagesRef = useRef<HTMLDivElement | null>(null);

  // Load matches when dialog opens
  useEffect(() => {
    if (open && candidateId) {
      loadMatches();
    }
  }, [open, candidateId]);

  const loadMatches = async () => {
    setIsLoading(true);
    try {
      // Load current user's profile data for the cover
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let userProfile = {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
      };
      let companySettings: {
        name: string;
        email: string;
        phone: string;
        website: string;
      } = {
        name: "Beckett Stone",
        email: "info@beckettstone.ch",
        phone: "+41 76 801 83 70",
        website: "beckettstone.ch",
      };

      if (user) {
        // Load profile data
        const { data: profileData } = await supabase
          .from("profiles")
          .select("first_name, last_name, email, phone")
          .eq("id", user.id)
          .single();

        if (profileData) {
          userProfile = {
            firstName: profileData.first_name || "",
            lastName: profileData.last_name || "",
            email: profileData.email || "",
            phone: (profileData as any).phone || "",
          };
        }

        // Load company settings from status_configurations (once)
        const { data: configData } = await supabase
          .from("status_configurations")
          .select("config_value")
          .eq("user_id", user.id)
          .eq("config_type", "company_settings")
          .single();

        if (configData?.config_value) {
          const savedCompany = configData.config_value as any;
          companySettings = {
            name: savedCompany.name || companySettings.name,
            email: savedCompany.email || companySettings.email,
            phone: savedCompany.phone || companySettings.phone,
            website: savedCompany.website || companySettings.website,
          };
        }
      }

      const { data: candidateMatches, error: matchesError } = await supabase
        .from("placements")
        .select(
          `
          *,
          candidates(name),
          jobs(*, clients(*))
        `,
        )
        .eq("candidate_id", candidateId)
        .eq("stage", "Ready2Send");

      if (matchesError) throw matchesError;

      if (!candidateMatches || candidateMatches.length === 0) {
        toast({
          title: t("aiMatches.noMatches"),
          description: "Keine Matches in der Ready2Send Stage gefunden.",
          variant: "destructive",
        });
        onOpenChange(false);
        return;
      }

      const matches: MatchData[] = await Promise.all(candidateMatches.map(async (match) => {
        // Determine benefits - use job benefits if available, otherwise client benefits
        const jobBenefits =
          match.jobs?.benefits || match.jobs?.clients?.benefits || "";

        const signedLogoUrl = await getSignedLogoUrl(match.jobs?.clients?.logo_url || null);
        const logoDataUrl = signedLogoUrl ? await fetchImageAsDataUrl(signedLogoUrl) : null;

        return {
          id: match.id,
          jobId: match.jobs?.id || "",
          clientId: match.jobs?.clients?.id || "",
          jobTitle: match.jobs?.title || "",
          jobDescription: match.jobs?.description || "",
          jobRequirements: match.jobs?.requirements || "",
          jobResponsibilities: match.jobs?.responsibilities || "",
          jobBenefits: jobBenefits,
          jobLocation: match.jobs?.location || "",
          jobSalaryRange: match.jobs?.salary_range || "",
          jobEmploymentType: match.jobs?.employment_type || "",
          jobExperienceLevel: match.jobs?.experience_level || "",
          jobSkills: match.jobs?.skills || [],
          companyName: match.jobs?.clients?.name || "",
          companyIndustry: match.jobs?.clients?.industry || "",
          companyWebsite: match.jobs?.clients?.website || "",
          companyAddress: match.jobs?.clients?.address || "",
          companyDescription: match.jobs?.clients?.description || "",
          companyLogoUrl: logoDataUrl,
          issueDate: format(new Date(), "MMMM yyyy", { locale: de }),
        };
      }));

      const fetchedCandidateName =
        candidateMatches[0].candidates?.name || candidateName;
      const fullUserName =
        `${userProfile.firstName} ${userProfile.lastName}`.trim();

      setExposeData((prev) => ({
        ...prev,
        candidateName: fetchedCandidateName,
        matches,
        cover: {
          ...prev.cover,
          candidateName: fetchedCandidateName,
          preparedBy: fullUserName || prev.cover.preparedBy,
          preparedByEmail: userProfile.email || prev.cover.preparedByEmail,
          preparedByPhone: userProfile.phone || prev.cover.preparedByPhone,
          companyName: companySettings.name,
          companyEmail: companySettings.email,
          companyPhone: companySettings.phone,
          companyWebsite: companySettings.website,
        },
      }));
      // Set first position as active tab (not cover)
      if (matches.length > 0) {
        setActiveTab("position-0");
      }
      setActiveMatchIndex(0);
    } catch (error) {
      console.error("Error loading matches:", error);
      toast({
        title: t("toast.error"),
        description: "Fehler beim Laden der Matches.",
        variant: "destructive",
      });
    } finally {
      // Preload all template images before showing
      const templateImages = [
        "/Element%201.png",
        "/Element%202.png",
        "/Element%203.png",
        "/Element%204.png",
        "/hdtry.png",
        "/bs-logo-white.png",
        "/bs-logo-black.png",
      ];
      await Promise.all(
        templateImages.map(
          (src) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = src;
            })
        )
      );
      setIsLoading(false);
    }
  };

  const updateMatch = (index: number, field: keyof MatchData, value: any) => {
    setExposeData((prev) => ({
      ...prev,
      matches: prev.matches.map((match, i) =>
        i === index ? { ...match, [field]: value } : match,
      ),
    }));
    setHasChanges(true);
  };

  const updateCandidateName = (value: string) => {
    setExposeData((prev) => ({
      ...prev,
      candidateName: value,
      cover: { ...prev.cover, candidateName: value },
    }));
    setHasChanges(true);
  };

  const updateCover = (field: keyof CoverData, value: string) => {
    setExposeData((prev) => ({
      ...prev,
      cover: { ...prev.cover, [field]: value },
    }));
    setHasChanges(true);
  };

  /** Build job shape for 2ndcv job template from dialog match data */
  const matchToJobForTemplate = (match: MatchData): JobForTemplate => ({
    title: match.jobTitle,
    created_at: new Date().toISOString(),
    location: match.jobLocation,
    employment_type: match.jobEmploymentType,
    salary_range: match.jobSalaryRange,
    description: match.jobDescription,
    responsibilities: match.jobResponsibilities,
    benefits: match.jobBenefits,
    clients: {
      name: match.companyName,
      website: match.companyWebsite,
      address: match.companyAddress,
      description: match.companyDescription,
      logo_url: match.companyLogoUrl,
    },
  });

  const addSkill = (matchIndex: number, skill: string) => {
    if (skill.trim()) {
      const currentSkills = exposeData.matches[matchIndex].jobSkills || [];
      if (!currentSkills.includes(skill.trim())) {
        updateMatch(matchIndex, "jobSkills", [...currentSkills, skill.trim()]);
      }
    }
  };

  const removeSkill = (matchIndex: number, skillToRemove: string) => {
    const currentSkills = exposeData.matches[matchIndex].jobSkills || [];
    updateMatch(
      matchIndex,
      "jobSkills",
      currentSkills.filter((s) => s !== skillToRemove),
    );
  };

  const handleGenerateExpose = async () => {
    try {
      setIsGenerating(true);
      toast({
        title: "Exposé wird generiert",
        description: "Bitte warten Sie einen Moment...",
      });

      const matchesForPdf = exposeData.matches.map((match) => ({
        jobTitle: match.jobTitle,
        jobDescription: match.jobDescription,
        jobRequirements: match.jobRequirements,
        jobResponsibilities: match.jobResponsibilities,
        jobBenefits: match.jobBenefits,
        jobLocation: match.jobLocation,
        jobSalaryRange: match.jobSalaryRange,
        jobEmploymentType: match.jobEmploymentType,
        jobExperienceLevel: match.jobExperienceLevel,
        jobSkills: match.jobSkills,
        companyName: match.companyName,
        companyIndustry: match.companyIndustry,
        companyWebsite: match.companyWebsite,
        companyAddress: match.companyAddress,
        companyDescription: match.companyDescription,
      }));

      const { data, error } = await supabase.functions.invoke(
        "generate-expose",
        {
          body: {
            candidateName: exposeData.candidateName,
            matches: matchesForPdf,
          },
        },
      );

      if (error) throw error;

      const blob = new Blob([data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exposeData.candidateName.replace(
        /\s+/g,
        "_",
      )}_Expose.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Log activity
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("activity_logs").insert({
          user_id: user.id,
          entity_type: "candidates",
          entity_id: candidateId,
          action: "EXPOSE_CREATED",
          new_data: {
            matches_count: exposeData.matches.length,
            candidate_name: exposeData.candidateName,
          },
        });
      }

      toast({
        title: t("toast.createSuccess"),
        description: `Exposé mit ${exposeData.matches.length} Position${
          exposeData.matches.length > 1 ? "en" : ""
        } erstellt.`,
      });
    } catch (error) {
      console.error("Error generating exposé:", error);
      toast({
        title: t("toast.error"),
        description: "Exposé konnte nicht generiert werden.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to parse HTML content and extract text for bullet points
  const parseHtmlToBulletPoints = (html: string): string => {
    if (!html) return "";

    // Check if it's HTML content
    if (
      html.includes("<li>") ||
      html.includes("<ul>") ||
      html.includes("<p>")
    ) {
      // Create a temporary div to parse HTML
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;

      // Extract text from list items
      const listItems = tempDiv.querySelectorAll("li");
      if (listItems.length > 0) {
        return Array.from(listItems)
          .map((li) => `• ${li.textContent?.trim() || ""}`)
          .filter((line) => line !== "• ")
          .join("\n");
      }

      // If no list items, extract paragraphs
      const paragraphs = tempDiv.querySelectorAll("p");
      if (paragraphs.length > 0) {
        return Array.from(paragraphs)
          .map((p) => p.textContent?.trim() || "")
          .filter((text) => text)
          .map((text) => `• ${text}`)
          .join("\n");
      }

      // Fallback to text content
      return tempDiv.textContent?.trim() || "";
    }

    // Not HTML, format as bullet points
    const lines = html.split("\n").filter((line) => line.trim());
    return lines
      .map((line) => {
        const trimmed = line.trim();
        if (
          trimmed.startsWith("•") ||
          trimmed.startsWith("-") ||
          trimmed.startsWith("*")
        ) {
          return trimmed.replace(/^[-*]/, "•");
        }
        return `• ${trimmed}`;
      })
      .join("\n");
  };

  // Editable text component - inline editing with same styling as preview
  const EditableText = ({
    value,
    matchIndex,
    fieldKey,
    className = "",
    multiline = false,
    placeholder = "Klicken zum Bearbeiten",
    asBulletPoints = false,
  }: {
    value: string;
    matchIndex: number;
    fieldKey: keyof MatchData;
    className?: string;
    multiline?: boolean;
    placeholder?: string;
    asBulletPoints?: boolean;
  }) => {
    const fieldId = `${matchIndex}-${fieldKey}`;
    const isEditing = editingField === fieldId;

    // Parse and display value - format as bullet points if needed
    const displayValue =
      asBulletPoints && value ? parseHtmlToBulletPoints(value) : value;

    const handleSave = () => {
      if (asBulletPoints && value) {
        updateMatch(matchIndex, fieldKey, parseHtmlToBulletPoints(value));
      }
      setEditingField(null);
    };

    if (isEditing) {
      return multiline ? (
        <div
          className="relative group"
          onBlur={(e) => {
            // Only close if clicking outside the container
            if (!e.currentTarget.contains(e.relatedTarget)) {
              handleSave();
            }
          }}
        >
          <textarea
            value={displayValue}
            onChange={(e) => updateMatch(matchIndex, fieldKey, e.target.value)}
            className="w-full bg-transparent border-none outline-none resize-none text-sm font-sans whitespace-pre-wrap focus:ring-1 focus:ring-primary/50 rounded p-1 -m-1"
            style={{ minHeight: "60px", height: "auto" }}
            autoFocus
            rows={displayValue ? displayValue.split("\n").length + 1 : 3}
          />
          <Button
            size="sm"
            variant="secondary"
            className="absolute -top-2 -right-2 h-6 w-6 p-0 shadow-md"
            onClick={handleSave}
          >
            <Check className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <input
          value={value}
          onChange={(e) => updateMatch(matchIndex, fieldKey, e.target.value)}
          className="bg-transparent border-none outline-none w-full focus:ring-1 focus:ring-primary/50 rounded px-1 -mx-1"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
          onBlur={() => setEditingField(null)}
        />
      );
    }

    return (
      <div
        className={`cursor-pointer hover:bg-primary/5 rounded px-1 -mx-1 transition-colors ${className} ${
          !value ? "text-muted-foreground italic" : ""
        }`}
        onClick={() => setEditingField(fieldId)}
      >
        {displayValue ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {displayValue}
          </pre>
        ) : (
          <span className="text-sm">{placeholder}</span>
        )}
      </div>
    );
  };

  const activeMatch = exposeData.matches[activeMatchIndex];
  const [newSkillInput, setNewSkillInput] = useState("");

  // Zoom controls
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.1, 1.2));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.1, 0.3));
  };

  /** Download a single PDF that contains: first the cover intro page, then all job exposé main pages. */
  // ... (keep all the imports and interfaces the same until handleDownloadAllAsPdf)
  // Add these utility functions at the top of your file
  const preloadImages = async (container: HTMLElement): Promise<void> => {
    const images = Array.from(container.querySelectorAll("img"));
    const promises = images.map((img) => {
      if (img.complete && img.naturalHeight !== 0) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        setTimeout(() => resolve(), 2000); // Timeout fallback
      });
    });
    await Promise.all(promises);
  };

  const fixHeaderImageRendering = (container: HTMLElement) => {
    // Find the header image and force explicit dimensions
    const headerImg = container.querySelector("header img");
    if (headerImg) {
      const img = headerImg as HTMLImageElement;
      // Force the image to maintain its rendered dimensions
      img.style.width = "830px";
      img.style.height = "320px";
      img.style.maxWidth = "none";
      img.style.minWidth = "830px";
      img.style.objectFit = "cover";
      img.style.objectPosition = "center top";
    }

    // Also fix any background images
    const header = container.querySelector("header");
    if (header) {
      const headerEl = header as HTMLElement;
      headerEl.style.height = "320px";
      headerEl.style.minHeight = "320px";
      headerEl.style.maxHeight = "320px";
      headerEl.style.overflow = "hidden";
    }
  };
  /** Download a single PDF that contains: first the cover intro page, then all job exposé main pages. */
  const handleDownloadAllAsPdf = async () => {
    if (!allPagesRef.current) {
      toast({
        title: t("toast.error"),
        description: "PDF Container nicht gefunden.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGenerating(true);

      // ✅ CRITICAL: Longer preload with forced image dimensions
      console.log("Preloading images...");
      await preloadImages(allPagesRef.current);

      // ✅ CRITICAL: Additional delay for Chrome to finish rendering
      await new Promise((resolve) => setTimeout(resolve, 500));

      const pageElements = Array.from(
        allPagesRef.current.querySelectorAll<HTMLElement>("[data-expose-page]"),
      );

      // ✅ CRITICAL: Force header layout BEFORE capture
      for (const el of pageElements) {
        el.style.width = "793px";
        el.style.minWidth = "793px";
        el.style.maxWidth = "793px";
        el.style.boxSizing = "border-box";

        const header = el.querySelector("header");
        if (header) {
          const headerEl = header as HTMLElement;
          headerEl.style.width = "793px";
          headerEl.style.height = "320px";
          headerEl.style.overflow = "hidden";
          headerEl.style.position = "relative";
          headerEl.style.backgroundColor = "#0a0a0a"; // Dark fallback

          // ✅ CRITICAL: Force image to cover full width
          const headerImg = headerEl.querySelector("img");
          if (headerImg) {
            const img = headerImg as HTMLImageElement;
            // Force reload image to ensure it's rendered
            const currentSrc = img.src;
            img.src = currentSrc;

            img.style.cssText = `
            width: 793px !important;
            height: 320px !important;
            object-fit: cover !important;
            object-position: center top !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            display: block !important;
            max-width: none !important;
            min-width: 793px !important;
          `;
          }

          // ✅ CRITICAL: Ensure overlay is on top
          const overlay = headerEl.querySelector("div");
          if (overlay) {
            (overlay as HTMLElement).style.zIndex = "10";
          }
        }
      }

      // Force browser reflow
      document.body.offsetHeight;

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const BLEED = 2;
      const SCALE = 3;

      if (pageElements.length === 0) {
        toast({
          title: t("toast.error"),
          description: "Keine Seiten zum Exportieren gefunden.",
          variant: "destructive",
        });
        return;
      }

      // Pre-rasterize cross-origin logo images to PNG data URLs
      const logoDataUrls = new Map<string, string>();
      for (const el of pageElements) {
        const imgs = el.querySelectorAll('img');
        for (const img of imgs) {
          if (img.src && img.src.startsWith('http') && !img.src.startsWith('data:')
              && !img.src.includes('/Element') && !img.src.includes('/WhatsApp')
              && !img.src.includes('/hdtry')) {
            if (!logoDataUrls.has(img.src)) {
              try {
                const response = await fetch(img.src);
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                const pngDataUrl = await new Promise<string>((resolve, reject) => {
                  const tempImg = new Image();
                  tempImg.crossOrigin = 'anonymous';
                  tempImg.onload = () => {
                    const rasterCanvas = document.createElement('canvas');
                    const scale = 3;
                    rasterCanvas.width = (tempImg.naturalWidth || 200) * scale;
                    rasterCanvas.height = (tempImg.naturalHeight || 200) * scale;
                    const ctx = rasterCanvas.getContext('2d');
                    if (ctx) {
                      ctx.scale(scale, scale);
                      ctx.drawImage(tempImg, 0, 0, tempImg.naturalWidth || 200, tempImg.naturalHeight || 200);
                    }
                    URL.revokeObjectURL(objectUrl);
                    resolve(rasterCanvas.toDataURL('image/png'));
                  };
                  tempImg.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('fail')); };
                  tempImg.src = objectUrl;
                });
                logoDataUrls.set(img.src, pngDataUrl);
              } catch (e) {
                console.warn('Could not rasterize logo:', e);
              }
            }
          }
        }
      }

      for (let i = 0; i < pageElements.length; i++) {
        const el = pageElements[i];
        const isIntroPage = i === 0;
        const bgColor = isIntroPage ? "#0a0a0a" : "#ffffff";

        let contentHeight: number;

        if (isIntroPage) {
          contentHeight = 1122;
          el.style.height = "1122px";
          el.style.minHeight = "1122px";
          el.style.maxHeight = "1122px";
        } else {
          el.style.height = "auto";
          el.style.minHeight = "auto";
          el.style.maxHeight = "none";
          el.offsetHeight;
          contentHeight = el.scrollHeight;
          if (contentHeight < 1122) contentHeight = 1122;
        }

        const captureOptions = {
          scale: SCALE,
          useCORS: true,
          allowTaint: true,
          backgroundColor: bgColor,
          logging: true,
          imageTimeout: 0,
          width: 793,
          height: contentHeight,
          windowWidth: 793,
          windowHeight: contentHeight,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,

          onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
            clonedElement.style.width = "793px";
            clonedElement.style.minWidth = "793px";
            clonedElement.style.maxWidth = "793px";
            clonedElement.style.boxSizing = "border-box";

            const header = clonedElement.querySelector("header");
            if (header) {
              const headerEl = header as HTMLElement;
              headerEl.style.width = "793px";
              headerEl.style.height = "320px";
              headerEl.style.overflow = "hidden";
              headerEl.style.position = "relative";
              headerEl.style.backgroundColor = "#0a0a0a";

              // ✅ CRITICAL: Force image dimensions in clone
              const img = headerEl.querySelector("img");
              if (img) {
                (img as HTMLElement).style.cssText = `
                width: 793px !important;
                height: 320px !important;
                object-fit: cover !important;
                object-position: center top !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                display: block !important;
                max-width: none !important;
                min-width: 793px !important;
              `;
              }

              // Preserve overlay
              const overlay = headerEl.querySelector("div");
              if (overlay) {
                (overlay as HTMLElement).style.cssText += `
                position: absolute !important;
                inset: 0 !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: flex-start !important;
                padding: 56px !important;
                z-index: 10 !important;
              `;
              }
            }

            // Clean transforms except header
            const allElements = clonedElement.querySelectorAll("*");
            allElements.forEach((el) => {
              if (el instanceof HTMLElement) {
                let parent = el.parentElement;
                let isInHeader = false;
                while (parent) {
                  if (parent.tagName === "HEADER") {
                    isInHeader = true;
                    break;
                  }
                  parent = parent.parentElement;
                }

                if (!isInHeader && el.tagName !== "HEADER") {
                  el.style.transform = "none";
                }
                el.style.backdropFilter = "none";
                el.style.filter = "none";
              }
            });

            // Fix: Replace \u00AD with \u200B — Canvas fillText renders \u00AD as visible glyph
            const walker = clonedDoc.createTreeWalker(clonedElement, NodeFilter.SHOW_TEXT);
            let textNode: Node | null;
            while ((textNode = walker.nextNode())) {
              if (textNode.textContent && textNode.textContent.includes("\u00AD")) {
                textNode.textContent = textNode.textContent.replace(/\u00AD/g, "\u200B");
              }
            }

            // Fix: Set overflowWrap to normal so html2canvas doesn't break at every character
            const h1Elements = clonedElement.querySelectorAll('h1');
            h1Elements.forEach((h1) => {
              if (h1 instanceof HTMLElement) {
                h1.style.overflowWrap = 'normal';
                h1.style.wordBreak = 'normal';
              }
            });

            // Fix: Replace cross-origin logo URLs with pre-rasterized PNG data URLs
            const clonedImgs = clonedElement.querySelectorAll('img');
            clonedImgs.forEach((img) => {
              const originalSrc = img.getAttribute('src') || '';
              for (const [origUrl, dataUrl] of logoDataUrls.entries()) {
                if (originalSrc === origUrl) {
                  img.src = dataUrl;
                  break;
                }
              }
            });

            // Fix: html2canvas does not support object-fit: contain.
            // Manually compute correct dimensions for company logo images.
            const logoImgs = clonedElement.querySelectorAll('img[class*="object-contain"]');
            logoImgs.forEach((img) => {
              if (img instanceof HTMLImageElement && img.naturalWidth && img.naturalHeight) {
                const containerW = 237;
                const containerH = 160;
                const imgRatio = img.naturalWidth / img.naturalHeight;
                const containerRatio = containerW / containerH;
                let renderW: number, renderH: number;
                if (imgRatio > containerRatio) {
                  renderW = containerW;
                  renderH = containerW / imgRatio;
                } else {
                  renderH = containerH;
                  renderW = containerH * imgRatio;
                }
                img.style.width = `${renderW}px`;
                img.style.height = `${renderH}px`;
                img.style.objectFit = 'fill';
                img.style.display = 'block';
                img.style.margin = 'auto';
              }
            });
          },
        };

        console.log(`Capturing page ${i + 1}/${pageElements.length}...`);

        // ✅ CRITICAL: Small delay before each capture
        await new Promise((resolve) => setTimeout(resolve, 100));

        const canvas = await html2canvas(el, captureOptions);
        console.log(`Page ${i + 1} canvas: ${canvas.width}×${canvas.height}`);

        if (isIntroPage) {
          const imgData = canvas.toDataURL("image/jpeg", 1.0);
          pdf.setFillColor(10, 10, 10);
          pdf.rect(0, 0, pdfWidth, pdfHeight);
          pdf.fill();
          pdf.addImage(
            imgData,
            "JPEG",
            -BLEED,
            0,
            pdfWidth + 2 * BLEED,
            pdfHeight,
            undefined,
            "FAST",
          );
        } else {
          const imgData = canvas.toDataURL("image/png", 1.0);
          const imgWidth = pdfWidth;
          const imgHeight = (canvas.height * pdfWidth) / canvas.width;

          pdf.addPage([pdfWidth, imgHeight], "p");
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, 0, pdfWidth, imgHeight);
          pdf.fill();

          pdf.addImage(
            imgData,
            "PNG",
            -BLEED,
            0,
            imgWidth + 2 * BLEED,
            imgHeight,
            undefined,
            "FAST",
          );
        }
      }

      pdf.save(`Expose_${exposeData.candidateName.replace(/\s+/g, "_")}.pdf`);

      toast({
        title: t("toast.createSuccess"),
        description: "Gesamtes Exposé als PDF heruntergeladen.",
      });
    } catch (err) {
      console.error("Combined Exposé PDF failed:", err);
      toast({
        title: t("toast.error"),
        description: "PDF konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setIsCapturingPdf(false);
    }
  };
  console.log("exposeData", exposeData);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Job Exposé Creator
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Header with Generate Button */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Klicken Sie auf die Texte um sie zu bearbeiten
                </p>
                {hasChanges && (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <Save className="h-4 w-4" />
                    Änderungen vorgenommen
                  </div>
                )}
              </div>
              <Button
                onClick={handleDownloadAllAsPdf}
                disabled={isGenerating || isCapturingPdf}
                size="lg"
              >
                <Download className="h-4 w-4 mr-2" />
                {isGenerating
                  ? "Wird generiert..."
                  : isCapturingPdf
                    ? "PDF wird erstellt..."
                    : "PDF Generieren"}
              </Button>
            </div>

            {/* Main Tabs: Cover + Positions */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="flex-shrink-0 w-full min-h-10 border-b border-border/40">
                <div
                  className="w-full overflow-x-auto overflow-y-hidden pb-px"
                  style={{ scrollbarGutter: "stable" }}
                >
                  <TabsList className="inline-flex w-max flex-nowrap h-10 items-center p-1 rounded-md bg-muted">
                    <TabsTrigger
                      value="cover"
                      className="flex-shrink-0 whitespace-nowrap px-3 py-1.5"
                    >
                      Cover
                    </TabsTrigger>
                    {exposeData.matches.map((match, index) => (
                      <TabsTrigger
                        key={match.id}
                        value={`position-${index}`}
                        className="flex-shrink-0 whitespace-nowrap px-3 py-1.5"
                      >
                        {index + 1}.{" "}
                        {match.jobTitle
                          ? match.jobTitle.length > 20
                            ? match.jobTitle.slice(0, 20) + "..."
                            : match.jobTitle
                          : "Position"}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </div>

              {/* Cover Tab Content: only the job exposé intro page */}
              <TabsContent
                value="cover"
                className="flex-1 mt-4 relative overflow-auto scrollbar-hide"
              >
                <div className="bg-muted/30 rounded-lg p-4 flex items-start justify-center">
                  <div
                    className="origin-top transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel})` }}
                  >
                    {activeMatch ? (
                      <PrintPage
                        job={matchToJobForTemplate(activeMatch)}
                        introSubtitleOverride={
                          exposeData.cover.candidateName
                            ? `${exposeData.cover.candidateName}`
                            : undefined
                        }
                        presenterName={exposeData.cover.preparedBy}
                        presenterEmail={exposeData.cover.preparedByEmail}
                        presenterPhone={exposeData.cover.preparedByPhone}
                        companyOverride={{
                          name: exposeData.cover.companyName,
                          email: exposeData.cover.companyEmail,
                          phone: exposeData.cover.companyPhone,
                          website: exposeData.cover.companyWebsite,
                        }}
                        hideDownloadButton={true}
                        showIntro={true}
                        showCv={false}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Keine Position ausgewählt.
                      </div>
                    )}
                  </div>
                </div>
                {/* Navigation Buttons */}
                {activeMatch && (activeMatch.jobId || activeMatch.clientId) && (
                  <div className="absolute bottom-20 right-6 flex flex-col gap-1 bg-background/90 backdrop-blur-sm border rounded-lg p-1 shadow-lg">
                    {activeMatch.jobId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => {
                          onNavigateAway?.({ candidateId, candidateName: exposeData.candidateName, activeTab });
                          navigate(`/jobs/${activeMatch.jobId}`, { state: { from: '/pipeline', exposeCreator: { candidateId, candidateName: exposeData.candidateName, activeTab } } });
                        }}
                      >
                        <Briefcase className="h-3.5 w-3.5" />
                        Zur Stelle
                      </Button>
                    )}
                    {activeMatch.clientId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => {
                          onNavigateAway?.({ candidateId, candidateName: exposeData.candidateName, activeTab });
                          navigate(`/clients/${activeMatch.clientId}`, { state: { from: '/pipeline', exposeCreator: { candidateId, candidateName: exposeData.candidateName, activeTab } } });
                        }}
                      >
                        <Building2 className="h-3.5 w-3.5" />
                        Zum Klienten
                      </Button>
                    )}
                  </div>
                )}
                {/* Zoom Controls */}
                <div className="absolute bottom-6 right-6 flex items-center gap-1 bg-background/90 backdrop-blur-sm border rounded-lg p-1 shadow-lg">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleZoomOut}
                    disabled={zoomLevel <= 0.3}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-medium w-12 text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleZoomIn}
                    disabled={zoomLevel >= 1.2}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Position Tabs Content */}
              {exposeData.matches.map((match, index) => (
                <TabsContent
                  key={match.id}
                  value={`position-${index}`}
                  className="flex-1 mt-4 relative overflow-auto scrollbar-hide"
                >
                  <div className="bg-muted/30 rounded-lg p-4 flex items-start justify-center">
                    {/* Dark background wrapper that covers any white gaps from scaling */}
                    <div
                      className="origin-top transition-transform duration-200 relative"
                      style={{
                        transform: `scale(${isCapturingPdf ? 1 : zoomLevel})`,

                        padding: "2px", // Extend slightly to cover edges
                        margin: "-2px", // Compensate for padding
                      }}
                    >
                      <PrintPage
                        job={matchToJobForTemplate(match)}
                        presenterName={exposeData.cover.preparedBy}
                        presenterEmail={exposeData.cover.preparedByEmail}
                        presenterPhone={exposeData.cover.preparedByPhone}
                        companyOverride={{
                          name: exposeData.cover.companyName,
                          email: exposeData.cover.companyEmail,
                          phone: exposeData.cover.companyPhone,
                          website: exposeData.cover.companyWebsite,
                        }}
                        hideDownloadButton={true}
                        triggerDownloadRef={printDownloadRef}
                        onDownloadComplete={() => setIsCapturingPdf(false)}
                        showIntro={false}
                        showCv={true}
                      />
                    </div>
                  </div>
                  {/* Navigation Buttons */}
                  {(match.jobId || match.clientId) && (
                    <div className="absolute bottom-20 right-6 flex flex-col gap-1 bg-background/90 backdrop-blur-sm border rounded-lg p-1 shadow-lg">
                      {match.jobId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={() => {
                            onNavigateAway?.({ candidateId, candidateName: exposeData.candidateName, activeTab });
                            navigate(`/jobs/${match.jobId}`, { state: { from: '/pipeline', exposeCreator: { candidateId, candidateName: exposeData.candidateName, activeTab } } });
                          }}
                        >
                          <Briefcase className="h-3.5 w-3.5" />
                          Zur Stelle
                        </Button>
                      )}
                      {match.clientId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={() => {
                            onNavigateAway?.({ candidateId, candidateName: exposeData.candidateName, activeTab });
                            navigate(`/clients/${match.clientId}`, { state: { from: '/pipeline', exposeCreator: { candidateId, candidateName: exposeData.candidateName, activeTab } } });
                          }}
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          Zum Klienten
                        </Button>
                      )}
                    </div>
                  )}
                  {/* Zoom Controls */}
                  <div className="absolute bottom-6 right-6 flex items-center gap-1 bg-background/90 backdrop-blur-sm border rounded-lg p-1 shadow-lg">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleZoomOut}
                      disabled={zoomLevel <= 0.3}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-medium w-12 text-center">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleZoomIn}
                      disabled={zoomLevel >= 1.2}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            {/* Hidden container that renders all pages (cover + all positions) for combined PDF generation */}
            <div
              ref={allPagesRef}
              className="fixed left-0 top-0 flex flex-col gap-4 bg-white"
              style={{ opacity: 0, pointerEvents: 'none', zIndex: -1 }}
            >
              {/* First page: intro/cover page based on the currently active match (or first match as fallback) */}
              {(activeMatch || exposeData.matches[0]) && (
                <div data-expose-page>
                  <PrintPage
                    job={matchToJobForTemplate(
                      activeMatch || exposeData.matches[0],
                    )}
                    introSubtitleOverride={
                      exposeData.cover.candidateName
                        ? `${exposeData.cover.candidateName}`
                        : undefined
                    }
                    presenterName={exposeData.cover.preparedBy}
                    presenterEmail={exposeData.cover.preparedByEmail}
                    presenterPhone={exposeData.cover.preparedByPhone}
                    companyOverride={{
                      name: exposeData.cover.companyName,
                      email: exposeData.cover.companyEmail,
                      phone: exposeData.cover.companyPhone,
                      website: exposeData.cover.companyWebsite,
                    }}
                    hideDownloadButton={true}
                    showIntro={true}
                    showCv={false}
                  />
                </div>
              )}

              {/* Following pages: main exposé pages for each position */}
              {exposeData.matches.map((match) => (
                <div key={match.id} data-expose-page>
                  <PrintPage
                    job={matchToJobForTemplate(match)}
                    presenterName={exposeData.cover.preparedBy}
                    presenterEmail={exposeData.cover.preparedByEmail}
                    presenterPhone={exposeData.cover.preparedByPhone}
                    companyOverride={{
                      name: exposeData.cover.companyName,
                      email: exposeData.cover.companyEmail,
                      phone: exposeData.cover.companyPhone,
                      website: exposeData.cover.companyWebsite,
                    }}
                    hideDownloadButton={true}
                    showIntro={false}
                    showCv={true}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
