
-- Create blog_posts table
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  slug text UNIQUE,
  content_html text,
  excerpt text,
  meta_description text,
  seo_keywords text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  target_audience text DEFAULT 'candidates',
  featured_image_url text,
  category text,
  language text DEFAULT 'de',
  linked_job_ids uuid[] DEFAULT '{}'::uuid[],
  ai_generated boolean DEFAULT false,
  word_count integer DEFAULT 0
);

-- Indexes
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX idx_blog_posts_published_at ON public.blog_posts(published_at);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Team members can insert blog posts"
  ON public.blog_posts FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team members can view blog posts"
  ON public.blog_posts FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Public can view published blog posts"
  ON public.blog_posts FOR SELECT
  USING (status = 'published' AND published_at <= now());

CREATE POLICY "Team members can update blog posts"
  ON public.blog_posts FOR UPDATE
  USING (is_team_member(auth.uid()));

CREATE POLICY "Admins and creators can delete blog posts"
  ON public.blog_posts FOR DELETE
  USING (has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Activity log trigger
CREATE TRIGGER log_blog_posts_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION log_activity();

-- Storage bucket for blog images
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true);

-- Storage RLS: team members can upload
CREATE POLICY "Team members can upload blog images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'blog-images' AND is_team_member(auth.uid()));

-- Storage RLS: public read
CREATE POLICY "Public can view blog images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-images');

-- Storage RLS: team members can delete
CREATE POLICY "Team members can delete blog images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'blog-images' AND is_team_member(auth.uid()));
