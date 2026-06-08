import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ContentStatusCards } from "@/components/content/ContentStatusCards";
import { BlogPostsList } from "@/components/content/BlogPostsList";
import { BlogPostGenerateForm } from "@/components/content/BlogPostGenerateForm";
import { BlogPostEditor } from "@/components/content/BlogPostEditor";
import { PenTool } from "lucide-react";

export default function ContentManager() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    let query = supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error) {
      toast({ title: t("toast.loadError"), variant: "destructive" });
    } else {
      setPosts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchPosts(); }, [statusFilter]);

  const counts = {
    draft: posts.filter(p => p.status === 'draft').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    published: posts.filter(p => p.status === 'published').length,
    archived: posts.filter(p => p.status === 'archived').length,
  };

  // Re-count from unfiltered data
  const [allPosts, setAllPosts] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('blog_posts').select('status').then(({ data }) => {
      setAllPosts(data || []);
    });
  }, [posts]);

  const allCounts = {
    draft: allPosts.filter(p => p.status === 'draft').length,
    scheduled: allPosts.filter(p => p.status === 'scheduled').length,
    published: allPosts.filter(p => p.status === 'published').length,
    archived: allPosts.filter(p => p.status === 'archived').length,
  };

  const handleEdit = (post: any) => {
    setEditingPost(post);
    setGeneratedData(null);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('blog_posts').delete().eq('id', id);
    if (error) {
      toast({ title: t("toast.deleteError"), variant: "destructive" });
    } else {
      toast({ title: t("toast.deleteSuccess") });
      fetchPosts();
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    const updateData: any = { status };
    if (status === 'published') updateData.published_at = new Date().toISOString();
    const { error } = await supabase.from('blog_posts').update(updateData).eq('id', id);
    if (error) {
      toast({ title: t("toast.updateError"), variant: "destructive" });
    } else {
      toast({ title: t("toast.statusUpdated") });
      fetchPosts();
    }
  };

  const handleGenerated = (data: any) => {
    setGeneratedData(data);
    setEditingPost(null);
    setEditorOpen(true);
  };

  const handleNewManual = () => {
    setEditingPost(null);
    setGeneratedData(null);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PenTool className="h-6 w-6" />
          {t("content.title")}
        </h1>
        <p className="text-muted-foreground">{t("content.subtitle")}</p>
      </div>

      <ContentStatusCards counts={allCounts} activeFilter={statusFilter} onFilterChange={setStatusFilter} />

      <Tabs defaultValue="articles">
        <TabsList>
          <TabsTrigger value="articles">{t("content.articles")}</TabsTrigger>
          <TabsTrigger value="new">{t("content.newArticle")}</TabsTrigger>
        </TabsList>

        <TabsContent value="articles" className="mt-4">
          <BlogPostsList
            posts={posts}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />
        </TabsContent>

        <TabsContent value="new" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BlogPostGenerateForm onGenerated={handleGenerated} />
            <div className="flex items-center justify-center">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">{t("content.orManual")}</p>
                <button
                  onClick={handleNewManual}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <PenTool className="h-5 w-5" />
                  {t("content.writeManually")}
                </button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <BlogPostEditor
        post={editingPost}
        generatedData={generatedData}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={fetchPosts}
      />
    </div>
  );
}
