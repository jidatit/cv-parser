import {
  useState,
  useRef,
  useEffect,
  useCallback,
  TextareaHTMLAttributes,
} from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Trophy,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  Loader2,
  RefreshCw,
  Heart,
  Wand2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "./ui/richText-editor";

// Auto-resizing textarea component (keep for AI Summary which is plain text)
interface AutoResizeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minHeight?: number;
}

function AutoResizeTextarea({
  value,
  onChange,
  className,
  minHeight = 80,
  ...props
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      className={cn(
        "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

interface CandidateInsightsProps {
  candidateId: string;
  candidateData: {
    name: string;
    position?: string;
    desired_position?: string;
    industry?: string;
    experience?: string;
    skills?: string[];
    education?: any[];
    work_experience?: any[];
    languages?: any[];
    awards_publications?: any[];
    summary?: string;
    reason_for_change?: string;
    ai_summary?: string;
    signature_achievements?: string[];
    growth_potential?: string[];
    most_proud_of?: string;
    potential_risks?: string;
    insights_notes?: string;
    candidate_values?: string[];
  };
  onUpdate: (updates: Record<string, any>) => Promise<void>;
}

/** Parse text so only lines starting with "•" start a new bullet; other lines continue the previous bullet */
const parseBulletPoints = (text: string): string[] => {
  if (!text || !text.trim()) return [];
  const lines = text.split("\n");
  const result: string[] = [];
  let current = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("•")) {
      if (current) {
        result.push(current.trim());
        current = "";
      }
      current = trimmed.replace(/^•\s*/, "").trim();
    } else {
      if (current) current += "\n" + line.trim();
      else if (trimmed) current = trimmed;
    }
  }
  if (current) result.push(current.trim());
  return result;
};

// Decode HTML entities (&nbsp;, &amp;, etc.) to their actual characters
const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value.replace(/\u00A0/g, ' ');
};

// Helper to render description with proper bullet points OR existing HTML
const renderDescription = (description: string) => {
  if (!description) return null;

  // If content already contains HTML tags (e.g. from RichTextEditor),
  // render it as HTML so lists and formatting are shown correctly.
  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(description);
  if (hasHtmlTags) {
    return (
      <div
        className="text-sm text-muted-foreground w-full [&_ul]:w-full [&_ul]:space-y-2 [&_li]:break-words [&_li]:min-w-0"
        // Content comes from our own editor, so this is safe in this context
        dangerouslySetInnerHTML={{ __html: description }}
      />
    );
  }

  // Decode HTML entities before rendering as plain text
  description = decodeHtmlEntities(description);

  // Plain-text: only "•" at line start starts a new bullet; text takes full width, continuation lines align with first line
  const bullets = parseBulletPoints(description);
  if (bullets.length === 0) return null;
  return (
    <ul className="text-sm space-y-2 w-full list-none pl-0">
      {bullets.map((content, i) => (
        <li key={i} className="flex w-full gap-2 text-muted-foreground">
          <span className="text-primary flex-shrink-0 mt-0.5" aria-hidden>
            •
          </span>
          <span className="flex-1 min-w-0 break-words whitespace-pre-line">
            {content}
          </span>
        </li>
      ))}
    </ul>
  );
};

export function CandidateInsights({
  candidateId,
  candidateData,
  onUpdate,
}: CandidateInsightsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingGrowth, setIsGeneratingGrowth] = useState(false);
  const [isGeneratingRisks, setIsGeneratingRisks] = useState(false);
  const [isProcessingAchievements, setIsProcessingAchievements] =
    useState(false);
  const [isProcessingRisks, setIsProcessingRisks] = useState(false);
  const [isProcessingNotes, setIsProcessingNotes] = useState(false);
  const [isProcessingProud, setIsProcessingProud] = useState(false);

  const [editingAchievements, setEditingAchievements] = useState(false);
  const [editingMostProud, setEditingMostProud] = useState(false);
  const [editingRisks, setEditingRisks] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [editingGrowth, setEditingGrowth] = useState(false);
  const [editingValues, setEditingValues] = useState(false);
  const [tempValues, setTempValues] = useState(
    (candidateData.candidate_values || []).join(", "),
  );

  // Convert array to bullet-point string for editing
  const arrayToBulletString = (arr: string[] | undefined): string => {
    if (!arr || arr.length === 0) return "";
    return arr.map((item) => `• ${item}`).join("\n");
  };

  const [tempAchievements, setTempAchievements] = useState(
    arrayToBulletString(candidateData.signature_achievements),
  );
  const [tempMostProud, setTempMostProud] = useState(
    candidateData.most_proud_of || "",
  );
  const [tempRisks, setTempRisks] = useState(
    candidateData.potential_risks || "",
  );
  const [tempNotes, setTempNotes] = useState(
    candidateData.insights_notes || "",
  );
  const [tempSummary, setTempSummary] = useState(candidateData.summary || "");
  const [tempGrowth, setTempGrowth] = useState(
    arrayToBulletString(candidateData.growth_potential),
  );

  const generateAISummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-candidate-summary",
        {
          body: { candidateData, skipCache: true },
        },
      );

      if (error) throw error;

      await onUpdate({ summary: data.summary });
      setTempSummary(data.summary ?? "");
      toast({
        title: t("candidateInsights.summaryGenerated"),
        description: t("candidateInsights.summaryGeneratedDesc"),
      });
    } catch (error) {
      console.error("Error generating summary:", error);
      toast({
        title: t("toast.error"),
        description: t("candidateInsights.summaryError"),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const generateGrowthPotential = async () => {
    setIsGeneratingGrowth(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-candidate-summary",
        {
          body: { candidateData, type: "growth" },
        },
      );

      if (error) throw error;

      await onUpdate({ growth_potential: data.growth_potential });
      toast({
        title: t("candidateInsights.growthGenerated"),
        description: t("candidateInsights.growthGeneratedDesc"),
      });
    } catch (error) {
      console.error("Error generating growth potential:", error);
      toast({
        title: t("toast.error"),
        description: t("candidateInsights.analysisError"),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingGrowth(false);
    }
  };

  const generatePotentialRisks = async () => {
    setIsGeneratingRisks(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-candidate-summary",
        {
          body: { candidateData, type: "generate_risks" },
        },
      );

      if (error) throw error;

      const formattedRisks = Array.isArray(data.potential_risks)
        ? data.potential_risks.map((r: string) => `• ${r}`).join("\n")
        : data.potential_risks;

      await onUpdate({ potential_risks: formattedRisks });
      setTempRisks(formattedRisks);
      toast({
        title: t("candidateInsights.risksGenerated"),
        description: t("candidateInsights.risksGeneratedDesc"),
      });
    } catch (error) {
      console.error("Error generating potential risks:", error);
      toast({
        title: t("toast.error"),
        description: t("candidateInsights.analysisError"),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingRisks(false);
    }
  };

  const processWithAI = async (
    type: "achievements" | "risks" | "notes" | "proud",
    inputText: string,
    setProcessing: (v: boolean) => void,
  ) => {
    if (!inputText.trim()) {
      toast({
        title: t("candidateInsights.noTextPresent"),
        description: t("candidateInsights.noTextPresentDesc"),
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-candidate-summary",
        {
          body: { candidateData, type, inputText },
        },
      );

      if (error) throw error;

      const resultKey =
        type === "achievements"
          ? "signature_achievements"
          : type === "risks"
            ? "potential_risks"
            : type === "proud"
              ? "most_proud_of"
              : "insights_notes";
      const result = data[resultKey];

      if (type === "achievements") {
        await onUpdate({ signature_achievements: result });
        setTempAchievements(arrayToBulletString(result));
        setEditingAchievements(false);
      } else if (type === "risks") {
        const formattedRisks = Array.isArray(result)
          ? result.map((r) => `• ${r}`).join("\n")
          : result;
        await onUpdate({ potential_risks: formattedRisks });
        setTempRisks(formattedRisks);
        setEditingRisks(false);
      } else if (type === "proud") {
        const formattedProud = Array.isArray(result)
          ? result.map((p) => `• ${p}`).join("\n")
          : result;
        await onUpdate({ most_proud_of: formattedProud });
        setTempMostProud(formattedProud);
        setEditingMostProud(false);
      } else {
        const formattedNotes = Array.isArray(result)
          ? result.map((n) => `• ${n}`).join("\n")
          : result;
        // Check if values were also returned for notes type
        const valuesResult = data.candidate_values;
        const updatePayload: Record<string, any> = {
          insights_notes: formattedNotes,
        };
        if (valuesResult && Array.isArray(valuesResult)) {
          updatePayload.candidate_values = valuesResult.slice(0, 3);
        }
        await onUpdate(updatePayload);
        setTempNotes(formattedNotes);
        setEditingNotes(false);
      }

      toast({
        title: t("candidateInsights.aiProcessingComplete"),
        description: t("candidateInsights.aiProcessingCompleteDesc"),
      });
    } catch (error) {
      console.error("Error processing with AI:", error);
      toast({
        title: t("toast.error"),
        description: t("candidateInsights.aiProcessingError"),
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const saveAchievements = async () => {
    // Only lines starting with "•" start a new bullet; line breaks within a bullet stay as one item
    const achievements = parseBulletPoints(tempAchievements);
    await onUpdate({ signature_achievements: achievements });
    setEditingAchievements(false);
  };

  const cleanHtmlEntities = (text: string) => text.replace(/&nbsp;/g, ' ').replace(/\u00A0/g, ' ');

  const saveMostProud = async () => {
    const cleaned = cleanHtmlEntities(tempMostProud);
    await onUpdate({ most_proud_of: cleaned });
    setTempMostProud(cleaned);
    setEditingMostProud(false);
  };

  const saveRisks = async () => {
    const cleaned = cleanHtmlEntities(tempRisks);
    await onUpdate({ potential_risks: cleaned });
    setTempRisks(cleaned);
    setEditingRisks(false);
  };

  const saveNotes = async () => {
    const cleaned = cleanHtmlEntities(tempNotes);
    await onUpdate({ insights_notes: cleaned });
    setTempNotes(cleaned);
    setEditingNotes(false);
  };

  const saveSummary = async () => {
    await onUpdate({ summary: tempSummary });
    setEditingSummary(false);
  };

  const saveGrowth = async () => {
    // Only lines starting with "•" start a new bullet; line breaks within a bullet stay as one item
    const growthPoints = parseBulletPoints(tempGrowth);
    await onUpdate({ growth_potential: growthPoints });
    setEditingGrowth(false);
  };

  const saveValues = async () => {
    const cleanedValues = Array.from(
      new Set(
        tempValues
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v !== ""),
      ),
    ).slice(0, 3);
    await onUpdate({ candidate_values: cleanedValues });
    setTempValues(cleanedValues.join(", "));
    setEditingValues(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {t("candidateInsights.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary - Keep as plain textarea since it's a paragraph */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              {t("candidateInsights.summary")}
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={generateAISummary}
              disabled={isGeneratingSummary}
              className="h-7 text-xs"
            >
              {isGeneratingSummary ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : candidateData.summary ? (
                <RefreshCw className="h-3 w-3 mr-1" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              {candidateData.summary ? t("candidateInsights.regenerate") : t("candidateInsights.generate")}
            </Button>
          </div>
          {editingSummary ? (
            <div className="space-y-2">
              <AutoResizeTextarea
                value={tempSummary}
                onChange={(e) => setTempSummary(e.target.value)}
                placeholder="Zusammenfassung bearbeiten..."
                className="text-sm"
                minHeight={80}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveSummary} className="h-7 text-xs">
                  {t("common.save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingSummary(false)}
                  className="h-7 text-xs"
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : candidateData.summary ? (
            <p
              onDoubleClick={() => {
                setTempSummary(candidateData.summary || "");
                setEditingSummary(true);
              }}
              className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3 leading-relaxed cursor-pointer hover:bg-muted/50 transition-colors"
              title="Doppelklick zum Bearbeiten"
            >
              {candidateData.summary}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {t("candidateInsights.generateHint")}
            </p>
          )}
        </div>

        <Separator />

        {/* Personal Information */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
              {t("candidateInsights.personalInfo")}
          </h4>

          {/* Growth Potential - Use RichTextEditor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Growth Potential (KI)
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={generateGrowthPotential}
                disabled={isGeneratingGrowth}
                className="h-6 text-xs"
              >
                {isGeneratingGrowth ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : candidateData.growth_potential?.length ? (
                  <RefreshCw className="h-3 w-3 mr-1" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1" />
                )}
                {candidateData.growth_potential?.length ? t("candidateInsights.regenerate") : t("candidateInsights.generate")}
              </Button>
            </div>
            {editingGrowth ? (
              <div className="space-y-2">
                <RichTextEditor
                  value={tempGrowth}
                  onChange={setTempGrowth}
                  placeholder="Growth Potential bearbeiten... (Bullet-Punkte mit • beginnen)"
                />
                <div className="flex gap-2">
                    <Button
                    size="sm"
                    onClick={saveGrowth}
                    className="h-7 text-xs"
                  >
                    {t("common.save")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingGrowth(false)}
                    className="h-7 text-xs"
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : candidateData.growth_potential?.length ? (
              <div
                onDoubleClick={() => {
                  setTempGrowth(
                    arrayToBulletString(candidateData.growth_potential),
                  );
                  setEditingGrowth(true);
                }}
                className="cursor-pointer hover:bg-muted/30 rounded-lg p-2 -m-2 transition-colors"
                title="Doppelklick zum Bearbeiten"
              >
                {renderDescription(
                  arrayToBulletString(candidateData.growth_potential),
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                KI-Analyse des Entwicklungspotentials
              </p>
            )}
          </div>

          {/* Most Proud Of - Use RichTextEditor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Heart className="h-3 w-3 text-red-400" />
                Most Proud Of
              </span>
              {editingMostProud && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    processWithAI("proud", tempMostProud, setIsProcessingProud)
                  }
                  disabled={isProcessingProud}
                  className="h-7 text-xs"
                >
                  {isProcessingProud ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Wand2 className="h-3 w-3 mr-1" />
                  )}
                  {t("candidateInsights.aiFormat", "KI formatieren")}
                </Button>
              )}
            </div>
            {editingMostProud ? (
              <div className="space-y-2">
                <RichTextEditor
                  value={tempMostProud}
                  onChange={setTempMostProud}
                  placeholder="Stichworte worauf der Kandidat stolz ist..."
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={saveMostProud}
                    className="h-7 text-xs"
                  >
                    {t("common.save")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingMostProud(false)}
                    className="h-7 text-xs"
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onDoubleClick={() => {
                  setTempMostProud(candidateData.most_proud_of || "");
                  setEditingMostProud(true);
                }}
                className="text-sm bg-muted/30 rounded-lg p-2 cursor-pointer hover:bg-muted/50 transition-colors min-h-[40px]"
                title="Doppelklick zum Bearbeiten"
              >
                {candidateData.most_proud_of ? (
                  renderDescription(candidateData.most_proud_of)
                ) : (
                  <span className="italic text-muted-foreground">
                    Doppelklick zum Bearbeiten...
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Signature Achievements - Use RichTextEditor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              Signature Achievements
            </h4>
            {editingAchievements && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  processWithAI(
                    "achievements",
                    tempAchievements,
                    setIsProcessingAchievements,
                  )
                }
                disabled={isProcessingAchievements}
                className="h-7 text-xs"
              >
                {isProcessingAchievements ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Wand2 className="h-3 w-3 mr-1" />
                )}
                  {t("candidateInsights.aiFormat", "KI formatieren")}
                </Button>
            )}
          </div>
          {editingAchievements ? (
            <div className="space-y-2 w-full">
              <RichTextEditor
                value={tempAchievements}
                onChange={setTempAchievements}
                placeholder="Stichworte oder kurze Beschreibungen der Achievements..."
                className="w-full"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={saveAchievements}
                  className="h-7 text-xs"
                >
                  {t("common.save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingAchievements(false)}
                  className="h-7 text-xs"
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div
              onDoubleClick={() => {
                setTempAchievements(
                  arrayToBulletString(candidateData.signature_achievements),
                );
                setEditingAchievements(true);
              }}
              className="text-sm bg-muted/30 rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors min-h-[60px] w-full"
              title="Doppelklick zum Bearbeiten"
            >
              {candidateData.signature_achievements?.length ? (
                <div className="w-full">
                  {renderDescription(
                    arrayToBulletString(candidateData.signature_achievements),
                  )}
                </div>
              ) : (
                <span className="italic text-muted-foreground">
                  Doppelklick zum Bearbeiten...
                </span>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Potential Risks & Assumptions - Use RichTextEditor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
              Potential Risks & Assumptions (KI)
            </h4>
            <div className="flex items-center gap-1">
              {!editingRisks && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generatePotentialRisks}
                  disabled={isGeneratingRisks}
                  className="h-6 text-xs"
                >
                  {isGeneratingRisks ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : candidateData.potential_risks ? (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  {candidateData.potential_risks ? t("candidateInsights.regenerate") : t("candidateInsights.generate")}
                </Button>
              )}
              {editingRisks && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    processWithAI("risks", tempRisks, setIsProcessingRisks)
                  }
                  disabled={isProcessingRisks}
                  className="h-7 text-xs"
                >
                  {isProcessingRisks ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Wand2 className="h-3 w-3 mr-1" />
                  )}
                  {t("candidateInsights.aiFormat", "KI formatieren")}
                </Button>
              )}
            </div>
          </div>
          {editingRisks ? (
            <div className="space-y-2">
              <RichTextEditor
                value={tempRisks}
                onChange={setTempRisks}
                placeholder="Stichworte zu möglichen Risiken..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveRisks} className="h-7 text-xs">
                  {t("common.save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingRisks(false)}
                  className="h-7 text-xs"
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div
              onDoubleClick={() => {
                setTempRisks(candidateData.potential_risks || "");
                setEditingRisks(true);
              }}
              className="text-sm bg-muted/30 rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors min-h-[60px]"
              title="Doppelklick zum Bearbeiten"
            >
              {candidateData.potential_risks ? (
                renderDescription(candidateData.potential_risks)
              ) : (
                <span className="italic text-muted-foreground">
                  Doppelklick zum Bearbeiten...
                </span>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Insights Notes - Use RichTextEditor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-purple-500" />
              Insights Notes
            </h4>
            {editingNotes && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  processWithAI("notes", tempNotes, setIsProcessingNotes)
                }
                disabled={isProcessingNotes}
                className="h-7 text-xs"
              >
                {isProcessingNotes ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Wand2 className="h-3 w-3 mr-1" />
                )}
                {t("candidateInsights.aiFormat", "KI formatieren")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Persönliche Einschätzung zum Kandidaten
          </p>
          {editingNotes ? (
            <div className="space-y-2">
              <RichTextEditor
                value={tempNotes}
                onChange={setTempNotes}
                placeholder="Stichworte zur persönlichen Einschätzung..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveNotes} className="h-7 text-xs">
                  {t("common.save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingNotes(false)}
                  className="h-7 text-xs"
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                onDoubleClick={() => {
                  setTempNotes(candidateData.insights_notes || "");
                  setEditingNotes(true);
                }}
                className="text-sm bg-muted/30 rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors min-h-[80px]"
                title="Doppelklick zum Bearbeiten"
              >
                {candidateData.insights_notes ? (
                  renderDescription(candidateData.insights_notes)
                ) : (
                  <span className="italic text-muted-foreground">
                    Doppelklick zum Bearbeiten...
                  </span>
                )}
              </div>
              {/* Candidate Values */}
              {editingValues ? (
                <div className="space-y-2">
                  <Input
                    value={tempValues}
                    onChange={(e) => setTempValues(e.target.value)}
                    placeholder="z. B. Verlässlichkeit, Teamgeist, Innovation"
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Kommagetrennt, maximal 3 Werte
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={saveValues}
                      className="h-7 text-xs"
                    >
                      {t("common.save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTempValues(
                          (candidateData.candidate_values || []).join(", "),
                        );
                        setEditingValues(false);
                      }}
                      className="h-7 text-xs"
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : candidateData.candidate_values &&
                candidateData.candidate_values.length > 0 ? (
                <div
                  onDoubleClick={() => {
                    setTempValues(
                      (candidateData.candidate_values || []).join(", "),
                    );
                    setEditingValues(true);
                  }}
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                  title="Doppelklick zum Bearbeiten"
                >
                  <span className="font-medium text-foreground">Werte: </span>
                  {candidateData.candidate_values.slice(0, 3).join(", ")}
                </div>
              ) : (
                <div
                  onDoubleClick={() => {
                    setTempValues("");
                    setEditingValues(true);
                  }}
                  className="text-xs italic text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                  title="Doppelklick zum Bearbeiten"
                >
                  + Werte hinzufügen (Doppelklick)
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
