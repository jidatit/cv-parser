import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Routes: /blog-api or /blog-api/posts or /blog-api/posts/:slug
    const action = pathParts[pathParts.length - 1];

    // GET /posts/:slug - single post
    if (req.method === 'GET' && pathParts.length >= 2) {
      const slug = pathParts[pathParts.length - 1];
      if (slug !== 'posts') {
        const { data: post, error } = await supabase
          .from('blog_posts')
          .select('id, title, slug, content_html, excerpt, meta_description, seo_keywords, published_at, target_audience, featured_image_url, category, language, linked_job_ids, word_count')
          .eq('slug', slug)
          .eq('status', 'published')
          .lte('published_at', new Date().toISOString())
          .single();

        if (error || !post) {
          return new Response(JSON.stringify({ error: 'Post not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Fetch linked job titles if any
        let linkedJobs: any[] = [];
        if (post.linked_job_ids && (post.linked_job_ids as string[]).length > 0) {
          const { data: jobs } = await supabase
            .from('jobs')
            .select('id, public_title_a, seo_slug, public_id')
            .in('id', post.linked_job_ids as string[])
            .eq('is_published', true);
          linkedJobs = (jobs || []).map((j: any) => ({
            id: j.id,
            title: j.public_title_a,
            slug: j.seo_slug,
            public_id: j.public_id,
          }));
        }

        return new Response(JSON.stringify({ ...post, linked_jobs: linkedJobs }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // GET /posts - list posts
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
    const category = url.searchParams.get('category');
    const audience = url.searchParams.get('audience');
    const lang = url.searchParams.get('language');
    const offset = (page - 1) * limit;

    let query = supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, meta_description, seo_keywords, published_at, target_audience, featured_image_url, category, language, word_count', { count: 'exact' })
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) query = query.eq('category', category);
    if (audience) query = query.eq('target_audience', audience);
    if (lang) query = query.eq('language', lang);

    const { data: posts, error, count } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch posts' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      posts: posts || [],
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('blog-api error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
