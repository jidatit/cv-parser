import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Save, Globe, Clock, CalendarIcon, Eye, Archive, Sparkles, X } from "lucide-react";
import { format } from "date-fns";
import { de as deLocale } from "date-fns/locale";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/ui/richText-editor";


interface BlogPostEditorProps {
  post?: any;
  generatedData?: any;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function BlogPostEditor({ post, generatedData, open, onClose, onSaved }: BlogPostEditorProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');
  const [targetAudience, setTargetAudience] = useState('candidates');
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('de');
  const [publishDate, setPublishDate] = useState<Date | undefined>();
  const [featuredImageUrl, setFeaturedImageUrl] = useState('');

  useEffect(() => {
    if (post) {
      setTitle(post.title || '');
      setSlug(post.slug || '');
      setContentHtml(post.content_html || '');
      setExcerpt(post.excerpt || '');
      setMetaDescription(post.meta_description || '');
      setSeoKeywords((post.seo_keywords || []).join(', '));
      setTargetAudience(post.target_audience || 'candidates');
      setCategory(post.category || '');
      setLanguage(post.language || 'de');
      setPublishDate(post.published_at ? new Date(post.published_at) : undefined);
      setFeaturedImageUrl(post.featured_image_url || '');
    } else if (generatedData) {
      setTitle(generatedData.title || '');
      setSlug(generatedData.slug || '');
      setContentHtml(generatedData.content_html || '');
      setExcerpt(generatedData.excerpt || '');
      setMetaDescription(generatedData.meta_description || '');
      setSeoKeywords((generatedData.seo_keywords || []).join(', '));
      setTargetAudience(generatedData.target_audience || 'candidates');
      setCategory(generatedData.category || '');
      setLanguage(generatedData.language || 'de');
    } else {
      setTitle(''); setSlug(''); setContentHtml(''); setExcerpt('');
      setMetaDescription(''); setSeoKeywords(''); setTargetAudience('candidates');
      setCategory(''); setLanguage('de'); setPublishDate(undefined); setFeaturedImageUrl('');
    }
  }, [post, generatedData]);

  const generateSlug = (text: string) => {
    return text.toLowerCase()
      .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!post) setSlug(generateSlug(val));
  };

  const countWords = (html: string) => {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? text.split(' ').length : 0;
  };

  const save = async (status: string) => {
    if (!title.trim()) {
      toast({ title: t("toast.fillAtLeastTitle"), variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const postData: any = {
        title: title.trim(),
        slug: slug.trim() || generateSlug(title),
        content_html: contentHtml,
        excerpt: excerpt.trim(),
        meta_description: metaDescription.trim(),
        seo_keywords: seoKeywords.split(',').map(k => k.trim()).filter(Boolean),
        status,
        target_audience: targetAudience,
        category: category.trim() || null,
        language,
        featured_image_url: featuredImageUrl.trim() || null,
        word_count: countWords(contentHtml),
        ai_generated: generatedData?.ai_generated || post?.ai_generated || false,
      };

      if (status === 'published' && !post?.published_at) {
        postData.published_at = new Date().toISOString();
      } else if (status === 'scheduled' && publishDate) {
        postData.published_at = publishDate.toISOString();
      }

      if (post?.id) {
        const { error } = await supabase.from('blog_posts').update(postData).eq('id', post.id);
        if (error) throw error;
      } else {
        postData.user_id = user.id;
        const { error } = await supabase.from('blog_posts').insert(postData);
        if (error) throw error;
      }

      toast({ title: t("toast.saveSuccess") });
      onSaved();
      onClose();
    } catch (e: any) {
      console.error('Save error:', e);
      toast({ title: t("toast.saveError"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const categories = ['Arbeitsmarkt', 'Karrieretipps', 'Branchennews', 'Recruiting-Wissen', 'Gehaltsreport'];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{post ? t("content.editArticle") : t("content.newArticle")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main editor area */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <Label>{t("common.title")}</Label>
              <Input value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder={t("content.titlePlaceholder")} />
            </div>

            <div>
              <Label>{t("content.content")}</Label>
              <RichTextEditor value={contentHtml} onChange={setContentHtml} />
            </div>

            <div>
              <Label>{t("content.excerpt")}</Label>
              <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} placeholder={t("content.excerptPlaceholder")} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* SEO Preview */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" /> {t("content.seoPreview")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-primary text-sm font-medium truncate">{title || t("content.titlePlaceholder")}</p>
                <p className="text-xs text-muted-foreground truncate">/{slug || 'url-slug'}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{metaDescription || t("content.metaDescPlaceholder")}</p>
              </CardContent>
            </Card>

            {/* Meta */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <Label className="text-xs">{t("content.slug")}</Label>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("content.metaDescription")}</Label>
                  <Textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={2} className="text-sm" />
                  <p className="text-xs text-muted-foreground mt-1">{metaDescription.length}/160</p>
                </div>
                <div>
                  <Label className="text-xs">{t("content.seoKeywords")}</Label>
                  <Input value={seoKeywords} onChange={(e) => setSeoKeywords(e.target.value)} className="h-8 text-sm" placeholder="keyword1, keyword2" />
                </div>
              </CardContent>
            </Card>

            {/* Settings */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <Label className="text-xs">{t("content.targetAudience")}</Label>
                  <Select value={targetAudience} onValueChange={setTargetAudience}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="candidates">{t("content.audienceCandidates")}</SelectItem>
                      <SelectItem value="clients">{t("content.audienceClients")}</SelectItem>
                      <SelectItem value="both">{t("content.audienceBoth")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("content.category")}</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("content.selectCategory")} /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("content.scheduledDate")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-8 text-sm justify-start">
                        <CalendarIcon className="h-3 w-3 mr-2" />
                        {publishDate ? format(publishDate, 'dd.MM.yyyy', { locale: deLocale }) : t("content.selectDate")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={publishDate} onSelect={setPublishDate} locale={deLocale} />
                    </PopoverContent>
                  </Popover>
                </div>
              </CardContent>
            </Card>

            {/* Word count */}
            <div className="text-xs text-muted-foreground text-center">
              {countWords(contentHtml)} {t("content.words")}
            </div>

            <Separator />

            {/* Actions */}
            <div className="space-y-2">
              <Button onClick={() => save('draft')} variant="outline" className="w-full" disabled={saving}>
                <Save className="h-4 w-4 mr-2" />{t("content.saveDraft")}
              </Button>
              {publishDate && (
                <Button onClick={() => save('scheduled')} variant="secondary" className="w-full" disabled={saving}>
                  <Clock className="h-4 w-4 mr-2" />{t("content.schedule")}
                </Button>
              )}
              <Button onClick={() => save('published')} className="w-full" disabled={saving}>
                <Globe className="h-4 w-4 mr-2" />{t("content.publishNow")}
              </Button>
              {post && post.status !== 'archived' && (
                <Button onClick={() => save('archived')} variant="ghost" className="w-full text-muted-foreground" disabled={saving}>
                  <Archive className="h-4 w-4 mr-2" />{t("common.archive")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
