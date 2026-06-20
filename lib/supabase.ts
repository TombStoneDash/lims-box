import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

// Env values pulled/copied through some shells arrive with a trailing literal
// "\n" (backslash-n) or stray whitespace baked into the value. A Supabase URL
// or service-role JWT can never legitimately contain those, and even one stray
// char breaks the REST URL or yields "Invalid API key". Strip them defensively.
function sanitizeEnv(v: string | undefined): string | undefined {
  return v?.replace(/\\[rnt]/g, '').replace(/\s+/g, '').trim() || undefined;
}

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;

  const url = sanitizeEnv(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = sanitizeEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY || // alias used in .env (without _ROLE_ suffix)
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}
