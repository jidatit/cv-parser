import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { searchQuery } = await req.json();
    console.log('AI Job Search Query:', searchQuery);

    if (!searchQuery || typeof searchQuery !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing searchQuery parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch up to 200 jobs for analysis
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*, clients(name)')
      .limit(200);

    if (jobsError) {
      console.error('Error fetching jobs:', jobsError);
      throw jobsError;
    }

    console.log(`Fetched ${jobs?.length || 0} jobs for analysis`);

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Analyze and score jobs based on search query
    const searchTerms = searchQuery.toLowerCase().split(/\s+/);
    
    const scoredJobs = jobs.map((job: any) => {
      let score = 0;
      const searchableText = [
        job.title,
        job.description,
        job.location,
        job.status,
        job.employment_type,
        job.experience_level,
        job.salary_range,
        job.requirements,
        job.responsibilities,
        job.clients?.name,
        ...(job.skills || [])
      ].filter(Boolean).join(' ').toLowerCase();

      // Score based on term matches
      searchTerms.forEach((term: string) => {
        const termCount = (searchableText.match(new RegExp(term, 'g')) || []).length;
        score += termCount;
        
        // Bonus for title matches
        if (job.title?.toLowerCase().includes(term)) {
          score += 5;
        }
        
        // Bonus for skills matches
        if (job.skills?.some((skill: string) => skill.toLowerCase().includes(term))) {
          score += 3;
        }
      });

      // Salary range matching
      const salaryMatch = searchQuery.match(/(\d+)k?\s*[-–]\s*(\d+)k?/i);
      if (salaryMatch && job.salary_range) {
        const [, min, max] = salaryMatch;
        const salaryRangeText = job.salary_range.toLowerCase();
        if (salaryRangeText.includes(min) || salaryRangeText.includes(max)) {
          score += 4;
        }
      }

      // Location matching
      const locationTerms = ['remote', 'hybrid', 'vor ort', 'onsite', 'office'];
      locationTerms.forEach((locTerm: string) => {
        if (searchQuery.toLowerCase().includes(locTerm) && 
            job.location?.toLowerCase().includes(locTerm)) {
          score += 3;
        }
      });

      // Employment type matching
      const empTypes = ['vollzeit', 'teilzeit', 'freelance', 'praktikum', 'full-time', 'part-time'];
      empTypes.forEach((empType: string) => {
        if (searchQuery.toLowerCase().includes(empType) && 
            job.employment_type?.toLowerCase().includes(empType)) {
          score += 3;
        }
      });

      // Experience level matching
      const expLevels = ['junior', 'senior', 'lead', 'principal', 'entry'];
      expLevels.forEach((level: string) => {
        if (searchQuery.toLowerCase().includes(level) && 
            (job.experience_level?.toLowerCase().includes(level) ||
             job.title?.toLowerCase().includes(level))) {
          score += 4;
        }
      });

      return { ...job, score };
    });

    // Sort by score and return top 50
    const rankedJobs = scoredJobs
      .filter((job: any) => job.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 50);

    console.log(`Returning ${rankedJobs.length} ranked jobs (top scores: ${rankedJobs.slice(0, 3).map((j: any) => j.score).join(', ')})`);

    return new Response(
      JSON.stringify({ results: rankedJobs }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in ai-job-search:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
