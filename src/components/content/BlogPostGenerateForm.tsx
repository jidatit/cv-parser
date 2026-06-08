import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BlogPostGenerateFormProps {
  onGenerated: (data: any) => void;
}

export function BlogPostGenerateForm({ onGenerated }: BlogPostGenerateFormProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [targetAudience, setTargetAudience] = useState('candidates');
  const [language, setLanguage] = useState('de');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: t("content.topicRequired"), variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-blog-post', {
        body: {
          topic: topic.trim(),
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
          target_audience: targetAudience,
          language,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      onGenerated(data);
      toast({ title: t("content.articleGenerated") });
    } catch (e: any) {
      console.error('Generation error:', e);
      toast({ title: t("content.generateError"), description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          {t("content.aiGenerate")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>{t("content.topic")}</Label>
          <Input
            placeholder={t("content.topicPlaceholder")}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div>
          <Label>{t("content.keywords")} ({t("common.optional")})</Label>
          <Input
            placeholder={t("content.keywordsPlaceholder")}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t("content.targetAudience")}</Label>
            <Select value={targetAudience} onValueChange={setTargetAudience}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="candidates">{t("content.audienceCandidates")}</SelectItem>
                <SelectItem value="clients">{t("content.audienceClients")}</SelectItem>
                <SelectItem value="both">{t("content.audienceBoth")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("settings.language")}</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating || !topic.trim()} className="w-full">
          {isGenerating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("content.generating")}</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" />{t("content.generateArticle")}</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
