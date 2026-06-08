import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Detect format type
function detectFormat(text: string): 'html' | 'json' | 'fliesstext' | 'plain_bullets' | 'correct' | null {
  if (!text || text.trim() === '') return null;
  
  // Check for HTML format
  if (text.includes('<ul>') || text.includes('<li>') || text.includes('<ol>')) {
    return 'html';
  }
  
  // Check for JSON array format
  if (text.trim().startsWith('[') && text.trim().endsWith(']')) {
    try {
      JSON.parse(text);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }
  
  // Check for Fliesstext with bullets (bullets on same line)
  // Pattern: "• text • text" without newlines between bullets
  if (text.includes('•')) {
    const lines = text.split('\n').filter(l => l.trim());
    const bulletsInText = (text.match(/•/g) || []).length;
    
    // If there are multiple bullets but they're mostly on single lines, it's Fliesstext
    if (bulletsInText > 1) {
      // Count how many lines have multiple bullets
      const linesWithMultipleBullets = lines.filter(line => {
        const bulletCount = (line.match(/•/g) || []).length;
        return bulletCount > 1;
      }).length;
      
      if (linesWithMultipleBullets > 0) {
        return 'fliesstext';
      }
    }
    
    // Plain text with bullets and newlines - needs HTML conversion
    if (text.includes('\n') && !text.includes('<')) {
      return 'plain_bullets';
    }
    
    // Already correct format (one bullet per line) - but still needs HTML for frontend
    return 'plain_bullets';
  }
  
  return null;
}

// Convert HTML to clean HTML list (normalize existing HTML)
function normalizeHtmlList(html: string): string {
  // Extract content from <li> tags
  const liItems: string[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  
  while ((match = liRegex.exec(html)) !== null) {
    let content = match[1];
    // Remove <p> tags
    content = content.replace(/<\/?p[^>]*>/gi, '');
    // Remove other HTML tags
    content = content.replace(/<[^>]+>/g, '');
    // Clean up whitespace
    content = decodeHtmlEntities(content.trim());
    if (content) {
      liItems.push(content);
    }
  }
  
  if (liItems.length > 0) {
    const listItems = liItems.map(item => `<li>${item}</li>`).join('');
    return `<ul>${listItems}</ul>`;
  }
  
  // Fallback: return original
  return html;
}

// Convert JSON array to HTML list
function convertJsonToHtml(json: string): string {
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      const listItems = arr.map(item => {
        let text = String(item).trim();
        // Remove existing bullet if present
        if (text.startsWith('• ')) {
          text = text.substring(2);
        } else if (text.startsWith('•')) {
          text = text.substring(1).trim();
        }
        return `<li>${text}</li>`;
      }).join('');
      return `<ul>${listItems}</ul>`;
    }
  } catch {
    // Return original if not valid JSON
  }
  return json;
}

// Convert Fliesstext to HTML list
function convertFliesstextToHtml(text: string): string {
  // Split by bullet point pattern
  const parts = text.split(/\s*•\s*/);
  
  // Filter empty parts and create HTML list
  const items = parts
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  if (items.length > 0) {
    const listItems = items.map(item => `<li>${item}</li>`).join('');
    return `<ul>${listItems}</ul>`;
  }
  
  return text;
}

// Convert plain text bullets to HTML list
function convertPlainBulletsToHtml(text: string): string {
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  const listItems = lines.map(line => {
    // Remove bullet character at the beginning
    let content = line.replace(/^[•\-\*]\s*/, '').trim();
    return `<li>${content}</li>`;
  });
  
  if (listItems.length > 0) {
    return `<ul>${listItems.join('')}</ul>`;
  }
  
  return text;
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—');
}

// Main conversion function
function convertToStandardFormat(text: string): { converted: string; formatType: string } | null {
  const format = detectFormat(text);
  
  if (!format) {
    return null;
  }
  
  let converted: string;
  
  switch (format) {
    case 'html':
      converted = normalizeHtmlList(text);
      break;
    case 'json':
      converted = convertJsonToHtml(text);
      break;
    case 'fliesstext':
      converted = convertFliesstextToHtml(text);
      break;
    case 'plain_bullets':
      converted = convertPlainBulletsToHtml(text);
      break;
    default:
      return null;
  }
  
  // Final cleanup
  converted = converted.trim();
  
  // Don't return if nothing changed
  if (converted === text.trim()) {
    return null;
  }
  
  return { converted, formatType: format };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all jobs
    const { data: jobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, title, responsibilities, requirements, benefits')
      .neq('status', 'Archived');

    if (fetchError) {
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    console.log(`Checking ${jobs?.length || 0} jobs for formatting issues...`);

    const results = {
      total_checked: jobs?.length || 0,
      responsibilities_fixed: 0,
      requirements_fixed: 0,
      benefits_fixed: 0,
      jobs_updated: 0,
      details: [] as { id: string; title: string; field: string; from: string; to: string }[]
    };

    for (const job of jobs || []) {
      const updates: Record<string, string> = {};
      
      // Check responsibilities
      if (job.responsibilities) {
        const respResult = convertToStandardFormat(job.responsibilities);
        if (respResult) {
          updates.responsibilities = respResult.converted;
          results.responsibilities_fixed++;
          results.details.push({
            id: job.id,
            title: job.title,
            field: 'responsibilities',
            from: respResult.formatType,
            to: 'bullets'
          });
          console.log(`Job "${job.title}": responsibilities ${respResult.formatType} → bullets`);
        }
      }
      
      // Check requirements
      if (job.requirements) {
        const reqResult = convertToStandardFormat(job.requirements);
        if (reqResult) {
          updates.requirements = reqResult.converted;
          results.requirements_fixed++;
          results.details.push({
            id: job.id,
            title: job.title,
            field: 'requirements',
            from: reqResult.formatType,
            to: 'bullets'
          });
          console.log(`Job "${job.title}": requirements ${reqResult.formatType} → bullets`);
        }
      }
      
      // Check benefits
      if (job.benefits) {
        const benefitsResult = convertToStandardFormat(job.benefits);
        if (benefitsResult) {
          updates.benefits = benefitsResult.converted;
          results.benefits_fixed++;
          results.details.push({
            id: job.id,
            title: job.title,
            field: 'benefits',
            from: benefitsResult.formatType,
            to: 'bullets'
          });
          console.log(`Job "${job.title}": benefits ${benefitsResult.formatType} → bullets`);
        }
      }
      
      // Update job if there are changes
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        
        const { error: updateError } = await supabase
          .from('jobs')
          .update(updates)
          .eq('id', job.id);
        
        if (updateError) {
          console.error(`Failed to update job ${job.title}:`, updateError.message);
        } else {
          results.jobs_updated++;
        }
      }
    }

    console.log(`Formatting fix complete: ${results.jobs_updated} jobs updated`);

    return new Response(JSON.stringify({
      success: true,
      message: `Formatting korrigiert für ${results.jobs_updated} Jobs`,
      stats: {
        total_checked: results.total_checked,
        jobs_updated: results.jobs_updated,
        responsibilities_fixed: results.responsibilities_fixed,
        requirements_fixed: results.requirements_fixed,
        benefits_fixed: results.benefits_fixed
      },
      details: results.details
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fix-job-formatting function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
