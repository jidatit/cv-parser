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

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, public_id, public_title, public_title_a, public_title_b, public_summary_a, public_summary_b, framework_a, framework_b, active_variant, public_description, public_responsibilities, public_requirements, public_benefits, public_description_b, public_responsibilities_b, public_requirements_b, public_benefits_b, location, salary_range, employment_type, seo_meta_title, seo_meta_description, seo_keywords, seo_slug, meta_description, publication_language, published_at')
      .eq('is_published', true)
      .eq('publication_status', 'live');

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch jobs' }), { status: 500, headers: corsHeaders });
    }

    const publicJobs = (jobs || []).map((j: any) => {
      // Determine which variant to show
      let variant = j.active_variant || 'A';
      if (variant === 'split') {
        variant = Math.random() < 0.5 ? 'A' : 'B';
      }

      const isB = variant === 'B';
      const title = isB ? (j.public_title_b || j.public_title_a || j.public_title) : (j.public_title_a || j.public_title);
      const summary = isB ? j.public_summary_b : j.public_summary_a;
      const framework = isB ? j.framework_b : j.framework_a;
      const description = isB ? (j.public_description_b || j.public_description) : j.public_description;
      const responsibilities = isB ? (j.public_responsibilities_b || j.public_responsibilities) : j.public_responsibilities;
      const requirements = isB ? (j.public_requirements_b || j.public_requirements) : j.public_requirements;
      const benefits = isB ? (j.public_benefits_b || j.public_benefits) : j.public_benefits;

      // Schema.org/JobPosting JSON-LD
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title,
        description: description || '',
        datePosted: j.published_at,
        employmentType: j.employment_type || 'FULL_TIME',
        jobLocation: j.location ? {
          "@type": "Place",
          address: { "@type": "PostalAddress", addressLocality: j.location }
        } : undefined,
        baseSalary: j.salary_range ? {
          "@type": "MonetaryAmount",
          currency: "CHF",
          value: { "@type": "QuantitativeValue", value: j.salary_range }
        } : undefined,
      };

      return {
        id: j.public_id,
        _job_id: j.id,
        variant_shown: variant,
        title,
        summary,
        description,
        responsibilities,
        requirements,
        benefits,
        location: j.location,
        salary_range: j.salary_range,
        employment_type: j.employment_type,
        language: j.publication_language,
        published_at: j.published_at,
        seo: {
          title: j.seo_meta_title,
          description: j.meta_description || j.seo_meta_description,
          keywords: j.seo_keywords,
          slug: j.seo_slug,
        },
        jsonLd,
      };
    });

    return new Response(JSON.stringify({ jobs: publicJobs, count: publicJobs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
