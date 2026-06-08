import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generatePassword(length = 14): string {
  // Avoid HTML-special characters (&, <, >) that get corrupted in email HTML
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%*_-+";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const token = authHeader.replace("Bearer ", "");

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = userData.user.id;

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: roleCheck } = await authClient.rpc("is_team_member", {
      _user_id: callerId,
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: not a team member" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { application_id, candidate_email, candidate_name, job_title } = await req.json();

    if (!candidate_email || !candidate_name) {
      return new Response(JSON.stringify({ error: "Missing candidate_email or candidate_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const temporaryPassword = generatePassword();
    let userId: string;

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === candidate_email.toLowerCase()
    );

    if (existingUser) {
      userId = existingUser.id;
      console.log(`User already exists: ${userId}`);
    } else {
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: candidate_email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: candidate_name,
          user_type: "candidate",
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = newUser.user.id;
      console.log(`Created new candidate user: ${userId}`);
    }

    // Ensure candidate has the candidate role (required by auth hook)
    const { error: roleError } = await adminClient
      .from('user_roles')
      .upsert({ user_id: userId, role: 'candidate' }, { onConflict: 'user_id,role' });

    if (roleError) {
      console.error("Error setting user role:", roleError);
    } else {
      console.log(`Viewer role ensured for user: ${userId}`);
    }

    // Step 1: Generate magic link FIRST (before setting password)
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: candidate_email,
    });

    if (linkError) {
      console.error("Error generating magic link:", linkError);
      return new Response(JSON.stringify({ error: linkError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const magicLink = linkData?.properties?.action_link;
    console.log("Magic link generated successfully");

    // Step 2: Set password AFTER magic link generation (so it doesn't get invalidated)
    const { error: pwdError } = await adminClient.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
    });

    if (pwdError) {
      console.error("Error setting password for user:", userId, pwdError);
      return new Response(
        JSON.stringify({ error: `Failed to set password: ${pwdError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Password set successfully for user: ${userId}`);

    // Update application with candidate_id
    if (application_id) {
      await adminClient
        .from("applications")
        .update({ candidate_id: userId })
        .eq("id", application_id);
    }

    // Send email via Resend
    if (resendApiKey && magicLink) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "Beckett Stone <noreply@beckettstone.ch>",
          to: [candidate_email],
          subject: `Ihre Bewerbung – Zugang zu Ihrem Profil`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">Hallo ${candidate_name},</h2>
              <p>vielen Dank für Ihre Bewerbung${job_title ? ` auf die Stelle <strong>${job_title}</strong>` : ""}.</p>
              <p>Wir haben für Sie einen persönlichen Zugang erstellt. Klicken Sie auf den folgenden Link, um sich einzuloggen:</p>
              <div style="margin: 24px 0;">
                <a href="${magicLink}" style="background-color: #1a1a1a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Jetzt einloggen
                </a>
              </div>
              <div style="background-color: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 0 0 8px 0; font-weight: bold; color: #1a1a1a;">Alternative: Login mit Passwort</p>
                <p style="margin: 0 0 4px 0; color: #333;">Falls der Link nicht funktioniert, können Sie sich auch mit folgenden Zugangsdaten einloggen:</p>
                <p style="margin: 8px 0 4px 0; color: #333;"><strong>E-Mail:</strong> ${candidate_email}</p>
                <p style="margin: 4px 0 0 0; color: #333;"><strong>Passwort:</strong> <code style="background: #e8e8e8; padding: 2px 6px; border-radius: 4px; font-size: 14px;">${temporaryPassword}</code></p>
                <p style="margin: 12px 0 0 0; color: #999; font-size: 12px;">Bitte ändern Sie Ihr Passwort nach dem ersten Login.</p>
              </div>
              <p style="color: #666; font-size: 14px;">Falls Sie Probleme beim Einloggen haben, kontaktieren Sie uns bitte direkt.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #999; font-size: 12px;">Beckett Stone – Executive Search</p>
            </div>
          `,
        }),
      });

      if (!emailResponse.ok) {
        const errBody = await emailResponse.text();
        console.error("Resend error:", errBody);
        return new Response(
          JSON.stringify({ error: "Email could not be sent", details: errBody }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Invitation email sent successfully");
    } else {
      console.warn("No RESEND_API_KEY configured or no magic link generated");
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
