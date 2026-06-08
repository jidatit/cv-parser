import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Get Google access token from service account JSON
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  
  const header = base64Encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const payload = base64Encode(JSON.stringify(claimSet))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  // Import the private key and sign the JWT
  const pemContent = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signatureBuffer = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);
  const signature = base64Encode(new Uint8Array(signatureBuffer))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${header}.${payload}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${err}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.76.1');
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ success: false, error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const projectId = Deno.env.get("GOOGLE_CLOUD_PROJECT_ID");
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    
    if (!projectId || !serviceAccountJson) {
      throw new Error("GOOGLE_CLOUD_PROJECT_ID or GOOGLE_SERVICE_ACCOUNT_JSON not configured");
    }

    console.log("🎨 Enhancing image with Imagen 3 via Vertex AI...");

    const accessToken = await getAccessToken(serviceAccountJson);

    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-capability-001:predict`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: "Enhance the quality of this portrait photo. Make it sharper, clearer, with better lighting and professional look. Keep the person's appearance exactly the same.",
            image: {
              bytesBase64Encoded: imageBase64,
            },
          },
        ],
        parameters: {
          sampleCount: 1,
          mode: "upscale",
          upscaleConfig: {
            upscaleFactor: "x2",
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Vertex AI error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback to Gemini if Imagen fails
      console.log("⚠️ Imagen failed, falling back to Gemini...");
      return await fallbackToGemini(imageBase64, corsHeaders);
    }

    const result = await response.json();
    const predictions = result.predictions;

    if (!predictions || predictions.length === 0 || !predictions[0].bytesBase64Encoded) {
      console.error("No enhanced image in Imagen response");
      return await fallbackToGemini(imageBase64, corsHeaders);
    }

    const enhancedImageUrl = `data:image/png;base64,${predictions[0].bytesBase64Encoded}`;

    console.log("✅ Image enhanced successfully with Imagen 3");

    return new Response(
      JSON.stringify({ success: true, enhancedImage: enhancedImageUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("enhance-image error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Fallback to Gemini 2.5 Flash if Imagen is unavailable
async function fallbackToGemini(imageBase64: string, corsHeaders: Record<string, string>) {
  const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, error: "No fallback API key configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("🔄 Using Gemini 2.5 Flash as fallback...");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Verbessere die Qualität dieses Bildes. Mache es schärfer und klarer." },
              { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini fallback error:", response.status, errorText);
    return new Response(JSON.stringify({ success: false, error: "Both Imagen and Gemini failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await response.json();
  const parts = result.candidates?.[0]?.content?.parts;
  let enhancedImageUrl: string | null = null;

  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData?.mimeType) {
        enhancedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  if (!enhancedImageUrl) {
    return new Response(JSON.stringify({ success: false, error: "No image generated from fallback" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("✅ Image enhanced with Gemini fallback");
  return new Response(
    JSON.stringify({ success: true, enhancedImage: enhancedImageUrl }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
