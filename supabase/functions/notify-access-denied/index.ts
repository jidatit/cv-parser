import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AccessDeniedRequest {
  userId: string;
  userEmail: string;
  userRole: string | null;
  attemptedPath: string;
  requiredRoles: string[];
}

const handler = async (req: Request): Promise<Response> => {
  console.log("notify-access-denied function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user: authUser }, error: authError } = await authClient.auth.getUser();
  if (authError || !authUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, userEmail, userRole, attemptedPath, requiredRoles }: AccessDeniedRequest = await req.json();

    console.log("Access denied attempt:", { userId, userEmail, userRole, attemptedPath, requiredRoles });

    // Log the access attempt to the database
    const { error: logError } = await supabase
      .from("access_logs")
      .insert({
        user_id: userId,
        user_email: userEmail,
        attempted_path: attemptedPath,
        user_role: userRole,
        required_roles: requiredRoles,
      });

    if (logError) {
      console.error("Error logging access attempt:", logError);
    }

    // Get admin emails
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesError) {
      console.error("Error fetching admin roles:", rolesError);
      throw rolesError;
    }

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admins found to notify");
      return new Response(JSON.stringify({ success: true, message: "No admins to notify" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get admin emails from profiles
    const adminUserIds = adminRoles.map(r => r.user_id);
    const { data: adminProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email")
      .in("id", adminUserIds);

    if (profilesError) {
      console.error("Error fetching admin profiles:", profilesError);
      throw profilesError;
    }

    const adminEmails = adminProfiles?.map(p => p.email).filter(Boolean) || [];

    if (adminEmails.length === 0) {
      console.log("No admin emails found");
      return new Response(JSON.stringify({ success: true, message: "No admin emails found" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Sending notification to admins:", adminEmails);

    const roleLabels: Record<string, string> = {
      admin: "Admin",
      manager: "Manager",
      user: "Recruiter",
      viewer: "Viewer",
    };

    const currentTime = new Date().toLocaleString("de-DE", {
      dateStyle: "full",
      timeStyle: "medium",
    });

    // Send email notification
    const emailResponse = await resend.emails.send({
      from: "Headhunter CRM <onboarding@resend.dev>",
      to: adminEmails,
      subject: `🔒 Zugriff verweigert: ${userEmail} auf ${attemptedPath}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .info-row { display: flex; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
            .info-label { font-weight: 600; width: 150px; color: #6b7280; }
            .info-value { flex: 1; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; }
            .badge-amber { background: #fef3c7; color: #92400e; }
            .badge-red { background: #fee2e2; color: #991b1b; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 20px;">🔒 Zugriffsverweigerung gemeldet</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Ein Benutzer hat versucht, auf eine geschützte Seite zuzugreifen</p>
            </div>
            <div class="content">
              <div class="info-row">
                <span class="info-label">Benutzer:</span>
                <span class="info-value">${userEmail}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Aktuelle Rolle:</span>
                <span class="info-value">
                  <span class="badge badge-amber">${userRole ? roleLabels[userRole] || userRole : "Keine Rolle"}</span>
                </span>
              </div>
              <div class="info-row">
                <span class="info-label">Versuchter Pfad:</span>
                <span class="info-value"><code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${attemptedPath}</code></span>
              </div>
              <div class="info-row">
                <span class="info-label">Benötigte Rollen:</span>
                <span class="info-value">
                  ${requiredRoles.map(r => `<span class="badge badge-red">${roleLabels[r] || r}</span>`).join(" ")}
                </span>
              </div>
              <div class="info-row" style="border-bottom: none;">
                <span class="info-label">Zeitpunkt:</span>
                <span class="info-value">${currentTime}</span>
              </div>
            </div>
            <div class="footer">
              <p>Diese E-Mail wurde automatisch vom Headhunter CRM gesendet.</p>
              <p>Sie erhalten diese Benachrichtigung, weil Sie als Administrator registriert sind.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-access-denied function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
