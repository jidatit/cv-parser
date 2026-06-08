import { supabase } from "@/integrations/supabase/client";

/**
 * Triggers automatic AI match analysis in the background (fire-and-forget).
 * Loads candidate/job/client data, calculates commute, runs analyze-match,
 * and saves all results to the placement.
 * 
 * Errors are only logged to console and never block the user flow.
 */
export function triggerAutoAnalysis(placementId: string, candidateId: string, jobId: string) {
  // Fire and forget - don't await
  runAnalysis(placementId, candidateId, jobId).catch((err) => {
    console.error('[AutoAnalysis] Background analysis failed:', err);
  });
}

async function runAnalysis(placementId: string, candidateId: string, jobId: string) {
  console.log('[AutoAnalysis] Starting for placement:', placementId);

  // Load candidate and job data in parallel
  const [candidateResult, jobResult] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', candidateId).single(),
    supabase.from('jobs').select('*, clients(*)').eq('id', jobId).single(),
  ]);

  if (candidateResult.error || !candidateResult.data) {
    console.error('[AutoAnalysis] Failed to load candidate:', candidateResult.error);
    return;
  }
  if (jobResult.error || !jobResult.data) {
    console.error('[AutoAnalysis] Failed to load job:', jobResult.error);
    return;
  }

  const candidate = candidateResult.data;
  const job = jobResult.data;
  const client = (job as any).clients || null;

  // Load placement notes + existing commute data
  const { data: placement } = await supabase
    .from('placements')
    .select('notes, stage, commute_calculated_at, commute_auto_duration, commute_auto_distance, commute_oepnv_duration, commute_oepnv_distance')
    .eq('id', placementId)
    .maybeSingle();

  const placementNotes = Array.isArray(placement?.notes) ? placement.notes : [];
  const stage = placement?.stage || 'Ready2Send';

  // Calculate commute if both locations exist AND not already calculated
  let commuteData: any = null;
  if (candidate.location && job.location) {
    if (placement?.commute_calculated_at) {
      // Reuse existing commute data from placement
      console.log('[AutoAnalysis] Commute already calculated, reusing existing data');
      commuteData = {
        auto: (placement.commute_auto_duration || placement.commute_auto_distance)
          ? { duration: placement.commute_auto_duration, distance: placement.commute_auto_distance }
          : null,
        oepnv: (placement.commute_oepnv_duration || placement.commute_oepnv_distance)
          ? { duration: placement.commute_oepnv_duration, distance: placement.commute_oepnv_distance }
          : null,
      };
    } else {
      try {
        const { data: commuteResult } = await supabase.functions.invoke('calculate-commute', {
          body: { origin: candidate.location, destination: job.location }
        });
        commuteData = commuteResult;

        // Save commute data to placement
        await supabase
          .from('placements')
          .update({
            commute_auto_duration: commuteResult?.auto?.duration || null,
            commute_auto_distance: commuteResult?.auto?.distance || null,
            commute_oepnv_duration: commuteResult?.oepnv?.duration || null,
            commute_oepnv_distance: commuteResult?.oepnv?.distance || null,
            commute_calculated_at: new Date().toISOString()
          })
          .eq('id', placementId);
      } catch (e) {
        console.log('[AutoAnalysis] Could not calculate commute:', e);
      }
    }
  }

  // Run AI analysis
  const { data, error } = await supabase.functions.invoke('analyze-match', {
    body: {
      candidate,
      job,
      client,
      notes: placementNotes,
      stage,
      commuteData
    }
  });

  if (error) {
    console.error('[AutoAnalysis] analyze-match failed:', error);
    return;
  }

  // Save analysis results to placement
  const { error: updateError } = await supabase
    .from('placements')
    .update({
      match_score: data.score || 75,
      match_reasons: data.reasons || [],
      match_strengths: data.strengths || [],
      match_gaps: data.gaps || [],
      match_risks: data.risks || [],
      match_summary: data.summary || '',
      skills_score: data.skills_score || 70,
      experience_score: data.experience_score || 75,
      salary_score: data.salary_score || 80,
      analysis_completed_at: new Date().toISOString()
    })
    .eq('id', placementId);

  if (updateError) {
    console.error('[AutoAnalysis] Failed to save results:', updateError);
    return;
  }

  console.log('[AutoAnalysis] Completed for placement:', placementId, 'Score:', data.score);
}
