/**
 * AI-powered headshot extraction using Lovable AI image editing
 * The AI directly extracts and returns the headshot image,
 * bypassing coordinate calculations for much better accuracy
 */

/**
 * Extract the headshot from a CV page image using AI image editing
 */
export async function detectAndCropFace(imageDataUrl: string): Promise<string | null> {
  try {
    console.log('🎯 Starting AI headshot extraction...');
    
    // Extract base64 from data URL
    const base64Match = imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (!base64Match) {
      console.error('Invalid image data URL format');
      return null;
    }
    const imageBase64 = base64Match[1];
    
    // Call the edge function
    // Get the user's session token for auth
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('No active session for face detection');
      return null;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-face-boundaries`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ imageBase64 }),
      }
    );

    if (!response.ok) {
      console.error('Edge function error:', response.status);
      return null;
    }

    const result = await response.json();
    console.log('📊 AI extraction result:', result.success ? 'Success' : 'Failed');

    if (!result.success || !result.extractedImage) {
      console.log('❌ No headshot extracted by AI');
      return null;
    }

    console.log('✅ Headshot extracted successfully');
    return result.extractedImage;
  } catch (error) {
    console.error('❌ Headshot extraction error:', error);
    return null;
  }
}

/**
 * Enhance a portrait image using Gemini 2.5 Flash Image
 */
export async function enhanceImage(imageDataUrl: string): Promise<string | null> {
  try {
    console.log('🎨 Starting AI image enhancement...');

    const base64Match = imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (!base64Match) {
      console.error('Invalid image data URL format for enhancement');
      return null;
    }

    // Get the user's session token for auth
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('No active session for image enhancement');
      return null;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enhance-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ imageBase64: base64Match[1] }),
      }
    );

    if (!response.ok) {
      console.error('Enhancement edge function error:', response.status);
      return null;
    }

    const result = await response.json();
    if (!result.success || !result.enhancedImage) {
      console.log('❌ Image enhancement failed');
      return null;
    }

    console.log('✅ Image enhanced successfully');
    return result.enhancedImage;
  } catch (error) {
    console.error('❌ Image enhancement error:', error);
    return null;
  }
}

/**
 * No-op for backwards compatibility - AI extraction doesn't need preloading
 */
export async function preloadFaceDetectionModel(): Promise<void> {
  // AI-based extraction doesn't need preloading
}
