import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const {
      candidate_name,
      candidate_email,
      candidate_phone,
      job_id,
      variant_shown,
      cover_letter,
      cv_base64,
      cv_filename,
    } = body;

    // Validate required fields
    if (!candidate_name || typeof candidate_name !== "string" || candidate_name.trim().length === 0) {
      return new Response(JSON.stringify({ error: "candidate_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!candidate_email || typeof candidate_email !== "string") {
      return new Response(JSON.stringify({ error: "candidate_email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(candidate_email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Length limits
    if (candidate_name.length > 200) {
      return new Response(JSON.stringify({ error: "candidate_name too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (candidate_email.length > 320) {
      return new Response(JSON.stringify({ error: "candidate_email too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cv_url: string | null = null;

    // Upload CV if provided
    if (cv_base64 && cv_filename) {
      const allowedExtensions = [".pdf", ".doc", ".docx"];
      const ext = cv_filename.substring(cv_filename.lastIndexOf(".")).toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        return new Response(JSON.stringify({ error: "Invalid file type. Allowed: PDF, DOC, DOCX" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fileData = Uint8Array.from(atob(cv_base64), (c) => c.charCodeAt(0));
      
      // Max 10MB
      if (fileData.length > 10 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "File too large. Max 10MB" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const filePath = `${crypto.randomUUID()}/${cv_filename}`;
      const contentType = ext === ".pdf" ? "application/pdf" : "application/msword";

      const { error: uploadError } = await supabase.storage
        .from("application-documents")
        .upload(filePath, fileData, { contentType });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return new Response(JSON.stringify({ error: "Failed to upload CV" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      cv_url = filePath;
    }

    // Insert application
    const { data: application, error: insertError } = await supabase
      .from("applications")
      .insert({
        candidate_name: candidate_name.trim(),
        candidate_email: candidate_email.trim(),
        candidate_phone: candidate_phone?.trim() || null,
        job_id: job_id || null,
        variant_shown: variant_shown || null,
        cover_letter: cover_letter?.substring(0, 5000) || null,
        cv_url,
        status: "neu",
        source: "website",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create application" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log apply event in job_analytics for conversion tracking
    if (job_id) {
      await supabase.from("job_analytics").insert({
        job_id,
        variant_shown: variant_shown || "A",
        event_type: "apply",
        device_type: null,
      });
    }

    return new Response(
      JSON.stringify({ success: true, id: application.id }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
