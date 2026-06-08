// ============================================================
// WICHTIG: Diese Werte NIEMALS ändern!
// Externes Supabase-Projekt: bwjnfbpczevbhhjmsosq
// ============================================================
// Diese Konstanten dienen als Fallback, falls die .env-Datei
// automatisch auf Lovable Cloud Credentials zurückgesetzt wird.
// ============================================================

export const SUPABASE_CONFIG = {
  url: 'https://bwjnfbpczevbhhjmsosq.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3am5mYnBjemV2Ymhoam1zb3NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNTk0NTMsImV4cCI6MjA4MTgzNTQ1M30.D1QtwVfBzdVeWb1E2kCWI3Hf8_pbNmmweg4UOgW-q1c',
  projectId: 'bwjnfbpczevbhhjmsosq'
} as const;

// Validierung: Prüft ob die aktuellen Umgebungsvariablen korrekt sind
export const validateSupabaseConfig = () => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  const isCorrect = envUrl === SUPABASE_CONFIG.url && envKey === SUPABASE_CONFIG.anonKey;
  
  if (!isCorrect) {
    console.warn(
      '⚠️ WARNUNG: Die Supabase-Umgebungsvariablen stimmen nicht mit dem externen Projekt überein!',
      '\nErwartet:', SUPABASE_CONFIG.url,
      '\nAktuell:', envUrl
    );
  }
  
  return isCorrect;
};
